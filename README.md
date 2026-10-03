# Wild Neighbours

A Pokedex-style wildlife discovery web app for casual hikers around Brisbane, built for DECO1800
(Design Computing Studio 1, UQ) by team **Hairy Penguins**. Piloted on Mt Coot-tha, with cached
data for greater Brisbane and live data anywhere.

Pick a spot and a radius, see recent wildlife records as shaded **habitat zones** on a map
(never exact pinpoints, for the animals' safety), walk outside, and unlock species entries in
your personal Pokedex. Entering a zone always counts, so a walk with no sightings still makes
progress. You can attach your own photo to any unlocked entry as a private keepsake.

Progress earns **XP, ranger levels and 53 badges**, and you can **compare with friends** by
swapping a share link. It is built mobile-first like a native app and can be installed to a
phone's home screen.

- **Live demo (UQ login):** https://deco1800teams-hairy-penguins.uqcloud.net/
- **Repo:** https://github.com/aditonorman/deco1800-hairy-penguins

## Running it

There is no build step. It is plain HTML, CSS and JavaScript with Leaflet from a CDN.

**Option A: open the file.** Double-click `index.html`. The cached data ships as a script
(`data/cached.js`), so this works straight from disk. Map tiles and Google Fonts need internet;
zones, the Pokedex and cached thumbnails work offline for the cached areas.

**Option B: local server** (needed for the Live data mode and recommended for the camera):

```bash
cd project
python3 -m http.server 8000
# then open http://localhost:8000/
```

**Option C: the team zone.** Run `./deploy.sh your_uq_username` from the project folder. It
uploads `index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `images/` and `data/` to
`/var/www/htdocs`. On the UQ network or VPN it connects straight to the zone. Anywhere else,
including overseas, it goes through EAIT's public SSH host `remote.labs.eait.uq.edu.au`. EAIT
asks for your UQ password, then shows a `signin.uq.edu.au` link: open it, approve the sign-in in
your browser, and press Enter in the terminal. `VIA_EAIT=1 ./deploy.sh ...` always uses the EAIT
route.

On a real phone, use the zone URL (HTTPS) so the browser allows geolocation and the camera.
Add it to the home screen (Share > Add to Home Screen on iPhone, the install prompt on Android)
and it opens full screen like an app, and opens offline after the first visit. Indoors, open
Settings and turn on "Simulate my position". Everything is stored on the device with
localStorage and IndexedDB. There are no accounts and no server.

## How it works

### Views

| View | What it does |
|---|---|
| **Map** | The main screen. Habitat zones are drawn as separate cells: overlapping zones are split down the middle with a thin gap, neighbouring cells get different shades of green, visited zones turn gold, and a coral edge marks a threatened species. A chip on each zone shows how many species live there with a coloured dot per animal type; names appear when you zoom in. A glass stat bar shows species, zones and distance; a status pill says which zone you are in or how far the nearest one is. The floating card shows where you are exploring and a "Likely around here" carousel; tap **Change** for presets across Brisbane, the radius (0.5 to 3 km) and the recency window. Drag the map and tap **Search this area** to explore anywhere. Walking is always on: the find-me button starts GPS and the map follows you. |
| **Entering a zone** | Every species recorded there joins your Pokedex at *zone visit* tier straight away. Instead of a pop-up, a small alert card slides in at the side ("4 new birds collected") with a safety reminder; nothing opens until you tap it. Tapping the card, or the status pill while you are in the zone, opens the zone sheet with the new species marked **New** and **I spotted it** / **Saw signs** buttons. Cards close themselves after a few seconds unless touched, and can be swiped away. You choose which animals trigger a card (see Settings). |
| **Pokedex** | A numbered card for every species, coloured by animal type. Group tiles (mammals, birds, reptiles, frogs) show progress and filter the grid; sort by number, name, recently found or rarest. Locked cards are greyed with a `?`. Unlocked cards show the photo, a tier badge (sighted / signs / zone visit), rarity pips and a camera icon if you added a photo. The entry view shows the ALA photo, rarity, record count, activity, when and where you unlocked it, and your own photo. |
| **Badges** | Your ranger card (level, rank, XP bar, stats, streak), the three badges you are closest to, all 53 badges by category, and a friends leaderboard. |
| **Settings** (gear icon) | **Alerts while walking**: turn alert cards on or off, and pick which animal types (mammals, birds, reptiles, frogs) trigger a zone card. Species are collected either way; the zone sheet links straight here. Switch between **Cached** and **Live** data, and the **demo tools**: simulate your position (tap the map or a zone to jump, arrows or arrow keys to walk 25 m), jump into the nearest zone, replay the intro, and reset progress. Opening the site with `#demo` on the end of the URL jumps straight to the demo tools. |

Tiers only go up: sighted (3) beats signs (2) beats zone visit (1). The app only interrupts
you in response to something you did: logging a sighting or signs shows a short celebration
card (confetti, rays, the species photo) that closes itself after two seconds, and badges
earned that way get their own celebration. Anything that happens just because you walked
(entering a zone, badges for distance or zones) arrives as an alert card instead. A
three-slide intro explains the app on first visit.

### Progression

Everything is derived from what is saved on the device, so XP and badges never drift.

| Source | XP |
|---|---|
| Species at zone visit / signs / sighted tier | 10 / 30 / 60 |
| Rarity bonus (uncommon / rare / very rare) | +5 / +15 / +30 |
| Each zone visited | 25 |
| Every 100 m walked | 5 |
| Each entry with your photo | 15 |
| Badge (bronze / silver / gold / legendary) | 25 / 50 / 100 / 250 |

Each level costs 50 XP more than the last (level 2 at 100 XP, level 3 at 250, level 5 at 700).
Ranks run Fresh Tracks, Trail Scout, Bush Explorer, Wildlife Spotter, Habitat Ranger, Field
Naturalist and Living Legend. Rarity comes from how many records a species has in the cached
data: common (100+), uncommon (25+), rare (5+) and very rare.

**Badges** (53, in bronze, silver, gold and holographic legendary):

| Category | Examples |
|---|---|
| Collection | 1, 10, 25, 50, 100 and 250 species |
| Animal groups | Birdwatcher, Twitcher, Flock Leader; mammals, reptiles and frogs; Full House (one of each group) |
| Sightings and signs | First Sighting to Hawkeye (50 sightings); Track Reader to Master Tracker |
| On the move | 1 km to 100 km walked, including Half Marathon and Marathon Ranger; 1 to 30 zones; zones in 3, 8 and 15 areas of Brisbane at least 2 km apart |
| Conservation | Guardian (a threatened species), Aussie Icons and Brisbane Big Ten (koala, kookaburra, echidna, platypus, water dragon, lace monitor, grey kangaroo, tawny frogmouth, green tree frog, carpet python), Koala Moment, Rare Find |
| Habits and journal | 3- and 7-day streaks, 30 active days, Four Seasons, 1, 10 and 25 photos |
| Friends | First friend, five friends |
| Secret | Two hidden badges with hints |

The badge logic is pure functions in `js/progress.js`; `node scripts/test-progress.mjs` checks
the catalogue, stats, streaks, seasons, XP, levels and friend cards.

### Friends

There is no server, so friends swap **ranger cards** as links. **Share my card** (on the Badges
tab) opens the phone's share sheet, or copies a link like
`https://deco1800teams-hairy-penguins.uqcloud.net/#friend=...`. Opening a friend's link adds
them to your leaderboard on that device and opens a side-by-side comparison (XP, species,
sightings, zones, distance, badges, best streak, areas, and the badges only one of you has).
To update a friend, open a fresh link from them.

A card holds only a random id, a nickname you can edit, counts and badge ids: no places, no
coordinates, no photos and no species list. Cards are checked and cleaned when they are opened.

### Data pipeline

Two public sources, with the Queensland WildNet Data API as the primary source and the Atlas of
Living Australia (ALA) as the secondary source for images and recent occurrence records.

| | WildNet | ALA |
|---|---|---|
| Base | `https://wildnet-pub.science-data.qld.gov.au/api/v1` (the old `apps.des.qld.gov.au/species/` URL redirects here) | `https://api.ala.org.au` |
| Used for | Species list for the circle, conservation status (NCA and EPBC codes), sighting records | Occurrence records from the last 24 months, reference images |
| Browser calls? | **No.** WildNet sends no CORS headers, so a page cannot call it directly | **Yes.** ALA sends `Access-Control-Allow-Origin: *` |

Because WildNet blocks browser requests, `scripts/fetch-data.mjs` (Node 18+, no packages)
downloads and normalises everything into `/data`. It caches two circular areas at different depths
so the bundle stays small enough for a phone:

| Area | Radius | ALA records | WildNet sightings |
|---|---|---|---|
| Mt Coot-tha pilot (`-27.4747, 152.9509`) | 3 km | last 24 months | everything |
| Greater Brisbane (`-27.4698, 153.0251`) | 22 km | last 6 months | last 3 years |

```bash
node scripts/fetch-data.mjs --images       # both areas + thumbnails for offline use
node scripts/fetch-data.mjs --lat -27.4747 --lng 152.9509 --radius 3000 --months 24 --years 0
                                           # one custom area instead
node scripts/fetch-data.mjs --bundle-only  # rebuild data/cached.js from the JSON files, no network
```

It writes `meta.json` (areas, counts, column names), `species.json`, `sightings.json`,
`images.json`, cached thumbnails in `data/img/`, and `data/cached.js` (the JSON bundled as a
script so the app runs from `file://`). Sightings are stored as compact rows,
`[id, src, speciesIndex, lat, lng, date, precision, vetCode]`, and expanded on load by
`js/data.js`.

The **Cached / Live** toggle in the header switches sources. Live mode fetches fresh ALA
occurrences for the current circle straight from the browser (pages of 100, the API limit) and
keeps WildNet records from the cache. If you pick a spot outside the cached areas while online,
the app switches to Live by itself. If the live request fails or times out, the app falls back
to the cache and says so in a dismissible notice.

### Data rules

- **Recency.** Records default to the last 6 months (12 months, 2 years and everything cached
  are also offered; the longer windows are only deep inside the Mt Coot-tha pilot area). WildNet
  alone has very few recent records, which is why the ALA records matter so much for recency.
- **Precision.** Records with a location precision worse than 1 km, or with no precision value,
  never place a zone. Restricted WildNet records and sensitive species are excluded from zone
  placement as well.
- **Scope.** Mammals, birds, reptiles and frogs only, so the Pokedex stays about wildlife a hiker
  might meet. Insects and fish are filtered out in the fetch script.
- **Recency and activity.** Each species shows how long ago it was last recorded in that zone
  ("recorded 12 days ago") and an activity hint derived from a 12-month histogram of all its
  records ("Most active Oct-Nov", "Recorded year-round", or "Too few records to spot a pattern").

### Zone clustering

Zones are built in the browser by `js/zones.js` from the filtered records:

1. **Filter** to the search circle, the recency window and precision <= 1 km.
2. **Link.** Records are processed newest first. Each record joins the nearest existing zone if
   its centre is within 300 m, otherwise it starts a new zone. Zone centres are the running mean
   of their members, so the centre is never one animal's coordinates.
3. **Merge** zones whose centres end up within 180 m of each other.
4. **Tiny zones** (fewer than 3 records) fold into a neighbour within 600 m. If there is none,
   the zone keeps a deterministic privacy offset of up to 120 m so a single record can never be
   pinpointed.
5. **Finalise.** Radius = clamp(1.15 x spread + 60 m, 220 m, 420 m). Each zone gets a stable id
   from its member records, a species summary (count, latest date, threatened flag, species per
   animal group) and a name made from its most-recorded species plus a habitat word
   ("Kookaburra Ridge").
6. **Draw as cells.** Each zone starts as its circle and is cut along the line halfway to every
   nearby zone centre, pulled back 7 m so neighbours keep a 14 m gap. Overlapping zones become
   separate cells. Cells that share an edge get different shades (DSatur graph colouring), and
   each cell's label sits at its centroid.
7. **Detect.** You are in the zone whose centre is nearest, as long as you are inside its
   circle. This is the same rule the drawing uses, so what you see on the map is exactly what
   triggers a zone.

`node scripts/test-zones.mjs` checks this against the cached data: bounds, determinism, filters,
uniqueness, that cells never overlap, that every label sits inside its own cell, that thousands
of random points inside a drawn cell all trigger that zone, and that neighbouring cells never
share a shade.

### Privacy and scope decisions

- No exact animal coordinates are shown anywhere. Zones are the only spatial output.
- Photos are resized on the device and stored in IndexedDB. They are never uploaded, shared,
  moderated or used to verify a sighting. They can be replaced or deleted from the entry.
- Sightings and signs are self-reported personal records for the user's own collection. Nothing
  is sent anywhere and nothing is framed as contributing scientific data.
- No accounts, no backend, no database. Friend comparison works by swapping links that carry
  only counts and badges.

## Project layout

```
index.html              The single page (views, sheets, dialogs)
css/style.css           One stylesheet; palette and type in :root variables
js/config.js            Tunable numbers, presets, labels
js/util.js              Haversine, dates, activity hint, escaping
js/zones.js             Habitat zone clustering (pure functions, Node-testable)
js/storage.js           localStorage collection + stats, IndexedDB photos
js/data.js              Cached data loading, live ALA fetch, images
js/photos.js            Pick, resize, store a personal photo
js/icons.js             Inline SVG icons and animal silhouettes
js/progress.js          XP, levels, 53 badges, friend cards (pure functions, Node-testable)
js/ui.js                Tabs, sheets, zone sheet, entry view, celebrations, confetti
js/map.js               Leaflet map, zone shapes, ripples, "you are here"
js/walk.js              Walking: GPS or simulated position, zone entry, reports
js/pokedex.js           Numbered species grid, group tiles, filters and sorting
js/badges.js            Badges tab: ranger card, badges, leaderboard, compare, share
js/app.js               Bootstrap, explore card, intro, friend links, settings, demo tools
sw.js                   Service worker: opens offline after the first visit
manifest.webmanifest    Install to home screen (name, icons, colours)
images/                 App icons
data/                   Cached WildNet + ALA data (generated)
scripts/fetch-data.mjs  Data fetch and cache script
scripts/test-zones.mjs  Command-line checks for the clustering
scripts/test-progress.mjs  Command-line checks for XP, badges and friend cards
scripts/smoke-test.js   End-to-end browser test, 113 checks (needs puppeteer-core, see the file)
deploy.sh               Upload to the team zone
```

## Design

The base palette comes from the team slide deck: dark olive `#404a1c`, panel olive `#2f3813`,
cream `#f6f2e4`, amber `#e8a94b` for actions, leaf green `#8fae4e` for zones and coral `#e0764a`
for threatened species. A Brisbane "bush" palette adds colour Pokedex-style, one per animal type:
kingfisher blue `#5aaee0` for birds, galah pink `#ec8fb1` for mammals, jacaranda `#a48be8` for
reptiles and eucalyptus `#52c3a4` for frogs, with wattle gold `#f3cd52` for XP, rarity and gold
medals. Fraunces for headings, DM Sans for UI, via Google Fonts. All icons are inline SVG.

It is built like a native app: fixed header, full-bleed map, a floating glass tab bar with a
sliding indicator, bottom sheets you can swipe down to close, safe-area padding for notched
phones, 16 px inputs so iOS does not zoom, and haptic taps on Android. Motion includes a splash,
the intro, view transitions, staggered card entrances, skeleton shimmer and fade-in photos,
counting stats, zone pop-ins and entry ripples, a pulsing location marker, confetti and light
rays on unlocks, shining and holographic medals, and animated XP and comparison bars. Everything
respects the system "reduce motion" setting. At laptop widths the explore card sits beside the
map, the Badges tab uses two columns and entries open as a two-panel card.

## Team zone

| | |
|---|---|
| **Web address** | https://deco1800teams-hairy-penguins.uqcloud.net/ (behind UQ login by default) |
| **SSH / SFTP host** | `deco1800teams-hairy-penguins.zones.eait.uq.edu.au` (UQ network or VPN; from elsewhere, jump through `remote.labs.eait.uq.edu.au`) |
| **Web root** | `/var/www/htdocs` |
| **Deploy** | `./deploy.sh your_uq_username` |

The zone runs Ubuntu 24.04 with nginx already enabled. Use `sudo systemctl restart nginx` and
`sudo tail -f /var/log/nginx/error.log` (the course notes' `svcadm` is for the older image).
After a deploy, phones that installed the app pick up the new version on the next launch.
Backups are in `/var/www/.zfs/snapshot/` for a week.

## Data credits

Basemap tiles: OpenTopoMap (CC-BY-SA) with Esri World Topo and World Street as automatic fallbacks. OpenStreetMap's own tile servers are deliberately not used because their usage policy blocks pages opened from disk, and CARTO now requires an API key.

Wildlife records: Queensland Government, WildNet Data API; Atlas of Living Australia and its
contributors (iNaturalist Australia, BirdLife Australia Birdata and others). Reference images via
the Atlas of Living Australia under their respective licences. Map tiles by OpenStreetMap contributors.
