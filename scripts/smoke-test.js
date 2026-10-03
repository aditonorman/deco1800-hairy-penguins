/**
 * Headless browser smoke test for Wild Neighbours.
 * Serves the project folder, loads the app in Chrome and walks through the
 * main flows: first-run intro, map and zones, GPS walking (emulated
 * positions), demo tools, unlock + badge celebrations, Pokedex, photo
 * attach, Badges tab, friend links, persistence, offline support and
 * layout at phone, small-phone and laptop sizes. Screenshots go to
 * scripts/screenshots/.
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
    return WN_ZONES.buildZones(f, { speciesIndex: WN_DATA.state.speciesIndex }).map(z => ({ id: z.id, lat: z.lat, lng: z.lng, name: z.name, radius: z.radius }));
  });
  /** Centre of a zone circle that is on screen and not under any floating panel. */
  const visibleZonePoint = () => page.evaluate(() => {
    const map = document.getElementById("map").getBoundingClientRect();
    const blockers = ["#explore-panel", ".statbar", "#hud-zone", "#btn-search-here", ".map-side"].map(s => document.querySelector(s)).filter(el => el && !el.hidden).map(el => el.getBoundingClientRect());
    const tab = document.getElementById("tabbar").getBoundingClientRect();
    blockers.push(tab);
    for (const p of document.querySelectorAll(".leaflet-interactive")) {
      const b = p.getBoundingClientRect();
      if (b.width < 30 || p.getAttribute("stroke") === "#e8a94b") continue;
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      if (x < map.left + 20 || x > map.right - 20 || y < map.top + 20 || y > map.bottom - 20) continue;
      if (blockers.some(r => x > r.left - 10 && x < r.right + 10 && y > r.top - 10 && y < r.bottom + 10)) continue;
      return { x, y };
    }
    return null;
  });
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
  check("zone circles drawn", (await page.$$eval(".leaflet-interactive", els => els.length)) > 4);
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
    check("entering a zone shows the safety banner", await waitShown("#safety-banner", 4000));
    await shot("04-banner");
    await page.click("#safety-ok");
    check("species celebration", await waitShown("#unlock-modal", 3000));
    await shot("05-celebrate-species");
    const kickers = await drainCelebrations();
    check("badge celebration follows the species one", kickers.length >= 2 && /badge/i.test(kickers[1]), kickers.join(" | "));
    const st = await store();
    check("zone visit unlocked species", st.species > 0, st.species);
    check("first badges earned (First Neighbour, Into the Wild)", st.badges.includes("col-1") && st.badges.includes("zone-1"), st.badges.join(","));
    check("level chip shows the level", Number(await page.$eval("#level-num", el => el.textContent)) === st.level, "level " + st.level);
    check("new-badge dot on the Badges tab", await isShown("#badges-dot"));
    check("status pill names the zone", await page.$eval("#hud-zone", el => el.classList.contains("is-in") && /^In /.test(el.textContent)));
    check("inside the zone: report buttons", (await page.$$eval('#zone-species [data-report="3"]', els => els.length)) > 0);
    for (let i = 1; i <= 8; i++) { await page.setGeolocation({ latitude: z0.lat + i * 0.00135, longitude: z0.lng, accuracy: 10 }); await sleep(220); }
    await sleep(500);
    check("walking out clears the pill", await page.$eval("#hud-zone", el => el.classList.contains("is-out")));
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
  check("jump enters a zone", await waitShown("#safety-banner", 4000));
  await page.click("#safety-ok");
  await drainCelebrations();
  check("zone sheet with report buttons", await waitShown("#zone-sheet") && (await page.$$eval('#zone-species [data-report="3"]', els => els.length)) > 0);
  await page.click('#zone-species [data-report="3"]');
  check("sighting celebration", await waitShown("#unlock-modal", 2000) && /Sighting/.test(await page.$eval("#unlock-card .celebrate-kicker", el => el.textContent)));
  await shot("07-sighting");
  const k2 = await drainCelebrations();
  check("First Sighting badge celebrated", k2.some(k => /badge/i.test(k)) || (await store()).badges.includes("see-1"), k2.join(" | "));
  const afterJump = await store();
  check("sighting recorded", afterJump.sighted > before.sighted, afterJump.sighted);
  check("tier upgraded in the sheet", await page.$eval("#zone-species", el => /Sighted/.test(el.textContent)));
  await page.click("#zone-sheet [data-close]"); await waitHidden("#zone-sheet");
  const d0 = (await store()).distance;
  for (let i = 0; i < 4; i++) { await page.click('#dpad [data-dir="n"]'); await sleep(70); }
  check("arrow steps add distance", (await store()).distance - d0 >= 99, Math.round((await store()).distance - d0) + " m");
  await settle();   // distance badges may pop up

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
