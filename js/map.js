/* ==========================================================================
   Wild Neighbours - Leaflet map
   --------------------------------------------------------------------------
   Draws the search circle and the habitat zones. Each zone is drawn as a
   cell: its circle, split from overlapping neighbours along the halfway line
   with a small gap (see WN_ZONES.zoneShapes), so zones never blur together.
   Neighbouring cells get different shades of green; visited zones turn gold;
   a coral edge marks zones with a threatened species. A chip on each zone
   shows how many species live there and dots for the animal types (names
   appear when zoomed in). Nothing is ever drawn at a record's exact point.
   Also draws the "you are here" marker and a ripple when you enter a zone.
   ========================================================================== */

const WN_MAP = (function () {
	"use strict";

	const U = WN_UTIL;
	const P = WN_CONFIG.PALETTE;
	let map, zoneLayer, chipLayer, radiusCircle, youMarker, accuracyCircle;
	let cells = new Map();        // zone id -> { poly, zone, centre, shade }
	let chips = [];               // { zone, marker }
	let activeId = null;          // the zone the walker is standing in
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
		chipLayer = L.layerGroup().addTo(map);
		map.on("click", (e) => { if (handlers.mapTap) handlers.mapTap(e.latlng.lat, e.latlng.lng); });
		map.on("zoomend", updateChips);
		map.on("moveend", () => { if (handlers.moved) { const c = map.getCenter(); handlers.moved(c.lat, c.lng); } });
		return map;
	}

	function on(name, fn) { handlers[name] = fn; }

	/**
	 * Draw the search area as a dashed circle and optionally fit the view to it.
	 * There is no dot in the middle: it looked like a second walker next to you.
	 */
	function setCentre(lat, lng, radiusM, fit) {
		if (!radiusCircle) {
			radiusCircle = L.circle([lat, lng], { radius: radiusM, color: P.amber, weight: 2.5, opacity: 0.85, dashArray: "8 8", fill: false, interactive: false }).addTo(map);
		} else {
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

	/* ---- zones ------------------------------------------------------------ */

	function isVisited(id) { return WN_STORE.stats().zonesVisited.includes(id); }

	/** Leaflet style for a zone cell. */
	function cellStyle(cell) {
		const shade = WN_CONFIG.ZONE_SHADES[cell.shade] || WN_CONFIG.ZONE_SHADES[0];
		const visited = isVisited(cell.zone.id), active = cell.zone.id === activeId;
		return {
			color: active ? P.amber : cell.zone.threatened ? P.coral : visited ? "#b48a12" : shade.line,
			weight: active ? 4 : cell.zone.threatened ? 2.5 : 2,
			opacity: cell.zone.threatened && !active ? 0.85 : 0.95,
			fillColor: visited ? P.wattle : shade.fill,
			fillOpacity: active ? 0.55 : visited ? 0.46 : 0.4,
			lineJoin: "round"
		};
	}

	/** The chip on a zone: species count, dots for the animal types, name below. */
	function chipHtml(zone) {
		const dots = WN_CONFIG.GROUP_ORDER.filter(g => zone.groups && zone.groups[g])
			.map(g => '<i style="background:' + WN_CONFIG.TYPE_COLORS[g] + '" title="' + WN_CONFIG.GROUP_PLURALS[g] + '"></i>').join("");
		const visited = isVisited(zone.id);
		return '<div class="zone-chip' + (visited ? " is-visited" : "") + (zone.threatened ? " is-threat" : "") + (zone.id === activeId ? " is-active" : "") + '">' +
			'<span class="zc-pill">' + (visited ? WN_ICONS.svg("check", "zc-check") : "") +
				"<b>" + zone.speciesCount + '</b><span class="zc-dots">' + dots + "</span></span>" +
			'<span class="zc-name">' + U.esc(zone.name) + "</span></div>";
	}

	/** Replace all zones. `animate` pops them in (a new area, not every refresh). */
	function renderZones(zones, animate) {
		zoneLayer.clearLayers();
		chipLayer.clearLayers();
		cells = new Map();
		chips = [];
		const shapes = WN_ZONES.zoneShapes(zones, { gutter: WN_CONFIG.ZONE_GUTTER_M });
		const shades = WN_ZONES.shadeZones(shapes, WN_CONFIG.ZONE_SHADES.length);
		const pop = animate && !WN_UI.reducedMotion();
		zones.forEach((zone, i) => {
			const shape = shapes[i];
			if (!shape.latlngs.length) return;
			const cell = { zone, centre: shape.centre, shade: shades[i] };
			cell.poly = L.polygon(shape.latlngs, Object.assign(cellStyle(cell), { className: pop ? "zone-anim" : "" }));
			cell.poly.on("click", (e) => { L.DomEvent.stopPropagation(e); if (handlers.zoneTap) handlers.zoneTap(zone, e.latlng); });
			cell.poly.addTo(zoneLayer);
			cells.set(zone.id, cell);

			const marker = L.marker([shape.centre.lat, shape.centre.lng], {
				icon: L.divIcon({ className: "zone-chip-anchor", html: chipHtml(zone), iconSize: [0, 0], iconAnchor: [0, 0] }),
				keyboard: false, zIndexOffset: zone.speciesCount
			});
			marker.on("click", (e) => {
				L.DomEvent.stopPropagation(e);
				if (handlers.zoneTap) handlers.zoneTap(zone, L.latLng(shape.centre.lat, shape.centre.lng));
			});
			marker.addTo(chipLayer);
			chips.push({ zone, marker });
		});
		if (activeId && cells.has(activeId)) cells.get(activeId).poly.bringToFront();
		requestAnimationFrame(updateChips);
	}

	/**
	 * Names show from zoom 15; chips hide below zoom 13. Chips that would
	 * overlap are hidden, keeping the zone you are in and the busiest zones.
	 */
	function updateChips() {
		if (!map) return;
		const zoom = map.getZoom(), el = map.getContainer();
		if (!el.offsetWidth) return;      // map tab hidden: measure again when it is shown
		el.classList.toggle("show-zone-names", zoom >= 15);
		el.classList.toggle("hide-zone-chips", zoom < 13);
		if (zoom < 13) return;
		const items = chips
			.map(c => ({ zone: c.zone, el: c.marker.getElement() && c.marker.getElement().firstElementChild }))
			.filter(x => x.el)
			.sort((a, b) => ((b.zone.id === activeId) - (a.zone.id === activeId)) || (b.zone.speciesCount - a.zone.speciesCount));
		const placed = [];
		items.forEach(({ el }) => {
			el.classList.remove("is-hidden");
			const r = el.getBoundingClientRect();
			const hit = placed.some(q => r.left < q.right + 4 && r.right > q.left - 4 && r.top < q.bottom + 2 && r.bottom > q.top - 2);
			if (hit) el.classList.add("is-hidden"); else placed.push(r);
		});
	}

	/** Highlight the zone the walker is in (null for none). */
	function setActiveZone(id) {
		if (activeId === id) return;
		const prev = activeId;
		activeId = id;
		[prev, id].forEach(zid => {
			const cell = zid && cells.get(zid);
			if (cell) cell.poly.setStyle(cellStyle(cell));
		});
		if (id && cells.has(id)) cells.get(id).poly.bringToFront();
		chips.forEach(c => {
			const chip = c.marker.getElement() && c.marker.getElement().firstElementChild;
			if (chip) chip.classList.toggle("is-active", c.zone.id === id);
		});
		updateChips();
	}

	/** Brighten a zone and send a ripple out from its middle. */
	function pulseZone(zoneId) {
		const cell = cells.get(zoneId);
		if (!cell) return;
		cell.poly.setStyle({ weight: 5, fillOpacity: 0.62 });
		setTimeout(() => { const now = cells.get(zoneId); if (now) now.poly.setStyle(cellStyle(now)); }, 1400);
		if (WN_UI.reducedMotion()) return;
		const ripple = L.marker([cell.centre.lat, cell.centre.lng], { icon: L.divIcon({ className: "", html: '<div class="zone-ripple"></div>', iconSize: [40, 40], iconAnchor: [20, 20] }), interactive: false, keyboard: false }).addTo(map);
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
		// the ring shows GPS accuracy; in demo mode there is none, so hide it completely
		accuracyCircle.setStyle({ opacity: accuracyM ? 1 : 0, fillOpacity: accuracyM ? 0.08 : 0 });
	}
	function clearYou() {
		if (youMarker) { map.removeLayer(youMarker); map.removeLayer(accuracyCircle); youMarker = accuracyCircle = null; }
	}
	function panTo(lat, lng) { map.panTo([lat, lng], { animate: true, duration: 0.5 }); }
	function zoomTo(lat, lng, zoom) { map.setView([lat, lng], zoom || 16, { animate: true }); }
	function zoomIn() { map.zoomIn(); }
	function zoomOut() { map.zoomOut(); }
	function center() { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; }
	function invalidate() { if (map) setTimeout(() => { map.invalidateSize(); updateChips(); }, 60); }

	return { init, on, setCentre, fitCircle, renderZones, setActiveZone, pulseZone, setYou, clearYou, panTo, zoomTo, zoomIn, zoomOut, center, invalidate };
})();
