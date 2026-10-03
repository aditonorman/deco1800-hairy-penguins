/* ==========================================================================
   Wild Neighbours - habitat zone clustering
   --------------------------------------------------------------------------
   Turns individual sighting records into HABITAT ZONES so that no animal is
   ever shown at an exact point. Pure functions, no DOM, so this file is also
   unit-tested from Node (scripts/test-zones.mjs).

   Approach (documented in README):
     1. filterRecords  - keep records inside the search circle, within the
                         recency window, and with location precision <= 1 km.
     2. buildZones     - greedy "link" clustering, newest records first:
                         a record joins the nearest zone within linkDistance,
                         otherwise it starts a new zone. Zone centres are the
                         running mean of their members.
     3. merge pass     - zones whose centres are within mergeDistance merge.
     4. tiny zones     - zones with < minRecords fold into a neighbour within
                         foldDistance; if none, they keep a privacy jitter
                         (so one record never pinpoints an animal).
     5. finalise       - radius = clamp(1.15 x spread + 60, min, max), a stable
                         id from the member ids, a species summary and a name.
     6. shapes         - zoneShapes() splits overlapping circles along the line
                         halfway between their centres (with a small gutter),
                         so neighbouring zones are drawn as separate cells.
                         zoneAt() uses the same "nearest centre" rule, so what
                         you see on the map is exactly what triggers a zone.
   ========================================================================== */

const WN_ZONES = (function () {
	"use strict";

	const U = (typeof WN_UTIL !== "undefined") ? WN_UTIL : require("./util.js");
	const CFG = (typeof WN_CONFIG !== "undefined") ? WN_CONFIG : require("./config.js");

	/**
	 * Keep records that can place a zone.
	 * @param {Array}  records   normalised records {key, lat, lng, date, prec}
	 * @param {Object} o         {lat, lng, radiusM, sinceIso, maxPrecision}
	 */
	function filterRecords(records, o) {
		const maxPrec = o.maxPrecision || CFG.MAX_PRECISION_M;
		return records.filter(r => {
			if (r.lat == null || r.lng == null) return false;
			if (r.prec == null || r.prec > maxPrec) return false;
			if (o.sinceIso && (!r.date || r.date < o.sinceIso)) return false;
			if (o.excludeKeys && o.excludeKeys.has(r.key)) return false;
			return U.haversine(r.lat, r.lng, o.lat, o.lng) <= o.radiusM;
		});
	}

	function mergeInto(target, other) {
		const n1 = target.records.length, n2 = other.records.length;
		target.lat = (target.lat * n1 + other.lat * n2) / (n1 + n2);
		target.lng = (target.lng * n1 + other.lng * n2) / (n1 + n2);
		target.records.push(...other.records);
	}

	function nearestZone(zones, lat, lng, skip) {
		let best = null, bestD = Infinity;
		for (const z of zones) {
			if (z === skip) continue;
			const d = U.haversine(lat, lng, z.lat, z.lng);
			if (d < bestD) { bestD = d; best = z; }
		}
		return { zone: best, dist: bestD };
	}

	/**
	 * Cluster filtered records into zones.
	 * @param {Array}  records  output of filterRecords
	 * @param {Object} o        overrides for CFG.ZONE plus:
	 *                          speciesIndex: Map key -> species (for names/threat)
	 */
	function buildZones(records, o) {
		const P = Object.assign({}, CFG.ZONE, o || {});
		const speciesIndex = P.speciesIndex || new Map();

		// 1. greedy linking, newest first so recent activity seeds the zones
		const sorted = records.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
		let zones = [];
		for (const r of sorted) {
			const { zone, dist } = nearestZone(zones, r.lat, r.lng);
			if (zone && dist <= P.linkDistance) {
				zone.records.push(r);
				const n = zone.records.length;
				zone.lat += (r.lat - zone.lat) / n;   // running mean centroid
				zone.lng += (r.lng - zone.lng) / n;
			} else {
				zones.push({ lat: r.lat, lng: r.lng, records: [r] });
			}
		}

		// 2. merge zones whose centres ended up very close
		let merged = true;
		while (merged) {
			merged = false;
			outer:
			for (let i = 0; i < zones.length; i++) {
				for (let j = i + 1; j < zones.length; j++) {
					if (U.haversine(zones[i].lat, zones[i].lng, zones[j].lat, zones[j].lng) <= P.mergeDistance) {
						mergeInto(zones[i], zones[j]);
						zones.splice(j, 1);
						merged = true;
						break outer;
					}
				}
			}
		}

		// 3. tiny zones fold into a neighbour, or get a privacy jitter
		const big = zones.filter(z => z.records.length >= P.minRecords);
		const tiny = zones.filter(z => z.records.length < P.minRecords);
		for (const t of tiny) {
			const { zone, dist } = nearestZone(big, t.lat, t.lng);
			if (zone && dist <= P.foldDistance) {
				mergeInto(zone, t);
			} else {
				const seed = U.hash(t.records.map(r => r.id).sort().join("|"));
				const angle = U.seeded(seed) * Math.PI * 2;
				const dist2 = P.jitter * (0.4 + 0.6 * U.seeded(seed + 7));
				const moved = U.offset(t.lat, t.lng, Math.cos(angle) * dist2, Math.sin(angle) * dist2);
				t.lat = moved.lat; t.lng = moved.lng; t.jittered = true;
				big.push(t);
			}
		}
		zones = big;

		// 4. finalise each zone
		const usedNames = new Set();
		const out = zones.map(z => finaliseZone(z, P, speciesIndex, usedNames));
		out.sort((a, b) => b.count - a.count);
		return out;
	}

	function finaliseZone(z, P, speciesIndex, usedNames) {
		let spread = 0;
		const bySpecies = new Map();
		const sources = { wn: 0, ala: 0 };
		for (const r of z.records) {
			spread = Math.max(spread, U.haversine(r.lat, r.lng, z.lat, z.lng));
			sources[r.src] = (sources[r.src] || 0) + 1;
			const s = bySpecies.get(r.key) || { key: r.key, count: 0, lastDate: null };
			s.count++;
			if (!s.lastDate || (r.date && r.date > s.lastDate)) s.lastDate = r.date;
			bySpecies.set(r.key, s);
		}
		const species = [...bySpecies.values()].map(s => {
			const info = speciesIndex.get(s.key);
			s.threatened = Boolean(info && info.threatened);
			return s;
		}).sort((a, b) => b.count - a.count || (b.lastDate || "").localeCompare(a.lastDate || ""));

		// how many species of each animal group were recorded here (for map chips and alert filters)
		const groups = {};
		species.forEach(s => {
			const info = speciesIndex.get(s.key);
			if (info && info.group) groups[info.group] = (groups[info.group] || 0) + 1;
		});

		const radius = Math.min(P.maxRadius, Math.max(P.minRadius, Math.round(spread * 1.15 + 60)));
		const id = "z" + U.hash(z.records.map(r => r.id).sort().join("|") + "@" + z.lat.toFixed(4) + "," + z.lng.toFixed(4)).toString(36);
		const lastDate = z.records.reduce((m, r) => (r.date && r.date > m) ? r.date : m, "");

		return {
			id,
			name: nameZone(id, species, speciesIndex, usedNames),
			lat: +z.lat.toFixed(5),
			lng: +z.lng.toFixed(5),
			radius,
			count: z.records.length,
			species,
			speciesCount: species.length,
			threatened: species.some(s => s.threatened),
			groups,
			lastDate: lastDate || null,
			sources,
			jittered: Boolean(z.jittered)
		};
	}

	/** "Kookaburra Ridge": dominant species' last name word + a habitat word. */
	function nameZone(id, species, speciesIndex, usedNames) {
		const top = species[0] && speciesIndex.get(species[0].key);
		let animal = "Wildlife";
		if (top) {
			// "Greater Glider (southern)" -> "Glider"; "Eastern Water Dragon" -> "Dragon"
			const common = (top.common || top.sci).replace(/\([^)]*\)/g, " ").trim();
			const words = common.split(/\s+/).filter(Boolean);
			animal = words[words.length - 1] || "Wildlife";
			if (animal.length < 4 && words.length > 1) animal = words.slice(-2).join(" ");
		}
		const habitat = CFG.HABITAT_WORDS[U.hash(id) % CFG.HABITAT_WORDS.length];
		let name = animal + " " + habitat;
		let n = 2;
		while (usedNames.has(name)) name = animal + " " + habitat + " " + toRoman(n++);
		usedNames.add(name);
		return name;
	}

	function toRoman(n) {
		const map = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
		let out = "";
		for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
		return out;
	}

	/**
	 * Which zone (if any) contains a point. Overlapping zones are split down the
	 * middle: a point belongs to the zone with the nearest centre, as long as it
	 * is inside that zone's circle. This is the same rule zoneShapes() draws.
	 */
	function zoneAt(zones, lat, lng) {
		let best = null, bestD = Infinity;
		for (const z of zones) {
			const d = U.haversine(lat, lng, z.lat, z.lng);
			if (d < bestD) { bestD = d; best = z; }
		}
		return best && bestD <= best.radius ? best : null;
	}

	/* ---- drawing shapes ----------------------------------------------------- */

	const EARTH_R = 6371000;

	/** Keep the part of a convex polygon where ax*x + ay*y <= c (Sutherland-Hodgman). */
	function clipHalfPlane(poly, ax, ay, c) {
		const out = [];
		for (let k = 0; k < poly.length; k++) {
			const p = poly[k], q = poly[(k + 1) % poly.length];
			const fp = ax * p.x + ay * p.y - c, fq = ax * q.x + ay * q.y - c;
			if (fp <= 0) out.push(p);
			if ((fp <= 0) !== (fq <= 0)) {
				const t = fp / (fp - fq);
				out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
			}
		}
		return out;
	}

	/** Area-weighted centre of a polygon (where the zone's label goes). */
	function centroid(poly) {
		let a = 0, cx = 0, cy = 0;
		for (let k = 0; k < poly.length; k++) {
			const p = poly[k], q = poly[(k + 1) % poly.length];
			const cross = p.x * q.y - q.x * p.y;
			a += cross; cx += (p.x + q.x) * cross; cy += (p.y + q.y) * cross;
		}
		if (Math.abs(a) < 1e-9) return poly[0];
		return { x: cx / (3 * a), y: cy / (3 * a) };
	}

	/**
	 * The shape to draw for each zone, in the same order as `zones`.
	 * Each zone starts as its circle, then is cut along the line halfway to
	 * every nearby zone centre, pulled back by half a gutter so neighbours never
	 * touch. Overlapping zones therefore become separate cells, and every point
	 * inside a cell is in that zone by zoneAt()'s nearest-centre rule.
	 * @returns [{ id, latlngs: [[lat, lng], ...], centre: { lat, lng }, neighbours: [index, ...] }]
	 *          neighbours = cells that share an edge with this one (across the gutter)
	 */
	function zoneShapes(zones, opts) {
		const o = Object.assign({ gutter: 14, steps: 72 }, opts || {});
		if (!zones.length) return [];
		// flat x/y metres around the middle of the zones (fine at suburb scale)
		const lat0 = zones.reduce((a, z) => a + z.lat, 0) / zones.length;
		const lng0 = zones.reduce((a, z) => a + z.lng, 0) / zones.length;
		const ky = EARTH_R * Math.PI / 180;
		const kx = ky * Math.cos(lat0 * Math.PI / 180);
		const toXY = (lat, lng) => ({ x: (lng - lng0) * kx, y: (lat - lat0) * ky });
		const toLatLng = (p) => [lat0 + p.y / ky, lng0 + p.x / kx];
		const centres = zones.map(z => toXY(z.lat, z.lng));

		const cells = zones.map((z, i) => {
			const c = centres[i];
			let poly = [];
			for (let k = 0; k < o.steps; k++) {
				const a = 2 * Math.PI * k / o.steps;
				poly.push({ x: c.x + z.radius * Math.cos(a), y: c.y + z.radius * Math.sin(a) });
			}
			const cuts = [];
			zones.forEach((other, j) => {
				if (j === i || poly.length < 3) return;
				const dx = centres[j].x - c.x, dy = centres[j].y - c.y, d = Math.hypot(dx, dy);
				const reach = d / 2 - o.gutter / 2;          // distance from this centre to the cut line
				if (d < 1 || reach >= z.radius) return;      // the cut line misses this circle
				const ux = dx / d, uy = dy / d, line = ux * c.x + uy * c.y + reach;
				poly = clipHalfPlane(poly, ux, uy, line);    // keep the side nearer this zone
				cuts.push({ j, ux, uy, line });
			});
			// edges that survived all the cuts tell us which cells face each other
			const edgeTo = new Set(cuts.filter(cut =>
				poly.filter(v => Math.abs(cut.ux * v.x + cut.uy * v.y - cut.line) < 0.05).length >= 2).map(cut => cut.j));
			return { poly, edgeTo };
		});

		return zones.map((z, i) => {
			const { poly, edgeTo } = cells[i];
			const neighbours = Array.from(edgeTo).filter(j => cells[j].edgeTo.has(i));
			if (poly.length < 3) return { id: z.id, latlngs: [], centre: { lat: z.lat, lng: z.lng }, neighbours };
			const mid = toLatLng(centroid(poly));
			return { id: z.id, latlngs: poly.map(toLatLng), centre: { lat: mid[0], lng: mid[1] }, neighbours };
		});
	}

	/**
	 * Give cells that share an edge different shades so neighbours stand apart.
	 * DSatur colouring: repeatedly colour the cell whose neighbours already use
	 * the most different shades. Deterministic, so the map looks the same each
	 * time. Returns a shade index per cell.
	 */
	function shadeZones(shapes, count) {
		const n = shapes.length;
		const shade = new Array(n).fill(-1);
		for (let step = 0; step < n; step++) {
			let pick = -1, bestSat = -1, bestDeg = -1;
			for (let i = 0; i < n; i++) {
				if (shade[i] >= 0) continue;
				const sat = new Set(shapes[i].neighbours.map(j => shade[j]).filter(v => v >= 0)).size;
				const deg = shapes[i].neighbours.length;
				if (sat > bestSat || (sat === bestSat && deg > bestDeg)) { pick = i; bestSat = sat; bestDeg = deg; }
			}
			const used = shapes[pick].neighbours.map(j => shade[j]);
			let s = 0;
			while (used.includes(s) && s < count - 1) s++;
			shade[pick] = s;
		}
		return shade;
	}

	return { filterRecords, buildZones, zoneAt, zoneShapes, shadeZones };
})();

if (typeof module !== "undefined") module.exports = WN_ZONES;
