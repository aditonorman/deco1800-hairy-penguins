/* ==========================================================================
   Wild Neighbours - small utility helpers (no DOM assumptions)
   Exposed as the WN_UTIL global. Also exported for Node so the clustering
   logic can be tested from the command line.
   ========================================================================== */

const WN_UTIL = (function () {
	"use strict";

	const EARTH_R = 6371000; // metres

	/** Distance in metres between two lat/lng points (haversine formula). */
	function haversine(lat1, lng1, lat2, lng2) {
		const toRad = (d) => d * Math.PI / 180;
		const dLat = toRad(lat2 - lat1);
		const dLng = toRad(lng2 - lng1);
		const a = Math.sin(dLat / 2) ** 2 +
			Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
		return 2 * EARTH_R * Math.asin(Math.sqrt(a));
	}

	/** Move a point by metres north and east. Good enough at walking scale. */
	function offset(lat, lng, northM, eastM) {
		const dLat = northM / EARTH_R * 180 / Math.PI;
		const dLng = eastM / (EARTH_R * Math.cos(lat * Math.PI / 180)) * 180 / Math.PI;
		return { lat: lat + dLat, lng: lng + dLng };
	}

	/** Deterministic 32-bit hash of a string (FNV-1a). Used for stable zone ids. */
	function hash(str) {
		let h = 0x811c9dc5;
		for (let i = 0; i < str.length; i++) {
			h ^= str.charCodeAt(i);
			h = Math.imul(h, 0x01000193);
		}
		return h >>> 0;
	}

	/** Pseudo-random number in [0,1) from a seed. Same seed, same number. */
	function seeded(seed) {
		let x = (seed || 1) | 0;
		x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
		return ((x >>> 0) % 100000) / 100000;
	}

	/** ISO date (YYYY-MM-DD) for "n months ago", or null for no limit. */
	function monthsAgoIso(months) {
		if (!months) return null;
		const d = new Date();
		d.setMonth(d.getMonth() - months);
		return d.toISOString().slice(0, 10);
	}

	/** Whole days between an ISO date and now. */
	function daysSince(iso) {
		if (!iso) return null;
		const then = new Date(iso + "T00:00:00");
		return Math.max(0, Math.round((Date.now() - then.getTime()) / 86400000));
	}

	/** "recorded 12 days ago" style text. */
	function ago(iso) {
		const d = daysSince(iso);
		if (d === null) return "date unknown";
		if (d === 0) return "today";
		if (d === 1) return "yesterday";
		if (d < 30) return d + " days ago";
		const months = Math.round(d / 30.4);
		if (months < 12) return months + (months === 1 ? " month ago" : " months ago");
		const years = Math.round(d / 365);
		return years + (years === 1 ? " year ago" : " years ago");
	}

	const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

	/** "14 Feb 2025" */
	function formatDate(iso) {
		if (!iso) return "unknown date";
		const d = new Date(iso.length > 10 ? iso : iso + "T00:00:00");
		if (Number.isNaN(d.getTime())) return iso;
		return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
	}

	/** "850 m" or "2.3 km" */
	function formatDistance(m) {
		if (!m || m < 1) return "0 m";
		if (m < 1000) return Math.round(m) + " m";
		return (m / 1000).toFixed(m < 10000 ? 1 : 0) + " km";
	}

	/**
	 * Activity hint from a 12-bucket month histogram of records.
	 * Returns short text such as "Most records in November" or
	 * "Most active Oct-Nov". Derived only, so it is honest about thin data.
	 */
	function activityHint(months) {
		if (!months || months.length !== 12) return null;
		const total = months.reduce((a, b) => a + b, 0);
		if (total < 4) return "Too few records to spot a pattern";
		let top = 0;
		for (let i = 1; i < 12; i++) if (months[i] > months[top]) top = i;
		const share = months[top] / total;
		const prev = (top + 11) % 12, next = (top + 1) % 12;
		const nb = months[next] >= months[prev] ? next : prev;
		const pairShare = (months[top] + months[nb]) / total;
		if (share >= 0.5) return "Most records in " + MONTHS_LONG[top];
		if (pairShare >= 0.45) {
			const first = Math.min(top, nb), second = Math.max(top, nb);
			// handle the Dec-Jan wrap
			const order = (second - first === 11) ? [second, first] : [first, second];
			return "Most active " + MONTHS[order[0]] + "–" + MONTHS[order[1]];
		}
		return "Recorded year-round";
	}

	/** Escape text for safe insertion into innerHTML. */
	function esc(str) {
		return String(str == null ? "" : str)
			.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
	}

	/** Title-case a phrase ("laughing kookaburra" -> "Laughing Kookaburra"). */
	function titleCase(s) {
		return String(s || "").toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
	}

	return { haversine, offset, hash, seeded, monthsAgoIso, daysSince, ago, formatDate, formatDistance, activityHint, esc, titleCase, MONTHS, MONTHS_LONG };
})();

if (typeof module !== "undefined") module.exports = WN_UTIL;
