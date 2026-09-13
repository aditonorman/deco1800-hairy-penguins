/* ==========================================================================
   Wild Neighbours - app bootstrap
   --------------------------------------------------------------------------
   Wires the modules together: loads data, builds zones for the chosen
   location/radius/recency window, and handles the top-level controls
   (location, radius, window, data source, tabs, start/end walk).
   ========================================================================== */

(function () {
	"use strict";

	const U = WN_UTIL, $ = WN_UI.$;
	const S = WN_STORE.settings();
	let zones = [];
	let liveTimer = null;

	/* ---- helpers ------------------------------------------------------------ */

	function currentLocation() {
		const preset = WN_CONFIG.LOCATIONS.find(l => l.id === S.location) || WN_CONFIG.LOCATIONS[0];
		if (preset.id === "custom") {
			if (S.customLat == null) return Object.assign({}, WN_CONFIG.LOCATIONS[0]);
			return Object.assign({}, preset, { lat: S.customLat, lng: S.customLng });
		}
		return preset;
	}

	function windowLabel() {
		return S.window ? "the last " + (S.window === 12 ? "12 months" : S.window === 24 ? "2 years" : S.window + " months") : "all cached records";
	}

	/** Rebuild zones from the current records + settings and redraw everything. */
	function rebuild(fit) {
		const loc = currentLocation();
		const sensitive = new Set(WN_DATA.allSpecies().filter(s => s.sensitive).map(s => s.key));
		const filtered = WN_ZONES.filterRecords(WN_DATA.records(), {
			lat: loc.lat, lng: loc.lng, radiusM: S.radius,
			sinceIso: U.monthsAgoIso(S.window), excludeKeys: sensitive
		});
		zones = WN_ZONES.buildZones(filtered, { speciesIndex: WN_DATA.state.speciesIndex });

		WN_MAP.setCentre(loc.lat, loc.lng, S.radius, fit);
		WN_MAP.renderZones(zones);
		WN_WALK.setZones(zones, loc.place || loc.name);
		WN_POKEDEX.render();

		const speciesCount = new Set(zones.flatMap(z => z.species.map(s => s.key))).size;
		let text = "<strong>" + zones.length + " habitat zones</strong> with <strong>" + speciesCount + " species</strong> from " +
			filtered.length + " records in " + windowLabel() + ", within " + U.formatDistance(S.radius) + " of " + U.esc(loc.name) + ".";
		if (!zones.length) text += " Try a wider radius or a longer time window.";
		else if (zones.length < 4) text += " Few zones here. A wider radius or longer window will show more.";
		$("#explore-summary").innerHTML = text;
	}

	/* ---- data source ------------------------------------------------------------ */

	function setSourceButtons(src) {
		WN_UI.$$("[data-source]").forEach(b => b.classList.toggle("is-active", b.dataset.source === src));
	}

	function cachedNotice() {
		const m = WN_DATA.meta();
		WN_UI.notice("Cached data from " + U.formatDate(m.fetchedAt.slice(0, 10)) + " (" + m.counts.sightings + " records, WildNet + ALA). Switch to Live for fresh ALA records.");
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
				", fetched " + new Date(live.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
				". WildNet records come from the cache (its API blocks browser requests).");
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
		cachedNotice();
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

	/* ---- controls ------------------------------------------------------------------ */

	function bindControls() {
		const locSel = $("#location-select");
		locSel.innerHTML = WN_CONFIG.LOCATIONS.map(l => '<option value="' + l.id + '">' + U.esc(l.name) + "</option>").join("");
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

		WN_UI.$$("[data-source]").forEach(b => b.addEventListener("click", () => b.dataset.source === "live" ? goLive() : goCached()));

		$("#btn-use-location").addEventListener("click", () => {
			if (!("geolocation" in navigator)) { WN_UI.toast("Geolocation is not available in this browser"); return; }
			WN_UI.toast("Finding you…");
			navigator.geolocation.getCurrentPosition(p => {
				S.location = "custom"; S.customLat = p.coords.latitude; S.customLng = p.coords.longitude;
				WN_STORE.setSetting("location", "custom"); WN_STORE.setSetting("customLat", S.customLat); WN_STORE.setSetting("customLng", S.customLng);
				locSel.value = "custom";
				settingsChanged(true);
				if (WN_DATA.source() === "cached") {
					const c = WN_DATA.meta().centre;
					if (U.haversine(S.customLat, S.customLng, c.lat, c.lng) > WN_DATA.meta().radiusM) WN_UI.notice("You are outside the cached pilot area (Mt Coot-tha). Switch to Live to see records near you.");
				}
			}, err => WN_UI.toast("Could not get your location: " + err.message), { enableHighAccuracy: true, timeout: 15000 });
		});

		// Map taps: choose a custom centre (explore) or teleport (simulated walk)
		WN_MAP.on("mapTap", (lat, lng) => {
			if (WN_UI.tab() === "walk") { WN_WALK.teleport(lat, lng); return; }
			if (S.location !== "custom") return;
			S.customLat = lat; S.customLng = lng;
			WN_STORE.setSetting("customLat", lat); WN_STORE.setSetting("customLng", lng);
			settingsChanged(true);
		});
		WN_MAP.on("zoneTap", (zone) => {
			const walking = WN_WALK.isActive() && WN_UI.tab() === "walk";
			WN_UI.showZone(zone, walking ? { canReport: true, onReport: WN_WALK.report } : null);
		});

		// tabs
		WN_UI.$$(".tabbar button").forEach(b => b.addEventListener("click", () => WN_UI.showTab(b.dataset.tab)));
		WN_UI.onTab(tab => {
			$("#explore-panel").hidden = (tab !== "map");
			$("#walk-hud").hidden = !(tab === "walk" && WN_WALK.isActive());
			if (tab === "walk" && !WN_WALK.isActive()) WN_WALK.start(currentLocation());
			if (tab !== "pokedex") WN_MAP.invalidate();
			if (tab !== "walk") WN_UI.hideZone();
		});
		$("#btn-start-walk").addEventListener("click", () => WN_UI.showTab("walk"));

		// On phones the options panel can fold away so the map gets the space.
		const panel = $("#explore-panel"), toggle = $("#panel-toggle");
		toggle.addEventListener("click", () => {
			const collapsed = panel.classList.toggle("is-collapsed");
			toggle.textContent = collapsed ? "Show options" : "Hide options";
			toggle.setAttribute("aria-expanded", String(!collapsed));
			WN_MAP.invalidate();
		});
		$("#btn-end-walk").addEventListener("click", () => { WN_WALK.stop(); WN_UI.showTab("map"); WN_UI.toast("Walk saved. " + U.formatDistance(WN_STORE.stats().distanceM) + " walked in total."); });

		$("#btn-reset").addEventListener("click", async () => {
			if (!confirm("Clear your Pokedex, photos and walk stats on this device?")) return;
			await WN_STORE.resetAll();
			WN_UI.renderStats(); WN_POKEDEX.render(); WN_MAP.renderZones(zones);
			WN_UI.toast("Progress cleared");
		});

		document.addEventListener("wn:collection", () => { WN_UI.renderStats(); WN_MAP.renderZones(zones); });
	}

	/* ---- boot --------------------------------------------------------------------- */

	async function init() {
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
		else { setSourceButtons("cached"); cachedNotice(); rebuild(true); }
		WN_UI.showTab("map");
	}

	document.addEventListener("DOMContentLoaded", init);
})();
