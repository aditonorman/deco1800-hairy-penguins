/* ==========================================================================
   Wild Neighbours - data access
   --------------------------------------------------------------------------
   Two data sources, switchable from the header:

   "cached"  Reads the files in /data written by scripts/fetch-data.mjs.
             The fetch script also bundles them into data/cached.js so the app
             works when index.html is opened straight from disk (file://),
             where fetch() of local JSON is blocked by browsers.

   "live"    Fetches recent occurrence records straight from the Atlas of
             Living Australia (which allows browser requests). WildNet blocks
             browser requests (no CORS headers), so its records always come
             from the cache, even in live mode. If the live request fails the
             app drops back to cached data and shows a notice.
   ========================================================================== */

const WN_DATA = (function () {
	"use strict";

	const U = WN_UTIL;
	const THREATENED = ["E", "V", "CR", "NT"];   // Qld NCA codes treated as threatened

	const state = {
		meta: null,
		species: [],
		speciesIndex: new Map(),
		sightings: [],        // cached, precise records (WildNet + ALA)
		images: {},
		source: "cached",
		live: null,           // { records, centre, radiusM, months, truncated, fetchedAt }
		liveError: null,
		loadedFrom: null      // "bundle" or "json"
	};

	/* ---- loading the cache ------------------------------------------------ */

	async function fetchJson(url) {
		const res = await fetch(url, { cache: "no-cache" });
		if (!res.ok) throw new Error(url + " -> HTTP " + res.status);
		return res.json();
	}

	/** Load cached data: from the script bundle if present, else the JSON files. */
	async function load() {
		let bundle = window.WN_CACHED || null;
		if (bundle) {
			state.loadedFrom = "bundle";
		} else {
			const D = WN_CONFIG.DATA;
			const [meta, species, sightings, images] = await Promise.all([
				fetchJson(D.meta), fetchJson(D.species), fetchJson(D.sightings), fetchJson(D.images)
			]);
			bundle = { meta, species, sightings, images };
			state.loadedFrom = "json";
		}
		state.meta = bundle.meta;
		state.images = bundle.images || {};
		state.species = bundle.species.map(decorateSpecies);
		state.speciesIndex = new Map(state.species.map(s => [s.key, s]));
		state.sightings = expandRows(bundle.sightings, state.species);
		numberSpecies();
		return state;
	}

	/**
	 * Pokedex numbers: mammals, birds, reptiles, frogs, each A to Z. Sorted on a
	 * copy, because sighting rows point at species by array position.
	 */
	function numberSpecies() {
		const order = WN_CONFIG.GROUP_ORDER;
		state.species.slice()
			.sort((a, b) => (order.indexOf(a.group) - order.indexOf(b.group)) || a.displayName.localeCompare(b.displayName))
			.forEach((s, i) => { s.no = i + 1; });
	}

	/** Rarity tier from the number of records (see WN_CONFIG.RARITY). */
	function rarityFor(count) {
		const tier = WN_CONFIG.RARITY.find(r => (count || 0) >= r.min) || WN_CONFIG.RARITY[WN_CONFIG.RARITY.length - 1];
		return tier.id;
	}
	function rarityInfo(id) { return WN_CONFIG.RARITY.find(r => r.id === id) || WN_CONFIG.RARITY[WN_CONFIG.RARITY.length - 1]; }

	/**
	 * The fetch script stores sightings as compact rows
	 *   [id, src, speciesIndex, lat, lng, date, prec, vet]
	 * (see meta.columns) to keep the download small. Expand them into the
	 * record objects the rest of the app uses. Older caches used objects already.
	 */
	function expandRows(rows, species) {
		return rows.map(r => Array.isArray(r)
			? { id: r[0], src: r[1], key: species[r[2]] ? species[r[2]].key : null, lat: r[3], lng: r[4], date: r[5], prec: r[6], vet: r[7] || undefined }
			: r).filter(r => r.key);
	}

	/** Add derived fields the UI needs. */
	function decorateSpecies(s) {
		const code = s.nca && s.nca.code;
		s.threatened = Boolean(code && THREATENED.includes(code)) || Boolean(s.epbc && THREATENED.includes(s.epbc.code));
		s.common = s.common || null;
		s.displayName = s.common || s.sci;
		s.hint = U.activityHint(s.months);
		s.months = s.months || Array(12).fill(0);
		s.rarity = rarityFor(s.recordCount);
		return s;
	}

	/* ---- lookups ------------------------------------------------------------ */

	function getSpecies(key) { return state.speciesIndex.get(key) || null; }
	function allSpecies() { return state.species; }
	function meta() { return state.meta; }

	/**
	 * Reference image URL for a species. Thumbnails prefer the local cached
	 * copy (works offline); large images prefer the ALA copy when online.
	 */
	function imageFor(key, size) {
		const img = state.images[key];
		if (!img) return null;
		if (size === "large") return (navigator.onLine !== false && img.large) ? img.large : (img.local || img.thumb || null);
		return img.local || img.thumb || null;
	}

	function imageInfo(key) { return state.images[key] || null; }

	/* ---- records for the current source ----------------------------------- */

	/**
	 * Records to cluster. In live mode the live ALA records replace the cached
	 * ALA records inside the live circle (WildNet cache stays).
	 */
	function records() {
		if (state.source !== "live" || !state.live) return state.sightings;
		const L = state.live;
		const keepCached = state.sightings.filter(r =>
			r.src !== "ala" || U.haversine(r.lat, r.lng, L.centre.lat, L.centre.lng) > L.radiusM);
		return keepCached.concat(L.records);
	}

	function setSource(src) { state.source = src === "live" ? "live" : "cached"; }
	function source() { return state.source; }
	function liveInfo() { return state.live; }
	function liveError() { return state.liveError; }

	/* ---- live ALA fetch ------------------------------------------------------ */

	function speciesKey(name) {
		if (!name) return null;
		const clean = name.replace(/\([^)]*\)/g, " ").replace(/[^A-Za-z\s-]/g, " ").trim().split(/\s+/);
		return clean.length < 2 ? null : (clean[0] + "-" + clean[1]).toLowerCase();
	}

	const CLASS_GROUP = { Mammalia: "mammal", Aves: "bird", Reptilia: "reptile", Amphibia: "frog" };

	/**
	 * Fetch recent ALA occurrences for a circle. Pages of 100 (the API's
	 * limit), capped at maxPages so a demo never waits too long.
	 */
	async function fetchLive(o) {
		const months = o.months || 6;
		const maxPages = o.maxPages || 12;
		const since = U.monthsAgoIso(months) || "1900-01-01";
		const fq = [
			"kingdom:Animalia", "spatiallyValid:true",
			"classs:(" + WN_CONFIG.ALA_CLASSES.join(" OR ") + ")",
			"eventDate:[" + since + "T00:00:00Z TO *]",
			"coordinateUncertaintyInMeters:[0 TO " + WN_CONFIG.MAX_PRECISION_M + "]"
		].map(f => "fq=" + encodeURIComponent(f)).join("&");
		const fl = "id,uuid,species,scientificName,vernacularName,classs,decimalLatitude,decimalLongitude,eventDate,coordinateUncertaintyInMeters,dataResourceName,sensitive";
		const base = WN_CONFIG.ALA_BASE + "/occurrences/occurrences/search?q=*:*&lat=" + o.lat + "&lon=" + o.lng +
			"&radius=" + (o.radiusM / 1000) + "&" + fq + "&fl=" + fl + "&pageSize=100&sort=eventDate&dir=desc";

		const records = [];
		let total = 0, page = 0, fetched = 0;
		for (; page < maxPages; page++) {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 15000);
			let json;
			try {
				const res = await fetch(base + "&startIndex=" + (page * 100), { signal: controller.signal });
				if (!res.ok) throw new Error("ALA responded with HTTP " + res.status);
				json = await res.json();
			} finally {
				clearTimeout(timer);
			}
			total = json.totalRecords || 0;
			const rows = json.occurrences || [];
			fetched += rows.length;
			for (const r of rows) {
				const key = speciesKey(r.species || r.scientificName);
				if (!key || r.decimalLatitude == null || r.sensitive) continue;
				ensureSpecies(key, r);
				records.push({
					id: "ala" + (r.uuid || r.id), src: "ala", key,
					lat: +Number(r.decimalLatitude).toFixed(5), lng: +Number(r.decimalLongitude).toFixed(5),
					date: r.eventDate ? new Date(r.eventDate).toISOString().slice(0, 10) : null,
					prec: r.coordinateUncertaintyInMeters == null ? null : Number(r.coordinateUncertaintyInMeters),
					ds: r.dataResourceName || null
				});
			}
			if (rows.length < 100 || fetched >= total) break;
		}
		state.live = {
			records, total, truncated: fetched < total,
			centre: { lat: o.lat, lng: o.lng }, radiusM: o.radiusM, months, fetchedAt: new Date().toISOString()
		};
		state.liveError = null;
		return state.live;
	}

	/** A live record for a species the cache does not know: add a bare entry. */
	function ensureSpecies(key, r) {
		if (state.speciesIndex.has(key)) return;
		const cls = r.classs;
		const s = decorateSpecies({
			key, sci: (r.species || r.scientificName), common: r.vernacularName ? U.titleCase(r.vernacularName) : null,
			class: cls, group: CLASS_GROUP[cls] || "bird", family: null, taxonId: null, source: "ala-live",
			conSig: false, sensitive: false, nca: null, epbc: null, wildnet: null, months: Array(12).fill(0), recordCount: 0
		});
		s.no = state.species.length + 1;
		state.species.push(s);
		state.speciesIndex.set(key, s);
		lookupImage(s);   // fire and forget; the card updates when it lands
	}

	const imageLookups = new Map();
	/** Ask ALA for a reference image for one species (live mode only). */
	function lookupImage(species) {
		if (state.images[species.key] || imageLookups.has(species.key)) return imageLookups.get(species.key);
		const url = WN_CONFIG.ALA_BASE + "/species/search?q=" + encodeURIComponent(species.sci) + "&fq=idxtype:TAXON&pageSize=5";
		const p = fetch(url).then(r => r.json()).then(json => {
			const hits = (json.searchResults && json.searchResults.results) || [];
			const hit = hits.find(h => h.thumbnailUrl || h.imageUrl);
			if (hit) {
				state.images[species.key] = { thumb: hit.thumbnailUrl || hit.imageUrl, large: hit.imageUrl || hit.thumbnailUrl, guid: hit.guid, from: "taxon" };
				if (!species.common && hit.commonNameSingle) { species.common = hit.commonNameSingle; species.displayName = species.common; }
				document.dispatchEvent(new CustomEvent("wn:image", { detail: { key: species.key } }));
			}
		}).catch(() => {});
		imageLookups.set(species.key, p);
		return p;
	}

	return { load, getSpecies, allSpecies, meta, imageFor, imageInfo, rarityInfo, records, setSource, source, fetchLive, liveInfo, liveError, state };
})();
