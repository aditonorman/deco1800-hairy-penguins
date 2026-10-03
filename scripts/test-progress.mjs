#!/usr/bin/env node
/**
 * Command-line checks for the progression engine (js/progress.js):
 * badge catalogue, stats, streaks, seasons, XP, levels and friend cards.
 * Run:  node scripts/test-progress.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CFG = require(path.join(root, "js/config.js"));
global.WN_CONFIG = CFG;
global.WN_UTIL = require(path.join(root, "js/util.js"));
const P = require(path.join(root, "js/progress.js"));
const ICONS = require(path.join(root, "js/icons.js"));

let failed = 0;
function check(name, ok, detail) {
	console.log((ok ? "  ok   " : "  FAIL ") + name + (detail !== undefined ? "  (" + detail + ")" : ""));
	if (!ok) failed++;
}

console.log("catalogue");
check("53 badges", P.BADGES.length === 53, P.BADGES.length);
check("badge ids unique", new Set(P.BADGES.map(b => b.id)).size === P.BADGES.length);
check("every badge has a known category", P.BADGES.every(b => P.CATEGORIES.some(c => c.id === b.cat)));
check("every badge icon exists", P.BADGES.every(b => ICONS.names.includes(b.icon)), P.BADGES.filter(b => !ICONS.names.includes(b.icon)).map(b => b.icon).join(","));
check("every rarity has an XP bonus", P.BADGES.every(b => CFG.XP.badge[b.rarity] > 0));
check("secret badges have hints", P.BADGES.filter(b => b.secret).every(b => b.hint));

console.log("\nstreaks and seasons");
check("no days -> 0", P.streaks([], "2026-10-03").best === 0);
const s1 = P.streaks(["2026-10-01", "2026-10-02", "2026-10-03", "2026-09-20"], "2026-10-03");
check("best streak 3", s1.best === 3, s1.best);
check("current streak 3 (ends today)", s1.current === 3, s1.current);
check("current streak survives until tomorrow", P.streaks(["2026-10-01", "2026-10-02"], "2026-10-03").current === 2);
check("current streak resets after a missed day", P.streaks(["2026-10-01"], "2026-10-03").current === 0);
check("duplicate days ignored", P.streaks(["2026-10-01", "2026-10-01", "2026-10-02"], "2026-10-02").best === 2);
check("month boundary counts", P.streaks(["2026-09-30", "2026-10-01"], "2026-10-01").best === 2);
check("seasons (southern hemisphere)", [0, 3, 6, 9].map(P.seasonOf).join() === "summer,autumn,winter,spring");

console.log("\nstats and badges");
const index = new Map([
	["phascolarctos-cinereus", { group: "mammal", threatened: true, rarity: "common" }],
	["dacelo-novaeguineae", { group: "bird", threatened: false, rarity: "common" }],
	["intellagama-lesueurii", { group: "reptile", threatened: false, rarity: "common" }],
	["litoria-caerulea", { group: "frog", threatened: false, rarity: "uncommon" }],
	["rare-thing", { group: "bird", threatened: false, rarity: "veryrare" }]
]);
const at = (h) => { const d = new Date(2026, 9, 3, h, 15); return d.toISOString(); };
const input = {
	entries: {
		"phascolarctos-cinereus": { tier: 3, sighted: true, unlockedAt: at(9), tierAt: at(10), hasPhoto: true },
		"dacelo-novaeguineae": { tier: 2, signs: true, unlockedAt: at(21), tierAt: at(21) },
		"intellagama-lesueurii": { tier: 1, unlockedAt: at(6), tierAt: at(6) },
		"litoria-caerulea": { tier: 3, signs: true, sighted: true, unlockedAt: at(12), tierAt: at(12) },
		"rare-thing": { tier: 1, unlockedAt: at(12), tierAt: at(12) }
	},
	stats: {
		zonesVisited: ["a", "b", "c"],
		zoneVisits: { a: { lat: -27.47, lng: 152.95 }, b: { lat: -27.471, lng: 152.951 }, c: { lat: -27.55, lng: 153.05 } },
		distanceM: 1234, days: ["2026-10-02", "2026-10-03"]
	},
	speciesIndex: index, friendsCount: 1, today: "2026-10-03"
};
const st = P.computeStats(input);
check("species 5", st.species === 5, st.species);
check("sighted 2", st.sighted === 2, st.sighted);
check("signs 2 (signs then sighted still counts)", st.signs === 2, st.signs);
check("all four groups covered", st.groupsCovered === 4, st.groupsCovered);
check("threatened 1", st.threatened === 1);
check("icons 3 (koala, kookaburra, water dragon, green tree frog = 4)", st.icons === 4, st.icons);
check("koala sighted", st.koalaSighted === 1);
check("very rare 1", st.veryRare === 1);
check("photos 1", st.photos === 1);
check("areas 2 (zones 150 m apart count once)", st.areas === 2, st.areas);
check("areas: 3 spread-out points", P.countAreas([{ lat: -27.47, lng: 152.95 }, { lat: -27.55, lng: 153.05 }, { lat: -27.38, lng: 153.08 }]) === 3);
check("distance 1.2 km", st.distanceKm === 1.2, st.distanceKm);
check("night owl (9 pm unlock)", st.night === 1);
check("early bird (6 am unlock)", st.early === 1);
const ev = P.evaluate(st);
const eligible = new Set(ev.filter(e => e.eligible).map(e => e.badge.id));
["col-1", "all-4", "see-1", "sign-1", "zone-1", "dist-1", "thr-1", "koala", "rare-1", "pic-1", "friend-1", "night-owl", "early-bird"].forEach(id =>
	check("eligible: " + id, eligible.has(id)));
["col-10", "see-10", "zone-5", "streak-3", "icon-5", "area-3"].forEach(id => check("not yet: " + id, !eligible.has(id)));
const z5 = ev.find(e => e.badge.id === "zone-5");
check("zone-5 progress 3/5", z5.value === 3 && Math.abs(z5.progress - 0.6) < 1e-9);

console.log("\nXP and levels");
check("threshold L1 = 0", P.threshold(1) === 0);
check("threshold L2 = 100", P.threshold(2) === 100);
check("threshold L3 = 250", P.threshold(3) === 250);
check("threshold L5 = 700", P.threshold(5) === 700);
check("level for 0 XP", P.levelFor(0).level === 1);
check("level for 249 XP = 2", P.levelFor(249).level === 2);
check("level for 250 XP = 3", P.levelFor(250).level === 3);
check("rank at 3 = Trail Scout", P.levelFor(260).rank === "Trail Scout");
const xp = P.xpFor(input, st, ["col-1", "koala"]);
// tiers 60+30+10+60+10 = 170, rarity 0+0+0+5+30 = 35, zones 75, distance 12*5 = 60, photo 15, badges 25+100
check("XP adds up", xp === 170 + 35 + 75 + 60 + 15 + 125, xp);
const nu = P.nextUp(ev, {}, 3);
check("next up has 3 non-secret badges", nu.length === 3 && nu.every(e => !e.badge.secret));

console.log("\nfriend cards");
const card = { v: 1, id: "abc123", n: "Kookaburra Kid", x: 420, s: 23, t3: 2, t2: 1, z: 5, d: 1250, st: 3, a: 2, b: ["col-1", "zone-1"], g: [1, 18, 2, 2], u: "2026-10-03" };
const code = P.encodeCard(card);
check("code is URL-safe", /^[A-Za-z0-9_-]+$/.test(code), code.length + " chars");
check("round trip", JSON.stringify(P.decodeCard(code)) === JSON.stringify(card));
const uni = P.decodeCard(P.encodeCard(Object.assign({}, card, { n: "Ránger Zoë" })));
check("unicode nickname survives", uni && uni.n === "Ránger Zoë");
check("extract from full link", P.extractCode("https://x.uqcloud.net/#friend=" + code) === code);
check("extract bare code", P.extractCode("  " + code + " ") === code);
check("garbage rejected", P.decodeCard("not-a-real-code-at-all-xx") === null);
const evil = P.decodeCard(P.encodeCard({ v: 1, id: "zzz999", n: "<script>alert(1)</script>Bob", x: -5, s: 1e12, b: ["col-1", "made-up", "col-1"], g: [1] }));
check("hostile card sanitised", evil && !/[<>]/.test(evil.n) && evil.x === 0 && evil.s === 5000 && evil.b.join() === "col-1" && evil.g.join() === "0,0,0,0", evil && JSON.stringify(evil));
check("bad id rejected", P.decodeCard(P.encodeCard({ v: 1, id: "../etc", n: "x" })) === null);

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
