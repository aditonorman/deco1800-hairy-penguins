/**
 * Headless browser smoke test for Wild Neighbours.
 * Serves the project folder, loads the app in Chrome and walks through the
 * main flows: first-run intro, zones drawn as separate cells with chips,
 * GPS walking (emulated positions), quiet alert cards on zone entry, alert
 * filters by animal group, demo tools, celebrations for things the user
 * taps, Pokedex, photo attach, Badges tab, friend links, persistence,
 * offline support and layout at phone, small-phone and laptop sizes.
 * Screenshots go to scripts/screenshots/.
 *
 * One-off setup (not needed to run the app itself):
 *   npm install --no-save --no-package-lock puppeteer-core
 *   node scripts/smoke-test.js          # via a local http server (includes GPS + offline checks)
 *   node scripts/smoke-test.js file     # opening index.html from disk
 * Set CHROME_PATH if Chrome is not in /Applications.
 */
const puppeteer = require("puppeteer-core");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const PROJECT = path.resolve(__dirname, "..");
const SHOTS = path.join(PROJECT, "scripts", "screenshots");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 8765;
const mode = process.argv[2] || "server";   // "server" or "file"
const server = mode === "server";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail) { console.log((ok ? "  ok   " : "  FAIL ") + name + (detail !== undefined ? " (" + detail + ")" : "")); if (!ok) failures++; }
function section(name) { console.log("\n" + name); }

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const http = server ? spawn("python3", ["-m", "http.server", String(PORT)], { cwd: PROJECT, stdio: "ignore" }) : null;
  if (http) await sleep(800);
  const base = server ? `http://localhost:${PORT}/index.html` : "file://" + PROJECT + "/index.html";

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"] });
  if (server) await browser.defaultBrowserContext().overridePermissions(`http://localhost:${PORT}`, ["geolocation", "clipboard-read", "clipboard-write"]);
  const page = await browser.newPage();
  const errors = [], logs = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") logs.push(m.type() + ": " + m.text()); });
  page.on("requestfailed", r => { if (!/tile\.|fonts\.g|images\.ala|arcgisonline/.test(r.url())) logs.push("requestfailed: " + r.url()); });
  page.on("dialog", d => d.accept());

  // ---- helpers ----------------------------------------------------------
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${mode}-${name}.png`) });
  const isShown = (sel) => page.evaluate(s => { const el = document.querySelector(s); return !!el && !el.hidden && el.getClientRects().length > 0; }, sel);
  // visible AND finished its entrance animation (sheets slide in, so buttons move until then)
  const waitShown = (sel, ms) => page.waitForFunction(s => {
    const el = document.querySelector(s);
    if (!el || el.hidden || !el.getClientRects().length) return false;
    const card = el.querySelector(".modal-card");
    return el.getAnimations().concat(card ? card.getAnimations() : []).every(a => a.playState !== "running");
  }, { timeout: ms || 5000 }, sel).then(() => true).catch(() => false);
  const waitHidden = (sel, ms) => page.waitForFunction(s => { const el = document.querySelector(s); return !el || el.hidden; }, { timeout: ms || 5000 }, sel).then(() => true).catch(() => false);
  const store = () => page.evaluate(() => ({
    species: WN_STORE.unlockedCount(), zones: WN_STORE.stats().zonesVisited.length, distance: WN_STORE.stats().distanceM,
    badges: Object.keys(WN_STORE.badges()), friends: Object.keys(WN_STORE.friends()), level: WN_PROGRESS.snapshot().level.level,
    sighted: Object.values(WN_STORE.allEntries()).filter(e => e.tier === 3).length
  }));
  /** Close any celebrations that are showing (clicks "Nice" until none are left). */
  async function drainCelebrations(max) {
    const seen = [];
    for (let i = 0; i < (max || 6); i++) {
      if (!(await waitShown("#unlock-modal", i === 0 ? 1500 : 900))) break;
      seen.push(await page.$eval("#unlock-card .celebrate-kicker", el => el.textContent).catch(() => "?"));
      await page.click('#unlock-card [data-act="close"]');
      await waitHidden("#unlock-modal", 1500);
    }
    return seen;
  }
  /** Let pending badge checks run, then clear any celebration covering the screen. */
  async function settle() { await sleep(350); return drainCelebrations(4); }
  /** Zones the app is showing, rebuilt from the same public modules. */
  const zoneList = () => page.evaluate(() => {
    const S = WN_STORE.settings();
    const loc = WN_CONFIG.LOCATIONS.find(l => l.id === S.location) || WN_CONFIG.LOCATIONS[0];
    const sensitive = new Set(WN_DATA.allSpecies().filter(s => s.sensitive).map(s => s.key));
    const f = WN_ZONES.filterRecords(WN_DATA.records(), { lat: loc.lat, lng: loc.lng, radiusM: S.radius, sinceIso: WN_UTIL.monthsAgoIso(S.window), excludeKeys: sensitive });
    return WN_ZONES.buildZones(f, { speciesIndex: WN_DATA.state.speciesIndex }).map(z => ({ id: z.id, lat: z.lat, lng: z.lng, name: z.name, radius: z.radius, groups: z.groups }));
  });
  /** Centre of a zone's chip that is on screen and not under any floating panel. */
  const visibleZonePoint = () => page.evaluate(() => {
    const map = document.getElementById("map").getBoundingClientRect();
    const blockers = ["#explore-panel", ".statbar", "#hud-zone", "#btn-search-here", ".map-side", "#tabbar"].map(s => document.querySelector(s)).filter(el => el && !el.hidden).map(el => el.getBoundingClientRect());
    for (const chip of document.querySelectorAll(".zone-chip:not(.is-hidden) .zc-pill")) {
      const b = chip.getBoundingClientRect();
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      if (!b.width || x < map.left + 20 || x > map.right - 20 || y < map.top + 20 || y > map.bottom - 20) continue;
      if (blockers.some(r => x > r.left - 10 && x < r.right + 10 && y > r.top - 10 && y < r.bottom + 10)) continue;
      return { x, y };
    }
    return null;
  });
  /** Visible chips never overlap each other. */
  const chipsClear = () => page.evaluate(() => {
    const rects = [...document.querySelectorAll(".zone-chip:not(.is-hidden)")].map(el => el.getBoundingClientRect()).filter(r => r.width);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) return false;
    }
    return rects.length > 0;
  });
  /** Is the element at its own centre the top-most thing (not covered by a card or panel)? */
  const onTop = (sel) => page.evaluate((s) => {
    return [...document.querySelectorAll(s)].every(el => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit === el || el.contains(hit);
    });
  }, sel);
  const cards = (kind) => page.$$eval(".notif" + (kind ? ".is-" + kind : ""), els => els.filter(e => !e.classList.contains("is-leaving")).length);
  const clearCards = () => page.evaluate(() => document.querySelectorAll(".notif").forEach(n => n.remove()));
  const noOverflow = () => page.evaluate(() => {
    const views = ["view-map", "view-pokedex", "view-badges"].map(id => document.getElementById(id)).filter(v => !v.hidden);
    return document.documentElement.scrollWidth <= document.documentElement.clientWidth && views.every(v => v.scrollWidth <= v.clientWidth + 1);
  });

  // ---- 1. first run --------------------------------------------------------
  section("first run");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (server) await page.setGeolocation({ latitude: -27.4747, longitude: 152.9300, accuracy: 15 });   // 2 km west of the pilot centre: in the cache, outside every zone
  await page.goto(base, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(1200);
  check("splash fades away", await page.evaluate(() => !document.body.classList.contains("is-loading")));
  check("intro shows on first visit", await isShown("#onboarding"));
  await shot("01-intro");
  await page.click("#ob-next"); await sleep(600);
  await page.click("#ob-next"); await sleep(700);
  check("last intro slide offers location", /Turn on location/.test(await page.$eval("#ob-next", el => el.textContent)) && await isShown("#ob-later"));
  await page.click("#ob-later");
  check("intro closes", await waitHidden("#onboarding"));
  check("intro remembered", await page.evaluate(() => WN_STORE.profile().onboarded === true));

  // ---- 2. map ---------------------------------------------------------------
  section("map");
  await sleep(600);
  const summary = await page.$eval("#explore-summary", el => el.textContent);
  console.log("  summary: " + summary.trim());
  check("zones built", /\d+ zones/.test(summary) && !/^0 zones/.test(summary.trim()));
  check("three tabs", (await page.$$eval(".tabbar button", els => els.length)) === 3);
  check("no data bar on load", !(await isShown("#notice")));
  check("demo arrows hidden by default", !(await isShown("#dpad")));
  check("no emoji anywhere", await page.evaluate(() => !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(document.body.innerText)));
  check("zones drawn as cells", (await page.$$eval(".leaflet-overlay-pane path", els => els.length)) > 4);
  check("every zone has a chip", (await page.$$eval(".zone-chip", els => els.length)) === (await zoneList()).length);
  check("visible chips never overlap", await chipsClear());
  check("chips show animal-type dots", (await page.$$eval(".zone-chip .zc-dots i", els => els.length)) > 0);
  check("no safety banner element any more", (await page.$("#safety-banner")) === null);
  check("likely-around-here carousel filled", (await page.$$eval("#nearby-row .nearby-item", els => els.length)) > 3);
  check("map credit visible", /OpenStreetMap|Esri/.test(await page.$eval("#map-credit", el => el.textContent)));
  if (server) check("GPS started on its own (permission granted earlier)", (await page.$(".you-marker")) !== null && /away|from/.test(await page.$eval("#hud-zone", el => el.textContent)), await page.$eval("#hud-zone", el => el.textContent));
  await shot("02-map");
  await page.click("#panel-toggle"); await sleep(300);
  check("Change opens the controls", await isShown("#explore-controls"));
  await page.click("#panel-toggle"); await sleep(200);
  await page.click("#card-handle"); await sleep(250);
  check("handle collapses the card", await page.$eval("#explore-panel", el => el.classList.contains("is-compact")));
  await page.click("#card-handle"); await sleep(250);

  // tap a zone you are not in
  if (server) { await page.click("#btn-follow"); await page.evaluate(() => WN_MAP.fitCircle()); await sleep(900); }
  const zp = await visibleZonePoint();
  check("a zone is visible to tap", zp !== null);
  if (zp) await page.mouse.click(zp.x, zp.y);
  check("zone sheet opens", await waitShown("#zone-sheet"));
  check("zone sheet lists species with recency", await page.$eval("#zone-species", el => el.querySelectorAll(".species-row").length > 0 && /recorded .*(ago|today|yesterday)/.test(el.textContent)));
  check("outside the zone: hint, no report buttons", await isShown("#zone-hint") && (await page.$$eval("#zone-species [data-report]", els => els.length)) === 0);
  await sleep(600);   // let the sheet finish sliding in
  check("zone sheet sits above the tab bar", await page.evaluate(() => document.getElementById("zone-sheet").getBoundingClientRect().bottom <= document.getElementById("tabbar").getBoundingClientRect().top + 1));
  await shot("03-zone-outside");
  await page.click("#zone-sheet [data-close]");
  check("zone sheet closes", await waitHidden("#zone-sheet"));
  if (server) await page.click("#btn-follow");

  // ---- 3. walking with real GPS (emulated fixes) --------------------------------
  if (server) {
    section("walking with GPS");
    const zones = await zoneList();
    const z0 = zones[0];
    await page.setGeolocation({ latitude: z0.lat, longitude: z0.lng, accuracy: 10 });
    await page.click("#btn-locate");
    check("entering a zone slides in an alert card", await waitShown(".notif.is-zone", 4000));
    await sleep(500);
    check("no pop-up and no sheet opened by itself", !(await isShown("#unlock-modal")) && !(await isShown("#zone-sheet")));
    check("the card carries the safety reminder", /Stay on the trail/.test(await page.$eval(".notif.is-zone", el => el.textContent)));
    await shot("04-zone-card");
    const st = await store();
    check("zone visit collected species quietly", st.species > 0, st.species);
    check("first badges earned (First Neighbour, Into the Wild)", st.badges.includes("col-1") && st.badges.includes("zone-1"), st.badges.join(","));
    check("badges earned by walking arrive as a card, not a pop-up", (await cards("badge")) === 1 && !(await isShown("#unlock-modal")));
    check("level chip shows the level", Number(await page.$eval("#level-num", el => el.textContent)) === st.level, "level " + st.level);
    check("new-badge dot on the Badges tab", await isShown("#badges-dot"));
    check("status pill names the zone", await page.$eval("#hud-zone", el => el.classList.contains("is-in") && /^In /.test(el.textContent) && !el.disabled));
    check("the zone you are in is highlighted", (await page.$$eval(".zone-chip.is-active", els => els.length)) === 1);
    await page.click(".notif.is-zone .notif-main");
    check("tapping the card opens the zone", await waitShown("#zone-sheet"));
    check("sheet: report buttons, New tags and the safety line", (await page.$$eval('#zone-species [data-report="3"]', els => els.length)) > 0 &&
      (await page.$$eval("#zone-species .new-tag", els => els.length)) > 0 && await page.$eval("#zone-hint", el => el.classList.contains("is-safety") && !el.hidden));
    await shot("05-zone-sheet");
    await page.click("#zone-sheet [data-close]"); await waitHidden("#zone-sheet");
    await page.click("#hud-zone");
    check("the status pill opens the zone too", await waitShown("#zone-sheet"));
    await page.click("#zone-sheet [data-close]"); await waitHidden("#zone-sheet");
    await clearCards();
    // walk west in 150 m steps until well past the edge of the search area
    let lastLng = z0.lng;
    for (let i = 1; i <= 22; i++) { lastLng = z0.lng - i * 0.00152; await page.setGeolocation({ latitude: z0.lat, longitude: lastLng, accuracy: 10 }); await sleep(140); }
    await sleep(600);
    const outside = await page.evaluate((lat, lng) => !WN_ZONES.zoneAt((() => { const S = WN_STORE.settings(); const loc = WN_CONFIG.LOCATIONS[0]; return WN_ZONES.buildZones(WN_ZONES.filterRecords(WN_DATA.records(), { lat: loc.lat, lng: loc.lng, radiusM: S.radius, sinceIso: WN_UTIL.monthsAgoIso(S.window) }), { speciesIndex: WN_DATA.state.speciesIndex }); })(), lat, lng), z0.lat, lastLng);
    check("walking out of every zone clears the pill", outside && await page.$eval("#hud-zone", el => el.classList.contains("is-out") && el.disabled));
    check("GPS walking counts distance", (await store()).distance > 500, Math.round((await store()).distance) + " m");

    section("far away (overseas)");
    await page.reload({ waitUntil: "networkidle2" }); await sleep(900);
    await page.setGeolocation({ latitude: -6.2088, longitude: 106.8456, accuracy: 20 });   // Jakarta
    await page.click("#btn-locate"); await sleep(1500);
    const far = await page.$eval("#explore-summary", el => el.textContent);
    check("search stays on Mt Coot-tha", /\d+ zones/.test(far) && !/covers Brisbane/.test(far));
    check("pill explains the distance", /from/.test(await page.$eval("#hud-zone", el => el.textContent)));
    await page.setGeolocation({ latitude: -27.4747, longitude: 152.9300, accuracy: 15 });
    await page.reload({ waitUntil: "networkidle2" }); await sleep(900);
  }

  // ---- 4. demo tools --------------------------------------------------------------
  section("demo tools");
  await page.click("#btn-settings");
  check("settings sheet opens", await waitShown("#settings-sheet"));
  check("data source switch lives in settings", (await page.$$eval("#settings-sheet [data-source]", els => els.length)) === 2);
  await shot("06-settings");
  const before = await store();
  await page.click("#btn-jump");
  check("jump closes settings and shows the arrows", await waitHidden("#settings-sheet") && await waitShown("#dpad"));
  check("jump enters a zone and shows a card", await waitShown(".notif.is-zone", 4000));
  check("still no pop-up on zone entry", !(await isShown("#unlock-modal")) && !(await isShown("#zone-sheet")));
  check("demo arrows are not covered by cards", await onTop("#dpad button"));
  await page.click(".notif.is-zone .notif-main");
  check("zone sheet with report buttons", await waitShown("#zone-sheet") && (await page.$$eval('#zone-species [data-report="3"]', els => els.length)) > 0);
  await page.click('#zone-species [data-report="3"]');
  check("sighting celebration", await waitShown("#unlock-modal", 2000) && /Sighting/.test(await page.$eval("#unlock-card .celebrate-kicker", el => el.textContent)));
  await shot("07-sighting");
  const k2 = await drainCelebrations();
  check("a badge earned by tapping still celebrates", k2.some(k => /badge/i.test(k)) && (await store()).badges.includes("see-1"), k2.join(" | "));
  const afterJump = await store();
  check("sighting recorded", afterJump.sighted > before.sighted, afterJump.sighted);
  check("tier upgraded in the sheet", await page.$eval("#zone-species", el => /Sighted/.test(el.textContent)));
  await page.click("#zone-sheet [data-close]"); await waitHidden("#zone-sheet");
  const d0 = (await store()).distance;
  for (let i = 0; i < 4; i++) { await page.click('#dpad [data-dir="n"]'); await sleep(70); }
  check("arrow steps add distance", (await store()).distance - d0 >= 99, Math.round((await store()).distance - d0) + " m");
  await settle();   // distance badges may pop up

  // demo mode: the arrows are the only way to move
  check("no search-centre dot next to you", (await page.$$eval('.leaflet-overlay-pane path[fill="#e8a94b"][fill-opacity="1"]', els => els.length)) === 0);
  const posBefore = await page.evaluate(() => WN_WALK.position());
  const emptySpot = await page.evaluate(() => {
    const map = document.getElementById("map").getBoundingClientRect();
    for (let y = map.top + 140; y < map.bottom - 200; y += 23) for (let x = map.left + 30; x < map.right - 90; x += 27) {
      const el = document.elementFromPoint(x, y);
      if (el && (el.classList.contains("leaflet-tile") || el.id === "map" || el.classList.contains("leaflet-container"))) return { x, y };
    }
    return null;
  });
  check("found an empty spot on the map to tap", emptySpot !== null);
  if (emptySpot) { await page.mouse.click(emptySpot.x, emptySpot.y); await sleep(500); }
  const posAfterTap = await page.evaluate(() => WN_WALK.position());
  check("tapping the map does not move you in demo mode", posAfterTap.lat === posBefore.lat && posAfterTap.lng === posBefore.lng);
  await clearCards();
  await page.evaluate(() => WN_MAP.fitCircle());      // show every zone, not just the one you are in
  await sleep(1000);
  const chipPt = await visibleZonePoint();
  check("a zone is visible to tap in demo mode", chipPt !== null);
  if (chipPt) {
    await page.mouse.click(chipPt.x, chipPt.y);
    check("tapping a zone in demo mode opens it", await waitShown("#zone-sheet"));
    const posAfterZone = await page.evaluate(() => WN_WALK.position());
    check("...without moving you", posAfterZone.lat === posBefore.lat && posAfterZone.lng === posBefore.lng);
    await page.click("#zone-sheet [data-close]"); await waitHidden("#zone-sheet");
  }
  const holdFrom = (await store()).distance;
  const east = await (await page.$('#dpad [data-dir="e"]')).boundingBox();
  await page.mouse.move(east.x + east.width / 2, east.y + east.height / 2);
  await page.mouse.down(); await sleep(1150); await page.mouse.up();
  await sleep(400);
  const walkedHold = (await store()).distance - holdFrom;
  check("holding an arrow keeps walking", walkedHold >= 100, Math.round(walkedHold) + " m");
  const stopped = (await store()).distance;
  await sleep(500);
  check("letting go stops the walk", (await store()).distance === stopped);
  await settle();

  // ---- alert filters ------------------------------------------------------------------
  section("alert filters");
  await clearCards();
  await page.click("#btn-settings");
  await waitShown("#settings-sheet");
  check("alerts section with four animal toggles", (await page.$$eval("#alert-groups .type-toggle.is-on", els => els.length)) === 4);
  for (const g of ["mammal", "bird", "reptile"]) await page.click(`#alert-groups [data-group="${g}"]`);
  check("frogs only", (await page.$$eval("#alert-groups .type-toggle.is-on", els => els.map(e => e.dataset.group))).join() === "frog");
  check("hint explains the choice", /frogs/.test(await page.$eval("#alert-groups-hint", el => el.textContent)));
  await shot("08-alert-settings");
  await page.click("#settings-sheet [data-close]"); await waitHidden("#settings-sheet");
  const visitedNow = await page.evaluate(() => WN_STORE.stats().zonesVisited);
  const pool = (await zoneList()).filter(z => !visitedNow.includes(z.id));
  const noFrogs = pool.find(z => !z.groups.frog);
  const before2 = (await store()).species;
  await page.evaluate((z) => WN_WALK.teleport(z.lat, z.lng), noFrogs);
  await sleep(1200);
  check("zone without frogs: no card", (await cards("zone")) === 0, noFrogs.name);
  check("...but its species are still collected", (await store()).species > before2);
  await page.click("#btn-settings"); await waitShown("#settings-sheet");
  for (const g of ["mammal", "bird", "reptile"]) await page.click(`#alert-groups [data-group="${g}"]`);
  await page.click("#alerts-toggle");
  check("master switch dims the toggles", await page.$eval("#alert-groups", el => el.classList.contains("is-off")));
  await page.click("#settings-sheet [data-close]"); await waitHidden("#settings-sheet");
  const other = (await zoneList()).find(z => z.id !== noFrogs.id && !visitedNow.includes(z.id));
  await clearCards();
  await page.evaluate((z) => WN_WALK.teleport(z.lat, z.lng), other);
  await sleep(1200);
  check("alerts off: no cards at all", (await cards()) === 0);
  await page.click("#btn-settings"); await waitShown("#settings-sheet");
  await page.click("#alerts-toggle");
  await page.click("#settings-sheet [data-close]"); await waitHidden("#settings-sheet");
  check("settings remembered", await page.evaluate(() => WN_STORE.settings().alertsOn === true && WN_STORE.settings().alertGroups.length === 4));
  const third = (await zoneList()).find(z => z.id !== noFrogs.id && z.id !== other.id && !visitedNow.includes(z.id));
  if (third) {
    await page.evaluate((z) => WN_WALK.teleport(z.lat, z.lng), third);
    check("alerts back on: card appears again", await waitShown(".notif.is-zone", 3000));
    const swipe = await page.$(".notif.is-zone");
    const box = await swipe.boundingBox();
    await page.mouse.move(box.x + box.width - 40, box.y + 30);
    await page.mouse.down(); await page.mouse.move(box.x - 60, box.y + 30, { steps: 8 }); await page.mouse.up();
    await sleep(500);
    check("swiping a card away dismisses it without opening the zone", (await cards("zone")) === 0 && !(await isShown("#zone-sheet")));
  }
  await settle();

  // ---- 5. pokedex ----------------------------------------------------------------
  section("pokedex");
  await page.click('.tabbar button[data-tab="pokedex"]');
  await sleep(700);
  check("cards rendered", (await page.$$eval(".card", els => els.length)) > 500);
  check("locked cards hide the name", await page.$eval(".card.is-locked .card-name", el => el.textContent === "???"));
  check("cards are numbered", /No\. \d{3}/.test(await page.$eval(".card .card-no", el => el.textContent)));
  await page.click('#group-filter [data-group="bird"]'); await sleep(400);
  check("bird tile filters to birds", await page.$$eval(".card", els => els.length > 0 && els.every(c => c.classList.contains("t-bird"))));
  await page.click('#group-filter [data-group="all"]'); await sleep(300);
  await page.click('#state-filter [data-state="unlocked"]'); await sleep(400);
  const found = await page.$$eval(".card", els => els.length);
  check("Found filter shows unlocked entries", found === (await store()).species, found);
  await page.select("#dex-sort", "recent"); await sleep(300);
  await shot("08-pokedex");
  await page.$eval(".card.is-unlocked", el => el.click());
  check("entry opens", await waitShown("#entry-modal"));
  check("entry shows number, tiles and unlock details", await page.$eval("#entry-body", el => /No\. \d{3}/.test(el.textContent) && /Rarity/.test(el.textContent) && /Unlocked/.test(el.textContent)));
  const sample = path.join(PROJECT, "data/img", (await page.evaluate(() => Object.keys(window.WN_CACHED.images).find(k => window.WN_CACHED.images[k].local))) + ".jpg");
  await sleep(500);
  const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 5000 }), page.$eval('#entry-body [data-act="photo"]', el => el.click())]);
  await chooser.accept([sample]);
  await sleep(1400);
  const snapKick = await settle();          // the Snapshot badge celebrates on top of the entry
  check("Snapshot badge celebrated over the entry", snapKick.some(k => /badge/i.test(k)), snapKick.join(" | "));
  check("your photo appears", await page.$eval("#entry-body", el => el.querySelectorAll(".your-photo img[src^='data:image/jpeg']").length === 1));
  check("replace and delete offered", (await page.$('#entry-foot [data-act="remove-photo"]')) !== null);
  await shot("09-entry-photo");
  await page.click("#entry-close");
  check("entry closes", await waitHidden("#entry-modal"));
  check("Snapshot badge earned", (await store()).badges.includes("pic-1"));
  check("camera icon on the card", (await page.$(".card .card-icon")) !== null);

  // ---- 6. badges ------------------------------------------------------------------
  section("badges");
  await page.click('.tabbar button[data-tab="badges"]');
  await sleep(900);
  const sb = await store();
  check("ranger card shows the level", Number(await page.$eval(".ranger-level-text b", el => el.textContent)) === sb.level);
  check("all 53 badges listed", (await page.$$eval(".badge-tile", els => els.length)) === 53);
  check("earned count matches", (await page.$$eval(".badge-tile.is-earned", els => els.length)) === sb.badges.length, sb.badges.length);
  check("next-up goals shown", (await page.$$eval(".next-card", els => els.length)) === 3);
  check("secret badges stay secret", (await page.$$eval(".badge-tile", els => els.filter(e => /Secret badge/.test(e.textContent)).length)) >= 1);
  await shot("10-badges");
  await page.$eval(".badge-tile.is-earned", el => el.click());
  check("badge detail opens", await waitShown("#badge-sheet"));
  await page.click("#badge-sheet [data-close]");
  check("badge detail closes", await waitHidden("#badge-sheet"));
  await sleep(2200);
  check("badges marked seen after viewing", await page.evaluate(() => WN_STORE.unseenBadgeCount() === 0));

  section("friends");
  await page.click('.ranger-actions [data-act="share"]');
  check("share sheet opens", await waitShown("#friend-sheet"));
  await page.click("#btn-copy-card");
  check("copy gives feedback", await waitShown("#toast", 2000));
  await page.click("#friend-sheet [data-close]"); await waitHidden("#friend-sheet");
  const code = await page.evaluate(() => WN_PROGRESS.encodeCard({ v: 1, id: "fr1end9", n: "Gentle Glider", x: 1460, s: 41, t3: 6, t2: 3, z: 9, d: 7400, st: 4, a: 3, b: ["col-1", "col-10", "zone-1", "see-1", "night-owl"], g: [3, 31, 4, 3], u: "2026-10-02" }));
  await page.goto(base + "#friend=" + code, { waitUntil: "networkidle2" });
  await sleep(1200);
  check("friend link adds the friend", (await store()).friends.includes("fr1end9"));
  check("link fragment cleared", await page.evaluate(() => !location.hash));
  await drainCelebrations(3);
  check("Better Together badge earned", (await store()).badges.includes("friend-1"));
  check("comparison opens", await waitShown("#compare-sheet"));
  check("comparison has 8 rows", (await page.$$eval("#compare-body .cmp-row", els => els.length)) === 8);
  await shot("11-compare");
  await page.click("#compare-sheet [data-close]"); await waitHidden("#compare-sheet");
  check("leaderboard has you and your friend", (await page.$$eval("#friends-section .board-row", els => els.length)) === 2);
  await page.click('#friends-section [data-metric="d"]'); await sleep(200);
  check("leaderboard re-ranks by distance", /walked/.test(await page.$eval("#friends-section .board-row .board-score", el => el.textContent)));
  await page.$eval('#friends-section [data-friend="fr1end9"]', el => el.click());
  check("tapping a friend opens the comparison", await waitShown("#compare-sheet"));
  await page.click('#compare-body [data-act="remove-friend"]');
  await sleep(500);
  check("remove friend", !(await store()).friends.includes("fr1end9"));
  const own = await page.evaluate(() => WN_PROGRESS.encodeCard(WN_PROGRESS.myCard()));
  await page.evaluate((c) => WN_BADGES.addFromText(c), own); await sleep(300);
  check("your own card is refused", (await store()).friends.length === 0);

  // ---- 7. persistence, links, offline ------------------------------------------------
  section("persistence");
  const keep = await store();
  await page.goto(base, { waitUntil: "networkidle2" }); await sleep(1300);
  const again = await store();
  check("progress survives a reload", again.species === keep.species && again.badges.length === keep.badges.length);
  check("intro not shown again", !(await isShown("#onboarding")));
  check("demo mode survives a reload", await isShown("#dpad"));
  await page.goto(base + "#demo", { waitUntil: "networkidle2" }); await sleep(1100);
  check("#demo opens settings", await isShown("#settings-sheet"));
  await page.click("#settings-sheet [data-close]"); await waitHidden("#settings-sheet");
  if (server) {
    const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r; });
    check("service worker registered (offline app shell)", sw);
  }

  // ---- 8. layouts ------------------------------------------------------------------
  section("layouts");
  await page.evaluate(() => WN_STORE.setSetting("cardCompact", null));   // as for someone who never folded the card
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(base, { waitUntil: "networkidle2" }); await sleep(1200);
  check("small phone: explore card starts folded", await page.$eval("#explore-panel", el => el.classList.contains("is-compact")));
  await page.evaluate(() => WN_WALK.jumpToNearestZone());
  await waitShown(".notif", 3000);
  check("small phone: arrows stay clear of cards and panels", await onTop("#dpad button"), "4 arrows");
  await shot("12a-small-phone-demo");
  await clearCards();
  for (const [w, h, label] of [[375, 667, "small-phone"], [1366, 860, "laptop"]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 900, hasTouch: w < 900 });
    await page.goto(base, { waitUntil: "networkidle2" }); await sleep(1200);
    for (const tab of ["map", "pokedex", "badges"]) {
      await page.click(`.tabbar button[data-tab="${tab}"]`); await sleep(500);
      check(`${label}: ${tab} fits the screen`, await noOverflow());
      await shot(`12-${label}-${tab}`);
    }
  }
  await page.$eval(".card.is-unlocked", el => el.click()).catch(() => {});
  await page.click('.tabbar button[data-tab="pokedex"]'); await sleep(400);
  await page.$eval(".card.is-unlocked", el => el.click());
  await waitShown("#entry-modal");
  check("laptop: entry shows photo and details side by side", await page.evaluate(() => getComputedStyle(document.getElementById("entry-body")).gridTemplateColumns.split(" ").length === 2));
  await shot("13-laptop-entry");

  console.log("\nconsole errors/warnings:", logs.length ? "\n  " + logs.slice(0, 12).join("\n  ") : "none");
  console.log("page errors:", errors.length ? "\n  " + errors.join("\n  ") : "none");
  check("no page errors", errors.length === 0);

  await browser.close();
  if (http) http.kill();
  console.log(failures ? `\n${failures} check(s) failed` : "\nall smoke checks passed");
  process.exit(failures ? 1 : 0);
})().catch(err => { console.error("smoke test crashed:", err); process.exit(2); });
