/* ==========================================================================
   Wild Neighbours - progression: XP, levels, badges and friend cards
   --------------------------------------------------------------------------
   Everything here is derived from saved progress (entries, zone visits,
   distance, photos, friends), so XP and badges can never drift out of sync.

   The first half is pure functions (unit tested from Node by
   scripts/test-progress.mjs). The second half reads WN_STORE / WN_DATA in the
   browser, awards newly earned badges and asks WN_UI to celebrate.

   Friend comparison needs no backend: a "card" holds only counts and badge
   ids (no locations, no photos), packed into a link. Opening a friend's link
   saves their card on this device for the local leaderboard.
   ========================================================================== */

const WN_PROGRESS = (function () {
	"use strict";

	const CFG = (typeof WN_CONFIG !== "undefined") ? WN_CONFIG : require("./config.js");
	const U = (typeof WN_UTIL !== "undefined") ? WN_UTIL : require("./util.js");
	const AREA_M = 2000;   // zones further apart than this count as different areas

	/* ---- badge catalogue ------------------------------------------------ */

	const CATEGORIES = [
		{ id: "collection", name: "Collection", blurb: "Grow your Pokedex." },
		{ id: "groups", name: "Animal groups", blurb: "Meet every kind of neighbour." },
		{ id: "evidence", name: "Sightings and signs", blurb: "See them, or find what they left behind." },
		{ id: "moving", name: "On the move", blurb: "Distance, zones and new corners of Brisbane." },
		{ id: "conservation", name: "Conservation", blurb: "Threatened, iconic and rare neighbours." },
		{ id: "habits", name: "Habits and journal", blurb: "Streaks, seasons and your own photos." },
		{ id: "friends", name: "Friends", blurb: "Better together." },
		{ id: "secret", name: "Secret", blurb: "Hidden until you stumble on them." }
	];

	// metric names map to fields of computeStats()
	const BADGES = [
		// Collection
		{ id: "col-1", cat: "collection", name: "First Neighbour", desc: "Unlock your first species.", icon: "book", rarity: "bronze", metric: "species", goal: 1 },
		{ id: "col-10", cat: "collection", name: "Getting Acquainted", desc: "Unlock 10 species.", icon: "book", rarity: "bronze", metric: "species", goal: 10 },
		{ id: "col-25", cat: "collection", name: "Local Knowledge", desc: "Unlock 25 species.", icon: "book", rarity: "silver", metric: "species", goal: 25 },
		{ id: "col-50", cat: "collection", name: "Block Party", desc: "Unlock 50 species.", icon: "book", rarity: "silver", metric: "species", goal: 50 },
		{ id: "col-100", cat: "collection", name: "Wildlife Centurion", desc: "Unlock 100 species.", icon: "book", rarity: "gold", metric: "species", goal: 100 },
		{ id: "col-250", cat: "collection", name: "Walking Field Guide", desc: "Unlock 250 species.", icon: "book", rarity: "legendary", metric: "species", goal: 250 },

		// Animal groups
		{ id: "bird-10", cat: "groups", name: "Birdwatcher", desc: "Unlock 10 birds.", icon: "bird", rarity: "bronze", metric: "birds", goal: 10 },
		{ id: "bird-50", cat: "groups", name: "Twitcher", desc: "Unlock 50 birds. Keen birders call themselves twitchers.", icon: "bird", rarity: "silver", metric: "birds", goal: 50 },
		{ id: "bird-150", cat: "groups", name: "Flock Leader", desc: "Unlock 150 birds.", icon: "bird", rarity: "gold", metric: "birds", goal: 150 },
		{ id: "mam-5", cat: "groups", name: "Furry Friends", desc: "Unlock 5 mammals.", icon: "mammal", rarity: "bronze", metric: "mammals", goal: 5 },
		{ id: "mam-15", cat: "groups", name: "Mammal Maven", desc: "Unlock 15 mammals.", icon: "mammal", rarity: "silver", metric: "mammals", goal: 15 },
		{ id: "rep-5", cat: "groups", name: "Scale Seeker", desc: "Unlock 5 reptiles.", icon: "reptile", rarity: "bronze", metric: "reptiles", goal: 5 },
		{ id: "rep-15", cat: "groups", name: "Cold-Blooded Crew", desc: "Unlock 15 reptiles.", icon: "reptile", rarity: "silver", metric: "reptiles", goal: 15 },
		{ id: "frog-3", cat: "groups", name: "Pond Life", desc: "Unlock 3 frogs.", icon: "frog", rarity: "bronze", metric: "frogs", goal: 3 },
		{ id: "frog-10", cat: "groups", name: "Frog Chorus", desc: "Unlock 10 frogs.", icon: "frog", rarity: "silver", metric: "frogs", goal: 10 },
		{ id: "all-4", cat: "groups", name: "Full House", desc: "Unlock a mammal, a bird, a reptile and a frog.", icon: "star", rarity: "silver", metric: "groupsCovered", goal: 4 },

		// Sightings and signs
		{ id: "see-1", cat: "evidence", name: "First Sighting", desc: "Log a species you saw with your own eyes.", icon: "binoculars", rarity: "bronze", metric: "sighted", goal: 1 },
		{ id: "see-10", cat: "evidence", name: "Sharp Eyes", desc: "Log 10 sightings.", icon: "binoculars", rarity: "silver", metric: "sighted", goal: 10 },
		{ id: "see-25", cat: "evidence", name: "Eagle Eye", desc: "Log 25 sightings.", icon: "binoculars", rarity: "gold", metric: "sighted", goal: 25 },
		{ id: "see-50", cat: "evidence", name: "Hawkeye", desc: "Log 50 sightings.", icon: "binoculars", rarity: "legendary", metric: "sighted", goal: 50 },
		{ id: "sign-1", cat: "evidence", name: "Track Reader", desc: "Log signs of a species: tracks, calls, scats or nests.", icon: "paw", rarity: "bronze", metric: "signs", goal: 1 },
		{ id: "sign-10", cat: "evidence", name: "Bush Detective", desc: "Log signs for 10 species.", icon: "paw", rarity: "silver", metric: "signs", goal: 10 },
		{ id: "sign-25", cat: "evidence", name: "Master Tracker", desc: "Log signs for 25 species.", icon: "paw", rarity: "gold", metric: "signs", goal: 25 },

		// On the move
		{ id: "dist-1", cat: "moving", name: "First Kilometre", desc: "Walk 1 km with Wild Neighbours.", icon: "route", rarity: "bronze", metric: "distanceKm", goal: 1 },
		{ id: "dist-5", cat: "moving", name: "Weekend Walker", desc: "Walk 5 km.", icon: "route", rarity: "bronze", metric: "distanceKm", goal: 5 },
		{ id: "dist-10", cat: "moving", name: "Trail Regular", desc: "Walk 10 km.", icon: "route", rarity: "silver", metric: "distanceKm", goal: 10 },
		{ id: "dist-21", cat: "moving", name: "Half Marathon", desc: "Walk 21.1 km, a half marathon.", icon: "route", rarity: "silver", metric: "distanceKm", goal: 21.1 },
		{ id: "dist-42", cat: "moving", name: "Marathon Ranger", desc: "Walk 42.2 km, a full marathon.", icon: "route", rarity: "gold", metric: "distanceKm", goal: 42.2 },
		{ id: "dist-100", cat: "moving", name: "Long Haul", desc: "Walk 100 km.", icon: "route", rarity: "legendary", metric: "distanceKm", goal: 100 },
		{ id: "zone-1", cat: "moving", name: "Into the Wild", desc: "Step into your first habitat zone.", icon: "pin", rarity: "bronze", metric: "zones", goal: 1 },
		{ id: "zone-5", cat: "moving", name: "Zone Hopper", desc: "Visit 5 habitat zones.", icon: "pin", rarity: "bronze", metric: "zones", goal: 5 },
		{ id: "zone-15", cat: "moving", name: "Habitat Hunter", desc: "Visit 15 habitat zones.", icon: "pin", rarity: "silver", metric: "zones", goal: 15 },
		{ id: "zone-30", cat: "moving", name: "Cartographer", desc: "Visit 30 habitat zones.", icon: "pin", rarity: "gold", metric: "zones", goal: 30 },
		{ id: "area-3", cat: "moving", name: "Suburb Hopper", desc: "Visit zones in 3 different areas of Brisbane, each at least 2 km apart.", icon: "compass", rarity: "silver", metric: "areas", goal: 3 },
		{ id: "area-8", cat: "moving", name: "City Explorer", desc: "Visit zones in 8 different areas of Brisbane, each at least 2 km apart.", icon: "compass", rarity: "gold", metric: "areas", goal: 8 },
		{ id: "area-15", cat: "moving", name: "Brisbane Ranger", desc: "Visit zones in 15 different areas of Brisbane, each at least 2 km apart.", icon: "compass", rarity: "legendary", metric: "areas", goal: 15 },

		// Conservation
		{ id: "thr-1", cat: "conservation", name: "Guardian", desc: "Find a threatened species. Give it extra space.", icon: "shield", rarity: "silver", metric: "threatened", goal: 1 },
		{ id: "thr-5", cat: "conservation", name: "Conservation Champion", desc: "Find 5 threatened species.", icon: "shield", rarity: "gold", metric: "threatened", goal: 5 },
		{ id: "icon-5", cat: "conservation", name: "Aussie Icons", desc: "Find 5 of Brisbane's Big Ten: koala, kookaburra, echidna, platypus, water dragon, lace monitor, eastern grey kangaroo, tawny frogmouth, green tree frog and carpet python.", icon: "crown", rarity: "gold", metric: "icons", goal: 5 },
		{ id: "icon-10", cat: "conservation", name: "Brisbane Big Ten", desc: "Find all ten of Brisbane's iconic animals.", icon: "crown", rarity: "legendary", metric: "icons", goal: 10 },
		{ id: "koala", cat: "conservation", name: "Koala Moment", desc: "Log a koala you spotted. Quietly, and from a distance.", icon: "heart", rarity: "gold", metric: "koalaSighted", goal: 1 },
		{ id: "rare-1", cat: "conservation", name: "Rare Find", desc: "Unlock a species that is very rare in our records.", icon: "gem", rarity: "gold", metric: "veryRare", goal: 1 },

		// Habits and journal
		{ id: "streak-3", cat: "habits", name: "On a Roll", desc: "Explore on 3 days in a row.", icon: "flame", rarity: "silver", metric: "bestStreak", goal: 3 },
		{ id: "streak-7", cat: "habits", name: "Week Warrior", desc: "Explore 7 days in a row.", icon: "flame", rarity: "gold", metric: "bestStreak", goal: 7 },
		{ id: "days-30", cat: "habits", name: "Bush Regular", desc: "Explore on 30 different days.", icon: "calendar", rarity: "legendary", metric: "days", goal: 30 },
		{ id: "season-4", cat: "habits", name: "Four Seasons", desc: "Unlock species in summer, autumn, winter and spring.", icon: "leaf", rarity: "legendary", metric: "seasons", goal: 4 },
		{ id: "pic-1", cat: "habits", name: "Snapshot", desc: "Add your own photo to an entry.", icon: "camera", rarity: "bronze", metric: "photos", goal: 1 },
		{ id: "pic-10", cat: "habits", name: "Photo Journal", desc: "Add your own photos to 10 entries.", icon: "camera", rarity: "silver", metric: "photos", goal: 10 },
		{ id: "pic-25", cat: "habits", name: "Shutterbug", desc: "Add your own photos to 25 entries.", icon: "camera", rarity: "gold", metric: "photos", goal: 25 },

		// Friends
		{ id: "friend-1", cat: "friends", name: "Better Together", desc: "Add your first friend.", icon: "users", rarity: "bronze", metric: "friends", goal: 1 },
		{ id: "friend-5", cat: "friends", name: "Ranger Pack", desc: "Add 5 friends.", icon: "users", rarity: "silver", metric: "friends", goal: 5 },

		// Secret
		{ id: "night-owl", cat: "secret", name: "Night Owl", desc: "Unlock a species between 8 pm and 4 am.", icon: "moon", rarity: "silver", metric: "night", goal: 1, secret: true, hint: "Some neighbours only come out after dark." },
		{ id: "early-bird", cat: "secret", name: "Early Bird", desc: "Unlock a species before 7 am.", icon: "sunrise", rarity: "silver", metric: "early", goal: 1, secret: true, hint: "The dawn chorus has its rewards." }
	];
	const BY_ID = new Map(BADGES.map(b => [b.id, b]));
	const RARITY_ORDER = { bronze: 1, silver: 2, gold: 3, legendary: 4 };

	/* ---- pure helpers -------------------------------------------------- */

	/** Southern-hemisphere season for a month index (0 = January). */
	function seasonOf(month) {
		if (month === 11 || month <= 1) return "summer";
		if (month <= 4) return "autumn";
		if (month <= 7) return "winter";
		return "spring";
	}

	function dayNumber(iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000; }

	/** Best and current run of consecutive active days. */
	function streaks(days, todayIso) {
		const nums = Array.from(new Set(days || [])).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).map(dayNumber).sort((a, b) => a - b);
		let best = 0, run = 0, prev = null;
		nums.forEach(n => { run = (prev !== null && n - prev === 1) ? run + 1 : 1; best = Math.max(best, run); prev = n; });
		let current = 0;
		if (nums.length && todayIso) {
			const last = nums[nums.length - 1], t = dayNumber(todayIso);
			if (t - last <= 1) current = run;
		}
		return { best, current };
	}

	/**
	 * How many distinct areas a list of visited zones covers. A zone starts a
	 * new area only if it is more than 2 km from every area found so far, so
	 * neighbouring zones in one reserve count once.
	 */
	function countAreas(points) {
		const seeds = [];
		(points || []).forEach(p => {
			if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
			if (!seeds.some(q => U.haversine(p.lat, p.lng, q.lat, q.lng) <= AREA_M)) seeds.push(p);
		});
		return seeds.length;
	}

	function speciesInfo(index, key) {
		if (!index) return null;
		return typeof index.get === "function" ? index.get(key) : index[key];
	}

	/**
	 * Every number the badges need, from raw saved state.
	 * @param {Object} input { entries, stats, speciesIndex, friendsCount, today }
	 */
	function computeStats(input) {
		const entries = input.entries || {};
		const st = input.stats || {};
		const iconic = new Set(CFG.ICONIC);
		const out = {
			species: 0, sighted: 0, signs: 0,
			mammals: 0, birds: 0, reptiles: 0, frogs: 0, groupsCovered: 0,
			threatened: 0, icons: 0, koalaSighted: 0, veryRare: 0, photos: 0,
			zones: (st.zonesVisited || []).length, areas: 0,
			distanceM: st.distanceM || 0, distanceKm: 0,
			days: (st.days || []).length, bestStreak: 0, currentStreak: 0,
			seasons: 0, night: 0, early: 0,
			friends: input.friendsCount || 0
		};
		const seasons = new Set();
		Object.keys(entries).forEach(key => {
			const e = entries[key];
			out.species++;
			if (e.tier === 3) out.sighted++;
			if (e.signs || e.tier === 2) out.signs++;
			if (e.hasPhoto) out.photos++;
			if (iconic.has(key)) out.icons++;
			if (key === CFG.KOALA && e.tier === 3) out.koalaSighted = 1;
			const sp = speciesInfo(input.speciesIndex, key);
			if (sp) {
				if (sp.group === "mammal") out.mammals++;
				else if (sp.group === "bird") out.birds++;
				else if (sp.group === "reptile") out.reptiles++;
				else if (sp.group === "frog") out.frogs++;
				if (sp.threatened) out.threatened++;
				if (sp.rarity === "veryrare") out.veryRare++;
			}
			[e.unlockedAt, e.tierAt].forEach(iso => {
				if (!iso) return;
				const d = new Date(iso);
				if (Number.isNaN(d.getTime())) return;
				seasons.add(seasonOf(d.getMonth()));
				const h = d.getHours();
				if (h >= 20 || h < 4) out.night = 1;
				if (h >= 4 && h < 7) out.early = 1;
			});
		});
		out.groupsCovered = [out.mammals, out.birds, out.reptiles, out.frogs].filter(n => n > 0).length;
		out.seasons = seasons.size;
		out.distanceKm = Math.floor(out.distanceM / 100) / 10;   // one decimal, rounded down
		const visits = Object.values(st.zoneVisits || {}).sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
		out.areas = countAreas(visits);
		const s = streaks(st.days, input.today);
		out.bestStreak = s.best;
		out.currentStreak = s.current;
		return out;
	}

	/** Progress of every badge: { badge, value, goal, progress 0..1, eligible }. */
	function evaluate(stats) {
		return BADGES.map(b => {
			const value = Number(stats[b.metric]) || 0;
			return { badge: b, value, goal: b.goal, progress: Math.min(1, value / b.goal), eligible: value >= b.goal };
		});
	}

	/** XP needed to reach a level. Each level costs 50 XP more than the last. */
	function threshold(level) { return 100 * (level - 1) + 25 * (level - 1) * (level - 2); }

	function rankFor(level) {
		let title = CFG.RANKS[0].title;
		CFG.RANKS.forEach(r => { if (level >= r.level) title = r.title; });
		return title;
	}

	function levelFor(xp) {
		let level = 1;
		while (threshold(level + 1) <= xp) level++;
		const base = threshold(level), next = threshold(level + 1);
		return { level, xp, base, next, into: xp - base, need: next - base, progress: (xp - base) / (next - base), rank: rankFor(level) };
	}

	/** Total XP from progress plus earned badges. */
	function xpFor(input, stats, earnedIds) {
		const X = CFG.XP;
		let xp = 0;
		Object.keys(input.entries || {}).forEach(key => {
			const e = input.entries[key];
			xp += X.tier[e.tier] || 0;
			const sp = speciesInfo(input.speciesIndex, key);
			if (sp && sp.rarity) xp += X.rarity[sp.rarity] || 0;
		});
		xp += stats.zones * X.zone;
		xp += Math.floor(stats.distanceM / 100) * X.per100m;
		xp += stats.photos * X.photo;
		(earnedIds || []).forEach(id => { const b = BY_ID.get(id); if (b) xp += X.badge[b.rarity] || 0; });
		return xp;
	}

	/** The closest badges to earn next (not secret, not yet earned). */
	function nextUp(evaluations, earned, count) {
		return evaluations
			.filter(ev => !earned[ev.badge.id] && !ev.badge.secret)
			.sort((a, b) => (b.progress - a.progress) || (RARITY_ORDER[a.badge.rarity] - RARITY_ORDER[b.badge.rarity]) || (a.goal - b.goal))
			.slice(0, count || 3);
	}

	/* ---- friend cards (shareable links) ---------------------------------- */

	function b64urlEncode(str) {
		const bytes = new TextEncoder().encode(str);
		let bin = "";
		bytes.forEach(b => { bin += String.fromCharCode(b); });
		return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	}
	function b64urlDecode(s) {
		let t = String(s).replace(/-/g, "+").replace(/_/g, "/");
		while (t.length % 4) t += "=";
		const bin = atob(t);
		return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
	}

	/** Pack a card. Only counts and badge ids: no places, no photos, no species list. */
	function encodeCard(card) { return b64urlEncode(JSON.stringify(card)); }

	/** Unpack and sanity-check a card from someone else. Returns null if it is not valid. */
	function decodeCard(code) {
		try {
			const o = JSON.parse(b64urlDecode(code));
			if (!o || o.v !== 1 || typeof o.id !== "string" || !/^[a-z0-9]{4,16}$/.test(o.id)) return null;
			const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), max) : 0; };
			const name = String(o.n || "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 24) || "Ranger";
			return {
				v: 1, id: o.id, n: name,
				x: num(o.x, 1e7), s: num(o.s, 5000), t3: num(o.t3, 5000), t2: num(o.t2, 5000),
				z: num(o.z, 1e5), d: num(o.d, 1e8), st: num(o.st, 3650), a: num(o.a, 1e4),
				b: Array.from(new Set(Array.isArray(o.b) ? o.b.filter(id => BY_ID.has(id)) : [])),
				g: Array.isArray(o.g) && o.g.length === 4 ? o.g.map(v => num(v, 5000)) : [0, 0, 0, 0],
				u: typeof o.u === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.u) ? o.u : null
			};
		} catch (err) {
			return null;
		}
	}

	/** Accept a whole link, a "#friend=..." fragment or a bare code. */
	function extractCode(text) {
		const t = String(text || "").trim();
		const m = t.match(/friend=([A-Za-z0-9_-]+)/);
		if (m) return m[1];
		return /^[A-Za-z0-9_-]{20,}$/.test(t) ? t : null;
	}

	/* ---- browser side: read state, award, celebrate ------------------------ */

	let lastXp = null;
	let timer = null;

	function input() {
		return {
			entries: WN_STORE.allEntries(),
			stats: WN_STORE.stats(),
			speciesIndex: WN_DATA.state.speciesIndex,
			friendsCount: Object.keys(WN_STORE.friends()).length,
			today: WN_STORE.today()
		};
	}

	/** Everything the UI needs in one object. */
	function snapshot() {
		const inp = input();
		const stats = computeStats(inp);
		const earned = WN_STORE.badges();
		const evaluations = evaluate(stats);
		const xp = xpFor(inp, stats, Object.keys(earned));
		return { stats, earned, evaluations, xp, level: levelFor(xp) };
	}

	/**
	 * Award any newly earned badges and handle level-ups.
	 * @param {Object} opts  { celebrate: show the celebration (default true) }
	 */
	function refresh(opts) {
		const celebrate = !(opts && opts.celebrate === false);
		let snap = snapshot();
		const fresh = snap.evaluations.filter(ev => ev.eligible && !snap.earned[ev.badge.id]).map(ev => ev.badge);
		fresh.forEach(b => WN_STORE.awardBadge(b.id));
		if (fresh.length) snap = snapshot();   // badges add XP

		const profile = WN_STORE.profile();
		let levelUp = null;
		if (snap.level.level > (profile.lastLevel || 1)) {
			levelUp = { level: snap.level.level, rank: snap.level.rank, rankChanged: rankFor(profile.lastLevel || 1) !== snap.level.rank };
			WN_STORE.setProfile("lastLevel", snap.level.level);
		}
		const gained = lastXp === null ? 0 : snap.xp - lastXp;
		lastXp = snap.xp;

		if (celebrate && (fresh.length || levelUp)) {
			WN_UI.celebrateProgress({ badges: fresh, levelUp, xp: snap.xp, gained });
		} else if (!celebrate && fresh.length) {
			WN_UI.toast(fresh.length === 1 ? "You earned a badge: " + fresh[0].name : "You have " + fresh.length + " new badges waiting", 3200);
		}
		WN_UI.renderLevel(snap.level, WN_STORE.unseenBadgeCount());
		document.dispatchEvent(new CustomEvent("wn:progress", { detail: snap }));
		return snap;
	}

	/** Coalesce bursts of changes (a zone visit unlocks many species at once). */
	function schedule() {
		clearTimeout(timer);
		timer = setTimeout(() => refresh(), 60);
	}

	/** This user's card, ready to share. */
	function myCard() {
		const snap = snapshot();
		const p = WN_STORE.profile();
		const s = snap.stats;
		return {
			v: 1, id: p.id, n: p.nickname, x: snap.xp, s: s.species, t3: s.sighted, t2: s.signs,
			z: s.zones, d: Math.round(s.distanceM), st: s.bestStreak, a: s.areas,
			b: Object.keys(snap.earned), g: [s.mammals, s.birds, s.reptiles, s.frogs], u: WN_STORE.today()
		};
	}

	return {
		CATEGORIES, BADGES, BY_ID, RARITY_ORDER,
		seasonOf, streaks, countAreas, computeStats, evaluate, threshold, levelFor, rankFor, xpFor, nextUp,
		encodeCard, decodeCard, extractCode,
		snapshot, refresh, schedule, myCard
	};
})();

if (typeof module !== "undefined") module.exports = WN_PROGRESS;
