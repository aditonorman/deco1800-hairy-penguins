/* ==========================================================================
   Wild Neighbours - app bootstrap
   --------------------------------------------------------------------------
   Wires the modules together: loads data, builds zones for the chosen
   location / radius / recency window, and handles the top-level controls
   (location card, settings sheet, tabs, data source, demo tools).
   ========================================================================== */

(function () {
	"use strict";

	const U = WN_UTIL, $ = WN_UI.$;
	const S = WN_STORE.settings();
	const BRISBANE = { lat: -27.4698, lng: 153.0251 };
	let zones = [];
	let liveTimer = null;
	let autoLiveKey = null;   // centre we already tried to fetch live for

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

	/** Rebuild zones from the current records + settings and redraw everything. */
	function rebuild(fit) {
		const loc = currentLocation();

		// Outside the cached circles? Fetch live once, automatically, when online.
		const coverage = cacheCoverage(loc);
		const key = loc.lat.toFixed(3) + "," + loc.lng.toFixed(3) + "," + S.radius;
		if (coverage === "none" && S.source !== "live" && navigator.onLine !== false && autoLiveKey !== key) {
			autoLiveKey = key;
			WN_UI.toast("No cached records here, fetching live from ALA…", 2500);
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
		WN_MAP.renderZones(zones);
		WN_WALK.setZones(zones, { lat: loc.lat, lng: loc.lng, place: shortName(loc) });
		WN_POKEDEX.render();

		$("#explore-title").textContent = shortName(loc);
		const speciesCount = new Set(zones.flatMap(z => z.species.map(s => s.key))).size;
		let text = "<strong>" + zones.length + " habitat zones</strong>, <strong>" + speciesCount + " species</strong>, " +
			filtered.length + " records from " + windowLabel() + " within " + U.formatDistance(S.radius) + ".";
		const farFromBrisbane = U.haversine(loc.lat, loc.lng, BRISBANE.lat, BRISBANE.lng) > 150000;
		if (farFromBrisbane) text += " <strong>Wild Neighbours covers Brisbane.</strong> Pick a Brisbane spot to explore.";
		else if (!zones.length) text += " Try a wider radius or a longer time window.";
		else if (zones.length < 4) text += " Few zones here. A wider radius or longer window will show more.";
		if (S.source !== "live" && coverage === "partial") text += " Part of this circle is outside the cached data; Live covers all of it.";
		$("#explore-summary").innerHTML = text;
		updateDataHint();
	}

	/* ---- data source ------------------------------------------------------------ */

	function setSourceButtons(src) {
		WN_UI.$$("[data-source]").forEach(b => b.classList.toggle("is-active", b.dataset.source === src));
		const pill = $("#data-pill");
		pill.textContent = src === "live" ? "Live" : "Cached";
		pill.classList.toggle("is-live", src === "live");
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
	function settingsChanged(fit) {
		rebuild(fit);
		if (S.source === "live") {
			clearTimeout(liveTimer);
			liveTimer = setTimeout(goLive, 700);
		}
	}

	function setCustomCentre(lat, lng, fit) {
		S.location = "custom"; S.customLat = lat; S.customLng = lng;
		WN_STORE.setSetting("location", "custom"); WN_STORE.setSetting("customLat", lat); WN_STORE.setSetting("customLng", lng);
		$("#location-select").value = "custom";
		settingsChanged(fit);
	}

	/* ---- controls ------------------------------------------------------------------ */

	function bindControls() {
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
			if (S.location === "custom" && S.customLat == null) { WN_UI.toast("Tap anywhere on the map to set your spot"); return; }
			settingsChanged(true);
		});

		const range = $("#radius-range"), out = $("#radius-output");
		range.min = WN_CONFIG.RADIUS_MIN; range.max = WN_CONFIG.RADIUS_MAX; range.value = S.radius;
		out.textContent = U.formatDistance(S.radius);
		range.addEventListener("input", () => { S.radius = Number(range.value); out.textContent = U.formatDistance(S.radius); WN_STORE.setSetting("radius", S.radius); settingsChanged(true); });

		const win = $("#window-select");
		win.value = String(S.window);
		win.addEventListener("change", () => { S.window = Number(win.value); WN_STORE.setSetting("window", S.window); settingsChanged(false); });

		// collapsible controls on the floating card
		const panel = $("#explore-panel"), toggle = $("#panel-toggle"), controls = $("#explore-controls");
		toggle.addEventListener("click", () => {
			const open = controls.hidden;
			controls.hidden = !open;
			panel.classList.toggle("is-open", open);
			toggle.textContent = open ? "Done" : "Change";
			toggle.setAttribute("aria-expanded", String(open));
		});

		// Map taps: teleport when simulating, otherwise choose a custom centre
		WN_MAP.on("mapTap", (lat, lng) => {
			if (WN_WALK.teleport(lat, lng)) return;
			setCustomCentre(lat, lng, false);
			WN_UI.toast("Searching around the spot you tapped");
		});
		WN_MAP.on("zoneTap", (zone) => {
			const here = WN_WALK.inZone(zone.id);
			WN_UI.showZone(zone, { canReport: here, onReport: WN_WALK.report, hint: here ? null : "Walk into this zone to log a sighting or signs." });
		});

		// tabs
		WN_UI.$$(".tabbar button").forEach(b => b.addEventListener("click", () => WN_UI.showTab(b.dataset.tab)));
		WN_UI.onTab(tab => { if (tab === "map") WN_MAP.invalidate(); else WN_UI.hideZone(); });

		// settings sheet
		$("#btn-settings").addEventListener("click", () => WN_UI.showSettings());
		$("#data-pill").addEventListener("click", () => WN_UI.showSettings());
		$("#settings-close").addEventListener("click", WN_UI.hideSettings);
		WN_UI.$$("[data-source]").forEach(b => b.addEventListener("click", () => b.dataset.source === "live" ? goLive() : goCached()));

		// demo tools
		const sim = $("#sim-toggle");
		sim.checked = Boolean(S.simulate);
		sim.addEventListener("change", () => WN_WALK.setSimulate(sim.checked));
		$("#btn-jump").addEventListener("click", () => { WN_UI.hideSettings(); WN_UI.showTab("map"); WN_WALK.jumpToNearestZone(); });
		$("#btn-reset").addEventListener("click", async () => {
			if (!confirm("Clear your Pokedex, photos and walk stats on this device?")) return;
			await WN_STORE.resetAll();
			WN_UI.renderStats(); WN_POKEDEX.render(); WN_MAP.renderZones(zones);
			WN_UI.toast("Progress cleared");
		});

		document.addEventListener("wn:collection", () => { WN_UI.renderStats(); WN_MAP.renderZones(zones); });
		window.addEventListener("hashchange", handleHash);
	}

	/** #demo in the URL opens the settings sheet on the demo tools. */
	function handleHash() {
		if (location.hash === "#demo") WN_UI.showSettings(true);
	}

	/**
	 * A GPS fix landed well outside the search area. If the walker is somewhere
	 * the app covers (greater Brisbane), search around them instead and return
	 * true. If they are far away (another city, another country), keep the
	 * chosen spot, say so, and return false so the map stays put.
	 */
	function onFarAway(info) {
		const place = shortName(currentLocation());
		if (U.haversine(info.lat, info.lng, BRISBANE.lat, BRISBANE.lng) > 150000) {
			WN_UI.toast("You are " + U.formatDistance(info.distanceM) + " from " + place + ". Wild Neighbours covers Brisbane, so the map stays here. Open settings for demo tools.", 5000);
			return false;
		}
		WN_UI.toast("Searching around you instead", 2500);
		setCustomCentre(info.lat, info.lng, true);
		return true;
	}

	/* ---- boot --------------------------------------------------------------------- */

	async function init() {
		document.body.classList.add("has-card");
		WN_MAP.init(currentLocation());
		bindControls();
		try {
			await WN_DATA.load();
		} catch (err) {
			WN_UI.notice("Could not load the cached data (" + err.message + "). Run scripts/fetch-data.mjs, or serve the folder with a local web server.", "error");
			$("#explore-summary").textContent = "No data loaded.";
			return;
		}
		WN_POKEDEX.init(() => new Set(zones.flatMap(z => z.species.map(s => s.key))));
		WN_UI.renderStats();
		if (S.source === "live") await goLive();
		else { setSourceButtons("cached"); rebuild(true); }
		WN_WALK.init({ onFarAway });
		WN_UI.showTab("map");
		handleHash();
	}

	document.addEventListener("DOMContentLoaded", init);
})();
