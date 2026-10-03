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

// ---- drawing shapes: overlapping zones become separate cells ----
for (const id of ["mt-coot-tha", "toohey", "city-botanic"]) {
	const loc = CFG.LOCATIONS.find(l => l.id === id);
	const fz = Z.filterRecords(sightings, { lat: loc.lat, lng: loc.lng, radiusM: 1500, sinceIso: U.monthsAgoIso(6) });
	const zs = Z.buildZones(fz, { speciesIndex: index });
	const shapes = Z.zoneShapes(zs, { gutter: CFG.ZONE_GUTTER_M });
	console.log(`\nshapes at ${loc.name}: ${zs.length} zones`);
	check("one shape per zone, each a real polygon", shapes.length === zs.length && shapes.every(s => s.latlngs.length >= 3));
	// flat metres around the first zone for geometry checks
	const lat0 = zs[0].lat, lng0 = zs[0].lng, ky = 6371000 * Math.PI / 180, kx = ky * Math.cos(lat0 * Math.PI / 180);
	const xy = ([lat, lng]) => ({ x: (lng - lng0) * kx, y: (lat - lat0) * ky });
	const polys = shapes.map(s => s.latlngs.map(xy));
	const inside = (pt, poly) => {
		let c = false;
		for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			const a = poly[i], b = poly[j];
			if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) c = !c;
		}
		return c;
	};
	// 1. no two cells overlap: every vertex of a cell lies outside every other cell
	let overlap = 0;
	polys.forEach((p, i) => polys.forEach((q, j) => { if (i !== j && p.some(v => inside(v, q))) overlap++; }));
	check("no two cells overlap", overlap === 0, overlap + " overlapping pairs");
	// 2. a cell's label point sits inside its own cell
	check("every label sits inside its own cell", shapes.every((s, i) => inside(xy([s.centre.lat, s.centre.lng]), polys[i])));
	// 3. what you see is what triggers: any point inside a cell is in that zone
	let checked = 0, wrong = 0;
	for (let k = 0; k < 4000; k++) {
		const lat = loc.lat + (Math.random() - 0.5) * 0.03, lng = loc.lng + (Math.random() - 0.5) * 0.03;
		const pt = xy([lat, lng]);
		const cell = polys.findIndex(p => inside(pt, p));
		if (cell < 0) continue;
		checked++;
		const z = Z.zoneAt(zs, lat, lng);
		if (!z || z.id !== zs[cell].id) wrong++;
	}
	check("points inside a drawn cell trigger that zone", wrong === 0, checked + " points checked");
	// 4. cells that share an edge never share a shade
	const shades = Z.shadeZones(shapes, CFG.ZONE_SHADES.length);
	let clash = 0, edges = 0;
	shapes.forEach((sh, i) => sh.neighbours.forEach(j => { if (i < j) { edges++; if (shades[i] === shades[j]) clash++; } }));
	check("neighbouring cells get different shades", clash === 0, edges + " shared edges, " + clash + " clashes");
	check("shading is deterministic", JSON.stringify(Z.shadeZones(Z.zoneShapes(zs, { gutter: CFG.ZONE_GUTTER_M }), CFG.ZONE_SHADES.length)) === JSON.stringify(shades));
	check("zones list the animal groups recorded there", zs.every(z => Object.values(z.groups).reduce((a, b) => a + b, 0) === z.speciesCount));
}

// activity hint sanity
check("activity hint: single peak", U.activityHint([0,0,0,0,0,0,0,0,0,0,20,2]) === "Most records in November");
check("activity hint: two-month peak", U.activityHint([1,1,1,1,1,1,1,1,1,10,9,1]) === "Most active Oct–Nov");
check("activity hint: flat", U.activityHint([5,5,5,5,5,5,5,5,5,5,5,5]) === "Recorded year-round");
check("activity hint: thin", U.activityHint([1,0,0,0,0,0,0,0,0,0,0,1]) === "Too few records to spot a pattern");

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
