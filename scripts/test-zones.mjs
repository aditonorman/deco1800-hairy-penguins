#!/usr/bin/env node
/**
 * Quick command-line checks for the zone clustering (js/zones.js).
 * Run:  node scripts/test-zones.mjs
 * Uses the cached data in /data so the numbers match what the app shows.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CFG = require(path.join(root, "js/config.js"));
const U = require(path.join(root, "js/util.js"));
const Z = require(path.join(root, "js/zones.js"));

const species = JSON.parse(fs.readFileSync(path.join(root, "data/species.json"), "utf8"));
// sightings are compact rows [id, src, speciesIndex, lat, lng, date, prec, vet]; expand them like js/data.js does
const sightings = JSON.parse(fs.readFileSync(path.join(root, "data/sightings.json"), "utf8")).map(r => Array.isArray(r)
	? { id: r[0], src: r[1], key: species[r[2]].key, lat: r[3], lng: r[4], date: r[5], prec: r[6], vet: r[7] || undefined }
	: r);
const index = new Map(species.map(s => [s.key, Object.assign(s, {
	threatened: Boolean(s.nca && ["E", "V", "CR", "NT"].includes(s.nca.code))
})]));

let failed = 0;
function check(name, ok, detail) {
	console.log((ok ? "  ok   " : "  FAIL ") + name + (detail ? "  (" + detail + ")" : ""));
	if (!ok) failed++;
}

const centre = CFG.LOCATIONS[0];
for (const months of [6, 12, 24, 0]) {
	const filtered = Z.filterRecords(sightings, {
		lat: centre.lat, lng: centre.lng, radiusM: 1500, sinceIso: U.monthsAgoIso(months)
	});
	const zones = Z.buildZones(filtered, { speciesIndex: index });
	console.log(`\nwindow=${months || "all"} months, radius 1500 m: ${filtered.length} records -> ${zones.length} zones`);
	check("every zone has >= 1 record", zones.every(z => z.count >= 1));
	check("radius within bounds", zones.every(z => z.radius >= CFG.ZONE.minRadius && z.radius <= CFG.ZONE.maxRadius));
	check("no zone centre sits exactly on a single record",
		zones.filter(z => z.count === 1).every(z => !filtered.some(r => r.lat === z.lat && r.lng === z.lng)));
	check("zone ids unique", new Set(zones.map(z => z.id)).size === zones.length);
	check("zone names unique", new Set(zones.map(z => z.name)).size === zones.length);
	check("records all within radius of centre", filtered.every(r => U.haversine(r.lat, r.lng, centre.lat, centre.lng) <= 1500));
	check("precision filter applied", filtered.every(r => r.prec != null && r.prec <= 1000));
	if (months) check("recency filter applied", filtered.every(r => r.date >= U.monthsAgoIso(months)));
	const big = zones.slice(0, 3).map(z => `${z.name} (${z.count} rec, ${z.speciesCount} sp, r=${z.radius}m${z.threatened ? ", threatened" : ""})`);
	console.log("  top zones: " + big.join(" | "));
}

// a preset away from the pilot area should also produce zones from the Brisbane-wide cache
const far = CFG.LOCATIONS.find(l => l.id === "toohey");
const farRecords = Z.filterRecords(sightings, { lat: far.lat, lng: far.lng, radiusM: 1500, sinceIso: U.monthsAgoIso(6) });
const farZones = Z.buildZones(farRecords, { speciesIndex: index });
console.log(`\n${far.name}: ${farRecords.length} records -> ${farZones.length} zones`);
check("Brisbane-wide cache gives zones away from Mt Coot-tha", farZones.length > 0);

// deterministic: same input, same output
const f = Z.filterRecords(sightings, { lat: centre.lat, lng: centre.lng, radiusM: 1500, sinceIso: U.monthsAgoIso(6) });
const a = Z.buildZones(f, { speciesIndex: index }), b = Z.buildZones(f, { speciesIndex: index });
check("\nclustering is deterministic", JSON.stringify(a) === JSON.stringify(b));

// zoneAt finds the zone you are standing in
const z0 = a[0];
check("zoneAt returns the zone at its own centre", Z.zoneAt(a, z0.lat, z0.lng) && Z.zoneAt(a, z0.lat, z0.lng).id === z0.id);
const away = U.offset(z0.lat, z0.lng, 5000, 5000);
check("zoneAt returns null far away", Z.zoneAt(a, away.lat, away.lng) === null);

// activity hint sanity
check("activity hint: single peak", U.activityHint([0,0,0,0,0,0,0,0,0,0,20,2]) === "Most records in November");
check("activity hint: two-month peak", U.activityHint([1,1,1,1,1,1,1,1,1,10,9,1]) === "Most active Oct–Nov");
check("activity hint: flat", U.activityHint([5,5,5,5,5,5,5,5,5,5,5,5]) === "Recorded year-round");
check("activity hint: thin", U.activityHint([1,0,0,0,0,0,0,0,0,0,0,1]) === "Too few records to spot a pattern");

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
