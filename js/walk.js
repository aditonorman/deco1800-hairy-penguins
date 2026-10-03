/* ==========================================================================
   Wild Neighbours - walking (always on)
   --------------------------------------------------------------------------
   Tracks where the walker is and fires the zone-entry flow:
     safety banner -> unlock every species in the zone at "zone visit" tier
     -> zone summary with "I spotted it" / "Saw signs" buttons.

   Position comes from the phone's GPS (started when the user taps the
   find-me button, or automatically if permission was granted before) or,
   in demo mode, from a simulated position moved by tapping the map or using
   the arrow pad. Distance walked and zones visited are saved on the device.
   ========================================================================== */

const WN_WALK = (function () {
	"use strict";

	const U = WN_UTIL, $ = WN_UI.$;
	const state = {
		source: "gps",          // "gps" or "sim"
		pos: null,              // { lat, lng }
		accuracy: null,
		watchId: null,
		follow: true,
		currentZoneId: null,
		zones: [],
		centre: null,           // search centre { lat, lng, place }
		gpsStatus: "idle",      // idle | waiting | ok | denied | error
		onFarAway: null         // callback(pos) when a GPS fix is far from the search area
	};

	const hud = $("#hud-zone");

	/* ---- wiring --------------------------------------------------------- */

	function init(opts) {
		state.onFarAway = opts && opts.onFarAway;
		$("#dpad").addEventListener("click", (e) => {
			const b = e.target.closest("[data-dir]");
			if (b) step(b.dataset.dir);
		});
		document.addEventListener("keydown", (e) => {
			if (state.source !== "sim" || WN_UI.tab() !== "map") return;
			if (e.target.matches("input, select, textarea")) return;
			const map = { ArrowUp: "n", ArrowDown: "s", ArrowLeft: "w", ArrowRight: "e" };
			if (map[e.key]) { e.preventDefault(); step(map[e.key]); }
		});
		$("#btn-locate").addEventListener("click", locate);
		$("#btn-follow").addEventListener("click", (e) => {
			state.follow = !state.follow;
			e.currentTarget.classList.toggle("is-active", state.follow);
			e.currentTarget.setAttribute("aria-pressed", String(state.follow));
			if (state.follow && state.pos) WN_MAP.panTo(state.pos.lat, state.pos.lng);
		});
		$("#btn-follow").classList.add("is-active");

		if (WN_STORE.settings().simulate) setSimulate(true, true);
		else autoStartGps();
	}

	/** The app hands over the current zones and centre whenever they are rebuilt. */
	function setZones(zones, centre) {
		state.zones = zones;
		state.centre = centre;
		if (state.source === "sim" && !state.pos) placeAtCentre();
		if (state.pos) checkZone(true);
	}

	/* ---- demo mode (simulated position) ---------------------------------- */

	function setSimulate(on, quiet) {
		state.source = on ? "sim" : "gps";
		WN_STORE.setSetting("simulate", on);
		$("#dpad").hidden = !on;
		document.body.classList.toggle("is-sim", on);
		if (on) {
			stopGps();
			if (!state.pos && state.centre) placeAtCentre();
			if (!quiet) WN_UI.toast("Demo mode: tap the map to jump, use the arrows to walk.", 3000);
		} else {
			state.pos = null;
			WN_MAP.clearYou();
			state.currentZoneId = null;
			setHud("Tap the find-me button to start walking", "out");
			autoStartGps();
		}
	}
	function isSimulating() { return state.source === "sim"; }

	function placeAtCentre() {
		const c = state.centre;
		if (!c) return;
		// Initial placement is silent: if the centre happens to sit inside a zone,
		// the walker has to move or tap it rather than being greeted with a banner on load.
		state.pos = { lat: c.lat, lng: c.lng };
		WN_MAP.setYou(c.lat, c.lng, 0);
		const zone = WN_ZONES.zoneAt(state.zones, c.lat, c.lng);
		state.currentZoneId = zone ? zone.id : null;
		if (zone) setHud("Demo: in " + zone.name + " \u00b7 " + zone.speciesCount + " species", "in");
		else setHud("Demo: you are at " + (c.place || "the search centre"), "out");
	}

	/** Map tap while simulating = teleport (does not count as walking). */
	function teleport(lat, lng) {
		if (state.source !== "sim") return false;
		updatePosition(lat, lng, null, "sim", false);
		return true;
	}

	/** Simulated step in a compass direction. */
	function step(dir) {
		if (state.source !== "sim") return;
		if (!state.pos) { placeAtCentre(); return; }
		const m = WN_CONFIG.SIM_STEP_M;
		const north = dir === "n" ? m : dir === "s" ? -m : 0;
		const east = dir === "e" ? m : dir === "w" ? -m : 0;
		const p = U.offset(state.pos.lat, state.pos.lng, north, east);
		updatePosition(p.lat, p.lng, null, "sim", true);
	}

	/** Demo shortcut: move into the nearest zone that has not been visited yet. */
	function jumpToNearestZone() {
		if (!state.zones.length) { WN_UI.toast("No zones here yet. Pick a spot with records first."); return; }
		if (state.source !== "sim") { setSimulate(true, true); $("#sim-toggle").checked = true; }
		const from = state.pos || state.centre;
		const visited = new Set(WN_STORE.stats().zonesVisited);
		const candidates = state.zones.filter(z => !visited.has(z.id) && z.id !== state.currentZoneId);
		const pool = candidates.length ? candidates : state.zones.filter(z => z.id !== state.currentZoneId);
		if (!pool.length) { WN_UI.toast("You have visited every zone here."); return; }
		let best = pool[0], bestD = Infinity;
		pool.forEach(z => { const d = U.haversine(from.lat, from.lng, z.lat, z.lng); if (d < bestD) { bestD = d; best = z; } });
		state.follow = true;
		WN_MAP.zoomTo(best.lat, best.lng, 16);
		updatePosition(best.lat, best.lng, null, "sim", false);
	}

	/* ---- real GPS ---------------------------------------------------------- */

	/** Start GPS silently if the browser already granted permission earlier. */
	function autoStartGps() {
		if (!("geolocation" in navigator)) { setHud("Location is not available in this browser", "out"); return; }
		if (!navigator.permissions || !navigator.permissions.query) { setHud("Tap the find-me button to start walking", "out"); return; }
		navigator.permissions.query({ name: "geolocation" }).then(p => {
			if (p.state === "granted") startGps();
			else setHud("Tap the find-me button to start walking", "out");
		}).catch(() => setHud("Tap the find-me button to start walking", "out"));
	}

	/** Find-me button: ask for the position, follow it, and recentre the search if far away. */
	function locate() {
		if (state.source === "sim") {
			// In demo mode the button recentres on the simulated walker.
			if (state.pos) WN_MAP.panTo(state.pos.lat, state.pos.lng);
			else placeAtCentre();
			return;
		}
		if (!("geolocation" in navigator)) { WN_UI.toast("This browser cannot share your location."); return; }
		state.follow = true;
		$("#btn-follow").classList.add("is-active");
		startGps(true);
	}

	function startGps(fromButton) {
		if (!("geolocation" in navigator)) return;
		stopGps();
		state.gpsStatus = "waiting";
		setHud("Finding you…", "out");
		$("#btn-locate").classList.add("is-busy");
		let first = true;
		state.watchId = navigator.geolocation.watchPosition(
			(p) => {
				const c = p.coords;
				state.gpsStatus = "ok";
				$("#btn-locate").classList.remove("is-busy");
				const wasFollowing = state.follow;
				if (first) state.follow = false;      // decide below whether to pan
				updatePosition(c.latitude, c.longitude, c.accuracy, "gps", true);
				if (first) state.follow = wasFollowing;
				if (first && state.follow) WN_MAP.panTo(c.latitude, c.longitude);
				if (first) {
					first = false;
					const far = state.centre && U.haversine(c.latitude, c.longitude, state.centre.lat, state.centre.lng);
					if (far != null && far > Math.max(5000, 3 * (WN_STORE.settings().radius || 1500))) {
						const recentred = state.onFarAway && state.onFarAway({ lat: c.latitude, lng: c.longitude, distanceM: far, fromButton: Boolean(fromButton) });
						if (!recentred) {
							// stay on the chosen area instead of panning off to the walker
							state.follow = false;
							$("#btn-follow").classList.remove("is-active");
							$("#btn-follow").setAttribute("aria-pressed", "false");
							setHud("You are " + U.formatDistance(far) + " from " + (state.centre.place || "the search area"), "out");
							WN_MAP.panTo(state.centre.lat, state.centre.lng);
						}
					}
				}
			},
			(err) => {
				$("#btn-locate").classList.remove("is-busy");
				state.gpsStatus = err.code === 1 ? "denied" : "error";
				setHud(err.code === 1 ? "Location access was denied" : "Could not get a location fix", "out");
				if (fromButton) WN_UI.toast(err.code === 1
					? "Location is blocked for this site. Allow it in your browser, or use demo tools in settings."
					: "No GPS fix yet. Try again outdoors, or use demo tools in settings.", 4000);
			},
			{ enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
		);
	}
	function stopGps() {
		if (state.watchId != null) { navigator.geolocation.clearWatch(state.watchId); state.watchId = null; }
	}

	/* ---- position + zones --------------------------------------------------- */

	/**
	 * Central position update.
	 * @param countDistance  add the move to "distance walked" (steps and GPS yes, teleports no)
	 */
	function updatePosition(lat, lng, accuracy, from, countDistance) {
		if (state.pos && countDistance) {
			const d = U.haversine(state.pos.lat, state.pos.lng, lat, lng);
			if (from !== "gps" || d <= WN_CONFIG.GPS_MAX_JUMP_M) {
				WN_STORE.addDistance(d);
				WN_PROGRESS.schedule();
			}
			WN_UI.renderStats();
		}
		state.pos = { lat, lng };
		state.accuracy = accuracy;
		WN_MAP.setYou(lat, lng, from === "gps" ? accuracy : 0);
		if (state.follow) WN_MAP.panTo(lat, lng);
		const roughGps = from === "gps" && accuracy > WN_CONFIG.GPS_MIN_ACCURACY_M;
		if (roughGps) setHud("GPS is rough here (about " + Math.round(accuracy) + " m). Keep walking.", "out");
		else checkZone(false);
	}

	function checkZone(silent) {
		if (!state.pos) return;
		const zone = WN_ZONES.zoneAt(state.zones, state.pos.lat, state.pos.lng);
		if (!zone) {
			if (state.currentZoneId) {
				state.currentZoneId = null;
				WN_UI.hideZone();
				WN_UI.setEntryActions(null);
			}
			setHud(nearestZoneText(), "out");
			return;
		}
		if (zone.id === state.currentZoneId) return;
		state.currentZoneId = zone.id;
		setHud("In " + zone.name + " · " + zone.speciesCount + " species", "in");
		if (!silent) enterZone(zone);
	}

	function nearestZoneText() {
		if (!state.zones.length) return "No habitat zones here yet";
		let best = null, bestD = Infinity;
		state.zones.forEach(z => { const d = U.haversine(state.pos.lat, state.pos.lng, z.lat, z.lng) - z.radius; if (d < bestD) { bestD = d; best = z; } });
		if (!best) return "Not in a habitat zone";
		if (bestD > 20000) return "You are " + U.formatDistance(bestD) + " from the nearest zone";
		return best.name + " is " + U.formatDistance(Math.max(0, bestD)) + " away";
	}

	async function enterZone(zone) {
		WN_MAP.pulseZone(zone.id);
		const firstVisit = WN_STORE.visitZone(zone, state.centre ? state.centre.place : null);
		WN_UI.renderStats();
		await WN_UI.safetyBanner(zone.name);
		if (state.currentZoneId !== zone.id) return;

		// Zone visit unlocks every species recorded in this zone (tier 1).
		const unlocked = [];
		zone.species.forEach(s => {
			const r = WN_STORE.unlock(s.key, 1, { zoneName: zone.name, place: state.centre ? state.centre.place : null });
			if (r.changed) unlocked.push({ key: s.key, tier: 1 });
		});
		WN_UI.setEntryActions({ canReport: true, onReport: report, zone });
		WN_UI.showZone(zone, { canReport: true, onReport: report });
		if (unlocked.length) {
			WN_UI.renderStats();
			// species celebration first; badge celebrations queue up behind it
			WN_UI.celebrate(unlocked, (firstVisit ? "Zone visited: " : "Back in ") + zone.name);
		} else if (firstVisit) {
			WN_UI.toast("Zone visited. Everything here was already in your Pokedex.");
		}
		document.dispatchEvent(new CustomEvent("wn:collection"));
	}

	/** Self-reported sighting (tier 3) or signs (tier 2). */
	async function report(key, tier, zone) {
		const z = zone || state.zones.find(x => x.id === state.currentZoneId) || null;
		const r = WN_STORE.unlock(key, tier, { zoneName: z ? z.name : null, place: state.centre ? state.centre.place : null });
		if (!r.changed) { WN_UI.toast("Already logged at this level or higher."); return; }
		WN_UI.renderStats();
		WN_UI.refreshZoneSheet();
		const photo = r.entry.hasPhoto ? await WN_PHOTOS.get(key) : null;
		WN_UI.hideEntry();
		WN_UI.celebrate([{ key, tier, photo }], tier === 3 ? "Sighting logged" : "Signs logged");
		document.dispatchEvent(new CustomEvent("wn:collection"));
	}

	function inZone(zoneId) { return state.currentZoneId === zoneId; }
	function currentZoneId() { return state.currentZoneId; }
	function position() { return state.pos; }

	/* ---- HUD pill ---------------------------------------------------------------- */

	function setHud(text, mode) {
		hud.textContent = text;
		hud.classList.toggle("is-in", mode === "in");
		hud.classList.toggle("is-out", mode !== "in");
	}

	return { init, setZones, setSimulate, isSimulating, teleport, step, jumpToNearestZone, locate, report, inZone, currentZoneId, position };
})();
