# Wild Neighbours

A Pokedex-style wildlife discovery web app for casual hikers, built for DECO1800
(Design Computing Studio 1, UQ) by team **Hairy Penguins**. Piloted on Mt Coot-tha, Brisbane.

Pick a spot and a radius, see recent wildlife records as shaded **habitat zones** on a map
(never exact pinpoints, for the animals' safety), walk outside, and unlock species entries in
your personal Pokedex. Entering a zone always counts, so a walk with no sightings still makes
progress. You can attach your own photo to any unlocked entry as a private keepsake.

- **Live demo (UQ login):** https://deco1800teams-hairy-penguins.uqcloud.net/
- **Repo:** https://github.com/aditonorman/deco1800-hairy-penguins

## Running it

There is no build step. It is plain HTML, CSS and JavaScript with Leaflet from a CDN.

**Option A: open the file.** Double-click `index.html`. The cached data ships as a script
(`data/cached.js`), so this works straight from disk. Map tiles and Google Fonts need internet;
zones, the Pokedex and cached thumbnails work offline.

**Option B: local server** (needed for the Live data mode and recommended for the camera):

```bash
cd project
python3 -m http.server 8000
# then open http://localhost:8000/
```

**Option C: the team zone.** From the UQ network or VPN, `./deploy.sh your_uq_username`
uploads `index.html`, `css/`, `js/`, `images/` and `data/` to the zone.

For the walking mode on a real phone, use the zone URL (HTTPS) so the browser allows
geolocation and the camera. Everything is stored on the device with localStorage and IndexedDB.
There are no accounts and no server.

## How it works

### Views

| View | What it does |
|---|---|
| **Map** | Choose a location preset (or tap the map), set the radius (0.5 to 3 km) and the recency window (6 months by default). Habitat zones are drawn as shaded circles, coral-edged when they include a threatened species. Tap a zone for the expected animals: name, scientific name, conservation status, how recently it was recorded, and an activity hint. |
| **Walk** | The map follows you. Position comes from real GPS or a simulated position (tap the map to jump, D-pad or arrow keys to walk 25 m). Entering a zone shows a safety banner, unlocks every species recorded there at *zone visit* tier, and opens the zone sheet with **I spotted it** and **Saw signs** buttons. |
| **Pokedex** | A card for every species in the area. Locked cards are greyed with `???`. Unlocked cards show a tier badge (sighted / signs / zone visit) and a camera icon if you added a photo. The detail view shows the ALA reference image, your photo, a fun fact, conservation status and when/where you unlocked it. |
| **Stats strip** | Zones visited, distance walked and species found, always visible. |

Tiers only go up: sighted (3) beats signs (2) beats zone visit (1). Unlocks show a short
celebration card that closes itself after two seconds unless you hold it.

### Data pipeline

Two public sources, with the Queensland WildNet Data API as the primary source and the Atlas of
Living Australia (ALA) as the secondary source for images and recent occurrence records.

| | WildNet | ALA |
|---|---|---|
| Base | `https://wildnet-pub.science-data.qld.gov.au/api/v1` (the old `apps.des.qld.gov.au/species/` URL redirects here) | `https://api.ala.org.au` |
| Used for | Species list for the circle, conservation status (NCA and EPBC codes), sighting records | Occurrence records from the last 24 months, reference images |
| Browser calls? | **No.** WildNet sends no CORS headers, so a page cannot call it directly | **Yes.** ALA sends `Access-Control-Allow-Origin: *` |

Because WildNet blocks browser requests, `scripts/fetch-data.mjs` (Node 18+, no packages)
downloads and normalises everything into `/data`:

```bash
node scripts/fetch-data.mjs --images       # Mt Coot-tha, 3 km, 24 months of ALA records + thumbnails
node scripts/fetch-data.mjs --lat -27.4747 --lng 152.9509 --radius 3000 --months 24
node scripts/fetch-data.mjs --bundle-only  # rebuild data/cached.js from the JSON files, no network
```

It writes `meta.json`, `species.json`, `sightings.json`, `images.json`, cached thumbnails in
`data/img/`, and `data/cached.js` (the JSON bundled as a script so the app runs from `file://`).
The curated fun facts in `data/facts.js` are hand-written.

The **Cached / Live** toggle in the header switches sources. Live mode fetches fresh ALA
occurrences for the current circle straight from the browser (pages of 100, the API limit) and
keeps WildNet records from the cache. If the live request fails or times out, the app falls back
to the cache and says so in the notice bar.

### Data rules

- **Recency.** Records default to the last 6 months (12 months, 2 years and everything cached
  are also offered). WildNet alone has very few recent records for Mt Coot-tha, which is why the
  ALA records matter so much for recency.
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
   from its member records, a species summary (count, latest date, threatened flag) and a name
   made from its most-recorded species plus a habitat word ("Kookaburra Ridge").

The same functions decide when a walker is inside a zone. `node scripts/test-zones.mjs` runs
checks against the cached data (bounds, determinism, filters, uniqueness).

### Privacy and scope decisions

- No exact animal coordinates are shown anywhere. Zones are the only spatial output.
- Photos are resized on the device and stored in IndexedDB. They are never uploaded, shared,
  moderated or used to verify a sighting. They can be replaced or deleted from the entry.
- Sightings and signs are self-reported personal records for the user's own collection. Nothing
  is sent anywhere and nothing is framed as contributing scientific data.
- No accounts, no backend, no database.

## Project layout

```
index.html              The single page (views, sheets, dialogs)
css/style.css           One stylesheet; palette and type in :root variables
js/config.js            Tunable numbers, presets, labels
js/util.js              Haversine, dates, activity hint, escaping
js/zones.js             Habitat zone clustering (pure functions, Node-testable)
js/storage.js           localStorage collection + stats, IndexedDB photos
js/data.js              Cached data loading, live ALA fetch, images, facts
js/photos.js            Pick, resize, store a personal photo
js/ui.js                Tabs, notices, badges, zone sheet, entry dialog, celebration
js/map.js               Leaflet map, zone shapes, "you are here"
js/walk.js              Walking mode: GPS / simulated position, zone entry, reports
js/pokedex.js           Species grid and filters
js/app.js               Bootstrap and top-level controls
data/                   Cached WildNet + ALA data (generated) and curated facts
scripts/fetch-data.mjs  Data fetch and cache script
scripts/test-zones.mjs  Command-line checks for the clustering
deploy.sh               Upload to the team zone
```

## Design

Palette from the team slide deck: dark olive `#404a1c`, panel olive `#2f3813`, cream `#f6f2e4`,
amber `#e8a94b` for actions, leaf green `#8fae4e` for zones and coral `#e0764a` for threatened
species. Fraunces for headings, DM Sans for UI, via Google Fonts. Mobile-first with a bottom tab
bar; at laptop widths the controls sit beside the map and the tab bar moves into the header row.

## Team zone

| | |
|---|---|
| **Web address** | https://deco1800teams-hairy-penguins.uqcloud.net/ (behind UQ login by default) |
| **SSH / SFTP host** | `deco1800teams-hairy-penguins.zones.eait.uq.edu.au` (UQ network or VPN only) |
| **Web root** | `/var/www/htdocs` |
| **Deploy** | `./deploy.sh your_uq_username` |

The zone runs Ubuntu 24.04 with nginx already enabled. Use `sudo systemctl restart nginx` and
`sudo tail -f /var/log/nginx/error.log` (the course notes' `svcadm` is for the older image).
Backups are in `/var/www/.zfs/snapshot/` for a week.

## Data credits

Basemap tiles: OpenTopoMap (CC-BY-SA) with Esri World Topo and World Street as automatic fallbacks. OpenStreetMap's own tile servers are deliberately not used because their usage policy blocks pages opened from disk, and CARTO now requires an API key.

Wildlife records: Queensland Government, WildNet Data API; Atlas of Living Australia and its
contributors (iNaturalist Australia, BirdLife Australia Birdata and others). Reference images via
the Atlas of Living Australia under their respective licences. Map tiles by OpenStreetMap contributors.
