/* ==========================================================================
   Wild Neighbours - inline SVG icons
   --------------------------------------------------------------------------
   Hand-drawn 24 x 24 line icons (stroke = currentColor), so the UI needs no
   icon font, image files or emoji. WN_ICONS.svg("camera") returns markup;
   pass a class for sizing and a label to make it meaningful to screen readers.
   The group silhouettes (mammal, bird, reptile, frog) stand in for species
   that have no reference photo.
   ========================================================================== */

const WN_ICONS = (function () {
	"use strict";

	// filled shapes use this so they still follow currentColor
	const F = ' fill="currentColor" stroke="none"';

	const paths = {
		/* brand + navigation */
		paw: '<circle cx="12" cy="15.6" r="3.6"' + F + '/><circle cx="6.2" cy="10.6" r="1.9"' + F + '/><circle cx="9.7" cy="6.4" r="1.9"' + F + '/><circle cx="14.3" cy="6.4" r="1.9"' + F + '/><circle cx="17.8" cy="10.6" r="1.9"' + F + '/>',
		map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
		book: '<path d="M4 4.5h5.5A2.5 2.5 0 0 1 12 7v13a2 2 0 0 0-2-2H4z"/><path d="M20 4.5h-5.5A2.5 2.5 0 0 0 12 7v13a2 2 0 0 1 2-2h6z"/>',
		medal: '<circle cx="12" cy="15" r="5.5"/><path d="M8.6 10.6 6 3h4l2 4.2L14 3h4l-2.6 7.6"/><path d="M12 12.6l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z"' + F + '/>',
		gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',

		/* map + walking */
		route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h5.5a3.5 3.5 0 0 0 0-7h-3a3.5 3.5 0 0 1 0-7H16"/>',
		pin: '<path d="M12 21.5s-6.5-6-6.5-11.5a6.5 6.5 0 0 1 13 0c0 5.5-6.5 11.5-6.5 11.5z"/><circle cx="12" cy="10" r="2.4"/>',
		target: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.6"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3"/>',
		navigate: '<path d="M3.5 11.2 20.5 3.5l-7.7 17-2-7.3z"/>',
		compass: '<circle cx="12" cy="12" r="9"/><path d="M15.8 8.2 13.6 13.6 8.2 15.8l2.2-5.4z"/>',
		refresh: '<path d="M20 11.5A8 8 0 1 0 17.6 17"/><path d="M20.5 4.5V11h-6.5"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		minus: '<path d="M5 12h14"/>',

		/* evidence + actions */
		eye: '<path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
		binoculars: '<circle cx="6.5" cy="16" r="3.5"/><circle cx="17.5" cy="16" r="3.5"/><path d="M10 15h4"/><path d="M3.6 14 5.6 5h3.6l.8 8.6"/><path d="M20.4 14 18.4 5h-3.6l-.8 8.6"/>',
		camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
		close: '<path d="M6 6l12 12M18 6 6 18"/>',
		check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
		trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
		info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4.5h1"/>',
		alert: '<path d="M12 3.5 2.5 20h19L12 3.5z"/><path d="M12 10v4.2M12 17.2h.01"/>',
		lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
		pencil: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 6.5l3 3"/>',
		share: '<path d="M12 3v12"/><path d="M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5"/>',
		link: '<path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1.2 1.2"/><path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1.2-1.2"/>',
		copy: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/>',
		users: '<circle cx="9" cy="8" r="3.6"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.6 3.6 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 6.3"/>',

		/* progression */
		bolt: '<path d="M13.5 2 4.5 13.5h6.5L10 22l9-11.5h-6.5z"/>',
		star: '<path d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
		trophy: '<path d="M7 4h10v4.5a5 5 0 0 1-10 0z"/><path d="M7 6H4.2v.8A3.4 3.4 0 0 0 7.4 10.4M17 6h2.8v.8a3.4 3.4 0 0 1-3.2 3.6"/><path d="M12 13.5V17M8 21h8M9.5 17h5l.5 4H9z"/>',
		crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-1.8 10H4.8z"/><path d="M5 21h14"/>',
		shield: '<path d="M12 21.5s7.5-3.3 7.5-9.8V5.2L12 2.5 4.5 5.2v6.5c0 6.5 7.5 9.8 7.5 9.8z"/><path d="M8.6 11.8l2.3 2.3 4.5-4.6"/>',
		gem: '<path d="M6.5 3.5h11l3.5 5.5L12 20.5 3 9z"/><path d="M3 9h18M9.5 3.5 8 9l4 11.5L16 9l-1.5-5.5"/>',
		flame: '<path d="M12 21.5c-4 0-7-2.9-7-6.9 0-3.6 2.4-5.5 3.6-8 .5 2 1.6 3.3 2.9 3.8-.4-3.3 1.1-6.3 3.6-8 0 3 1.4 4.8 2.8 6.6 1.2 1.6 2.1 3.3 2.1 5.6 0 4-3 6.9-7 6.9z"/><path d="M12 21.5c-1.9 0-3.2-1.4-3.2-3.2 0-1.9 1.6-2.9 2.3-4.6 1.4 1 2.8 2.4 3.6 4 .5 2-.9 3.8-2.7 3.8z"/>',
		calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="12" cy="15.5" r="1.4"' + F + '/>',
		leaf: '<path d="M5 20C5 11 10.5 4.5 20 4.5 20 14 14.5 19.5 7 19.5"/><path d="M5 20c2.8-4.2 6-7.2 10.5-9.5"/>',
		moon: '<path d="M20 14.6A8.3 8.3 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z"/>',
		sunrise: '<path d="M17 18.5a5 5 0 0 0-10 0"/><path d="M12 2.5V9M4.6 10.6l1.5 1.5M17.9 12.1l1.5-1.5M1.5 18.5h2.5M20 18.5h2.5M2 22h20M8.8 5.7 12 2.5l3.2 3.2"/>',
		heart: '<path d="M12 20.5S3.5 15.6 3.5 9.4A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 8.5 2.2c0 6.2-8.5 11.1-8.5 11.1z"/>',
		sparkles: '<path d="M10 3.5l1.7 4.6 4.6 1.7-4.6 1.7L10 16.1l-1.7-4.6-4.6-1.7 4.6-1.7z"/><path d="M18 13.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z"/>',

		/* d-pad */
		up: '<path d="M6 15l6-6 6 6"/>',
		down: '<path d="M6 9l6 6 6-6"/>',
		left: '<path d="M15 6l-6 6 6 6"/>',
		right: '<path d="M9 6l6 6-6 6"/>',

		/* animal group silhouettes */
		mammal: '<circle cx="5.6" cy="8" r="3.4"/><circle cx="18.4" cy="8" r="3.4"/><path d="M6.6 11.6A6.6 6.6 0 0 0 12 20.5a6.6 6.6 0 0 0 5.4-8.9 6.5 6.5 0 0 0-10.8 0z"/><ellipse cx="12" cy="14.6" rx="1.7" ry="2.3"' + F + '/><circle cx="9.3" cy="11.6" r=".9"' + F + '/><circle cx="14.7" cy="11.6" r=".9"' + F + '/>',
		bird: '<path d="M2.5 19.5l4.6-3.1C6 12 8.6 7.5 13.5 7.5c1.4-2.2 3.4-3.2 5.5-2.4l2.5 1-2.3 1.4c.8 4.8-2.3 10-8.7 10H7.1z"/><path d="M9.6 12.3c1.7 1.4 3.9 1.9 6.3 1.4"/><circle cx="17" cy="7.4" r=".9"' + F + '/>',
		reptile: '<path d="M12 2.8c1.6 0 2.6 1.2 2.6 2.8S13 8.9 13 10.4v3.4c0 1.6 1.4 2.6 1.4 4.3 0 1.6-1 3.3-2.4 3.3s-2.4-1.7-2.4-3.3c0-1.7 1.4-2.7 1.4-4.3v-3.4C11 8.9 9.4 7.2 9.4 5.6S10.4 2.8 12 2.8z"/><path d="M9.6 9.2 5.4 7.4M14.4 9.2l4.2-1.8M10.6 15.2l-4 2.4M13.4 15.2l4 2.4"/>',
		frog: '<path d="M3.5 14.5C3.5 18 7.3 20.5 12 20.5s8.5-2.5 8.5-6c0-1.8-.9-3-2.1-3.6a3.3 3.3 0 0 0-6.4-.6 3.3 3.3 0 0 0-6.4.6C4.4 11.5 3.5 12.7 3.5 14.5z"/><circle cx="8.4" cy="9.6" r="1"' + F + '/><circle cx="15.6" cy="9.6" r="1"' + F + '/><path d="M8.5 15.6c2.2 1.3 4.8 1.3 7 0"/>'
	};
	paths.signs = paths.paw;

	/** Markup for one icon. Decorative by default (aria-hidden). */
	function svg(name, cls, label) {
		const d = paths[name] || paths.info;
		return '<svg class="icon ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
			(label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true"') + ">" + d + "</svg>";
	}

	return { svg, names: Object.keys(paths) };
})();

if (typeof module !== "undefined") module.exports = WN_ICONS;
