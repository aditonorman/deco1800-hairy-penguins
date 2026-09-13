/**
 * Headless browser smoke test for Wild Neighbours.
 * Serves the project folder, loads the app in Chrome, walks through the main
 * flows (zones, walking mode, unlocks, Pokedex, photo attach, persistence) and
 * saves screenshots to scripts/screenshots/.
 *
 * One-off setup (not needed to run the app itself):
 *   npm install --no-save puppeteer-core
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


/** Centre of the first zone circle that is fully visible inside the map and clear of the tab bar. */
async function visibleZonePoint(page) {
  return page.evaluate(() => {
    const map = document.getElementById("map").getBoundingClientRect();
    const limit = Math.min(map.bottom, window.innerHeight - 80);
    const paths = Array.from(document.querySelectorAll(".leaflet-interactive"));
    for (const p of paths) {
      const b = p.getBoundingClientRect();
      if (b.width < 30) continue;                       // centre dot
      if (p.getAttribute("stroke") === "#e8a94b") continue; // search radius ring
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      if (cx > map.left + 10 && cx < map.right - 10 && cy > map.top + 10 && cy < limit) return { x: cx, y: cy };
    }
    return null;
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = mode === "server" ? spawn("python3", ["-m", "http.server", String(PORT)], { cwd: PROJECT, stdio: "ignore" }) : null;
  if (server) await sleep(800);
  const url = mode === "server" ? `http://localhost:${PORT}/index.html` : "file://" + PROJECT + "/index.html";

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"] });
  const page = await browser.newPage();
  const errors = [], logs = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") logs.push(m.type() + ": " + m.text()); });
  page.on("requestfailed", r => { if (!/tile\.openstreetmap|fonts\.g|images\.ala/.test(r.url())) logs.push("requestfailed: " + r.url()); });
  page.on("dialog", d => d.accept());

  // ---- phone width ----
  await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(1500);
  const summary = await page.$eval("#explore-summary", el => el.textContent);
  console.log("summary:", summary.trim());
  check("zones built", /\d+ habitat zones/.test(summary) && !/^0 habitat/.test(summary.trim()));
  const zoneCount = await page.$$eval(".leaflet-interactive", els => els.length);
  check("zone shapes drawn on map", zoneCount > 2, zoneCount + " shapes");
  await page.screenshot({ path: path.join(SHOTS, `${mode}-1-map-phone.png`) });

  // tap a zone (click centre of the first zone path)
  const zp = await visibleZonePoint(page);
  check("a zone is visible to tap", zp !== null);
  if (zp) await page.mouse.click(zp.x, zp.y);
  await sleep(500);
  check("zone sheet opens on tap", await page.$eval("#zone-sheet", el => !el.hidden));
  const rows = await page.$$eval("#zone-species .species-row", els => els.length);
  check("zone sheet lists species", rows > 0, rows + " species");
  const hasRecency = await page.$eval("#zone-species", el => /recorded .* ago|recorded today|recorded yesterday/.test(el.textContent));
  check("recency text shown", hasRecency);
  await page.screenshot({ path: path.join(SHOTS, `${mode}-2-zone-sheet-phone.png`) });
  await page.click("#zone-close");

  // Pokedex before any unlock
  await page.click('.tabbar button[data-tab="pokedex"]');
  await sleep(400);
  const cards = await page.$$eval(".card", els => els.length);
  const locked = await page.$$eval(".card.is-locked", els => els.length);
  check("pokedex cards rendered", cards > 100, cards + " cards, " + locked + " locked");
  check("locked cards show ???", await page.$eval(".card.is-locked .card-name", el => el.textContent === "???"));
  await page.screenshot({ path: path.join(SHOTS, `${mode}-3-pokedex-locked-phone.png`) });

  // Walking mode: simulate, teleport into the biggest zone
  await page.click('.tabbar button[data-tab="walk"]');
  await sleep(800);
  check("walk HUD visible", await page.$eval("#walk-hud", el => !el.hidden));
  check("you marker drawn", (await page.$(".you-marker")) !== null);
  // teleport to the first zone's centre via the app's zone list (use page context)
  const target = await page.evaluate(() => {
    // zones are module-private; re-derive from the DOM tooltips is hard, so use the walk API through a known zone: pick nearest shape centre
    const shapes = Array.from(document.querySelectorAll(".leaflet-interactive"));
    return shapes.length;
  });
  // Simulate by pressing the dpad until the HUD says we're in a zone (walk toward zone). Simpler: click on a zone shape while in walk tab = teleport (mapTap fires) 
  const zp2 = await visibleZonePoint(page);
  check("a zone is visible to walk into", zp2 !== null);
  if (zp2) await page.mouse.click(zp2.x, zp2.y);
  await sleep(700);
  const bannerShown = await page.$eval("#safety-banner", el => !el.hidden);
  check("safety banner on zone entry", bannerShown);
  await page.screenshot({ path: path.join(SHOTS, `${mode}-4-safety-banner-phone.png`) });
  if (bannerShown) await page.click("#safety-ok");
  await sleep(600);
  check("celebration shown after zone entry", await page.$eval("#unlock-modal", el => !el.hidden));
  await page.screenshot({ path: path.join(SHOTS, `${mode}-5-celebration-phone.png`) });
  await sleep(2600);
  check("celebration auto-closed", await page.$eval("#unlock-modal", el => el.hidden));
  check("zone sheet open in walk mode", await page.$eval("#zone-sheet", el => !el.hidden));
  const reportBtns = await page.$$eval('#zone-species [data-report="3"]', els => els.length);
  check("report buttons present in walk mode", reportBtns > 0, reportBtns + " buttons");
  const hudZone = await page.$eval("#hud-zone", el => el.textContent);
  check("HUD names the zone", /^In /.test(hudZone), hudZone);
  const zonesVisited = await page.$eval("#stat-zones", el => Number(el.textContent));
  check("zones visited stat = 1", zonesVisited === 1, String(zonesVisited));
  const found = await page.$eval("#stat-species", el => parseInt(el.textContent, 10));
  check("species found > 0", found > 0, String(found));

  // I spotted it -> tier 3
  await page.click('#zone-species [data-report="3"]');
  await sleep(500);
  check("sighting celebration shown", await page.$eval("#unlock-modal", el => !el.hidden));
  const kicker = await page.$eval("#unlock-card .celebrate-kicker", el => el.textContent);
  check("celebration says sighting logged", /Sighting/.test(kicker), kicker);
  await page.screenshot({ path: path.join(SHOTS, `${mode}-6-sighting-phone.png`) });
  await page.click('#unlock-card [data-act="close"]');
  await sleep(300);
  check("tier badge upgraded in sheet", await page.$eval("#zone-species", el => /Sighted/.test(el.textContent)));

  // D-pad steps add distance (close the sheet first, it covers the HUD on phones)
  await page.click("#zone-close");
  await sleep(200);
  for (let i = 0; i < 4; i++) { await page.click('#dpad [data-dir="n"]'); await sleep(80); }
  const dist = await page.$eval("#stat-distance", el => el.textContent);
  check("distance increases with steps", /100 m/.test(dist), dist);

  // Pokedex after unlock
  await page.click('.tabbar button[data-tab="pokedex"]');
  await sleep(400);
  const unlockedCards = await page.$$eval(".card.is-unlocked", els => els.length);
  check("unlocked cards in pokedex", unlockedCards > 0, unlockedCards + " unlocked");
  await page.click('#state-filter [data-state="unlocked"]');
  await sleep(300);
  await page.screenshot({ path: path.join(SHOTS, `${mode}-7-pokedex-unlocked-phone.png`) });
  await page.$eval(".card.is-unlocked", el => el.click());
  await sleep(400);
  check("entry detail opens", await page.$eval("#entry-modal", el => !el.hidden));
  check("entry has fact", await page.$eval("#entry-body", el => /Fun fact|From the records/.test(el.textContent)));
  check("entry has add photo button", (await page.$('#entry-foot [data-act="photo"]')) !== null);
  await page.screenshot({ path: path.join(SHOTS, `${mode}-8-entry-phone.png`) });

  // attach a photo through the real flow: button -> file chooser -> resize -> IndexedDB
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
  // walk out of the zone: sheet should close and HUD should say so
  await page.click('.tabbar button[data-tab="walk"]');
  await sleep(300);
  for (let i = 0; i < 30; i++) { await page.click('#dpad [data-dir="n"]'); await sleep(30); }
  const hudAfter = await page.$eval("#hud-zone", el => el.textContent);
  check("HUD changes after walking north 750 m (left the zone or entered another)", hudAfter !== hudZone, hudAfter);
  check("zone sheet closed or re-opened for a new zone", await page.evaluate(() => document.getElementById("zone-sheet").hidden || !document.getElementById("hud-zone").classList.contains("is-out")));

  // persistence across reload
  await page.reload({ waitUntil: "networkidle2" });
  await sleep(1200);
  const foundAfter = await page.$eval("#stat-species", el => parseInt(el.textContent, 10));
  check("progress persists after reload", foundAfter === found, foundAfter + " vs " + found);

  // ---- laptop width ----
  await page.setViewport({ width: 1366, height: 860, deviceScaleFactor: 1 });
  await page.click('.tabbar button[data-tab="map"]');
  await sleep(900);
  await page.screenshot({ path: path.join(SHOTS, `${mode}-10-map-laptop.png`) });
  await page.click('.tabbar button[data-tab="pokedex"]');
  await sleep(500);
  await page.screenshot({ path: path.join(SHOTS, `${mode}-11-pokedex-laptop.png`) });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check("no horizontal overflow at laptop width", !overflow);

  console.log("\nconsole errors/warnings:", logs.length ? "\n  " + logs.slice(0, 12).join("\n  ") : "none");
  console.log("page errors:", errors.length ? "\n  " + errors.join("\n  ") : "none");
  check("no page errors", errors.length === 0);

  await browser.close();
  if (server) server.kill();
  console.log(failures ? `\n${failures} check(s) failed` : "\nall smoke checks passed");
  process.exit(failures ? 1 : 0);
})().catch(err => { console.error("smoke test crashed:", err); process.exit(2); });
