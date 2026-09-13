/* ==========================================================================
   Wild Neighbours - on-device storage
   --------------------------------------------------------------------------
   * localStorage  : the Pokedex collection, walk stats and settings (small JSON)
   * IndexedDB     : personal photos (base64 data URLs can be a few hundred KB
                     each, which would blow the ~5 MB localStorage cap fast)

   Nothing here ever leaves the device. There are no accounts and no server.
   ========================================================================== */

const WN_STORE = (function () {
	"use strict";

	const KEY = WN_CONFIG.STORAGE_KEY;

	function defaults() {
		return {
			entries: {},        // speciesKey -> { tier, unlockedAt, tierAt, zoneName, place, hasPhoto }
			stats: { zonesVisited: [], distanceM: 0, walks: 0 },
			settings: {
				source: "cached",
				location: WN_CONFIG.DEFAULT_LOCATION,
				customLat: null, customLng: null,
				radius: WN_CONFIG.RADIUS_DEFAULT,
				window: WN_CONFIG.WINDOW_DEFAULT_MONTHS,
				positionSource: "sim"
			}
		};
	}

	let state = load();

	function load() {
		try {
			const raw = localStorage.getItem(KEY);
			if (raw) {
				const saved = JSON.parse(raw);
				const d = defaults();
				return {
					entries: saved.entries || d.entries,
					stats: Object.assign(d.stats, saved.stats || {}),
					settings: Object.assign(d.settings, saved.settings || {})
				};
			}
		} catch (err) {
			console.warn("Could not read saved progress, starting fresh.", err);
		}
		return defaults();
	}

	function save() {
		try {
			localStorage.setItem(KEY, JSON.stringify(state));
		} catch (err) {
			console.warn("Could not save progress (storage full or blocked).", err);
		}
	}

	/* ---- Pokedex entries ------------------------------------------------ */

	function getEntry(key) { return state.entries[key] || null; }
	function allEntries() { return state.entries; }
	function unlockedCount() { return Object.keys(state.entries).length; }

	/**
	 * Unlock or upgrade an entry. Tiers only ever go up (3 sighted > 2 signs >
	 * 1 zone visit). Returns { changed, isNew, previousTier, entry }.
	 */
	function unlock(key, tier, ctx) {
		const existing = state.entries[key];
		const previousTier = existing ? existing.tier : 0;
		if (existing && existing.tier >= tier) {
			return { changed: false, isNew: false, previousTier, entry: existing };
		}
		const now = new Date().toISOString();
		const entry = existing || { unlockedAt: now, hasPhoto: false };
		entry.tier = tier;
		entry.tierAt = now;
		entry.zoneName = (ctx && ctx.zoneName) || entry.zoneName || null;
		entry.place = (ctx && ctx.place) || entry.place || null;
		state.entries[key] = entry;
		save();
		return { changed: true, isNew: !existing, previousTier, entry };
	}

	function setPhotoFlag(key, hasPhoto) {
		if (!state.entries[key]) return;
		state.entries[key].hasPhoto = Boolean(hasPhoto);
		save();
	}

	/* ---- walk stats ------------------------------------------------------ */

	function stats() { return state.stats; }

	/** Record a zone visit. Returns true the first time this zone is visited. */
	function visitZone(zoneId) {
		if (state.stats.zonesVisited.includes(zoneId)) return false;
		state.stats.zonesVisited.push(zoneId);
		save();
		return true;
	}

	function addDistance(metres) {
		if (!Number.isFinite(metres) || metres <= 0) return;
		state.stats.distanceM += metres;
		save();
	}

	function startWalk() { state.stats.walks += 1; save(); }

	/* ---- settings -------------------------------------------------------- */

	function settings() { return state.settings; }
	function setSetting(name, value) { state.settings[name] = value; save(); }

	/** Wipe everything (used by the "reset" action for demos). */
	async function resetAll() {
		state = defaults();
		save();
		await photos.clear();
	}

	/* ---- photos in IndexedDB --------------------------------------------- */

	const memoryFallback = new Map();   // used only if IndexedDB is unavailable
	let dbPromise = null;

	function openDb() {
		if (dbPromise) return dbPromise;
		dbPromise = new Promise((resolve, reject) => {
			if (!("indexedDB" in window)) { reject(new Error("IndexedDB unavailable")); return; }
			const req = indexedDB.open(WN_CONFIG.DB_NAME, 1);
			req.onupgradeneeded = () => {
				req.result.createObjectStore(WN_CONFIG.DB_STORE, { keyPath: "key" });
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		return dbPromise;
	}

	function withStore(mode, fn) {
		return openDb().then(db => new Promise((resolve, reject) => {
			const tx = db.transaction(WN_CONFIG.DB_STORE, mode);
			const store = tx.objectStore(WN_CONFIG.DB_STORE);
			const req = fn(store);
			tx.oncomplete = () => resolve(req && req.result);
			tx.onerror = () => reject(tx.error);
		}));
	}

	const photos = {
		/** @returns {Promise<string|null>} data URL of the user's photo */
		get(key) {
			return withStore("readonly", s => s.get(key))
				.then(row => (row ? row.dataUrl : null))
				.catch(() => memoryFallback.get(key) || null);
		},
		put(key, dataUrl) {
			const row = { key, dataUrl, addedAt: new Date().toISOString() };
			return withStore("readwrite", s => s.put(row))
				.catch(() => { memoryFallback.set(key, dataUrl); });
		},
		remove(key) {
			return withStore("readwrite", s => s.delete(key))
				.catch(() => { memoryFallback.delete(key); });
		},
		clear() {
			return withStore("readwrite", s => s.clear())
				.catch(() => { memoryFallback.clear(); });
		}
	};

	return { getEntry, allEntries, unlockedCount, unlock, setPhotoFlag, stats, visitZone, addDistance, startWalk, settings, setSetting, resetAll, photos };
})();
