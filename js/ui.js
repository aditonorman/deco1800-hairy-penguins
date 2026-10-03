/* ==========================================================================
   Wild Neighbours - shared UI pieces
   --------------------------------------------------------------------------
   Tabs, notices, toasts, animated counters, the header level chip, bottom
   sheets (with swipe-to-close), the zone sheet, the species entry view, the
   safety banner, and the celebrations (species unlocks, badges, level-ups).
   Other modules call into WN_UI; WN_UI never fetches data itself.
   ========================================================================== */

const WN_UI = (function () {
	"use strict";

	const U = WN_UTIL;
	const $ = (sel, root) => (root || document).querySelector(sel);
	const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
	const I = (name, cls, label) => WN_ICONS.svg(name, cls, label);
	const reducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const isPhone = () => !window.matchMedia || window.matchMedia("(max-width: 899px)").matches;
	// Haptics on Android. Browsers only allow vibration after the user has tapped the page.
	const vibrate = (pattern) => {
		try {
			const ua = navigator.userActivation;
			if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(pattern);
		} catch (err) { /* not supported */ }
	};

	/* ---- tabs -------------------------------------------------------------- */

	const TABS = ["map", "pokedex", "badges"];
	const VIEWS = { map: "view-map", pokedex: "view-pokedex", badges: "view-badges" };
	let currentTab = "map";
	const tabListeners = [];

	function showTab(tab) {
		if (!VIEWS[tab]) tab = "map";
		const changed = tab !== currentTab;
		currentTab = tab;
		Object.keys(VIEWS).forEach(t => {
			const el = $("#" + VIEWS[t]);
			if (t === tab) {
				if (el.hidden) {
					el.hidden = false;
					el.classList.remove("is-entering");
					void el.offsetWidth;                // restart the entrance animation
					el.classList.add("is-entering");
				}
			} else {
				el.hidden = true;
			}
		});
		$$(".tabbar button").forEach(b => {
			const on = b.dataset.tab === tab;
			b.classList.toggle("is-active", on);
			if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
		});
		$("#tabbar").style.setProperty("--i", TABS.indexOf(tab));
		document.body.dataset.tab = tab;
		tabListeners.forEach(fn => fn(tab, changed));
	}
	function onTab(fn) { tabListeners.push(fn); }
	function tab() { return currentTab; }

	/* ---- notice + toast ------------------------------------------------------ */

	function notice(text, kind) {
		const el = $("#notice");
		if (!text) { el.hidden = true; return; }
		$("#notice-text").textContent = text;
		el.classList.toggle("is-error", kind === "error");
		el.hidden = false;
	}
	$("#notice-close").addEventListener("click", () => notice(null));

	let toastTimer = null;
	function toast(text, ms) {
		const el = $("#toast");
		el.hidden = true;
		el.textContent = text;
		void el.offsetWidth;
		el.hidden = false;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => { el.hidden = true; }, ms || 2400);
	}

	/* ---- animated counters ------------------------------------------------------ */

	/** Count an element up (or down) to a new value, formatting each frame. */
	function countTo(el, to, format) {
		const from = Number(el.dataset.value || 0);
		el.dataset.value = to;
		if (from === to || reducedMotion()) { el.textContent = format(to); return; }
		const start = performance.now(), dur = 700;
		const step = (now) => {
			const t = Math.min(1, (now - start) / dur);
			const eased = 1 - Math.pow(1 - t, 3);
			el.textContent = format(from + (to - from) * eased);
			if (t < 1) requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
		if (to > from) { el.classList.remove("bump-num"); void el.offsetWidth; el.classList.add("bump-num"); }
	}

	function renderStats() {
		const st = WN_STORE.stats();
		countTo($("#stat-species"), WN_STORE.unlockedCount(), n => String(Math.round(n)));
		$("#stat-species-of").textContent = "/" + WN_DATA.allSpecies().length;
		countTo($("#stat-zones"), st.zonesVisited.length, n => String(Math.round(n)));
		countTo($("#stat-distance"), Math.round(st.distanceM), n => U.formatDistance(n));
	}

	/** Header level chip + unseen-badge dots. */
	let shownLevel = null;
	function renderLevel(level, unseen) {
		const chip = $("#level-chip");
		$("#level-ring").style.strokeDashoffset = String(100 - Math.round(level.progress * 100));
		$("#level-num").textContent = level.level;
		$("#level-label").textContent = "Level " + level.level;
		$("#level-rank").textContent = level.rank;
		chip.setAttribute("aria-label", "Level " + level.level + ", " + level.rank + ". Open badges");
		$("#level-dot").hidden = !unseen;
		$("#badges-dot").hidden = !unseen;
		if (shownLevel !== null && level.level > shownLevel) { chip.classList.remove("is-bump"); void chip.offsetWidth; chip.classList.add("is-bump"); }
		shownLevel = level.level;
	}

	/* ---- small badges --------------------------------------------------------------- */

	/** Conservation status badge from Qld NCA / EPBC codes. */
	function statusBadge(species) {
		const nca = species.nca, epbc = species.epbc;
		if (species.threatened) {
			const label = (nca && nca.label) || (epbc && epbc.label) || "Threatened";
			return '<span class="status is-threatened" title="Queensland conservation status">' + U.esc(label) + "</span>";
		}
		if (nca && nca.code === "NT") return '<span class="status is-nt">Near threatened</span>';
		if (nca && nca.code === "SL") return '<span class="status is-special">Special least concern</span>';
		if (nca && nca.code === "C") return '<span class="status">Least concern</span>';
		return '<span class="status" title="No Queensland conservation listing found">Not listed</span>';
	}

	function tierBadge(tier) {
		const t = WN_CONFIG.TIERS[tier];
		if (!t) return "";
		return '<span class="tier tier-' + tier + '">' + I(t.icon) + t.name + "</span>";
	}

	function typeChip(species) {
		return '<span class="type-chip t-' + species.group + '">' + I(WN_CONFIG.GROUP_ICONS[species.group] || "paw") + (WN_CONFIG.GROUP_LABELS[species.group] || "Animal") + "</span>";
	}

	function rarityPips(species) {
		const r = WN_DATA.rarityInfo(species.rarity);
		let html = '<span class="pips" title="' + r.label + '" aria-label="Rarity: ' + r.label + '">';
		for (let i = 1; i <= 4; i++) html += '<i class="' + (i <= r.pips ? "on" : "") + '"></i>';
		return html + "</span>";
	}

	function pad(n) { return String(n || 0).padStart(3, "0"); }

	/** <img> for a species, or a group silhouette if there is no reference image. */
	function speciesImg(species, size, extraClass) {
		const src = WN_DATA.imageFor(species.key, size);
		if (!src) return groupIcon(species);
		const info = WN_DATA.imageInfo(species.key) || {};
		// If the cached copy is broken, fall back to the ALA copy, then to a silhouette.
		const fallback = (src === info.local && info.thumb) ? info.thumb : "";
		return '<img src="' + U.esc(src) + '" alt="' + U.esc(species.displayName) + '" loading="lazy" decoding="async" class="fade-img ' + (extraClass || "") + '"' +
			' data-fallback="' + U.esc(fallback) + '" data-group="' + U.esc(species.group) + '">';
	}
	/** Second-choice image URL: the ALA copy when the first choice was the cached copy. */
	function fallbackFor(key, src) {
		const info = WN_DATA.imageInfo(key) || {};
		return src === info.local && info.thumb ? info.thumb : "";
	}
	function groupIcon(species) {
		return '<span class="group-icon t-' + species.group + '" aria-hidden="true">' + I(WN_CONFIG.GROUP_ICONS[species.group] || "info") + "</span>";
	}
	// Images fade in once loaded; load events do not bubble, so listen in the capture phase.
	document.addEventListener("load", (e) => {
		if (e.target instanceof HTMLImageElement && e.target.classList.contains("fade-img")) e.target.classList.add("is-loaded");
	}, true);
	document.addEventListener("error", (e) => {
		const img = e.target;
		if (!(img instanceof HTMLImageElement)) return;
		if (img.dataset.optional) { img.remove(); return; }       // nice-to-have image: just drop it
		if (!img.hasAttribute("data-fallback")) return;
		const next = img.getAttribute("data-fallback");
		if (next) { img.setAttribute("data-fallback", ""); img.src = next; return; }
		const icon = document.createElement("span");
		// keep context classes (celebrate-img, stack-img) so the silhouette sits where the photo was
		icon.className = (img.className.replace(/\b(fade-img|is-loaded)\b/g, "") + " group-icon t-" + img.dataset.group).trim();
		icon.setAttribute("aria-hidden", "true");
		icon.innerHTML = I(WN_CONFIG.GROUP_ICONS[img.dataset.group] || "info");
		img.replaceWith(icon);
	}, true);

	/** A medal for a badge. opts: { earned, progress (0..1), shine } */
	function medal(badge, opts) {
		const o = opts || {};
		const earned = Boolean(o.earned);
		const icon = earned || !badge.secret ? badge.icon : "lock";
		let ring = "";
		if (!earned && o.progress > 0) {
			const pct = Math.round(o.progress * 100);
			ring = '<svg class="medal-progress" viewBox="0 0 36 36" aria-hidden="true"><circle class="track" cx="18" cy="18" r="16.5"/>' +
				'<circle class="fill" cx="18" cy="18" r="16.5" pathLength="100" stroke-dasharray="100" stroke-dashoffset="' + (100 - pct) + '"/></svg>';
		}
		return '<span class="medal ' + (earned ? badge.rarity : "is-locked") + '">' + ring + (earned && o.shine ? '<span class="medal-shine"></span>' : "") + I(icon) + "</span>";
	}

	/** Coloured initials avatar; the colour pair comes from the id so it stays stable. */
	const AVATAR_PAIRS = [["#f3cd52", "#e8a94b"], ["#ec8fb1", "#e0764a"], ["#5aaee0", "#52c3a4"], ["#a48be8", "#ec8fb1"], ["#52c3a4", "#8fae4e"], ["#e8a94b", "#e0764a"], ["#5aaee0", "#a48be8"]];
	function avatar(name, id, cls) {
		const words = String(name || "?").trim().split(/\s+/);
		const initials = ((words[0] || "?")[0] + (words[1] ? words[1][0] : "")).toUpperCase();
		const pair = AVATAR_PAIRS[U.hash(String(id || name)) % AVATAR_PAIRS.length];
		return '<span class="avatar ' + (cls || "") + '" style="--a1:' + pair[0] + ";--a2:" + pair[1] + '" aria-hidden="true">' + U.esc(initials) + "</span>";
	}

	/* ---- sheets ------------------------------------------------------------------------ */

	const backdrop = $("#backdrop");
	const MODAL_SHEETS = new Set(["settings-sheet", "badge-sheet", "compare-sheet", "friend-sheet"]);
	let openSheets = [];
	const closeHandlers = {};

	function openSheet(id) {
		const el = $("#" + id);
		el.classList.remove("is-closing");
		el.style.transform = "";
		el.hidden = false;
		openSheets = openSheets.filter(x => x !== id).concat(id);
		updateBackdrop();
		return el;
	}
	function closeSheet(id) {
		const el = $("#" + id);
		if (el.hidden) return;
		openSheets = openSheets.filter(x => x !== id);
		updateBackdrop();
		const done = () => {
			if (openSheets.includes(id)) return;            // re-opened meanwhile
			el.hidden = true;
			el.classList.remove("is-closing");
			el.style.transform = "";
			if (closeHandlers[id]) closeHandlers[id]();
		};
		if (reducedMotion()) { done(); return; }
		el.classList.add("is-closing");
		setTimeout(done, 230);
	}
	function onSheetClose(id, fn) { closeHandlers[id] = fn; }
	function updateBackdrop() { backdrop.hidden = !openSheets.some(id => MODAL_SHEETS.has(id)); }
	backdrop.addEventListener("click", () => {
		const top = openSheets.slice().reverse().find(id => MODAL_SHEETS.has(id));
		if (top) closeSheet(top);
	});
	document.addEventListener("click", (e) => {
		const btn = e.target.closest("[data-close]");
		if (btn && btn.closest(".sheet")) closeSheet(btn.closest(".sheet").id);
	});

	/** Swipe a sheet down to close it (phones only). */
	function enableDrag(el, handleSelector, onClose) {
		let startY = 0, dy = 0, startT = 0, dragging = false;
		el.addEventListener("pointerdown", (e) => {
			if (!isPhone() || (e.pointerType === "mouse" && e.button !== 0)) return;
			if (!e.target.closest(handleSelector) || e.target.closest("button, a, input, select, textarea")) return;
			dragging = true; startY = e.clientY; dy = 0; startT = performance.now();
			el.classList.add("is-dragging");
			try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
		});
		el.addEventListener("pointermove", (e) => {
			if (!dragging) return;
			dy = Math.max(0, e.clientY - startY);
			el.style.transform = "translateY(" + dy + "px)";
		});
		const end = () => {
			if (!dragging) return;
			dragging = false;
			el.classList.remove("is-dragging");
			const velocity = dy / Math.max(1, performance.now() - startT);
			if (dy > 110 || (dy > 30 && velocity > 0.6)) { onClose(); return; }
			el.style.transition = "transform 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)";
			el.style.transform = "";
			setTimeout(() => { el.style.transition = ""; }, 320);
		};
		el.addEventListener("pointerup", end);
		el.addEventListener("pointercancel", end);
	}
	$$(".sheet").forEach(sheet => enableDrag(sheet, ".sheet-handle, .sheet-head", () => closeSheet(sheet.id)));

	/* ---- zone sheet ------------------------------------------------------------------------ */

	const zoneSheet = $("#zone-sheet");
	let sheetZone = null;
	let sheetActions = null;  // { canReport, onReport(key, tier, zone), hint }

	/**
	 * Show the expected animals for a zone.
	 * @param {Object} zone      built by WN_ZONES
	 * @param {Object} actions   { canReport, onReport, hint }
	 */
	function showZone(zone, actions) {
		sheetZone = zone;
		sheetActions = actions || null;
		renderZoneSheet();
		zoneSheet.classList.toggle("is-threatened", Boolean(zone.threatened));
		zoneSheet.classList.toggle("is-visited", WN_STORE.stats().zonesVisited.includes(zone.id));
		openSheet("zone-sheet");
		$(".sheet-body", zoneSheet).scrollTop = 0;
	}
	function refreshZoneSheet() { if (!zoneSheet.hidden && sheetZone) renderZoneSheet(); }
	function hideZone() { closeSheet("zone-sheet"); }
	onSheetClose("zone-sheet", () => { sheetZone = null; });
	function currentZone() { return zoneSheet.hidden ? null : sheetZone; }

	function renderZoneSheet() {
		const zone = sheetZone;
		$("#zone-title").textContent = zone.name;
		$("#zone-kicker").textContent = zone.threatened ? "Habitat zone · threatened species" : "Habitat zone";
		const hint = $("#zone-hint");
		hint.hidden = !(sheetActions && sheetActions.hint);
		hint.innerHTML = sheetActions && sheetActions.hint ? I("pin") + "<span>" + U.esc(sheetActions.hint) + "</span>" : "";
		const src = [];
		if (zone.sources.wn) src.push("WildNet " + zone.sources.wn);
		if (zone.sources.ala) src.push("ALA " + zone.sources.ala);
		$("#zone-meta").textContent = zone.speciesCount + " species from " + zone.count + " records (" + src.join(", ") + ") · latest " + U.ago(zone.lastDate);
		const canReport = Boolean(sheetActions && sheetActions.canReport);
		$("#zone-species").innerHTML = zone.species.map((s, i) => {
			const sp = WN_DATA.getSpecies(s.key);
			if (!sp) return "";
			const entry = WN_STORE.getEntry(s.key);
			const locked = !entry;
			return '<li class="species-row" style="--d:' + Math.min(i * 35, 400) + 'ms">' +
				'<button type="button" class="species-thumb t-' + sp.group + (locked ? " is-locked" : "") + '" data-key="' + s.key + '" aria-label="Open ' + U.esc(sp.displayName) + '">' + speciesImg(sp, "thumb") + "</button>" +
				'<div class="species-main">' +
					'<div class="species-name"><button type="button" data-key="' + s.key + '">' + U.esc(sp.displayName) + "</button>" + (entry ? tierBadge(entry.tier) : "") + "</div>" +
					'<div class="species-sci">' + U.esc(sp.sci) + "</div>" +
					'<div class="species-meta">' + typeChip(sp) + statusBadge(sp) +
						'<span class="recency">recorded ' + U.esc(U.ago(s.lastDate)) + "</span>" +
						(sp.hint ? '<span class="hint">' + U.esc(sp.hint) + "</span>" : "") +
					"</div>" +
				"</div>" +
				(canReport ? '<div class="species-actions">' +
					(!entry || entry.tier < 3 ? '<button type="button" class="btn btn-primary btn-sm" data-report="3" data-key="' + s.key + '">' + I("binoculars") + "I spotted it</button>" : "") +
					(!entry || entry.tier < 2 ? '<button type="button" class="btn btn-leaf btn-sm" data-report="2" data-key="' + s.key + '">' + I("paw") + "Saw signs</button>" : "") +
				"</div>" : "") +
			"</li>";
		}).join("") || '<li class="empty">No species recorded here.</li>';
	}

	zoneSheet.addEventListener("click", (e) => {
		const report = e.target.closest("[data-report]");
		if (report && sheetActions && sheetActions.onReport) {
			sheetActions.onReport(report.dataset.key, Number(report.dataset.report), sheetZone);
			return;
		}
		const open = e.target.closest("[data-key]");
		if (open) showEntry(open.dataset.key);
	});

	/* ---- settings sheet ---------------------------------------------------------------------- */

	function showSettings(demo) {
		hideZone();
		const el = openSheet("settings-sheet");
		const body = $(".sheet-body", el);
		body.scrollTop = 0;
		if (demo) setTimeout(() => { body.scrollTop = $("#demo-group").offsetTop - 8; }, 60);
	}
	function hideSettings() { closeSheet("settings-sheet"); }

	/* ---- entry detail -------------------------------------------------------------------------- */

	const entryModal = $("#entry-modal");
	let entryKey = null;
	let entryActions = null;  // { canReport, onReport, zone }
	function setEntryActions(a) { entryActions = a; }

	async function showEntry(key) {
		const sp = WN_DATA.getSpecies(key);
		if (!sp) return;
		entryKey = key;
		const entry = WN_STORE.getEntry(key);
		const locked = !entry;
		const photo = entry && entry.hasPhoto ? await WN_PHOTOS.get(key) : null;
		const img = WN_DATA.imageInfo(key);
		const imgSrc = WN_DATA.imageFor(key, "large");
		const rarity = WN_DATA.rarityInfo(sp.rarity);

		// The small cached thumbnail shows instantly; the big ALA photo fades in over it when it arrives.
		const thumbSrc = WN_DATA.imageFor(key, "thumb");
		const showLarge = imgSrc && imgSrc !== thumbSrc;
		const alt = locked ? "" : U.esc(sp.displayName);
		const hero = '<div class="entry-hero t-' + sp.group + (locked ? " is-locked" : "") + '">' +
			(thumbSrc ? '<img class="hero-thumb" src="' + U.esc(thumbSrc) + '" alt="' + (showLarge ? "" : alt) + '" data-fallback="' + U.esc(fallbackFor(key, thumbSrc)) + '" data-group="' + sp.group + '">' : groupIcon(sp)) +
			(showLarge ? '<img class="fade-img hero-large" src="' + U.esc(imgSrc) + '" alt="' + alt + '" data-optional="1">' : "") +
			'<div class="entry-hero-top"><span class="dex-no">No. ' + pad(sp.no) + "</span></div>" +
			(img && !locked ? '<span class="entry-credit">Photo via ALA' + (img.from === "occurrence" ? " (observer)" : "") + "</span>" : "") +
			"</div>";

		const tiles = [];
		tiles.push('<div class="info-tile"><small>Rarity</small><b>' + rarityPips(sp) + " " + rarity.label + "</b></div>");
		tiles.push('<div class="info-tile"><small>Records</small><b>' + (sp.recordCount ? sp.recordCount.toLocaleString() + " around Brisbane" : "None lately") + "</b></div>");
		if (sp.hint) tiles.push('<div class="info-tile wide"><small>Activity</small><b>' + U.esc(sp.hint) + "</b></div>");
		if (!locked && sp.family) tiles.push('<div class="info-tile"><small>Family</small><b>' + U.esc(sp.family) + "</b></div>");
		if (!locked && sp.wildnet && sp.wildnet.lastSeen) tiles.push('<div class="info-tile"><small>Last WildNet record</small><b>' + U.formatDate(sp.wildnet.lastSeen) + "</b></div>");
		if (entry) {
			const where = (entry.zoneName ? " at " + entry.zoneName : "") + (entry.place ? ", " + entry.place : "");
			tiles.push('<div class="info-tile wide"><small>Unlocked</small><b>' + U.formatDate(entry.unlockedAt.slice(0, 10)) + U.esc(where) + "</b></div>");
			if (entry.tier === 3) tiles.push('<div class="info-tile"><small>Sighted</small><b>' + U.formatDate(entry.tierAt.slice(0, 10)) + "</b></div>");
			else if (entry.tier === 2) tiles.push('<div class="info-tile"><small>Signs seen</small><b>' + U.formatDate(entry.tierAt.slice(0, 10)) + "</b></div>");
		}

		let yours = "";
		if (entry) {
			yours = '<section class="your-photo"><h4>Your photo</h4>' + (photo
				? '<figure><img src="' + photo + '" alt="Your photo of ' + U.esc(sp.displayName) + '"></figure>'
				: '<button type="button" class="photo-slot" data-act="photo"><span class="slot-ico">' + I("camera") + "</span><span><b>Add your photo</b><small>Kept on this device. Never shared.</small></span></button>") +
				"</section>";
		}

		$("#entry-body").innerHTML = hero +
			'<div class="entry-content">' +
				'<div class="entry-chips">' + typeChip(sp) + (entry ? tierBadge(entry.tier) : '<span class="tier tier-1">' + I("lock") + "Hidden</span>") + statusBadge(sp) +
					(sp.sensitive ? '<span class="status is-nt">Location withheld</span>' : "") + "</div>" +
				'<h2 class="entry-title">' + (locked ? "???" : U.esc(sp.displayName)) + "</h2>" +
				'<p class="entry-sci">' + (locked ? "A " + (WN_CONFIG.GROUP_LABELS[sp.group] || "species").toLowerCase() + " you have not met yet" : U.esc(sp.sci)) + "</p>" +
				(locked ? '<p class="locked-note">' + I("pin") + "<span>Walk into a habitat zone where it has been recorded to unlock it. Then log a sighting or signs to level it up.</span></p>" : "") +
				'<div class="info-grid">' + tiles.join("") + "</div>" +
				yours +
				(entry ? '<p class="privacy-note">Your sightings and photos are personal records kept on this device. They are never shared or used to verify anything.</p>' : "") +
			"</div>";
		$("#entry-body").scrollTop = 0;

		const foot = [];
		if (entryActions && entryActions.canReport) {
			if (!entry || entry.tier < 3) foot.push('<button type="button" class="btn btn-primary" data-act="report" data-tier="3">' + I("binoculars") + "I spotted it</button>");
			if (!entry || entry.tier < 2) foot.push('<button type="button" class="btn btn-leaf" data-act="report" data-tier="2">' + I("paw") + "Saw signs</button>");
		}
		if (photo) {
			foot.push('<button type="button" class="btn btn-ghost" data-act="photo">' + I("camera") + "Replace photo</button>");
			foot.push('<button type="button" class="btn btn-danger" data-act="remove-photo">' + I("trash") + "Delete</button>");
		}
		$("#entry-foot").innerHTML = foot.join("");
		entryModal.hidden = false;
		$("#entry-close").focus({ preventScroll: true });
	}

	function hideEntry() { entryModal.hidden = true; entryKey = null; }

	entryModal.addEventListener("click", async (e) => {
		if (e.target === entryModal) { hideEntry(); return; }
		const btn = e.target.closest("[data-act]");
		if (!btn) return;
		const act = btn.dataset.act;
		if (act === "photo") {
			try {
				const url = await WN_PHOTOS.attach(entryKey);
				if (url) { toast("Photo saved to your entry"); showEntry(entryKey); document.dispatchEvent(new CustomEvent("wn:collection")); }
			} catch (err) { toast(err.message || "Could not read that photo"); }
		} else if (act === "remove-photo") {
			await WN_PHOTOS.remove(entryKey);
			toast("Photo deleted");
			showEntry(entryKey);
			document.dispatchEvent(new CustomEvent("wn:collection"));
		} else if (act === "report" && entryActions && entryActions.onReport) {
			entryActions.onReport(entryKey, Number(btn.dataset.tier), entryActions.zone);
		}
	});
	$("#entry-close").addEventListener("click", hideEntry);

	/* ---- safety banner ------------------------------------------------------------------------- */

	const banner = $("#safety-banner");
	let bannerResolve = null;
	/** Show the on-entry safety prompt; resolves when dismissed (or after 6 s). */
	function safetyBanner(zoneName) {
		$("#safety-title").textContent = "You have entered " + zoneName;
		banner.hidden = false;
		vibrate(25);
		return new Promise(resolve => {
			bannerResolve = resolve;
			setTimeout(() => { if (bannerResolve === resolve) dismissBanner(); }, 6000);
		});
	}
	function dismissBanner() {
		banner.hidden = true;
		if (bannerResolve) { const r = bannerResolve; bannerResolve = null; r(); }
	}
	$("#safety-ok").addEventListener("click", dismissBanner);

	/* ---- celebrations --------------------------------------------------------------------------- */

	const unlockModal = $("#unlock-modal");
	const unlockCard = $("#unlock-card");
	let unlockTimer = null;
	const queue = [];
	let busy = false;

	/** Burst of confetti from the middle of the screen. */
	function confetti(colors, count) {
		if (reducedMotion()) return;
		const box = document.createElement("div");
		box.className = "confetti";
		box.setAttribute("aria-hidden", "true");
		for (let i = 0; i < (count || 30); i++) {
			const p = document.createElement("i");
			const x = (Math.random() * 2 - 1) * 180;
			const y1 = -(90 + Math.random() * 180);
			const y2 = y1 + 240 + Math.random() * 160;
			p.style.cssText = "--x:" + x.toFixed(0) + "px;--y1:" + y1.toFixed(0) + "px;--y2:" + y2.toFixed(0) + "px;--r:" +
				((Math.random() * 2 - 1) * 600).toFixed(0) + "deg;--c:" + colors[i % colors.length] + ";--delay:" + (Math.random() * 140).toFixed(0) + "ms";
			box.appendChild(p);
		}
		document.body.appendChild(box);
		setTimeout(() => box.remove(), 2000);
	}

	/**
	 * Queue a species celebration. `items` is an array of { key, tier, photo? }.
	 * One entry: card flip with the species image. Many: "zone visited" summary.
	 */
	function celebrate(items, title) {
		if (!items || !items.length) return;
		queue.push({ kind: "species", items, title });
		if (!busy) next();
	}
	/** Queue a badge / level-up celebration: { badges, levelUp, gained }. */
	function celebrateProgress(p) {
		if ((!p.badges || !p.badges.length) && !p.levelUp) return;
		queue.push(Object.assign({ kind: "progress" }, p));
		if (!busy) next();
	}

	function speciesHtml(c) {
		const P = WN_CONFIG.PALETTE;
		if (c.items.length === 1) {
			const it = c.items[0];
			const sp = WN_DATA.getSpecies(it.key);
			const rarity = WN_DATA.rarityInfo(sp.rarity);
			const imgSrc = it.photo || WN_DATA.imageFor(sp.key, "thumb");
			const rare = rarity.id === "rare" || rarity.id === "veryrare";
			const kicker = c.title || (rare ? "Rare find" : "New entry unlocked");
			return {
				ms: WN_CONFIG.CELEBRATE_MS,
				colors: [WN_CONFIG.TYPE_COLORS[sp.group], P.wattle, P.amber, P.cream],
				vibe: rare ? [30, 40, 30] : 25,
				html: '<div class="rays"></div>' +
					'<div class="celebrate-kicker">' + U.esc(kicker) + (rare && c.title ? " · " + rarity.label : "") + "</div>" +
					(imgSrc ? '<img class="celebrate-img" src="' + U.esc(imgSrc) + '" alt="" data-fallback="' + U.esc(it.photo ? "" : fallbackFor(sp.key, imgSrc)) + '" data-group="' + sp.group + '">' : '<div class="celebrate-img group-icon t-' + sp.group + '">' + I(WN_CONFIG.GROUP_ICONS[sp.group] || "info") + "</div>") +
					"<h2>" + U.esc(sp.displayName) + "</h2>" +
					'<p class="entry-sci">' + U.esc(sp.sci) + "</p>" +
					'<div class="entry-chips">' + typeChip(sp) + tierBadge(it.tier) + statusBadge(sp) + "</div>" +
					'<div class="celebrate-actions">' +
						'<button type="button" class="btn btn-primary btn-sm" data-act="photo" data-key="' + sp.key + '">' + I("camera") + "Add your photo</button>" +
						'<button type="button" class="btn btn-ghost btn-sm" data-act="close">Nice</button>' +
					"</div>"
			};
		}
		const shown = c.items.slice(0, 5);
		const colors = Array.from(new Set(c.items.map(it => WN_CONFIG.TYPE_COLORS[(WN_DATA.getSpecies(it.key) || {}).group]).filter(Boolean))).concat([P.wattle, P.cream]);
		return {
			ms: WN_CONFIG.CELEBRATE_MS,
			colors,
			vibe: [20, 30, 20],
			html: '<div class="rays"></div>' +
				'<div class="celebrate-kicker">' + U.esc(c.title || "Zone visited") + "</div>" +
				'<div class="celebrate-stack">' + shown.map(it => {
					const sp = WN_DATA.getSpecies(it.key);
					const src = WN_DATA.imageFor(it.key, "thumb");
					return src
						? '<img class="stack-img" src="' + U.esc(src) + '" alt="' + U.esc(sp.displayName) + '" data-fallback="' + U.esc(fallbackFor(it.key, src)) + '" data-group="' + sp.group + '">'
						: '<span class="stack-img group-icon t-' + sp.group + '">' + I(WN_CONFIG.GROUP_ICONS[sp.group] || "info") + "</span>";
				}).join("") + (c.items.length > 5 ? '<span class="more">+' + (c.items.length - 5) + "</span>" : "") + "</div>" +
				"<h2>" + c.items.length + " new entries</h2>" +
				'<p class="celebrate-names">' + U.esc(c.items.map(it => WN_DATA.getSpecies(it.key).displayName).slice(0, 5).join(", ")) + (c.items.length > 5 ? " and more" : "") + "</p>" +
				'<div class="entry-chips">' + tierBadge(c.items[0].tier) + "</div>" +
				'<div class="celebrate-actions"><button type="button" class="btn btn-ghost btn-sm" data-act="pokedex">' + I("book") + 'See Pokedex</button><button type="button" class="btn btn-ghost btn-sm" data-act="close">Nice</button></div>'
		};
	}

	function progressHtml(c) {
		const P = WN_CONFIG.PALETTE;
		const badges = c.badges || [];
		const XP = WN_CONFIG.XP.badge;
		const rarityColors = { bronze: "#d68e52", silver: "#e4eaf0", gold: P.wattle, legendary: P.jacaranda };
		const colors = Array.from(new Set(badges.map(b => rarityColors[b.rarity]))).concat([P.wattle, P.kingfisher, P.galah, P.eucalyptus]);
		const levelLine = c.levelUp
			? '<p class="level-up">Level <b>' + c.levelUp.level + "</b> reached" + (c.levelUp.rankChanged ? ". New title: <b>" + U.esc(c.levelUp.rank) + "</b>" : " · " + U.esc(c.levelUp.rank)) + "</p>"
			: "";
		let body;
		if (badges.length === 1) {
			const b = badges[0];
			body = '<div class="celebrate-kicker">Badge earned</div>' +
				'<div class="celebrate-medals">' + medal(b, { earned: true, shine: true }) + "</div>" +
				"<h2>" + U.esc(b.name) + "</h2>" +
				'<p class="celebrate-names">' + U.esc(b.desc) + "</p>" +
				'<span class="celebrate-xp">' + I("bolt") + "+" + XP[b.rarity] + " XP</span>";
		} else if (badges.length > 1) {
			const shown = badges.slice(0, 4);
			body = '<div class="celebrate-kicker">' + badges.length + " badges earned</div>" +
				'<div class="celebrate-medals many">' + shown.map(b => medal(b, { earned: true, shine: true })).join("") + "</div>" +
				"<h2>" + U.esc(shown.map(b => b.name).slice(0, 2).join(" and ")) + (badges.length > 2 ? " +" + (badges.length - 2) : "") + "</h2>" +
				'<span class="celebrate-xp">' + I("bolt") + "+" + badges.reduce((n, b) => n + XP[b.rarity], 0) + " XP</span>";
		} else {
			body = '<div class="celebrate-kicker">Level up</div>' +
				'<div class="celebrate-medals"><span class="medal gold"><span class="medal-shine"></span><b style="font-family:var(--font-head);font-size:2rem;color:#513303">' + c.levelUp.level + "</b></span></div>" +
				"<h2>" + U.esc(c.levelUp.rank) + "</h2>";
		}
		return {
			ms: WN_CONFIG.CELEBRATE_BADGE_MS,
			colors,
			vibe: [30, 50, 30, 50, 60],
			html: '<div class="rays"></div>' + body + (badges.length ? levelLine : "") +
				'<div class="celebrate-actions">' +
					'<button type="button" class="btn btn-primary btn-sm" data-act="badges">' + I("medal") + "View badges</button>" +
					'<button type="button" class="btn btn-ghost btn-sm" data-act="close">Nice</button>' +
				"</div>"
		};
	}

	function next() {
		const c = queue.shift();
		if (!c) { busy = false; return; }
		busy = true;
		const view = c.kind === "progress" ? progressHtml(c) : speciesHtml(c);
		unlockCard.innerHTML = view.html + '<div class="celebrate-timer" style="--ms:' + view.ms + 'ms"></div>';
		unlockModal.classList.remove("is-held");
		unlockModal.hidden = true;           // restart the CSS animations
		void unlockCard.offsetWidth;
		unlockModal.hidden = false;
		confetti(view.colors, c.kind === "progress" ? 44 : 30);
		vibrate(view.vibe);
		clearTimeout(unlockTimer);
		unlockTimer = setTimeout(closeCelebration, view.ms);
	}

	function closeCelebration() {
		clearTimeout(unlockTimer);
		unlockModal.hidden = true;
		setTimeout(next, 160);
	}

	// Moving over the card, touching it or tabbing into it pauses the auto-close.
	["pointermove", "pointerdown", "focusin"].forEach(ev => unlockCard.addEventListener(ev, () => {
		clearTimeout(unlockTimer);
		unlockModal.classList.add("is-held");
	}));
	unlockModal.addEventListener("click", async (e) => {
		if (e.target === unlockModal) { closeCelebration(); return; }
		const btn = e.target.closest("[data-act]");
		if (!btn) return;
		const act = btn.dataset.act;
		if (act === "close") { closeCelebration(); return; }
		if (act === "badges") { closeCelebration(); showTab("badges"); return; }
		if (act === "pokedex") { closeCelebration(); showTab("pokedex"); return; }
		if (act === "photo") {
			const key = btn.dataset.key;
			try {
				const url = await WN_PHOTOS.attach(key);
				closeCelebration();
				if (url) {
					toast("Photo saved to your entry");
					document.dispatchEvent(new CustomEvent("wn:collection"));
					showEntry(key);
				}
			} catch (err) { toast(err.message || "Could not read that photo"); }
		}
	});

	// Escape closes whatever is on top
	document.addEventListener("keydown", (e) => {
		if (e.key !== "Escape") return;
		if (!unlockModal.hidden) { closeCelebration(); return; }
		if (!entryModal.hidden) { hideEntry(); return; }
		const top = openSheets[openSheets.length - 1];
		if (top) closeSheet(top);
	});

	return {
		$, $$, I, isPhone, reducedMotion,
		showTab, onTab, tab, notice, toast, countTo, renderStats, renderLevel,
		statusBadge, tierBadge, typeChip, rarityPips, pad, speciesImg, groupIcon, medal, avatar,
		openSheet, closeSheet, onSheetClose,
		showZone, refreshZoneSheet, hideZone, currentZone, showSettings, hideSettings,
		showEntry, hideEntry, setEntryActions, safetyBanner,
		celebrate, celebrateProgress, confetti
	};
})();
