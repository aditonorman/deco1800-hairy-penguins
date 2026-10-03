/* ==========================================================================
   Wild Neighbours - Leaflet map
   --------------------------------------------------------------------------
   Draws the search circle and the habitat zones. Zones are circles sized by
   the spread of their records; nothing is ever drawn at a record's exact
   coordinates. Zone colours: leaf green, coral ring when a threatened
   species is recorded there, wattle gold once you have visited.
   Also draws the "you are here" marker and a ripple when you enter a zone.
   ========================================================================== */

const WN_MAP = (function () {
	"use strict";

	const U = WN_UTIL;
	const P = WN_CONFIG.PALETTE;
	let map, zoneLayer, centreMarker, radiusCircle, youMarker, accuracyCircle;
	let zoneShapes = new Map();   // zone id -> L.Circle
	const handlers = { zoneTap: null, mapTap: null, moved: null };
	let tileErrorShown = false;

	/* Basemap providers, tried in order. OpenStreetMap's own tile servers are
	   not used: their usage policy rejects pages opened from disk (no referrer)
	   and returns an "Access blocked" image instead of an error. CARTO now
	   watermarks tiles without an API key. OpenTopoMap (trails and contours,
	   ideal for walkers) and Esri allow light non-commercial use with
	   attribution and fail loudly, so we can fall through the list. */
	const TILE_PROVIDERS = [
		{
			name: "OpenTopoMap",
			url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
			options: { subdomains: "abc", maxZoom: 17, attribution: 'Map &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM &middot; style <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)' }
		},
		{
			name: "Esri World Topo",
			url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
			options: { maxZoom: 19, attribution: "Tiles &copy; Esri and contributors" }
		},
		{
			name: "Esri World Street",
			url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
			options: { maxZoom: 19, attribution: "Tiles &copy; Esri and contributors" }
		}
	];

	/** Attribution lives in the explore card, where no overlay can cover it. */
	function setCredit(html) {
		const el = document.getElementById("map-credit");
		if (el) el.innerHTML = html;
	}

	/** Add basemap provider i; if none of its tiles load, move on to the next. */
	function addTiles(i) {
		const p = TILE_PROVIDERS[i];
		let loads = 0, errors = 0;
		const layer = L.tileLayer(p.url, p.options);
		setCredit(p.options.attribution);
		layer.on("tileload", () => { loads++; });
		// Once the first tiles are in, nudge Leaflet to repaint the SVG overlay.
		layer.once("load", () => { map.invalidateSize({ pan: false }); });
		layer.on("tileerror", () => {
			errors++;
			if (loads > 0 || errors < 3) return;          // sporadic errors are fine
			if (i + 1 < TILE_PROVIDERS.length) {
				map.removeLayer(layer);
				addTiles(i + 1);
			} else if (!tileErrorShown) {
				tileErrorShown = true;
				WN_UI.toast("Map tiles need internet. Zones still work offline.", 3500);
			}
		});
		layer.addTo(map);
	}

	function init(centre) {
		map = L.map("map", { zoomControl: false, attributionControl: false, tap: true }).setView([centre.lat, centre.lng], 14);
		addTiles(0);
		zoneLayer = L.layerGroup().addTo(map);
		map.on("click", (e) => { if (handlers.mapTap) handlers.mapTap(e.latlng.lat, e.latlng.lng); });
		map.on("zoomend", updateLabels);
		map.on("moveend", () => { if (handlers.moved) { const c = map.getCenter(); handlers.moved(c.lat, c.lng); } });
		return map;
	}

	function on(name, fn) { handlers[name] = fn; }

	/** Draw the search centre and radius, and optionally fit the view to it. */
	function setCentre(lat, lng, radiusM, fit) {
		if (!centreMarker) {
			centreMarker = L.circleMarker([lat, lng], { radius: 5, color: P.cream, fillColor: P.amber, fillOpacity: 1, weight: 2, interactive: false }).addTo(map);
			radiusCircle = L.circle([lat, lng], { radius: radiusM, color: P.amber, weight: 2.5, opacity: 0.85, dashArray: "8 8", fill: false, interactive: false }).addTo(map);
		} else {
			centreMarker.setLatLng([lat, lng]);
			radiusCircle.setLatLng([lat, lng]).setRadius(radiusM);
		}
		if (fit !== false) fitCircle();
	}

	/** Fit the search circle, leaving room for the floating card and bars. */
	function fitCircle() {
		if (!radiusCircle) return;
		const phone = WN_UI.isPhone();
		map.fitBounds(radiusCircle.getBounds(), phone
			? { paddingTopLeft: [12, 70], paddingBottomRight: [12, 250] }
			: { paddingTopLeft: [420, 70], paddingBottomRight: [70, 110] });
	}

	/** Replace all zone shapes. `animate` pops them in (new area, not every refresh). */
	function renderZones(zones, animate) {
		zoneLayer.clearLayers();
		zoneShapes = new Map();
		const visited = new Set(WN_STORE.stats().zonesVisited);
		zones.forEach(zone => {
			const been = visited.has(zone.id);
			const fill = been ? P.wattle : P.leaf;
			const shape = L.circle([zone.lat, zone.lng], {
				radius: zone.radius,
				color: zone.threatened ? P.coral : fill,
				weight: zone.threatened ? 4 : 3,
				opacity: 0.95,
				fillColor: fill,
				fillOpacity: been ? 0.42 : 0.34,
				className: animate && !WN_UI.reducedMotion() ? "zone-anim" : ""
			});
			shape.bindTooltip((been ? WN_ICONS.svg("check", "icon-xs") : "") + U.esc(zone.name), { permanent: true, direction: "center", className: "zone-label", opacity: 1 });
			shape.on("click", (e) => { L.DomEvent.stopPropagation(e); if (handlers.zoneTap) handlers.zoneTap(zone, e.latlng); });
			shape.addTo(zoneLayer);
			zoneShapes.set(zone.id, shape);
		});
		updateLabels();
	}

	/** Labels only at close zoom so the map does not turn into a word cloud. */
	function updateLabels() {
		if (!map) return;
		const show = map.getZoom() >= 15;
		zoneShapes.forEach(shape => {
			const el = shape.getTooltip() && shape.getTooltip().getElement();
			if (el) el.style.display = show ? "" : "none";
		});
	}

	/** Brighten a zone and send a ripple out from its centre. */
	function pulseZone(zoneId) {
		const shape = zoneShapes.get(zoneId);
		if (!shape) return;
		shape.setStyle({ weight: 5, fillOpacity: 0.55 });
		setTimeout(() => shape.setStyle({ weight: 3, fillOpacity: 0.42 }), 1400);
		if (WN_UI.reducedMotion()) return;
		const c = shape.getLatLng();
		const ripple = L.marker(c, { icon: L.divIcon({ className: "", html: '<div class="zone-ripple"></div>', iconSize: [40, 40], iconAnchor: [20, 20] }), interactive: false, keyboard: false }).addTo(map);
		setTimeout(() => map.removeLayer(ripple), 1400);
	}

	/** "You are here" marker with an accuracy ring (GPS). */
	function setYou(lat, lng, accuracyM) {
		if (!youMarker) {
			youMarker = L.marker([lat, lng], {
				icon: L.divIcon({ className: "", html: '<div class="you-marker"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }),
				zIndexOffset: 1000, keyboard: false, interactive: false
			}).addTo(map);
			accuracyCircle = L.circle([lat, lng], { radius: accuracyM || 0, color: P.amber, weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
		} else {
			youMarker.setLatLng([lat, lng]);
			accuracyCircle.setLatLng([lat, lng]).setRadius(accuracyM || 0);
		}
	}
	function clearYou() {
		if (youMarker) { map.removeLayer(youMarker); map.removeLayer(accuracyCircle); youMarker = accuracyCircle = null; }
	}
	function panTo(lat, lng) { map.panTo([lat, lng], { animate: true, duration: 0.5 }); }
	function zoomTo(lat, lng, zoom) { map.setView([lat, lng], zoom || 16, { animate: true }); }
	function zoomIn() { map.zoomIn(); }
	function zoomOut() { map.zoomOut(); }
	function center() { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; }
	function invalidate() { if (map) setTimeout(() => map.invalidateSize(), 60); }

	return { init, on, setCentre, fitCircle, renderZones, pulseZone, setYou, clearYou, panTo, zoomTo, zoomIn, zoomOut, center, invalidate };
})();
