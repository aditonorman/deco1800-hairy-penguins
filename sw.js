/* ==========================================================================
   Wild Neighbours - service worker
   --------------------------------------------------------------------------
   Makes the app open offline after the first visit (handy on a trail with
   no signal, and for the class demo).
     * App files, the data bundle, Leaflet and fonts: network first, so new
       deploys show up straight away; the cache is the fallback when offline
       or when the network takes longer than 3.5 seconds.
     * Cached species thumbnails (data/img): cache first, they never change.
     * Map tiles and live ALA requests are not touched.
   Redirects (for example the UQ login page) are passed straight through and
   never cached.
   ========================================================================== */

const CACHE = "wild-neighbours-v3";
const CORE = [
	"./", "index.html", "css/style.css", "manifest.webmanifest", "data/cached.js",
	"js/config.js", "js/util.js", "js/zones.js", "js/storage.js", "js/data.js", "js/photos.js", "js/icons.js",
	"js/progress.js", "js/ui.js", "js/map.js", "js/walk.js", "js/pokedex.js", "js/badges.js", "js/app.js",
	"images/icon.svg", "images/icon-192.png"
];
const CDN = /^https:\/\/(unpkg\.com\/leaflet@|fonts\.googleapis\.com\/|fonts\.gstatic\.com\/)/;

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE)
			.then(cache => Promise.all(CORE.map(url => cache.add(new Request(url, { cache: "reload" })).catch(() => null))))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys()
			.then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

/** Fetch, and keep a copy of good, same-origin or CORS responses. */
function fetchAndStore(request) {
	return fetch(request).then(response => {
		if (response.ok && !response.redirected && (response.type === "basic" || response.type === "cors")) {
			const copy = response.clone();
			caches.open(CACHE).then(cache => cache.put(request, copy));
		}
		return response;
	});
}

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	const sameOrigin = url.origin === self.location.origin;
	if (!sameOrigin && !CDN.test(request.url)) return;     // tiles, ALA: straight to the network

	if (sameOrigin && url.pathname.includes("/data/img/")) {
		event.respondWith(caches.match(request).then(hit => hit || fetchAndStore(request)));
		return;
	}
	event.respondWith(networkFirst(request));
});

/**
 * Network first, but on a weak trail signal do not wait forever: after
 * 3.5 seconds serve the cached copy if there is one (the network response
 * still refreshes the cache in the background).
 */
function networkFirst(request) {
	const fallback = () => caches.match(request, { ignoreSearch: true })
		.then(hit => hit || (request.mode === "navigate" ? caches.match("index.html") : null))
		.then(res => res || Response.error());
	return new Promise(resolve => {
		let done = false;
		const finish = (res) => { if (!done) { done = true; resolve(res); } };
		const timer = setTimeout(() => {
			caches.match(request, { ignoreSearch: true }).then(hit => { if (hit) finish(hit); });
		}, 3500);
		fetchAndStore(request)
			.then(res => { clearTimeout(timer); finish(res); })
			.catch(() => { clearTimeout(timer); fallback().then(finish); });
	});
}
