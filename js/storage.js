/* ==========================================================================
   Wild Neighbours - on-device storage
   --------------------------------------------------------------------------
   * localStorage  : the Pokedex collection, walk stats, settings, profile,
                     earned badges and friends' cards (small JSON)
   * IndexedDB     : personal photos (base64 data URLs can be a few hundred KB
                     each, which would blow the ~5 MB localStorage cap fast)

   Nothing here ever leaves the device. There are no accounts and no server.
   ========================================================================== */

const WN_STORE = (function () {
	"use strict";

	const KEY = WN_CONFIG.STORAGE_KEY;

	/** Short random id, used to tell friends' cards apart. */
	function randomId() {
		const bytes = new Uint8Array(6);
		(window.crypto || window.msCrypto).getRandomValues(bytes);
		return Array.from(bytes, b => (b % 36).toString(36)).join("");
	}
	function randomNickname() {
		const pick = (list) => list[Math.floor(Math.random() * list.length)];
		return pick(WN_CONFIG.NICK_ADJ) + " " + pick(WN_CONFIG.NICK_NOUN);
	}
	/** Local calendar date "YYYY-MM-DD" (device time zone). */
	function today() {
		const d = new Date();
		return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
	}

	function defaults() {
		return {
			entries: {},        // speciesKey -> { tier, unlockedAt, tierAt, zoneName, place, hasPhoto, signs, sighted }
			stats: {
				zonesVisited: [],   // zone ids, in visit order
				zoneVisits: {},     // zone id -> { lat, lng, place, at } (for "areas explored")
				distanceM: 0,
				walks: 0,
				days: []            // local dates with any activity, for streak badges
			},
			settings: {
				source: "cached",
				location: WN_CONFIG.DEFAULT_LOCATION,
				customLat: null, customLng: null,
				radius: WN_CONFIG.RADIUS_DEFAULT,
				window: WN_CONFIG.WINDOW_DEFAULT_MONTHS,
				simulate: false,
				cardCompact: null,          // null = decide by screen height
				alertsOn: true,                                       // alert cards while walking
				alertGroups: ["mammal", "bird", "reptile", "frog"]    // animal groups that trigger zone alerts
			},
			profile: {
				id: randomId(),
				nickname: randomNickname(),
				createdAt: new Date().toISOString(),
				lastLevel: 1,       // highest level already celebrated
				onboarded: false
			},
			badges: {},         // badge id -> { earnedAt, seen }
			friends: {}         // friend id -> snapshot decoded from their share link
		};
	}

	let state = load();

	function load() {
		const d = defaults();
		try {
			const raw = localStorage.getItem(KEY);
			if (raw) {
				const saved = JSON.parse(raw);
				return {
					entries: saved.entries || d.entries,
					stats: Object.assign(d.stats, saved.stats || {}),
					settings: Object.assign(d.settings, saved.settings || {}),
					profile: Object.assign(d.profile, saved.profile || {}),
					badges: saved.badges || {},
					friends: saved.friends || {}
				};
			}
		} catch (err) {
			console.warn("Could not read saved progress, starting fresh.", err);
		}
		return d;
	}

	function save() {
		try {
			localStorage.setItem(KEY, JSON.stringify(state));
		} catch (err) {
			console.warn("Could not save progress (storage full or blocked).", err);
		}
	}

	/** Remember that the walker did something today (for streak badges). */
	function markActiveDay() {
		const t = today();
		if (!state.stats.days.includes(t)) { state.stats.days.push(t); return true; }
		return false;
	}

	/* ---- Pokedex entries ------------------------------------------------ */

	function getEntry(key) { return state.entries[key] || null; }
	function allEntries() { return state.entries; }
	function unlockedCount() { return Object.keys(state.entries).length; }

	/**
	 * Unlock or upgrade an entry. Tiers only ever go up (3 sighted > 2 signs >
	 * 1 zone visit). The "signs" and "sighted" flags remember that evidence was
	 * ever logged, so upgrading signs to a sighting still counts for both badge
	 * families. Returns { changed, isNew, previousTier, entry }.
	 */
	function unlock(key, tier, ctx) {
		const existing = state.entries[key];
		const previousTier = existing ? existing.tier : 0;
		if (existing && existing.tier >= tier) {
			if (tier === 2 && !existing.signs) { existing.signs = true; save(); }
			return { changed: false, isNew: false, previousTier, entry: existing };
		}
		const now = new Date().toISOString();
		const entry = existing || { unlockedAt: now, hasPhoto: false };
		entry.tier = tier;
		entry.tierAt = now;
		if (tier === 2) entry.signs = true;
		if (tier === 3) entry.sighted = true;
		entry.zoneName = (ctx && ctx.zoneName) || entry.zoneName || null;
		entry.place = (ctx && ctx.place) || entry.place || null;
		state.entries[key] = entry;
		markActiveDay();
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

	/**
	 * Record a zone visit. Accepts a zone object (preferred, so its rough
	 * position can count towards "areas explored") or a bare id.
	 * Returns true the first time this zone is visited.
	 */
	function visitZone(zone, place) {
		const id = typeof zone === "string" ? zone : zone.id;
		markActiveDay();
		if (state.stats.zonesVisited.includes(id)) { save(); return false; }
		state.stats.zonesVisited.push(id);
		if (typeof zone === "object") {
			state.stats.zoneVisits[id] = { lat: zone.lat, lng: zone.lng, place: place || null, at: new Date().toISOString() };
		}
		save();
		return true;
	}

	function addDistance(metres) {
		if (!Number.isFinite(metres) || metres <= 0) return;
		state.stats.distanceM += metres;
		if (metres >= 5) markActiveDay();
		save();
	}

	function startWalk() { state.stats.walks += 1; save(); }

	/* ---- settings -------------------------------------------------------- */

	function settings() { return state.settings; }
	function setSetting(name, value) { state.settings[name] = value; save(); }

	/* ---- profile, badges, friends ------------------------------------------ */

	function profile() { return state.profile; }
	function setProfile(name, value) { state.profile[name] = value; save(); }

	function badges() { return state.badges; }
	/** Record a newly earned badge. Returns false if it was already earned. */
	function awardBadge(id) {
		if (state.badges[id]) return false;
		state.badges[id] = { earnedAt: new Date().toISOString(), seen: false };
		save();
		return true;
	}
	function markBadgesSeen() {
		let changed = false;
		Object.values(state.badges).forEach(b => { if (!b.seen) { b.seen = true; changed = true; } });
		if (changed) save();
	}
	function unseenBadgeCount() { return Object.values(state.badges).filter(b => !b.seen).length; }

	function friends() { return state.friends; }
	/** Add or refresh a friend from a decoded card. Returns "added" or "updated". */
	function saveFriend(card) {
		const existing = state.friends[card.id];
		state.friends[card.id] = Object.assign({}, card, {
			addedAt: existing ? existing.addedAt : new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
		save();
		return existing ? "updated" : "added";
	}
	function removeFriend(id) { delete state.friends[id]; save(); }

	/**
	 * Wipe progress (used by the "reset" demo action). Keeps who you are
	 * (id, nickname), your friends list and the intro flag.
	 */
	async function resetAll() {
		const keep = { profile: state.profile, friends: state.friends };
		state = defaults();
		state.profile = Object.assign(keep.profile, { lastLevel: 1 });
		state.friends = keep.friends;
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

	return {
		getEntry, allEntries, unlockedCount, unlock, setPhotoFlag,
		stats, visitZone, addDistance, startWalk, markActiveDay, today,
		settings, setSetting,
		profile, setProfile, badges, awardBadge, markBadgesSeen, unseenBadgeCount,
		friends, saveFriend, removeFriend,
		resetAll, photos
	};
})();
