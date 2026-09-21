/* ==========================================================================
   Wild Neighbours - inline SVG icons
   --------------------------------------------------------------------------
   Small line icons (24 x 24, stroke = currentColor) so the UI needs no icon
   font or emoji. WN_ICONS.svg("camera") returns the markup; pass a class for
   sizing. The animal silhouettes stand in for species without a reference image.
   ========================================================================== */

const WN_ICONS = (function () {
	"use strict";

	const paths = {
		/* navigation */
		map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
		route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h5a4 4 0 0 0 0-8h-2a4 4 0 0 1 0-8h5"/>',
		book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
		/* actions and states */
		eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
		paw: '<circle cx="12" cy="15.5" r="3.4" fill="currentColor" stroke="none"/><circle cx="6.5" cy="10.5" r="1.8" fill="currentColor" stroke="none"/><circle cx="9.8" cy="6.5" r="1.8" fill="currentColor" stroke="none"/><circle cx="14.2" cy="6.5" r="1.8" fill="currentColor" stroke="none"/><circle cx="17.5" cy="10.5" r="1.8" fill="currentColor" stroke="none"/>',
		pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.5"/>',
		target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
		camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
		close: '<path d="M6 6l12 12M18 6 6 18"/>',
		check: '<path d="M5 12l4 4L19 7"/>',
		trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
		info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>',
		alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
		/* d-pad */
		up: '<path d="M6 15l6-6 6 6"/>',
		down: '<path d="M6 9l6 6 6-6"/>',
		left: '<path d="M15 6l-6 6 6 6"/>',
		right: '<path d="M9 6l6 6-6 6"/>',
		/* animal silhouettes for missing images */
		mammal: '<circle cx="12" cy="15.5" r="3.4" fill="currentColor" stroke="none"/><circle cx="6.5" cy="10.5" r="1.8" fill="currentColor" stroke="none"/><circle cx="9.8" cy="6.5" r="1.8" fill="currentColor" stroke="none"/><circle cx="14.2" cy="6.5" r="1.8" fill="currentColor" stroke="none"/><circle cx="17.5" cy="10.5" r="1.8" fill="currentColor" stroke="none"/>',
		bird: '<path d="M20 4c-6 0-11 4-13 10l-3 6 6-3c6-2 10-7 10-13z"/><path d="M4 20 15 9"/>',
		reptile: '<path d="M12 3c2 0 3 1.5 3 3.5S13 10 13 12s2 3 2 5-1 4-3 4-3-2-3-4 2-3 2-5-2-3.5-2-5.5S10 3 12 3z"/><path d="M9 8 5 6M15 8l4-2M9 16l-4 2M15 16l4 2"/>',
		frog: '<path d="M4 14a8 6 0 0 0 16 0c0-2-1-3-2-3h-1a3 3 0 0 0-5 0 3 3 0 0 0-5 0H6c-1 0-2 1-2 3z"/><circle cx="8.5" cy="9" r="2.5"/><circle cx="15.5" cy="9" r="2.5"/>'
	};

	/** Markup for one icon. Decorative by default (aria-hidden). */
	function svg(name, cls, label) {
		const d = paths[name] || paths.info;
		return '<svg class="icon ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
			(label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true"') + ">" + d + "</svg>";
	}

	return { svg, names: Object.keys(paths) };
})();
