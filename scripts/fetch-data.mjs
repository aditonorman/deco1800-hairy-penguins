#!/usr/bin/env node
/**
 * Wild Neighbours - data fetch & cache script
 * ------------------------------------------------------------
 * Downloads wildlife records for a circle (default: Mt Coot-tha) from
 *
 *   1. Qld WildNet Data API  (primary: species list, conservation status,
 *      sighting records).  WildNet does NOT send CORS headers, so a browser
 *      cannot call it directly. That is the reason this script exists.
 *   2. Atlas of Living Australia (ALA) (secondary: recent occurrence
 *      records and reference images). ALA does allow browser calls, so the
 *      app can also use it live; the cache lets the demo run offline.
 *
 * and writes normalised JSON the app reads in "cached" mode:
 *
 *   data/meta.json       when/where the cache was built, record counts
 *   data/species.json    species catalogue (one entry per species)
 *   data/sightings.json  precise records used to build habitat zones
 *   data/images.json     ALA reference image URLs per species
 *   data/img/<key>.jpg   cached thumbnails (only with --images)
 *   data/cached.js       the four JSON files bundled as one script, so the app
 *                        also works when index.html is opened from disk (file://)
 *
 * Usage:
 *   node scripts/fetch-data.mjs                 # Mt Coot-tha, 3 km, 24 months of ALA data
 *   node scripts/fetch-data.mjs --images        # also download thumbnails for offline use
 *   node scripts/fetch-data.mjs --lat -27.4747 --lng 152.9509 --radius 3000 --months 24
 *   node scripts/fetch-data.mjs --bundle-only   # rebuild data/cached.js from the JSON files, no network
 *
 * Requires Node 18+ (built-in fetch). No npm packages.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------- configuration ---------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const CENTRE = { lat: num(args.lat, -27.4747), lng: num(args.lng, 152.9509) };
const RADIUS_M = num(args.radius, 3000);
const ALA_MONTHS = num(args.months, 24);          // how far back to pull ALA records
const DOWNLOAD_IMAGES = Boolean(args.images);
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", args.out || "data");

const WILDNET = "https://wildnet-pub.science-data.qld.gov.au/api/v1";
const ALA = "https://api.ala.org.au";

// Only "hiker" wildlife goes in the Pokedex. Insects, fish etc. are excluded
// so the collection stays focused (and the demo stays snappy).
const CLASSES = ["Mammalia", "Aves", "Reptilia", "Amphibia"];
const CLASS_GROUP = { Mammalia: "mammal", Aves: "bird", Reptilia: "reptile", Amphibia: "frog" };

// Records with a location precision worse than this never place a zone.
const MAX_PRECISION_M = 1000;

// ---------- small helpers ---------------------------------------------------

function parseArgs(list) {
  const out = {};
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = list[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}
function num(v, fallback) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }

/** Species key = "genus-species" (lower case). Collapses subspecies and subgenus. */
function speciesKey(name) {
  if (!name) return null;
  const clean = name.replace(/\([^)]*\)/g, " ").replace(/[^A-Za-z\s-]/g, " ").trim().split(/\s+/);
  if (clean.length < 2) return null;
  return (clean[0] + "-" + clean[1]).toLowerCase();
}
function binomial(name) {
  const k = speciesKey(name);
  if (!k) return name;
  const [g, s] = k.split("-");
  return g.charAt(0).toUpperCase() + g.slice(1) + " " + s;
}
function titleCase(s) {
  return (s || "").toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
}
function isoDate(d) { return new Date(d).toISOString().slice(0, 10); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** fetch JSON with retries (the public APIs return 503 now and then). */
async function getJSON(url, options = {}, tries = 4) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (err) {
      if (attempt === tries) throw new Error(`${url}\n  -> ${err.message}`);
      await sleep(600 * attempt);
    }
  }
}
function log(msg) { process.stdout.write(msg + "\n"); }

// ---------- 1. WildNet species list ----------------------------------------

async function fetchWildNetSpecies() {
  const url = `${WILDNET}/species-list?kingdom_name=Animalia` +
    `&central_point_latitude=${CENTRE.lat.toFixed(4)}&central_point_longitude=${CENTRE.lng.toFixed(4)}` +
    `&distance=${(RADIUS_M / 1000).toFixed(1)}&page_size=5000`;
  const rows = await getJSON(url);
  const species = new Map();
  for (const r of rows) {
    if (!CLASSES.includes(r.class_name)) continue;
    const key = speciesKey(r.scientific_name);
    if (!key) continue;
    const existing = species.get(key);
    // Keep the entry with the most sightings if WildNet lists subspecies separately.
    const total = (r.confirmed_sightings || 0) + (r.unconfirmed_sightings || 0);
    if (existing && existing._total >= total) continue;
    species.set(key, {
      key,
      sci: binomial(r.scientific_name),
      common: r.accepted_common_name ? titleCase(r.accepted_common_name) : null,
      class: r.class_name,
      group: CLASS_GROUP[r.class_name],
      family: r.family_name || null,
      taxonId: r.taxon_id,
      source: "wildnet",
      conSig: Boolean(r.con_sig),
      sensitive: Boolean(r.sensitive),
      nca: r.nca_code ? { code: r.nca_code, label: r.nca_desc || r.nca_code } : null,
      epbc: r.epbc_code ? { code: r.epbc_code, label: r.epbc_desc || r.epbc_code } : null,
      establishment: r.establishment_code || null,
      wildnet: {
        confirmed: r.confirmed_sightings || 0,
        unconfirmed: r.unconfirmed_sightings || 0,
        lastSeen: r.date_last_seen || null,
      },
      _total: total,
    });
  }
  return species;
}

// ---------- 2. WildNet sighting records ------------------------------------

async function fetchWildNetSightings() {
  const base = `${WILDNET}/sightings?kingdom_name=Animalia` +
    `&central_point_latitude=${CENTRE.lat.toFixed(4)}&central_point_longitude=${CENTRE.lng.toFixed(4)}` +
    `&distance=${(RADIUS_M / 1000).toFixed(1)}&page_size=5000`;
  const all = [];
  let after = null;
  for (let page = 1; page <= 20; page++) {
    const rows = await getJSON(base + (after ? `&after_sighting_id=${after}` : ""));
    all.push(...rows);
    if (rows.length < 5000) break;
    after = Math.max(...rows.map(r => r.sighting_id));
  }
  return all;
}

/** Normalise a raw WildNet sighting into the app's record shape. */
function normaliseWildNet(r) {
  const key = speciesKey(r.scientific_name);
  if (!key || r.latitude == null || r.longitude == null) return null;
  return {
    id: "wn" + r.sighting_id,
    src: "wn",
    key,
    lat: +r.latitude.toFixed(5),
    lng: +r.longitude.toFixed(5),
    date: r.sighting_date || r.site_visit_start_date || null,
    prec: r.precision == null ? null : Number(r.precision),
    vet: r.vet || null,
    restricted: Boolean(r.restricted_record),
    class: r.class_name,
    sci: r.scientific_name,
    common: r.accepted_common_name,
  };
}

// ---------- 3. ALA occurrence records --------------------------------------

async function fetchAlaOccurrences() {
  const since = new Date();
  since.setMonth(since.getMonth() - ALA_MONTHS);
  const fq = [
    "kingdom:Animalia",
    "spatiallyValid:true",
    `classs:(${CLASSES.join(" OR ")})`,
    `eventDate:[${since.toISOString().slice(0, 10)}T00:00:00Z TO *]`,
    `coordinateUncertaintyInMeters:[0 TO ${MAX_PRECISION_M}]`,
  ].map(f => "fq=" + encodeURIComponent(f)).join("&");
  const fl = "id,uuid,species,scientificName,vernacularName,classs,decimalLatitude,decimalLongitude," +
    "eventDate,coordinateUncertaintyInMeters,dataResourceName,identificationVerificationStatus,sensitive";
  const base = `${ALA}/occurrences/occurrences/search?q=*:*&lat=${CENTRE.lat}&lon=${CENTRE.lng}` +
    `&radius=${RADIUS_M / 1000}&${fq}&fl=${fl}&pageSize=100&sort=eventDate&dir=desc`;
  const all = [];
  let total = Infinity;
  for (let start = 0; start < total && start < 20000; start += 100) {
    const page = await getJSON(`${base}&startIndex=${start}`);
    total = page.totalRecords || 0;
    all.push(...(page.occurrences || []));
    if ((page.occurrences || []).length === 0) break;
    process.stdout.write(`\r   ALA occurrences: ${all.length}/${total}`);
  }
  process.stdout.write("\n");
  return all;
}

/** Normalise a raw ALA occurrence into the app's record shape. */
function normaliseAla(o) {
  const key = speciesKey(o.species || o.scientificName);
  if (!key || o.decimalLatitude == null || o.decimalLongitude == null) return null;
  return {
    id: "ala" + (o.uuid || o.id),
    src: "ala",
    key,
    lat: +Number(o.decimalLatitude).toFixed(5),
    lng: +Number(o.decimalLongitude).toFixed(5),
    date: o.eventDate ? isoDate(o.eventDate) : null,
    prec: o.coordinateUncertaintyInMeters == null ? null : Number(o.coordinateUncertaintyInMeters),
    grade: o.identificationVerificationStatus || null,
    ds: o.dataResourceName || null,
    sensitive: Boolean(o.sensitive),
    class: o.classs,
    sci: o.species || o.scientificName,
    common: o.vernacularName || null,
  };
}

// ---------- 4. ALA images (bulk name lookup) -------------------------------

async function lookupAlaImages(speciesList) {
  const images = {};
  const names = speciesList.map(s => s.sci);

  // Pass 1: bulk name lookup, 50 names per request.
  for (let i = 0; i < names.length; i += 50) {
    const batch = names.slice(i, i + 50);
    let result;
    try {
      result = await getJSON(`${ALA}/species/species/lookup/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: batch, vernacular: true }),
      });
    } catch (err) {
      log("   bulk lookup failed for a batch: " + err.message);
      continue;
    }
    result.forEach((hit, idx) => {
      const sp = speciesList[i + idx];
      if (!hit) return;
      if (!sp.common && hit.commonNameSingle) sp.common = hit.commonNameSingle;
      if (hit.thumbnailUrl || hit.imageUrl) {
        images[sp.key] = {
          thumb: hit.thumbnailUrl || hit.imageUrl,
          large: hit.imageUrl || hit.largeImageUrl || hit.thumbnailUrl,
          guid: hit.guid || null,
          from: "taxon",
        };
      }
    });
    process.stdout.write(`\r   ALA images (bulk): ${Object.keys(images).length}/${Math.min(i + 50, names.length)} species checked`);
  }
  process.stdout.write("\n");

  // Pass 2: the bulk lookup misses names that ALA spells with a subgenus,
  // e.g. "Anthus (Anthus) novaeseelandiae". The species search finds those.
  // Pass 3: if the taxon page has no image, use the first occurrence photo.
  const missing = speciesList.filter(sp => !images[sp.key]);
  let done = 0;
  for (const sp of missing) {
    try {
      const q = encodeURIComponent(sp.sci);
      const res = await getJSON(`${ALA}/species/search?q=${q}&fq=idxtype:TAXON&pageSize=5`);
      const hits = (res.searchResults && res.searchResults.results) || [];
      const hit = hits.find(h => h.rank === "species" && (h.thumbnailUrl || h.imageUrl)) ||
                  hits.find(h => h.thumbnailUrl || h.imageUrl);
      if (hit) {
        if (!sp.common && hit.commonNameSingle) sp.common = hit.commonNameSingle;
        images[sp.key] = {
          thumb: hit.thumbnailUrl || hit.imageUrl, large: hit.imageUrl || hit.thumbnailUrl,
          guid: hit.guid || null, from: "taxon",
        };
      } else {
        const occ = await getJSON(`${ALA}/occurrences/occurrences/search?q=species:%22${q}%22` +
          `&fq=multimedia:Image&fq=country:Australia&pageSize=1`);
        const o = (occ.occurrences || [])[0];
        if (o && (o.thumbnailUrl || o.imageUrl)) {
          images[sp.key] = {
            thumb: o.thumbnailUrl || o.smallImageUrl || o.imageUrl,
            large: o.largeImageUrl || o.imageUrl || o.thumbnailUrl,
            guid: null, from: "occurrence", license: o.license || null,
          };
        }
      }
    } catch (err) {
      // leave the species without an image; the app shows a silhouette
    }
    done++;
    process.stdout.write(`\r   ALA images (fallback): ${done}/${missing.length} checked, ${Object.keys(images).length} total`);
  }
  process.stdout.write("\n");
  return images;
}

async function downloadThumbnails(images) {
  const dir = path.join(OUT_DIR, "img");
  await fs.mkdir(dir, { recursive: true });
  const keys = Object.keys(images);
  let done = 0, failed = 0;
  // 6 downloads at a time
  const queue = keys.slice();
  async function worker() {
    while (queue.length) {
      const key = queue.shift();
      const file = path.join(dir, key + ".jpg");
      try {
        await fs.access(file);           // already cached
        images[key].local = "data/img/" + key + ".jpg";
      } catch {
        try {
          const res = await fetch(images[key].thumb);
          if (!res.ok) throw new Error("HTTP " + res.status);
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < 500) throw new Error("empty image");
          await fs.writeFile(file, buf);
          images[key].local = "data/img/" + key + ".jpg";
        } catch (err) {
          failed++;
        }
      }
      done++;
      process.stdout.write(`\r   thumbnails: ${done}/${keys.length} (${failed} failed)`);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  process.stdout.write("\n");
}

// ---------- bundle -----------------------------------------------------------

/** Browsers block fetch() of local files on file://, so also ship the data as a script. */
async function writeBundle(meta, species, sightings, images) {
  const js = "/* Generated by scripts/fetch-data.mjs on " + meta.fetchedAt + ". Do not edit by hand. */\n" +
    "window.WN_CACHED = " + JSON.stringify({ meta, species, sightings, images }) + ";\n";
  await fs.writeFile(path.join(OUT_DIR, "cached.js"), js);
}

async function bundleOnly() {
  const read = async (f) => JSON.parse(await fs.readFile(path.join(OUT_DIR, f), "utf8"));
  const [meta, species, sightings, images] = await Promise.all(["meta.json", "species.json", "sightings.json", "images.json"].map(read));
  await writeBundle(meta, species, sightings, images);
  log("data/cached.js rebuilt from the JSON files");
}

// ---------- main -----------------------------------------------------------

async function main() {
  if (args["bundle-only"]) return bundleOnly();
  log(`Wild Neighbours data fetch\n  centre ${CENTRE.lat}, ${CENTRE.lng}  radius ${RADIUS_M} m  ALA window ${ALA_MONTHS} months\n`);
  await fs.mkdir(OUT_DIR, { recursive: true });

  log("1. WildNet species list");
  const species = await fetchWildNetSpecies();
  log(`   ${species.size} vertebrate species`);

  log("2. WildNet sightings");
  const wnRaw = await fetchWildNetSightings();
  const wnAll = wnRaw.map(normaliseWildNet).filter(Boolean).filter(r => CLASSES.includes(r.class));
  log(`   ${wnRaw.length} records, ${wnAll.length} vertebrate records with coordinates`);

  log("3. ALA occurrences");
  const alaRaw = await fetchAlaOccurrences();
  const alaAll = alaRaw.map(normaliseAla).filter(Boolean);

  // Species seen in ALA but missing from the WildNet list get a catalogue entry too.
  let added = 0;
  for (const r of alaAll) {
    if (species.has(r.key) || !CLASSES.includes(r.class)) continue;
    species.set(r.key, {
      key: r.key, sci: binomial(r.sci), common: r.common ? titleCase(r.common) : null,
      class: r.class, group: CLASS_GROUP[r.class], family: null, taxonId: null,
      source: "ala", conSig: false, sensitive: false, nca: null, epbc: null,
      establishment: null, wildnet: null, _total: 0,
    });
    added++;
  }
  log(`   ${added} extra species found only in ALA records`);

  // Month histogram per species from every record we saw (any precision, any date)
  const months = {};
  for (const r of [...wnAll, ...alaAll]) {
    if (!r.date) continue;
    const m = Number(r.date.slice(5, 7)) - 1;
    if (!(m >= 0 && m < 12)) continue;
    (months[r.key] ||= Array(12).fill(0))[m]++;
  }
  for (const sp of species.values()) {
    sp.months = months[sp.key] || Array(12).fill(0);
    sp.recordCount = sp.months.reduce((a, b) => a + b, 0);
    delete sp._total;
  }

  // Records that may place a zone: known precision within 1 km, not restricted,
  // not a sensitive species (their coordinates are deliberately fuzzy at source).
  const sensitiveKeys = new Set([...species.values()].filter(s => s.sensitive).map(s => s.key));
  const usable = [...wnAll, ...alaAll].filter(r =>
    r.prec != null && r.prec <= MAX_PRECISION_M && !r.restricted && !r.sensitive &&
    !sensitiveKeys.has(r.key) && r.date && species.has(r.key));
  // Slim the records for the browser.
  // Dedupe by id: the ALA index can shift between pages, and WildNet lists a
  // sighting once per site visit.
  const seen = new Set();
  const unique = usable.filter(r => (seen.has(r.id) ? false : seen.add(r.id)));
  const sightings = unique.map(r => {
    const o = { id: r.id, src: r.src, key: r.key, lat: r.lat, lng: r.lng, date: r.date, prec: r.prec };
    if (r.vet) o.vet = r.vet;
    if (r.grade) o.grade = r.grade;
    if (r.ds) o.ds = r.ds;
    return o;
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  log(`   ${sightings.length} precise records kept for zone building (WildNet ${sightings.filter(s => s.src === "wn").length}, ALA ${sightings.filter(s => s.src === "ala").length})`);

  log("4. ALA reference images");
  const speciesList = [...species.values()].sort((a, b) => (a.common || a.sci).localeCompare(b.common || b.sci));
  const images = await lookupAlaImages(speciesList);
  if (DOWNLOAD_IMAGES) await downloadThumbnails(images);

  log("5. Writing files");
  const meta = {
    app: "Wild Neighbours",
    fetchedAt: new Date().toISOString(),
    centre: CENTRE,
    radiusM: RADIUS_M,
    alaWindowMonths: ALA_MONTHS,
    maxPrecisionM: MAX_PRECISION_M,
    classes: CLASSES,
    counts: {
      species: speciesList.length,
      sightings: sightings.length,
      wildnetRaw: wnRaw.length,
      alaRaw: alaRaw.length,
      images: Object.keys(images).length,
      localThumbnails: Object.values(images).filter(i => i.local).length,
    },
    sources: {
      wildnet: { name: "Qld WildNet Data API", url: WILDNET, cors: false },
      ala: { name: "Atlas of Living Australia", url: ALA, cors: true },
    },
  };
  await fs.writeFile(path.join(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));
  await fs.writeFile(path.join(OUT_DIR, "species.json"), JSON.stringify(speciesList));
  await fs.writeFile(path.join(OUT_DIR, "sightings.json"), JSON.stringify(sightings));
  await fs.writeFile(path.join(OUT_DIR, "images.json"), JSON.stringify(images));
  await writeBundle(meta, speciesList, sightings, images);
  log(`   done -> ${OUT_DIR}\n`);
  log(JSON.stringify(meta.counts, null, 2));
}

main().catch(err => { console.error("\nFetch failed:", err.message); process.exit(1); });
