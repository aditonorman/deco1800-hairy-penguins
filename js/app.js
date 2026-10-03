/* ==========================================================================
   Wild Neighbours - app bootstrap
   --------------------------------------------------------------------------
   Wires the modules together: loads data, builds zones for the chosen
   location / radius / recency window, and handles the top-level controls
   (explore card, "search this area", settings, demo tools, the first-run
   intro, friend links and the offline service worker).
   ========================================================================== */

(function () {
	"use strict";

	const U = WN_UTIL, $ = WN_UI.$, $$ = WN_UI.$$, I = WN_UI.I;
	const S = WN_STORE.settings();
	const BRISBANE = { lat: -27.4698, lng: 153.0251 };
	let zones = [];
	let liveTimer = null;
	let autoLiveKey = null;      // centre we already tried to fetch live for
	let pendingHash = null;      // a #friend= link waiting for the intro to finish

	/* ---- helpers ------------------------------------------------------------ */

	function currentLocation() {
		const preset = WN_CONFIG.LOCATIONS.find(l => l.id === S.location) || WN_CONFIG.LOCATIONS[0];
		if (preset.id === "custom") {
			if (S.customLat == null) return Object.assign({}, WN_CONFIG.LOCATIONS[0]);
			return Object.assign({}, preset, { lat: S.customLat, lng: S.customLng });
		}
		return preset;
	}
	function shortName(loc) { return loc.id === "custom" ? "Your chosen spot" : loc.place || loc.name; }

	function windowLabel() {
		return S.window ? "the last " + (S.window === 12 ? "12 months" : S.window === 24 ? "2 years" : S.window + " months") : "all cached records";
	}

	/** How well the cache covers a circle: "full", "partial" or "none". */
	function cacheAreas() {
		const m = WN_DATA.meta();
		return m.areas || [{ name: "cached area", lat: m.centre.lat, lng: m.centre.lng, radiusM: m.radiusM }];
	}
	function cacheCoverage(loc) {
		let best = "none";
		for (const a of cacheAreas()) {
			const d = U.haversine(loc.lat, loc.lng, a.lat, a.lng);
			if (d + S.radius <= a.radiusM) return "full";
			if (d - S.radius < a.radiusM) best = "partial";
		}
		return best;
	}

	/* ---- zones ---------------------------------------------------------------- */

	/**
	 * Rebuild zones from the current records + settings and redraw everything.
	 * @param fit      fit the map to the search circle
	 * @param animate  pop the zones in (a new area); off for slider drags
	 */
	function rebuild(fit, animate) {
		const loc = currentLocation();

		// Outside the cached circles? Fetch live once, automatically, when online.
		const coverage = cacheCoverage(loc);
		const key = loc.lat.toFixed(3) + "," + loc.lng.toFixed(3) + "," + S.radius;
		if (coverage === "none" && S.source !== "live" && navigator.onLine !== false && autoLiveKey !== key) {
			autoLiveKey = key;
			WN_UI.toast("No cached records here. Fetching live from ALA…", 2500);
			goLive();
			return;
		}

		const sensitive = new Set(WN_DATA.allSpecies().filter(s => s.sensitive).map(s => s.key));
		const filtered = WN_ZONES.filterRecords(WN_DATA.records(), {
			lat: loc.lat, lng: loc.lng, radiusM: S.radius,
			sinceIso: U.monthsAgoIso(S.window), excludeKeys: sensitive
		});
		zones = WN_ZONES.buildZones(filtered, { speciesIndex: WN_DATA.state.speciesIndex });

		WN_MAP.setCentre(loc.lat, loc.lng, S.radius, fit);
		WN_MAP.renderZones(zones, animate);
		WN_WALK.setZones(zones, { lat: loc.lat, lng: loc.lng, place: shortName(loc) });
		WN_POKEDEX.render();
		$("#btn-search-here").hidden = true;

		$("#explore-title").textContent = shortName(loc);
		$("#live-tag").hidden = S.source !== "live";
		const speciesCount = new Set(zones.flatMap(z => z.species.map(s => s.key))).size;
		let text = "<strong>" + zones.length + " zones</strong> · <strong>" + speciesCount + " species</strong> · " +
			filtered.length + " records from " + windowLabel() + " within " + U.formatDistance(S.radius) + ".";
		if (U.haversine(loc.lat, loc.lng, BRISBANE.lat, BRISBANE.lng) > 150000) text += " <strong>Wild Neighbours covers Brisbane.</strong> Pick a Brisbane spot to explore.";
		else if (!zones.length) text += " Try a wider radius or a longer time window.";
		else if (zones.length < 4) text += " A wider radius or longer window will show more.";
		if (S.source !== "live" && coverage === "partial") text += " Part of this circle is outside the cached data; Live covers all of it.";
		$("#explore-summary").innerHTML = text;
		renderNearby();
		updateDataHint();
	}

	/** "Likely around here": the most-recorded species across the current zones. */
	function renderNearby() {
		const agg = new Map();
		zones.forEach(z => z.species.forEach(s => {
			const a = agg.get(s.key) || { key: s.key, count: 0 };
			a.count += s.count;
			agg.set(s.key, a);
		}));
		const list = Array.from(agg.values()).sort((a, b) => b.count - a.count).slice(0, 16);
		$("#nearby-wrap").hidden = !list.length;
		$("#nearby-count").textContent = agg.size ? agg.size + " species" : "";
		$("#nearby-row").innerHTML = list.map((a, i) => {
			const sp = WN_DATA.getSpecies(a.key);
			if (!sp) return "";
			const locked = !WN_STORE.getEntry(a.key);
			return '<button type="button" class="nearby-item t-' + sp.group + (locked ? " is-locked" : "") + '" data-key="' + a.key + '" style="--d:' + (i * 30) + 'ms" aria-label="' + (locked ? "Hidden " + WN_CONFIG.GROUP_LABELS[sp.group] : U.esc(sp.displayName)) + '">' +
				'<span class="nearby-thumb">' + WN_UI.speciesImg(sp, "thumb") + (locked ? '<span class="nearby-q" aria-hidden="true">?</span>' : "") + "</span>" +
				'<span class="nearby-name">' + (locked ? "???" : U.esc(sp.displayName)) + "</span></button>";
		}).join("");
	}

	/* ---- data source ------------------------------------------------------------ */

	function setSourceButtons(src) {
		$$("[data-source]").forEach(b => b.classList.toggle("is-active", b.dataset.source === src));
		$("#live-tag").hidden = src !== "live";
	}

	function updateDataHint() {
		const m = WN_DATA.meta();
		const live = WN_DATA.liveInfo();
		$("#data-hint").textContent = S.source === "live" && live
			? "Live: fresh records from the Atlas of Living Australia for the current circle (" + live.records.length + " records). WildNet records still come from the cache because its API blocks browser requests."
			: "Cached: records downloaded " + U.formatDate(m.fetchedAt.slice(0, 10)) + " for Mt Coot-tha and greater Brisbane. Works offline. Switch to Live for the latest sightings anywhere.";
	}

	async function goLive() {
		const loc = currentLocation();
		setSourceButtons("live");
		WN_UI.notice("Fetching recent records from the Atlas of Living Australia…");
		try {
			const live = await WN_DATA.fetchLive({ lat: loc.lat, lng: loc.lng, radiusM: S.radius, months: S.window || 24 });
			WN_DATA.setSource("live");
			S.source = "live"; WN_STORE.setSetting("source", "live");
			WN_UI.notice("Live: " + live.records.length + (live.truncated ? " of " + live.total : "") + " ALA records from " + windowLabel() +
				", fetched " + new Date(live.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + ".");
		} catch (err) {
			WN_DATA.setSource("cached");
			S.source = "cached"; WN_STORE.setSetting("source", "cached");
			setSourceButtons("cached");
			const m = WN_DATA.meta();
			WN_UI.notice("Live data unavailable (" + (err.name === "AbortError" ? "timed out" : err.message) + "). Showing cached records from " + U.formatDate(m.fetchedAt.slice(0, 10)) + ".", "error");
		}
		rebuild(false);
	}

	function goCached() {
		WN_DATA.setSource("cached");
		S.source = "cached"; WN_STORE.setSetting("source", "cached");
		setSourceButtons("cached");
		WN_UI.notice(null);
		rebuild(false);
	}

	/** In live mode a new circle needs a new fetch; debounce slider drags. */
	function settingsChanged(fit, animate) {
		rebuild(fit, animate);
		if (S.source === "live") {
			clearTimeout(liveTimer);
			liveTimer = setTimeout(goLive, 700);
		}
	}

	function setCustomCentre(lat, lng, fit) {
		S.location = "custom"; S.customLat = lat; S.customLng = lng;
		WN_STORE.setSetting("location", "custom"); WN_STORE.setSetting("customLat", lat); WN_STORE.setSetting("customLng", lng);
		$("#location-select").value = "custom";
		settingsChanged(fit, true);
	}

	/* ---- controls ------------------------------------------------------------------ */

	function bindControls() {
		// location presets, grouped
		const locSel = $("#location-select");
		const groups = [];
		WN_CONFIG.LOCATIONS.forEach(l => {
			let g = groups.find(x => x.name === l.group);
			if (!g) { g = { name: l.group, items: [] }; groups.push(g); }
			g.items.push(l);
		});
		locSel.innerHTML = groups.map(g => '<optgroup label="' + U.esc(g.name) + '">' +
			g.items.map(l => '<option value="' + l.id + '">' + U.esc(l.name) + "</option>").join("") + "</optgroup>").join("");
		locSel.value = S.location;
		locSel.addEventListener("change", () => {
			S.location = locSel.value; WN_STORE.setSetting("location", S.location);
			if (S.location === "custom" && S.customLat == null) { WN_UI.toast("Drag the map, then tap Search this area"); return; }
			settingsChanged(true, true);
		});

		const range = $("#radius-range"), out = $("#radius-output");
		range.min = WN_CONFIG.RADIUS_MIN; range.max = WN_CONFIG.RADIUS_MAX; range.value = S.radius;
		out.textContent = U.formatDistance(S.radius);
		range.addEventListener("input", () => { S.radius = Number(range.value); out.textContent = U.formatDistance(S.radius); WN_STORE.setSetting("radius", S.radius); settingsChanged(true); });

		const win = $("#window-select");
		win.value = String(S.window);
		win.addEventListener("change", () => { S.window = Number(win.value); WN_STORE.setSetting("window", S.window); settingsChanged(false); });

		// explore card: "Change" opens the controls, the handle collapses the card
		const panel = $("#explore-panel"), toggle = $("#panel-toggle"), controls = $("#explore-controls"), handle = $("#card-handle");
		const setControls = (open) => {
			controls.hidden = !open;
			toggle.textContent = open ? "Done" : "Change";
			toggle.setAttribute("aria-expanded", String(open));
			if (open) setCompact(false);
		};
		const setCompact = (compact) => {
			panel.classList.toggle("is-compact", compact);
			handle.setAttribute("aria-expanded", String(!compact));
			handle.setAttribute("aria-label", compact ? "Expand" : "Collapse");
			WN_STORE.setSetting("cardCompact", compact);
		};
		toggle.addEventListener("click", () => setControls(controls.hidden));
		handle.addEventListener("click", () => { if (!controls.hidden) setControls(false); else setCompact(!panel.classList.contains("is-compact")); });
		setCompact(Boolean(S.cardCompact));
		if (!WN_UI.isPhone()) setControls(true);
		$("#nearby-row").addEventListener("click", (e) => { const b = e.target.closest("[data-key]"); if (b) WN_UI.showEntry(b.dataset.key); });

		// map interactions
		WN_MAP.on("mapTap", (lat, lng) => {
			if (WN_WALK.teleport(lat, lng)) return;          // demo mode: jump there
			WN_UI.hideZone();
		});
		WN_MAP.on("zoneTap", (zone, latlng) => {
			if (WN_WALK.isSimulating() && !WN_WALK.inZone(zone.id)) { WN_WALK.teleport(latlng.lat, latlng.lng); return; }
			const here = WN_WALK.inZone(zone.id);
			WN_UI.showZone(zone, { canReport: here, onReport: WN_WALK.report, hint: here ? null : "Walk into this zone to log a sighting or signs." });
		});
		WN_MAP.on("moved", (lat, lng) => {
			const loc = currentLocation();
			const far = U.haversine(lat, lng, loc.lat, loc.lng) > Math.max(900, S.radius * 0.8);
			$("#btn-search-here").hidden = !far;
		});
		$("#btn-search-here").addEventListener("click", () => {
			const c = WN_MAP.center();
			setCustomCentre(c.lat, c.lng, false);
			WN_UI.toast("Searching this area");
		});
		$("#btn-zoom-in").addEventListener("click", WN_MAP.zoomIn);
		$("#btn-zoom-out").addEventListener("click", WN_MAP.zoomOut);

		// tabs + header
		$$(".tabbar button").forEach(b => b.addEventListener("click", () => WN_UI.showTab(b.dataset.tab)));
		WN_UI.onTab(tab => { if (tab === "map") WN_MAP.invalidate(); else WN_UI.hideZone(); });
		$("#level-chip").addEventListener("click", () => WN_UI.showTab("badges"));

		// settings sheet
		$("#btn-settings").addEventListener("click", () => WN_UI.showSettings());
		$$("[data-source]").forEach(b => b.addEventListener("click", () => b.dataset.source === "live" ? goLive() : goCached()));
		const sim = $("#sim-toggle");
		sim.checked = Boolean(S.simulate);
		sim.addEventListener("change", () => WN_WALK.setSimulate(sim.checked));
		$("#btn-jump").addEventListener("click", () => { WN_UI.hideSettings(); WN_UI.showTab("map"); WN_WALK.jumpToNearestZone(); });
		$("#btn-replay-intro").addEventListener("click", () => { WN_UI.hideSettings(); showOnboarding(); });
		$("#btn-reset").addEventListener("click", async () => {
			if (!confirm("Clear your Pokedex, photos, badges and walk stats on this device? Your name and friends stay.")) return;
			await WN_STORE.resetAll();
			WN_UI.renderStats(); WN_POKEDEX.render(); WN_MAP.renderZones(zones); renderNearby();
			WN_PROGRESS.refresh({ celebrate: false });
			WN_UI.toast("Progress cleared");
		});

		document.addEventListener("wn:collection", () => {
			WN_UI.renderStats();
			WN_MAP.renderZones(zones);
			renderNearby();
			WN_PROGRESS.schedule();
		});
		window.addEventListener("hashchange", handleHash);
	}

	/* ---- first-run intro ------------------------------------------------------------- */

	function showOnboarding() {
		const ob = $("#onboarding"), track = $("#ob-track"), dots = $$("#ob-dots i"), next = $("#ob-next"), later = $("#ob-later");
		let index = 0;
		const update = () => {
			dots.forEach((d, i) => d.classList.toggle("is-active", i === index));
			const last = index === dots.length - 1;
			next.innerHTML = last ? I("target") + "Turn on location" : "Next";
			later.hidden = !last;
		};
		ob.hidden = false;
		track.scrollLeft = 0;
		track.onscroll = () => {
			const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
			if (i !== index) { index = i; update(); }
		};
		next.onclick = () => {
			if (index < dots.length - 1) track.scrollTo({ left: (index + 1) * track.clientWidth, behavior: WN_UI.reducedMotion() ? "auto" : "smooth" });
			else finishOnboarding(true);
		};
		later.onclick = () => finishOnboarding(false);
		$("#ob-skip").onclick = () => finishOnboarding(false);
		update();
		next.focus({ preventScroll: true });
	}

	function finishOnboarding(locate) {
		WN_STORE.setProfile("onboarded", true);
		$("#onboarding").hidden = true;
		if (locate) WN_WALK.locate();
		if (pendingHash) { const h = pendingHash; pendingHash = null; processHash(h); }
	}

	/* ---- links: #demo and #friend=CODE ----------------------------------------------- */

	function handleHash() {
		const h = location.hash;
		if (!h) return;
		if (!$("#onboarding").hidden && /^#friend=/.test(h)) { pendingHash = h; clearHash(); return; }
		processHash(h);
	}
	function processHash(h) {
		if (h === "#demo") { WN_UI.showSettings(true); return; }
		const m = h.match(/^#friend=([A-Za-z0-9_-]+)/);
		if (m) {
			clearHash();
			WN_UI.showTab("badges");
			WN_BADGES.addFromText(m[1]);
		}
	}
	function clearHash() {
		try { history.replaceState(null, "", location.pathname + location.search); } catch (err) { location.hash = ""; }
	}

	/** A GPS fix landed well outside the search area: search around the walker if they are in Brisbane. */
	function onFarAway(info) {
		const place = shortName(currentLocation());
		if (U.haversine(info.lat, info.lng, BRISBANE.lat, BRISBANE.lng) > 150000) {
			WN_UI.toast("You are " + U.formatDistance(info.distanceM) + " from " + place + ". Wild Neighbours covers Brisbane, so the map stays here. Demo tools are in settings.", 5000);
			return false;
		}
		WN_UI.toast("Searching around you instead", 2500);
		setCustomCentre(info.lat, info.lng, true);
		return true;
	}

	/* ---- boot --------------------------------------------------------------------- */

	function registerServiceWorker() {
		if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
		navigator.serviceWorker.register("sw.js").catch(() => { /* offline support is optional */ });
	}

	async function init() {
		registerServiceWorker();
		WN_MAP.init(currentLocation());
		bindControls();
		try {
			await WN_DATA.load();
		} catch (err) {
			document.body.classList.remove("is-loading");
			WN_UI.notice("Could not load the cached data (" + err.message + "). Run scripts/fetch-data.mjs, or serve the folder with a local web server.", "error");
			$("#explore-summary").textContent = "No data loaded.";
			return;
		}
		WN_POKEDEX.init(() => new Set(zones.flatMap(z => z.species.map(s => s.key))));
		WN_BADGES.init();
		WN_UI.renderStats();
		if (S.source === "live") await goLive();
		else { setSourceButtons("cached"); rebuild(true, true); }
		WN_PROGRESS.refresh({ celebrate: false });     // award badges for earlier progress quietly
		WN_WALK.init({ onFarAway });
		WN_UI.showTab("map");
		requestAnimationFrame(() => document.body.classList.remove("is-loading"));
		if (!WN_STORE.profile().onboarded) showOnboarding();
		handleHash();
	}

	document.addEventListener("DOMContentLoaded", init);
})();
