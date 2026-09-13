/* ==========================================================================
   Wild Neighbours - configuration
   Central place for tunable numbers, preset locations and labels.
   Everything is attached to one global object (WN_CONFIG) because the app is
   plain browser scripts with no bundler.
   ========================================================================== */

const WN_CONFIG = {
	/* Pilot area. The cached data covers a 3 km circle around this point, so
	   presets stay inside that circle. Coordinates are approximate trailheads. */
	DEFAULT_LOCATION: "mt-coot-tha",
	LOCATIONS: [
		{ id: "mt-coot-tha", name: "Mt Coot-tha (pilot centre)", place: "Mt Coot-tha", lat: -27.4747, lng: 152.9509 },
		{ id: "summit", name: "Summit lookout", place: "Mt Coot-tha summit", lat: -27.4767, lng: 152.9566 },
		{ id: "jc-slaughter", name: "JC Slaughter Falls picnic area", place: "JC Slaughter Falls", lat: -27.4695, lng: 152.9640 },
		{ id: "simpson-falls", name: "Simpson Falls picnic area", place: "Simpson Falls", lat: -27.4835, lng: 152.9560 },
		{ id: "botanic", name: "Brisbane Botanic Gardens", place: "Brisbane Botanic Gardens", lat: -27.4757, lng: 152.9766 },
		{ id: "custom", name: "Tap the map to choose a spot", place: "near Mt Coot-tha", lat: null, lng: null }
	],

	/* Search radius slider (metres). */
	RADIUS_MIN: 500,
	RADIUS_MAX: 3000,
	RADIUS_DEFAULT: 1500,

	/* Recency filter: months of records to use. 0 = everything cached. */
	WINDOW_DEFAULT_MONTHS: 6,

	/* Records with worse location precision than this never place a zone. */
	MAX_PRECISION_M: 1000,

	/* Zone clustering (see js/zones.js and README for the approach). */
	ZONE: {
		linkDistance: 300,   // a record joins a zone if within this many metres of its centre
		mergeDistance: 180,  // zones closer than this are merged
		foldDistance: 600,   // tiny zones fold into a neighbour within this distance
		minRecords: 3,       // zones with fewer records than this are "tiny"
		minRadius: 220,      // drawn / trigger radius floor (metres)
		maxRadius: 420,      // drawn / trigger radius ceiling (metres)
		jitter: 120          // privacy offset applied to tiny zones (metres)
	},

	/* Unlock tiers. Higher number = stronger evidence. */
	TIERS: {
		1: { name: "Zone visit", short: "Visited", icon: "\u{1F97E}" },
		2: { name: "Signs", short: "Signs", icon: "\u{1F43E}" },
		3: { name: "Sighted", short: "Sighted", icon: "\u{1F440}" }
	},

	/* Walking mode */
	SIM_STEP_M: 25,          // metres per D-pad press
	GPS_MAX_JUMP_M: 250,     // ignore GPS jumps bigger than this when adding distance
	GPS_MIN_ACCURACY_M: 80,  // positions less accurate than this are shown but do not trigger zones

	/* Celebration modal auto-closes after this many ms unless the user holds it. */
	CELEBRATE_MS: 2000,

	/* Personal photos are resized to fit this box before storing in IndexedDB. */
	PHOTO_MAX_PX: 1024,
	PHOTO_QUALITY: 0.82,

	/* Data files written by scripts/fetch-data.mjs */
	DATA: {
		meta: "data/meta.json",
		species: "data/species.json",
		sightings: "data/sightings.json",
		images: "data/images.json",
		facts: "data/facts.json"
	},

	/* Atlas of Living Australia (CORS enabled, so usable live from the browser).
	   WildNet has no CORS headers, so it is only used through the cache. */
	ALA_BASE: "https://api.ala.org.au",
	ALA_CLASSES: ["Mammalia", "Aves", "Reptilia", "Amphibia"],

	/* Placeholder icons for species with no reference image, by group. */
	GROUP_ICONS: { mammal: "\u{1F43E}", bird: "\u{1FAB6}", reptile: "\u{1F98E}", frog: "\u{1F438}" },
	GROUP_LABELS: { mammal: "Mammal", bird: "Bird", reptile: "Reptile", frog: "Frog" },

	/* Habitat words used to name zones ("Kookaburra Ridge"). */
	HABITAT_WORDS: ["Hollow", "Ridge", "Gully", "Thicket", "Creek", "Slope", "Grove", "Glade", "Flats", "Bend", "Knoll", "Scrub"],

	STORAGE_KEY: "wildneighbours.v1",
	DB_NAME: "wildneighbours",
	DB_STORE: "photos"
};

if (typeof module !== "undefined") module.exports = WN_CONFIG;
