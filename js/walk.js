/* ==========================================================================
   Wild Neighbours - walking mode
   --------------------------------------------------------------------------
   Tracks the walker's position (real GPS or simulated with the D-pad / map
   taps), follows them on the map, and fires the zone-entry flow:
     safety banner -> unlock every species in the zone at "zone visit" tier
     -> zone summary with "I spotted it" / "Saw signs" buttons.
   Distance walked and zones visited are saved to localStorage.
   ========================================================================== */

const WN_WALK = (function () {
	"use strict";

	const U = WN_UTIL, $ = WN_UI.$;
	const state = {
		active: false,
		source: "sim",          // "sim" or "gps"
		pos: null,              // { lat, lng }
		accuracy: null,
		watchId: null,
		follow: true,
		currentZoneId: null,
		zones: [],
		place: ""
	};

	const hud = $("#walk-hud");

	/** The app hands over the current zones whenever they are rebuilt. */
	function setZones(zones, place) {
		state.zones = zones;
		state.place = place;
		if (state.active && state.pos) checkZone(true);
	}

	function start(centre) {
		if (state.active) return;
		state.active = true;
		state.currentZoneId = null;
		WN_STORE.startWalk();
		state.source = WN_STORE.settings().positionSource || "sim";
		WN_UI.$$("[data-pos]").forEach(b => b.classList.toggle("is-active", b.dataset.pos === state.source));
		hud.hidden = false;
		WN_UI.setEntryActions({ canReport: true, onReport: report, zone: null });
		if (state.source === "gps") startGps();
		else {
			const p = state.pos || centre;
			updatePosition(p.lat, p.lng, null, "sim", false);
			WN_MAP.zoomTo(p.lat, p.lng, 16);
			setStatus("Simulated position. Tap the map to jump, use the arrows to walk 25 m at a time.");
		}
	}

	function stop() {
		if (!state.active) return;
		state.active = false;
		stopGps();
		hud.hidden = true;
		WN_MAP.clearYou();
		WN_UI.hideZone();
		WN_UI.setEntryActions(null);
		state.currentZoneId = null;
		setZoneText(null);
	}

	function isActive() { return state.active; }

	/* ---- position sources ----------------------------------------------------- */

	function setSource(src) {
		state.source = src;
		WN_STORE.setSetting("positionSource", src);
		WN_UI.$$("[data-pos]").forEach(b => b.classList.toggle("is-active", b.dataset.pos === src));
		if (!state.active) return;
		if (src === "gps") startGps();
		else { stopGps(); setStatus("Simulated position. Tap the map to jump, use the arrows to walk."); }
	}

	function startGps() {
		if (!("geolocation" in navigator)) {
			WN_UI.toast("This browser has no geolocation. Using simulation instead.");
			setSource("sim");
			return;
		}
		setStatus("Waiting for a GPS fix…");
		stopGps();
		state.watchId = navigator.geolocation.watchPosition(
			(p) => {
				const c = p.coords;
				updatePosition(c.latitude, c.longitude, c.accuracy, "gps", true);
				setStatus("GPS position, accurate to about " + Math.round(c.accuracy) + " m" +
					(c.accuracy > WN_CONFIG.GPS_MIN_ACCURACY_M ? " (too rough to trigger zones yet)" : ""));
			},
			(err) => {
				setStatus("GPS unavailable: " + err.message + ". Switch to Simulate to keep going.");
			},
			{ enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
		);
	}
	function stopGps() {
		if (state.watchId != null) { navigator.geolocation.clearWatch(state.watchId); state.watchId = null; }
	}

	/**
	 * Central position update.
	 * @param countDistance  add the move to "distance walked" (steps and GPS yes, teleports no)
	 */
	function updatePosition(lat, lng, accuracy, from, countDistance) {
		if (state.pos && countDistance) {
			const d = U.haversine(state.pos.lat, state.pos.lng, lat, lng);
			if (from !== "gps" || d <= WN_CONFIG.GPS_MAX_JUMP_M) WN_STORE.addDistance(d);
			WN_UI.renderStats();
		}
		state.pos = { lat, lng };
		state.accuracy = accuracy;
		WN_MAP.setYou(lat, lng, from === "gps" ? accuracy : 0);
		if (state.follow) WN_MAP.panTo(lat, lng);
		const roughGps = from === "gps" && accuracy > WN_CONFIG.GPS_MIN_ACCURACY_M;
		if (!roughGps) checkZone(false);
	}

	/** Simulated step in a compass direction. */
	function step(dir) {
		if (!state.active || !state.pos) return;
		const m = WN_CONFIG.SIM_STEP_M;
		const north = dir === "n" ? m : dir === "s" ? -m : 0;
		const east = dir === "e" ? m : dir === "w" ? -m : 0;
		const p = U.offset(state.pos.lat, state.pos.lng, north, east);
		updatePosition(p.lat, p.lng, null, "sim", true);
	}

	/** Map tap while simulating = teleport (does not count as walking). */
	function teleport(lat, lng) {
		if (!state.active || state.source !== "sim") return;
		updatePosition(lat, lng, null, "sim", false);
	}

	/* ---- zone entry --------------------------------------------------------------- */

	function checkZone(silent) {
		const zone = WN_ZONES.zoneAt(state.zones, state.pos.lat, state.pos.lng);
		if (!zone) {
			// walked out of the zone: close its sheet so the D-pad and map are clear
			if (state.currentZoneId) { state.currentZoneId = null; setZoneText(null); WN_UI.hideZone(); WN_UI.setEntryActions({ canReport: true, onReport: report, zone: null }); }
			return;
		}
		if (zone.id === state.currentZoneId) return;
		state.currentZoneId = zone.id;
		setZoneText(zone);
		if (!silent) enterZone(zone);
	}

	async function enterZone(zone) {
		WN_MAP.pulseZone(zone.id);
		const firstVisit = WN_STORE.visitZone(zone.id);
		WN_UI.renderStats();
		await WN_UI.safetyBanner(zone.name);
		if (!state.active || state.currentZoneId !== zone.id) return;

		// Zone visit unlocks every species recorded in this zone (tier 1).
		const unlocked = [];
		zone.species.forEach(s => {
			const r = WN_STORE.unlock(s.key, 1, { zoneName: zone.name, place: state.place });
			if (r.changed) unlocked.push({ key: s.key, tier: 1 });
		});
		WN_UI.setEntryActions({ canReport: true, onReport: report, zone });
		WN_UI.showZone(zone, { canReport: true, onReport: report });
		if (unlocked.length) {
			WN_UI.renderStats();
			document.dispatchEvent(new CustomEvent("wn:collection"));
			WN_UI.celebrate(unlocked, (firstVisit ? "Zone visited: " : "Back in ") + zone.name);
		} else if (firstVisit) {
			WN_UI.toast("Zone visited. Everything here was already in your Pokedex.");
		}
	}

	/** Self-reported sighting (tier 3) or signs (tier 2). */
	async function report(key, tier, zone) {
		const z = zone || state.zones.find(x => x.id === state.currentZoneId) || null;
		const r = WN_STORE.unlock(key, tier, { zoneName: z ? z.name : null, place: state.place });
		if (!r.changed) { WN_UI.toast("Already logged at this level or higher."); return; }
		WN_UI.renderStats();
		WN_UI.refreshZoneSheet();
		document.dispatchEvent(new CustomEvent("wn:collection"));
		const photo = r.entry.hasPhoto ? await WN_PHOTOS.get(key) : null;
		WN_UI.hideEntry();
		WN_UI.celebrate([{ key, tier, photo }], tier === 3 ? "Sighting logged" : "Signs logged");
	}

	/* ---- HUD -------------------------------------------------------------------------- */

	function setStatus(text) { $("#hud-status").textContent = text; }
	function setZoneText(zone) {
		const el = $("#hud-zone");
		if (zone) { el.textContent = "In " + zone.name + " · " + zone.speciesCount + " species"; el.classList.remove("is-out"); }
		else { el.textContent = "Not in a habitat zone yet"; el.classList.add("is-out"); }
	}

	$("#dpad").addEventListener("click", (e) => {
		const b = e.target.closest("[data-dir]");
		if (b) step(b.dataset.dir);
	});
	document.addEventListener("keydown", (e) => {
		if (!state.active || state.source !== "sim" || WN_UI.tab() !== "walk") return;
		if (e.target.matches("input, select, textarea")) return;
		const map = { ArrowUp: "n", ArrowDown: "s", ArrowLeft: "w", ArrowRight: "e" };
		if (map[e.key]) { e.preventDefault(); step(map[e.key]); }
	});
	WN_UI.$$("[data-pos]").forEach(b => b.addEventListener("click", () => setSource(b.dataset.pos)));
	$("#btn-follow").addEventListener("click", (e) => {
		state.follow = !state.follow;
		e.currentTarget.classList.toggle("is-active", state.follow);
		e.currentTarget.setAttribute("aria-pressed", String(state.follow));
		if (state.follow && state.pos) WN_MAP.panTo(state.pos.lat, state.pos.lng);
	});

	return { start, stop, isActive, setZones, setSource, teleport, step, report };
})();
