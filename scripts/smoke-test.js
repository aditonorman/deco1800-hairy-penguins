/**
 * Headless browser smoke test for Wild Neighbours.
 * Serves the project folder, loads the app in Chrome, walks through the main
 * flows (zones, GPS and simulated walking, unlocks, Pokedex, photo attach,
 * persistence, settings) and saves screenshots to scripts/screenshots/.
 *
 * One-off setup (not needed to run the app itself):
 *   npm install --no-save --no-package-lock puppeteer-core
 *   node scripts/smoke-test.js          # via a local http server
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail) { console.log((ok ? "  ok   " : "  FAIL ") + name + (detail ? " (" + detail + ")" : "")); if (!ok) failures++; }

/** Centre of the first zone circle that is fully visible on the map and clear of overlays. */
async function visibleZonePoint(page) {
  return page.evaluate(() => {
    const map = document.getElementById("map").getBoundingClientRect();
    const card = document.getElementById("explore-panel").getBoundingClientRect();
    const paths = Array.from(document.querySelectorAll(".leaflet-interactive"));
    for (const p of paths) {
      const b = p.getBoundingClientRect();
      if (b.width < 30) continue;                             // centre dot
      if (p.getAttribute("stroke") === "#e8a94b") continue;   // search radius ring
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const underCard = cx > card.left && cx < card.right && cy > card.top && cy < card.bottom;
      if (!underCard && cx > map.left + 60 && cx < map.right - 60 && cy > map.top + 60 && cy < map.bottom - 20) return { x: cx, y: cy };
    }
    return null;
  });
}
/** Lat/lng of a zone centre, read from the app's own zone tooltips is not possible; use the data instead. */
async function zoneCentre(page, index) {
  return page.evaluate((i) => {
    // rebuild the zones the same way the app does, through the public modules
    const S = WN_STORE.settings();
    const loc = WN_CONFIG.LOCATIONS.find(l => l.id === S.location) || WN_CONFIG.LOCATIONS[0];
    const sensitive = new Set(WN_DATA.allSpecies().filter(s => s.sensitive).map(s => s.key));
    const f = WN_ZONES.filterRecords(WN_DATA.records(), { lat: loc.lat, lng: loc.lng, radiusM: S.radius, sinceIso: WN_UTIL.monthsAgoIso(S.window), excludeKeys: sensitive });
    const z = WN_ZONES.buildZones(f, { speciesIndex: WN_DATA.state.speciesIndex });
    return z[i] ? { lat: z[i].lat, lng: z[i].lng, name: z[i].name, count: z.length } : null;
  }, index);
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = mode === "server" ? spawn("python3", ["-m", "http.server", String(PORT)], { cwd: PROJECT, stdio: "ignore" }) : null;
  if (server) await sleep(800);
  const url = mode === "server" ? `http://localhost:${PORT}/index.html` : "file://" + PROJECT + "/index.html";

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"] });
  const context = browser.defaultBrowserContext();
  if (mode === "server") await context.overridePermissions(`http://localhost:${PORT}`, ["geolocation"]);
  const page = await browser.newPage();
  const errors = [], logs = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") logs.push(m.type() + ": " + m.text()); });
  page.on("requestfailed", r => { if (!/tile\.|fonts\.g|images\.ala|arcgisonline/.test(r.url())) logs.push("requestfailed: " + r.url()); });
  page.on("dialog", d => d.accept());

  // ---- phone width, first load ----
  await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // Permission is pre-granted in server mode, so the app starts GPS on load.
  // Start 2 km west of the Mt Coot-tha centre: inside the cache, outside every zone.
  if (mode === "server") await page.setGeolocation({ latitude: -27.4747, longitude: 152.9300, accuracy: 15 });
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(1500);
  const summary = await page.$eval("#explore-summary", el => el.textContent);
  console.log("summary:", summary.trim());
  check("zones built", /\d+ habitat zones/.test(summary) && !/^0 habitat/.test(summary.trim()));
  check("two tabs only", await page.$$eval(".tabbar button", els => els.length === 2));
  check("no cached-data bar on load", await page.$eval("#notice", el => el.hidden));
  check("demo d-pad hidden by default", await page.$eval("#dpad", el => el.hidden));
  if (mode === "server") {
    check("GPS auto-started: marker drawn, pill says how far the nearest zone is", (await page.$(".you-marker")) !== null && /away|from/.test(await page.$eval("#hud-zone", el => el.textContent)), await page.$eval("#hud-zone", el => el.textContent));
  }
  check("no emoji anywhere in the page", await page.evaluate(() => !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(document.body.innerText)));
  const zoneCount = await page.$$eval(".leaflet-interactive", els => els.length);
  check("zone shapes drawn on map", zoneCount > 2, zoneCount + " shapes");
  await page.screenshot({ path: path.join(SHOTS, `${mode}-1-map-phone.png`) });
  await page.click("#panel-toggle");
  await sleep(300);
  check("Change opens the location controls", await page.$eval("#explore-controls", el => !el.hidden));
  await page.screenshot({ path: path.join(SHOTS, `${mode}-1b-controls-phone.png`) });
  await page.click("#panel-toggle");
  await sleep(200);

  // tap a zone while NOT in it: sheet opens with a hint and no report buttons
  const zp = await visibleZonePoint(page);
  check("a zone is visible to tap", zp !== null);
  if (zp) await page.mouse.click(zp.x, zp.y);
  await sleep(500);
  check("zone sheet opens on tap", await page.$eval("#zone-sheet", el => !el.hidden));
  check("zone sheet lists species", (await page.$$eval("#zone-species .species-row", els => els.length)) > 0);
  check("recency text shown", await page.$eval("#zone-species", el => /recorded .* ago|recorded today|recorded yesterday/.test(el.textContent)));
  check("hint instead of report buttons when outside the zone", await page.$eval("#zone-hint", el => !el.hidden) && (await page.$$eval('#zone-species [data-report]', els => els.length)) === 0);
  await page.screenshot({ path: path.join(SHOTS, `${mode}-2-zone-sheet-phone.png`) });
  await page.click("#zone-close");

  // Pokedex before any unlock
  await page.click('.tabbar button[data-tab="pokedex"]');
  await sleep(400);
  const cards = await page.$$eval(".card", els => els.length);
  check("pokedex cards rendered", cards > 100, cards + " cards");
  check("locked cards show ???", await page.$eval(".card.is-locked .card-name", el => el.textContent === "???"));
  await page.screenshot({ path: path.join(SHOTS, `${mode}-3-pokedex-locked-phone.png`) });
  await page.click('.tabbar button[data-tab="map"]');
  await sleep(300);

  // ---- real GPS path (server mode only: emulated fix inside a zone) ----
  if (mode === "server") {
    const z0 = await zoneCentre(page, 0);
    check("zone centre available for GPS test", z0 !== null, z0 && z0.name);
    await page.setGeolocation({ latitude: z0.lat, longitude: z0.lng, accuracy: 12 });
    await page.click("#btn-locate");
    await sleep(1200);
    check("GPS: you marker drawn", (await page.$(".you-marker")) !== null);
    check("GPS: safety banner on zone entry", await page.$eval("#safety-banner", el => !el.hidden));
    await page.screenshot({ path: path.join(SHOTS, `${mode}-4-safety-banner-phone.png`) });
    await page.click("#safety-ok");
    await sleep(600);
    check("GPS: celebration after zone entry", await page.$eval("#unlock-modal", el => !el.hidden));
    await page.screenshot({ path: path.join(SHOTS, `${mode}-5-celebration-phone.png`) });
    await sleep(2600);
    check("GPS: celebration auto-closed", await page.$eval("#unlock-modal", el => el.hidden));
    check("GPS: HUD pill names the zone", await page.$eval("#hud-zone", el => el.classList.contains("is-in") && /^In /.test(el.textContent)));
    check("GPS: zones visited = 1", (await page.$eval("#stat-zones", el => Number(el.textContent))) === 1);
    // walk out: fixes every 150 m northwards (a 2 km jump would be ignored as a GPS glitch)
    for (let i = 1; i <= 8; i++) {
      await page.setGeolocation({ latitude: z0.lat + i * 0.00135, longitude: z0.lng, accuracy: 12 });
      await sleep(250);
    }
    await sleep(600);
    check("GPS: leaving the zone clears the pill", await page.$eval("#hud-zone", el => el.classList.contains("is-out")));
    check("GPS: distance walked counted", (await page.$eval("#stat-distance", el => el.textContent)) !== "0 m", await page.$eval("#stat-distance", el => el.textContent));
  }

  // ---- far-away user (e.g. overseas): keep the Brisbane spot ----
  if (mode === "server") {
    await page.reload({ waitUntil: "networkidle2" });
    await sleep(800);
    await page.setGeolocation({ latitude: -6.2088, longitude: 106.8456, accuracy: 20 });   // Jakarta
    await page.click("#btn-locate");
    await sleep(1500);
    const farSummary = await page.$eval("#explore-summary", el => el.textContent);
    check("far away: search stays on Mt Coot-tha", /habitat zones/.test(farSummary) && !/covers Brisbane/.test(farSummary), farSummary.trim().slice(0, 60));
    check("far away: pill explains the distance", /from/.test(await page.$eval("#hud-zone", el => el.textContent)), await page.$eval("#hud-zone", el => el.textContent));
    await page.setGeolocation({ latitude: -27.4747, longitude: 152.9300, accuracy: 15 });
    await page.reload({ waitUntil: "networkidle2" });
    await sleep(800);
  }

  // ---- demo tools via settings ----
  await page.click("#btn-settings");
  await sleep(400);
  check("settings sheet opens", await page.$eval("#settings-sheet", el => !el.hidden));
  check("data source toggle lives in settings", (await page.$$eval("#settings-sheet [data-source]", els => els.length)) === 2);
  await page.screenshot({ path: path.join(SHOTS, `${mode}-6-settings-phone.png`) });
  await page.click("#btn-jump");             // turns on simulation and jumps into the nearest unvisited zone
  await sleep(900);
  check("jump: settings closed and d-pad shown", await page.$eval("#settings-sheet", el => el.hidden) && await page.$eval("#dpad", el => !el.hidden));
  check("jump: safety banner", await page.$eval("#safety-banner", el => !el.hidden));
  await page.click("#safety-ok");
  await sleep(600);
  check("jump: celebration", await page.$eval("#unlock-modal", el => !el.hidden));
  await sleep(2600);
  check("jump: zone sheet open with report buttons", await page.$eval("#zone-sheet", el => !el.hidden) && (await page.$$eval('#zone-species [data-report="3"]', els => els.length)) > 0);
  const found = await page.$eval("#stat-species", el => parseInt(el.textContent, 10));
  check("species found > 0", found > 0, String(found));

  // I spotted it -> tier 3
  await page.click('#zone-species [data-report="3"]');
  await sleep(500);
  check("sighting celebration shown", await page.$eval("#unlock-modal", el => !el.hidden));
  check("celebration says sighting logged", /Sighting/.test(await page.$eval("#unlock-card .celebrate-kicker", el => el.textContent)));
  await page.screenshot({ path: path.join(SHOTS, `${mode}-7-sighting-phone.png`) });
  await page.click('#unlock-card [data-act="close"]');
  await sleep(300);
  check("tier badge upgraded in sheet", await page.$eval("#zone-species", el => /Sighted/.test(el.textContent)));
  await page.click("#zone-close");
  await sleep(200);

  // D-pad steps add distance
  const distBefore = await page.$eval("#stat-distance", el => el.textContent);
  for (let i = 0; i < 4; i++) { await page.click('#dpad [data-dir="n"]'); await sleep(80); }
  const distAfter = await page.$eval("#stat-distance", el => el.textContent);
  check("distance increases with steps", distBefore !== distAfter, distBefore + " -> " + distAfter);

  // Pokedex after unlock + photo
  await page.click('.tabbar button[data-tab="pokedex"]');
  await sleep(400);
  check("unlocked cards in pokedex", (await page.$$eval(".card.is-unlocked", els => els.length)) > 0);
  await page.click('#state-filter [data-state="unlocked"]');
  await sleep(300);
  await page.screenshot({ path: path.join(SHOTS, `${mode}-8-pokedex-unlocked-phone.png`) });
  await page.$eval(".card.is-unlocked", el => el.click());
  await sleep(400);
  check("entry detail opens", await page.$eval("#entry-modal", el => !el.hidden));
  check("entry shows unlock details", await page.$eval("#entry-body", el => /Unlocked/.test(el.textContent)));
  check("entry has add photo button", (await page.$('#entry-foot [data-act="photo"]')) !== null);
  const sample = path.join(PROJECT, "data/img", (await page.evaluate(() => Object.keys(window.WN_CACHED.images).find(k => window.WN_CACHED.images[k].local))) + ".jpg");
  const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 5000 }), page.click('#entry-foot [data-act="photo"]')]);
  await chooser.accept([sample]);
  await sleep(1500);
  check("photo attached appears in entry", await page.$eval("#entry-body", el => /Your photo/.test(el.textContent) && el.querySelectorAll(".entry-img img[src^='data:image/jpeg']").length === 1));
  check("delete photo button present", (await page.$('#entry-foot [data-act="remove-photo"]')) !== null);
  await page.screenshot({ path: path.join(SHOTS, `${mode}-9-entry-photo-phone.png`) });
  await page.click("#entry-close");
  await sleep(300);
  check("camera icon on card with photo", (await page.$(".card .card-icon")) !== null);

  // persistence across reload (simulation stays on)
  await page.reload({ waitUntil: "networkidle2" });
  await sleep(1500);
  check("progress persists after reload", (await page.$eval("#stat-species", el => parseInt(el.textContent, 10))) >= found);
  check("demo mode persists after reload", await page.$eval("#dpad", el => !el.hidden));

  // #demo hash opens settings
  await page.goto(url + "#demo", { waitUntil: "networkidle2" });
  await sleep(1200);
  check("#demo opens the settings sheet", await page.$eval("#settings-sheet", el => !el.hidden));
  check("reload in demo mode does not fire the banner by itself", await page.$eval("#safety-banner", el => el.hidden));
  await page.click("#settings-close");
  await sleep(200);
  check("settings sheet closes", await page.$eval("#settings-sheet", el => el.hidden));

  // ---- laptop width ----
  // (changing isMobile makes puppeteer reload the page, so drop the #demo hash first)
  await page.setViewport({ width: 1366, height: 860, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle2" });
  await sleep(1200);
  check("laptop: settings sheet closed on a clean load", await page.$eval("#settings-sheet", el => el.hidden));
  await page.click('.tabbar button[data-tab="map"]');
  await sleep(900);
  await page.screenshot({ path: path.join(SHOTS, `${mode}-10-map-laptop.png`) });
  await page.click('.tabbar button[data-tab="pokedex"]');
  await sleep(500);
  check("laptop: pokedex tab shows the grid", await page.$eval("#view-pokedex", el => !el.hidden));
  await page.screenshot({ path: path.join(SHOTS, `${mode}-11-pokedex-laptop.png`) });
  check("no horizontal overflow at laptop width", !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)));

  console.log("\nconsole errors/warnings:", logs.length ? "\n  " + logs.slice(0, 12).join("\n  ") : "none");
  console.log("page errors:", errors.length ? "\n  " + errors.join("\n  ") : "none");
  check("no page errors", errors.length === 0);

  await browser.close();
  if (server) server.kill();
  console.log(failures ? `\n${failures} check(s) failed` : "\nall smoke checks passed");
  process.exit(failures ? 1 : 0);
})().catch(err => { console.error("smoke test crashed:", err); process.exit(2); });
