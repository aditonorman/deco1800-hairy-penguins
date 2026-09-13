/* ==========================================================================
   Wild Neighbours - Leaflet map
   --------------------------------------------------------------------------
   Draws the search circle and the habitat zones. Zones are circles sized by
   the spread of their records; nothing is ever drawn at a record's exact
   coordinates. Also draws the "you are here" marker for walking mode.
   ========================================================================== */

const WN_MAP = (function () {
	"use strict";

	let map, zoneLayer, centreMarker, radiusCircle, youMarker, accuracyCircle;
	let zoneShapes = new Map();   // zone id -> L.Circle
	let handlers = { zoneTap: null, mapTap: null };
	let tileErrorShown = false;

	const COLOURS = { zone: "#8fae4e", threat: "#e0764a", amber: "#e8a94b", cream: "#f6f2e4" };

	/* Basemap providers, tried in order. OpenStreetMap's own tile servers are
	   not used: their usage policy rejects pages opened from disk (no referrer)
	   and returns an "Access blocked" image instead of an error, so the app
	   could not even detect it. CARTO now watermarks tiles without an API key.
	   OpenTopoMap (trails and contours, ideal for hikers) and Esri allow light
	   non-commercial use with attribution and fail loudly, which lets us fall
	   through the list when a provider is down. */
	const TILE_PROVIDERS = [
		{
			name: "OpenTopoMap",
			url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
			options: { subdomains: "abc", maxZoom: 17, attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)' }
		},
		{
			name: "Esri World Topo",
			url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
			options: { maxZoom: 19, attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, USGS and others' }
		},
		{
			name: "Esri World Street",
			url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
			options: { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
		}
	];

	/** Add basemap provider i; if none of its tiles load, move on to the next. */
	function addTiles(i) {
		const p = TILE_PROVIDERS[i];
		let loads = 0, errors = 0;
		const layer = L.tileLayer(p.url, p.options);
		layer.on("tileload", () => { loads++; });
		// Once the first batch of tiles is in, nudge Leaflet to repaint the SVG
		// overlay. Some browsers otherwise leave the zones uncomposited until the
		// user touches the map.
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
		map = L.map("map", { zoomControl: true, tap: true }).setView([centre.lat, centre.lng], 14);
		addTiles(0);

		zoneLayer = L.layerGroup().addTo(map);
		map.on("click", (e) => { if (handlers.mapTap) handlers.mapTap(e.latlng.lat, e.latlng.lng); });
		map.on("zoomend", updateLabels);
		return map;
	}

	function on(name, fn) { handlers[name] = fn; }

	/** Draw the search centre and radius, and fit the view to it. */
	function setCentre(lat, lng, radiusM, fit) {
		if (!centreMarker) {
			centreMarker = L.circleMarker([lat, lng], { radius: 5, color: COLOURS.cream, fillColor: COLOURS.amber, fillOpacity: 1, weight: 2 }).addTo(map);
			radiusCircle = L.circle([lat, lng], { radius: radiusM, color: COLOURS.amber, weight: 2.5, dashArray: "8 8", fill: false, interactive: false }).addTo(map);
		} else {
			centreMarker.setLatLng([lat, lng]);
			radiusCircle.setLatLng([lat, lng]).setRadius(radiusM);
		}
		if (fit !== false) map.fitBounds(radiusCircle.getBounds(), { padding: [10, 10] });
	}

	/** Replace all zone shapes. */
	function renderZones(zones) {
		zoneLayer.clearLayers();
		zoneShapes = new Map();
		const visited = new Set(WN_STORE.stats().zonesVisited);
		zones.forEach(zone => {
			const colour = zone.threatened ? COLOURS.threat : COLOURS.zone;
			const shape = L.circle([zone.lat, zone.lng], {
				radius: zone.radius, color: colour, weight: visited.has(zone.id) ? 4 : 3, opacity: 0.95,
				fillColor: colour, fillOpacity: visited.has(zone.id) ? 0.5 : 0.38
			});
			shape.bindTooltip((visited.has(zone.id) ? "✓ " : "") + zone.name, { permanent: true, direction: "center", className: "zone-label", opacity: 1 });
			shape.on("click", (e) => { L.DomEvent.stopPropagation(e); if (handlers.zoneTap) handlers.zoneTap(zone); });
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

	function pulseZone(zoneId) {
		const shape = zoneShapes.get(zoneId);
		if (!shape) return;
		shape.setStyle({ weight: 4, fillOpacity: 0.45 });
		setTimeout(() => shape.setStyle({ weight: 3, fillOpacity: 0.38 }), 1200);
	}

	/** "You are here" marker with an accuracy ring (GPS) */
	function setYou(lat, lng, accuracyM) {
		if (!youMarker) {
			youMarker = L.marker([lat, lng], {
				icon: L.divIcon({ className: "", html: '<div class="you-marker"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
				zIndexOffset: 1000, keyboard: false
			}).addTo(map);
			accuracyCircle = L.circle([lat, lng], { radius: accuracyM || 0, color: COLOURS.amber, weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
		} else {
			youMarker.setLatLng([lat, lng]);
			accuracyCircle.setLatLng([lat, lng]).setRadius(accuracyM || 0);
		}
	}
	function clearYou() {
		if (youMarker) { map.removeLayer(youMarker); map.removeLayer(accuracyCircle); youMarker = accuracyCircle = null; }
	}
	function panTo(lat, lng) { map.panTo([lat, lng], { animate: true, duration: 0.4 }); }
	function zoomTo(lat, lng, zoom) { map.setView([lat, lng], zoom || 16); }
	function invalidate() { if (map) setTimeout(() => map.invalidateSize(), 50); }

	return { init, on, setCentre, renderZones, pulseZone, setYou, clearYou, panTo, zoomTo, invalidate };
})();
