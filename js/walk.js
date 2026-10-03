/* ==========================================================================
   Wild Neighbours - walking (always on)
   --------------------------------------------------------------------------
   Tracks where the walker is. Entering a zone quietly collects every
   species recorded there (at "zone visit" tier) and slides in a small alert
   card with a safety reminder. Nothing opens until the walker taps the card
   (or the status pill), which shows the zone with "I spotted it" and
   "Saw signs" buttons. Settings decide whether alerts show and for which
   animal groups; collecting happens either way.

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
	// The status pill doubles as the way back into the zone you are standing in.
	hud.addEventListener("click", () => {
		const zone = state.zones.find(z => z.id === state.currentZoneId);
		if (zone) openZone(zone);
	});

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
		WN_MAP.setActiveZone(state.currentZoneId);
		if (zone) setHud("In " + zone.name + " \u00b7 " + zone.speciesCount + " species", "in");
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
		// step in a little way from the side you came from, so your dot does not hide the zone's chip
		const back = U.haversine(best.lat, best.lng, from.lat, from.lng) > 1
			? { n: from.lat - best.lat, e: (from.lng - best.lng) * Math.cos(best.lat * Math.PI / 180) } : { n: -1, e: 0 };
		const len = Math.hypot(back.n, back.e) || 1;
		let target = U.offset(best.lat, best.lng, back.n / len * 55, back.e / len * 55);
		const landed = WN_ZONES.zoneAt(state.zones, target.lat, target.lng);
		if (!landed || landed.id !== best.id) target = { lat: best.lat, lng: best.lng };
		state.follow = true;
		WN_MAP.zoomTo(target.lat, target.lng, 16);
		updatePosition(target.lat, target.lng, null, "sim", false);
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
				WN_PROGRESS.schedule({ quiet: true });   // badges earned by walking come as alert cards
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
				const left = state.zones.find(z => z.id === state.currentZoneId);
				state.currentZoneId = null;
				WN_MAP.setActiveZone(null);
				WN_UI.setEntryActions(null);
				// an open sheet for the zone just left stays open, without the report buttons
				const open = WN_UI.currentZone();
				if (open && left && open.id === left.id) WN_UI.showZone(left, outsideActions());
			}
			setHud(nearestZoneText(), "out");
			return;
		}
		// still in the same zone: keep the pill in sync (it may say "Finding you" or "GPS is rough")
		setHud("In " + zone.name + " \u00b7 " + zone.speciesCount + " species", "in");
		if (zone.id === state.currentZoneId) return;
		state.currentZoneId = zone.id;
		WN_MAP.setActiveZone(zone.id);
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

	/**
	 * Walked into a zone: collect quietly, then maybe slide in an alert card.
	 * No pop-up and no sheet opens by itself; the walker taps the card or the
	 * status pill when they want to look.
	 */
	function enterZone(zone) {
		WN_MAP.pulseZone(zone.id);
		const place = state.centre ? state.centre.place : null;
		const firstVisit = WN_STORE.visitZone(zone, place);

		// Collecting: every species recorded here joins the Pokedex at zone-visit tier.
		const unlocked = [];
		zone.species.forEach(s => {
			const r = WN_STORE.unlock(s.key, 1, { zoneName: zone.name, place });
			if (r.changed) unlocked.push(s.key);
		});
		WN_UI.setEntryActions({ canReport: true, onReport: report, zone });
		WN_UI.renderStats();

		// A sheet already open for this zone switches to "inside" mode.
		const open = WN_UI.currentZone();
		if (open && open.id === zone.id) WN_UI.showZone(zone, insideActions(zone));

		const alert = alertFor(zone, unlocked, firstVisit);
		if (alert) WN_UI.notifyZone(zone, alert, () => openZone(zone, alert.newKeys));
		document.dispatchEvent(new CustomEvent("wn:collection", { detail: { quiet: true } }));
	}

	/**
	 * Should this zone raise an alert? Only if alerts are on and the zone has
	 * animals from the groups the walker chose, and only when there is
	 * something new to collect or it is the first visit.
	 * @returns null, or { newKeys, relevant, groups }
	 */
	function alertFor(zone, unlockedKeys, firstVisit) {
		const S = WN_STORE.settings();
		if (S.alertsOn === false) return null;
		const groups = new Set(S.alertGroups || WN_CONFIG.GROUP_ORDER);
		const groupOf = (key) => (WN_DATA.getSpecies(key) || {}).group;
		const relevant = zone.species.filter(s => groups.has(groupOf(s.key))).map(s => s.key);
		if (!relevant.length) return null;
		const newKeys = unlockedKeys.filter(k => groups.has(groupOf(k)));
		if (!newKeys.length && !firstVisit) return null;
		return { newKeys, relevant, groups: Array.from(groups) };
	}

	function insideActions(zone) { return { canReport: true, onReport: report, inside: true, zone }; }
	function outsideActions() { return { canReport: false, onReport: report, hint: "Walk into this zone to log a sighting or signs." }; }

	/** Show a zone's sheet: report buttons if you are in it, newest finds first. */
	function openZone(zone, newKeys) {
		WN_UI.showTab("map");
		const here = state.currentZoneId === zone.id;
		WN_UI.showZone(zone, Object.assign(here ? insideActions(zone) : outsideActions(), { newKeys: newKeys || [] }));
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
		hud.disabled = mode !== "in";
		hud.setAttribute("aria-label", mode === "in" ? text + ". Open zone" : text);
	}

	return { init, setZones, setSimulate, isSimulating, teleport, step, jumpToNearestZone, locate, report, openZone, insideActions, outsideActions, inZone, currentZoneId, position };
})();
