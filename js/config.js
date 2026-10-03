/* ==========================================================================
   Wild Neighbours - configuration
   Central place for tunable numbers, preset locations and labels.
   Everything is attached to one global object (WN_CONFIG) because the app is
   plain browser scripts with no bundler.
   ========================================================================== */

const WN_CONFIG = {
	/* Locations. Mt Coot-tha is the pilot area and the default. The other
	   presets are bushland reserves and parks around Brisbane; coordinates are
	   approximate car parks / trailheads. "Tap the map" and "Use my location"
	   work anywhere. */
	DEFAULT_LOCATION: "mt-coot-tha",
	LOCATIONS: [
		{ id: "mt-coot-tha", group: "Mt Coot-tha (pilot)", name: "Mt Coot-tha (pilot centre)", place: "Mt Coot-tha", lat: -27.4747, lng: 152.9509 },
		{ id: "summit", group: "Mt Coot-tha (pilot)", name: "Summit lookout", place: "Mt Coot-tha summit", lat: -27.4767, lng: 152.9566 },
		{ id: "jc-slaughter", group: "Mt Coot-tha (pilot)", name: "JC Slaughter Falls picnic area", place: "JC Slaughter Falls", lat: -27.4695, lng: 152.9640 },
		{ id: "simpson-falls", group: "Mt Coot-tha (pilot)", name: "Simpson Falls picnic area", place: "Simpson Falls", lat: -27.4835, lng: 152.9560 },
		{ id: "botanic", group: "Mt Coot-tha (pilot)", name: "Brisbane Botanic Gardens", place: "Brisbane Botanic Gardens", lat: -27.4757, lng: 152.9766 },

		{ id: "walkabout-creek", group: "North and west", name: "Walkabout Creek / Enoggera Reservoir", place: "Enoggera Reservoir", lat: -27.4436, lng: 152.9168 },
		{ id: "bunyaville", group: "North and west", name: "Bunyaville Conservation Park", place: "Bunyaville", lat: -27.3711, lng: 152.9689 },
		{ id: "chermside-hills", group: "North and west", name: "Chermside Hills Reserve", place: "Chermside Hills", lat: -27.3823, lng: 153.0165 },
		{ id: "boondall", group: "North and west", name: "Boondall Wetlands", place: "Boondall Wetlands", lat: -27.3436, lng: 153.0807 },
		{ id: "tinchi-tamba", group: "North and west", name: "Tinchi Tamba Wetlands", place: "Tinchi Tamba", lat: -27.3025, lng: 153.0567 },
		{ id: "anstead", group: "North and west", name: "Anstead Bushland Reserve", place: "Anstead Bushland", lat: -27.5385, lng: 152.8615 },

		{ id: "city-botanic", group: "Inner city", name: "City Botanic Gardens", place: "City Botanic Gardens", lat: -27.4750, lng: 153.0298 },
		{ id: "roma-street", group: "Inner city", name: "Roma Street Parkland", place: "Roma Street Parkland", lat: -27.4617, lng: 153.0193 },
		{ id: "kangaroo-point", group: "Inner city", name: "Kangaroo Point Cliffs", place: "Kangaroo Point", lat: -27.4780, lng: 153.0350 },
		{ id: "sherwood", group: "Inner city", name: "Sherwood Arboretum", place: "Sherwood Arboretum", lat: -27.5300, lng: 152.9745 },
		{ id: "oxley-creek", group: "Inner city", name: "Oxley Creek Common", place: "Oxley Creek Common", lat: -27.5487, lng: 152.9986 },

		{ id: "toohey", group: "South and east", name: "Toohey Forest", place: "Toohey Forest", lat: -27.5450, lng: 153.0550 },
		{ id: "mt-gravatt", group: "South and east", name: "Mt Gravatt Outlook", place: "Mt Gravatt", lat: -27.5385, lng: 153.0755 },
		{ id: "whites-hill", group: "South and east", name: "Whites Hill Reserve", place: "Whites Hill", lat: -27.4983, lng: 153.0700 },
		{ id: "minnippi", group: "South and east", name: "Minnippi Parklands", place: "Minnippi Parklands", lat: -27.4926, lng: 153.1053 },
		{ id: "koala-bushlands", group: "South and east", name: "Brisbane Koala Bushlands (Burbank)", place: "Brisbane Koala Bushlands", lat: -27.5598, lng: 153.1462 },
		{ id: "karawatha", group: "South and east", name: "Karawatha Forest", place: "Karawatha Forest", lat: -27.6289, lng: 153.0846 },
		{ id: "daisy-hill", group: "South and east", name: "Daisy Hill Koala Centre", place: "Daisy Hill", lat: -27.6330, lng: 153.1603 },
		{ id: "wynnum", group: "South and east", name: "Wynnum foreshore", place: "Wynnum", lat: -27.4420, lng: 153.1740 },

		{ id: "custom", group: "Anywhere", name: "Tap the map to choose a spot", place: "your chosen spot", lat: null, lng: null }
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

	/* How zones are drawn. Overlapping zones are split into separate cells
	   with a gap this wide between them (metres), and neighbouring cells get
	   different shades of green so they stand apart. */
	ZONE_GUTTER_M: 14,
	ZONE_SHADES: [
		{ fill: "#8fae4e", line: "#4f6a22" },   // leaf
		{ fill: "#5c9e57", line: "#2f6230" },   // fern
		{ fill: "#a3b843", line: "#5c6c18" },   // moss
		{ fill: "#4f9a7f", line: "#25604c" }    // bush green
	],

	/* Alerts while walking: a small card slides in on zone entry (and for
	   badges earned while walking). Users choose which animals trigger zone
	   alerts. Cards close themselves after this long unless touched. */
	ALERT_MS: 12000,

	/* Unlock tiers. Higher number = stronger evidence. */
	TIERS: {
		1: { name: "Zone visit", short: "Visited", icon: "pin" },
		2: { name: "Signs", short: "Signs", icon: "paw" },
		3: { name: "Sighted", short: "Sighted", icon: "eye" }
	},

	/* Walking mode */
	SIM_STEP_M: 25,          // metres per D-pad press
	GPS_MAX_JUMP_M: 250,     // ignore GPS jumps bigger than this when adding distance
	GPS_MIN_ACCURACY_M: 80,  // positions less accurate than this are shown but do not trigger zones

	/* Celebration modal auto-closes after this many ms unless the user holds it. */
	CELEBRATE_MS: 2000,
	CELEBRATE_BADGE_MS: 2600,

	/* Personal photos are resized to fit this box before storing in IndexedDB. */
	PHOTO_MAX_PX: 1024,
	PHOTO_QUALITY: 0.82,

	/* Data files written by scripts/fetch-data.mjs */
	DATA: {
		meta: "data/meta.json",
		species: "data/species.json",
		sightings: "data/sightings.json",
		images: "data/images.json"
	},

	/* Atlas of Living Australia (CORS enabled, so usable live from the browser).
	   WildNet has no CORS headers, so it is only used through the cache. */
	ALA_BASE: "https://api.ala.org.au",
	ALA_CLASSES: ["Mammalia", "Aves", "Reptilia", "Amphibia"],

	/* Placeholder silhouettes (WN_ICONS names) for species with no reference image. */
	GROUP_ICONS: { mammal: "mammal", bird: "bird", reptile: "reptile", frog: "frog" },
	GROUP_LABELS: { mammal: "Mammal", bird: "Bird", reptile: "Reptile", frog: "Frog" },

	/* Habitat words used to name zones ("Kookaburra Ridge"). */
	HABITAT_WORDS: ["Hollow", "Ridge", "Gully", "Thicket", "Creek", "Slope", "Grove", "Glade", "Flats", "Bend", "Knoll", "Scrub"],

	/* ---- colour + progression ------------------------------------------ */

	/* Brisbane "bush" palette layered on the slide-deck colours. CSS has the
	   same values as variables; JS needs them for confetti and avatars. */
	PALETTE: {
		amber: "#e8a94b", leaf: "#8fae4e", coral: "#e0764a", cream: "#f6f2e4",
		kingfisher: "#5aaee0", galah: "#ec8fb1", jacaranda: "#a48be8", eucalyptus: "#52c3a4", wattle: "#f3cd52"
	},
	/* Each animal group gets a "type" colour, Pokedex style. */
	TYPE_COLORS: { mammal: "#ec8fb1", bird: "#5aaee0", reptile: "#a48be8", frog: "#52c3a4" },
	GROUP_ORDER: ["mammal", "bird", "reptile", "frog"],
	GROUP_PLURALS: { mammal: "Mammals", bird: "Birds", reptile: "Reptiles", frog: "Frogs" },

	/* Rarity from how many records a species has in the cached data. */
	RARITY: [
		{ id: "common", label: "Common", min: 100, pips: 1 },
		{ id: "uncommon", label: "Uncommon", min: 25, pips: 2 },
		{ id: "rare", label: "Rare", min: 5, pips: 3 },
		{ id: "veryrare", label: "Very rare", min: 0, pips: 4 }
	],

	/* XP rules. Everything is derived from saved progress, so XP never drifts. */
	XP: {
		tier: { 1: 10, 2: 30, 3: 60 },                  // per species, at its current tier
		rarity: { common: 0, uncommon: 5, rare: 15, veryrare: 30 },
		zone: 25,                                       // per zone visited
		per100m: 5,                                     // per 100 m walked
		photo: 15,                                      // per entry with your photo
		badge: { bronze: 25, silver: 50, gold: 100, legendary: 250 }
	},

	/* Ranger titles by level. */
	RANKS: [
		{ level: 1, title: "Fresh Tracks" },
		{ level: 3, title: "Trail Scout" },
		{ level: 5, title: "Bush Explorer" },
		{ level: 8, title: "Wildlife Spotter" },
		{ level: 12, title: "Habitat Ranger" },
		{ level: 16, title: "Field Naturalist" },
		{ level: 20, title: "Living Legend" }
	],

	/* Brisbane's "Big Ten" for the Aussie Icons badges. */
	ICONIC: [
		"phascolarctos-cinereus", "dacelo-novaeguineae", "tachyglossus-aculeatus", "ornithorhynchus-anatinus",
		"intellagama-lesueurii", "varanus-varius", "macropus-giganteus", "podargus-strigoides",
		"litoria-caerulea", "morelia-spilota"
	],
	KOALA: "phascolarctos-cinereus",

	/* Words for generated ranger nicknames ("Curious Echidna"). */
	NICK_ADJ: ["Curious", "Quiet", "Swift", "Sunny", "Brave", "Gentle", "Keen", "Lucky", "Clever", "Wandering", "Bright", "Bold"],
	NICK_NOUN: ["Echidna", "Kookaburra", "Wallaby", "Possum", "Galah", "Goanna", "Bilby", "Lorikeet", "Glider", "Magpie", "Frogmouth", "Dragon"],

	STORAGE_KEY: "wildneighbours.v1",
	DB_NAME: "wildneighbours",
	DB_STORE: "photos"
};

if (typeof module !== "undefined") module.exports = WN_CONFIG;
