/* ==========================================================================
   Wild Neighbours - shared UI pieces
   --------------------------------------------------------------------------
   View switching, notices/toasts, badges, the zone sheet, the entry detail
   dialog, the safety banner and the unlock celebration. Other modules call
   into WN_UI; WN_UI never fetches data itself.
   ========================================================================== */

const WN_UI = (function () {
	"use strict";

	const U = WN_UTIL;
	const $ = (sel, root) => (root || document).querySelector(sel);
	const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

	/* ---- views + tabs ------------------------------------------------------ */

	const views = { map: "view-explore", walk: "view-explore", pokedex: "view-pokedex" };
	let currentTab = "map";
	const tabListeners = [];

	function showTab(tab) {
		currentTab = tab;
		Object.entries(views).forEach(([t, id]) => { $("#" + id).hidden = (views[tab] !== id); });
		$$(".tabbar button").forEach(b => {
			const on = b.dataset.tab === tab;
			b.classList.toggle("is-active", on);
			if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
		});
		document.body.dataset.tab = tab;
		tabListeners.forEach(fn => fn(tab));
	}
	function onTab(fn) { tabListeners.push(fn); }
	function tab() { return currentTab; }

	/* ---- notice bar + toast ------------------------------------------------- */

	function notice(text, kind) {
		const el = $("#notice");
		if (!text) { el.hidden = true; el.textContent = ""; return; }
		el.textContent = text;
		el.classList.toggle("is-error", kind === "error");
		el.hidden = false;
	}

	let toastTimer = null;
	function toast(text, ms) {
		const el = $("#toast");
		el.textContent = text;
		el.hidden = false;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => { el.hidden = true; }, ms || 2200);
	}

	/* ---- stats strip ----------------------------------------------------------- */

	function renderStats() {
		const st = WN_STORE.stats();
		$("#stat-zones").textContent = st.zonesVisited.length;
		$("#stat-distance").textContent = U.formatDistance(st.distanceM);
		$("#stat-species").innerHTML = WN_STORE.unlockedCount() + "<small>/" + WN_DATA.allSpecies().length + "</small>";
	}

	/* ---- badges ------------------------------------------------------------------ */

	/** Conservation status badge from Qld NCA / EPBC codes. */
	function statusBadge(species) {
		const nca = species.nca, epbc = species.epbc;
		if (species.threatened) {
			const label = (nca && nca.label) || (epbc && epbc.label) || "Threatened";
			return '<span class="status is-threatened" title="Qld Nature Conservation Act status">' + U.esc(label) + "</span>";
		}
		if (nca && nca.code === "NT") return '<span class="status is-nt">Near threatened</span>';
		if (nca && nca.code === "SL") return '<span class="status is-special">Special least concern</span>';
		if (nca && nca.code === "C") return '<span class="status">Least concern</span>';
		return '<span class="status" title="No Queensland conservation listing found">Not listed</span>';
	}

	function tierBadge(tier) {
		const t = WN_CONFIG.TIERS[tier];
		if (!t) return "";
		return '<span class="tier tier-' + tier + '"><span aria-hidden="true">' + t.icon + "</span>" + t.name + "</span>";
	}

	/** <img> for a species, or a group icon if there is no reference image. */
	function speciesImg(species, size, extraClass) {
		const src = WN_DATA.imageFor(species.key, size);
		if (!src) return groupIcon(species);
		const info = WN_DATA.imageInfo(species.key) || {};
		// If the cached copy is broken, fall back to the ALA copy, then to an icon.
		const fallback = (src === info.local && info.thumb) ? info.thumb : "";
		return '<img src="' + U.esc(src) + '" alt="' + U.esc(species.displayName) + '" loading="lazy" class="' + (extraClass || "") + '"' +
			' data-fallback="' + U.esc(fallback) + '" data-group="' + U.esc(species.group) + '">';
	}
	function groupIcon(species) {
		return '<span class="group-icon" aria-hidden="true">' + (WN_CONFIG.GROUP_ICONS[species.group] || "\u2753") + "</span>";
	}
	// Image load errors bubble here (capture phase) so every species <img> gets the fallback chain.
	document.addEventListener("error", (e) => {
		const img = e.target;
		if (!(img instanceof HTMLImageElement) || !img.hasAttribute("data-fallback")) return;
		const next = img.getAttribute("data-fallback");
		if (next) { img.setAttribute("data-fallback", ""); img.src = next; return; }
		const icon = document.createElement("span");
		icon.className = "group-icon"; icon.setAttribute("aria-hidden", "true");
		icon.textContent = WN_CONFIG.GROUP_ICONS[img.dataset.group] || "\u2753";
		img.replaceWith(icon);
	}, true);

	/* ---- zone sheet ----------------------------------------------------------------- */

	const zoneSheet = $("#zone-sheet");
	let sheetZone = null;
	let sheetActions = null;  // { canReport: bool, onReport(key, tier) }

	/**
	 * Show the expected animals for a zone.
	 * @param {Object} zone      built by WN_ZONES
	 * @param {Object} actions   { canReport, onReport } (walking mode only)
	 */
	function showZone(zone, actions) {
		sheetZone = zone;
		sheetActions = actions || null;
		renderZoneSheet();
		zoneSheet.hidden = false;
	}
	function refreshZoneSheet() { if (!zoneSheet.hidden && sheetZone) renderZoneSheet(); }
	function hideZone() { zoneSheet.hidden = true; sheetZone = null; }
	function currentZone() { return zoneSheet.hidden ? null : sheetZone; }

	function renderZoneSheet() {
		const zone = sheetZone;
		$("#zone-title").textContent = zone.name;
		const src = [];
		if (zone.sources.wn) src.push("WildNet " + zone.sources.wn);
		if (zone.sources.ala) src.push("ALA " + zone.sources.ala);
		$("#zone-meta").textContent = zone.speciesCount + " species from " + zone.count + " records (" + src.join(", ") +
			") · latest " + U.ago(zone.lastDate) + (zone.threatened ? " · includes threatened species" : "");
		const list = $("#zone-species");
		list.innerHTML = zone.species.map(s => {
			const sp = WN_DATA.getSpecies(s.key);
			if (!sp) return "";
			const entry = WN_STORE.getEntry(s.key);
			const locked = !entry;
			const canReport = sheetActions && sheetActions.canReport;
			return '<li class="species-row">' +
				'<button type="button" class="species-thumb ' + (locked ? "is-locked" : "") + '" data-key="' + s.key + '" aria-label="Open ' + U.esc(sp.displayName) + '">' + speciesImg(sp, "thumb") + "</button>" +
				'<div class="species-main">' +
					'<div class="species-name"><button type="button" data-key="' + s.key + '">' + U.esc(sp.displayName) + "</button> " + (entry ? tierBadge(entry.tier) : "") + "</div>" +
					'<div class="species-sci">' + U.esc(sp.sci) + "</div>" +
					'<div class="species-meta">' + statusBadge(sp) +
						'<span class="recency">recorded ' + U.esc(U.ago(s.lastDate)) + "</span>" +
						(sp.hint ? '<span class="hint">' + U.esc(sp.hint) + "</span>" : "") +
						'<span class="hint">' + s.count + (s.count === 1 ? " record" : " records") + " here</span>" +
					"</div>" +
				"</div>" +
				(canReport ? '<div class="species-actions">' +
					'<button type="button" class="btn btn-primary btn-sm" data-report="3" data-key="' + s.key + '">\u{1F440} I spotted it</button>' +
					'<button type="button" class="btn btn-leaf btn-sm" data-report="2" data-key="' + s.key + '">\u{1F43E} Saw signs</button>' +
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
	$("#zone-close").addEventListener("click", hideZone);

	/* ---- entry detail dialog ----------------------------------------------------------- */

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
		const fact = WN_DATA.factFor(sp);
		const img = WN_DATA.imageInfo(key);

		$("#entry-title").textContent = locked ? "???" : sp.displayName;
		$("#entry-sci").textContent = locked ? "Unlock this entry to reveal the species" : sp.sci;

		let hero = '<figure class="entry-img ' + (locked ? "is-locked" : "") + '">' + speciesImg(sp, "large") +
			(img ? '<figcaption>' + (img.from === "occurrence" ? "Photo via Atlas of Living Australia (observer photo)" : "Photo via Atlas of Living Australia") + "</figcaption>" : "") + "</figure>";
		if (photo) hero += '<figure class="entry-img"><img src="' + photo + '" alt="Your photo of ' + U.esc(sp.displayName) + '"><figcaption>Your photo (stored on this device only)</figcaption></figure>';

		const kv = [];
		kv.push(["Group", WN_CONFIG.GROUP_LABELS[sp.group] || sp.class]);
		if (sp.family) kv.push(["Family", sp.family]);
		if (sp.hint) kv.push(["Activity", sp.hint]);
		if (sp.wildnet && sp.wildnet.lastSeen) kv.push(["Last WildNet record", U.formatDate(sp.wildnet.lastSeen)]);
		if (entry) {
			kv.push(["Unlocked", U.formatDate(entry.unlockedAt.slice(0, 10)) + (entry.zoneName ? " at " + entry.zoneName : "") + (entry.place ? ", " + entry.place : "")]);
			if (entry.tier > 1 && entry.tierAt !== entry.unlockedAt) kv.push(["Upgraded", U.formatDate(entry.tierAt.slice(0, 10))]);
		}

		$("#entry-body").innerHTML =
			'<div class="entry-hero">' + hero + "</div>" +
			'<div class="entry-badges">' + (entry ? tierBadge(entry.tier) : '<span class="tier tier-1" style="opacity:.6">Locked</span>') + statusBadge(sp) +
				(sp.sensitive ? '<span class="status is-nt">Location withheld</span>' : "") + "</div>" +
			(locked
				? '<p class="summary">Walk into a habitat zone where this species has been recorded, or report a sighting during a walk, to unlock it.</p>'
				: '<div class="fact ' + (fact.derived ? "is-derived" : "") + '"><span class="fact-label">' + (fact.derived ? "From the records" : "Fun fact") + "</span>" + U.esc(fact.text) + "</div>") +
			'<dl class="kv">' + kv.map(([k, v]) => "<dt>" + U.esc(k) + "</dt><dd>" + U.esc(v) + "</dd>").join("") + "</dl>" +
			(entry ? '<p class="privacy-note">Your sightings and photos are personal records kept on this device. They are never shared or used to verify anything.</p>' : "");

		const foot = [];
		if (entry) {
			foot.push('<button type="button" class="btn btn-primary btn-sm" data-act="photo">' + (photo ? "\u{1F4F7} Replace photo" : "\u{1F4F7} Add your photo") + "</button>");
			if (photo) foot.push('<button type="button" class="btn btn-danger btn-sm" data-act="remove-photo">Delete photo</button>');
		}
		if (entryActions && entryActions.canReport) {
			if (!entry || entry.tier < 3) foot.push('<button type="button" class="btn btn-primary btn-sm" data-act="report" data-tier="3">\u{1F440} I spotted it</button>');
			if (!entry || entry.tier < 2) foot.push('<button type="button" class="btn btn-leaf btn-sm" data-act="report" data-tier="2">\u{1F43E} Saw signs</button>');
		}
		$("#entry-foot").innerHTML = foot.join("");
		entryModal.hidden = false;
		$("#entry-close").focus();
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

	/* ---- safety banner -------------------------------------------------------------- */

	const banner = $("#safety-banner");
	let bannerResolve = null;
	/** Show the on-entry safety prompt; resolves when dismissed. */
	function safetyBanner(zoneName) {
		$("#safety-title").textContent = "You have entered " + zoneName;
		banner.hidden = false;
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

	/* ---- unlock celebration --------------------------------------------------------- */

	const unlockModal = $("#unlock-modal");
	const unlockCard = $("#unlock-card");
	let unlockTimer = null;
	let unlockQueue = [];
	let unlockBusy = false;

	/**
	 * Queue a celebration. `items` is an array of { key, tier, photo? }.
	 * One entry = card flip with the species image. Many = "zone visited"
	 * summary with a stack of thumbnails. Auto-closes after CELEBRATE_MS
	 * unless the user is interacting with it.
	 */
	function celebrate(items, title) {
		if (!items || !items.length) return;
		unlockQueue.push({ items, title });
		if (!unlockBusy) nextCelebration();
	}

	function nextCelebration() {
		const next = unlockQueue.shift();
		if (!next) { unlockBusy = false; return; }
		unlockBusy = true;
		const { items, title } = next;
		const single = items.length === 1;
		let html;
		if (single) {
			const sp = WN_DATA.getSpecies(items[0].key);
			const photo = items[0].photo;
			const imgSrc = photo || WN_DATA.imageFor(sp.key, "thumb");
			html = '<div class="celebrate-kicker">' + U.esc(title || "New entry unlocked") + "</div>" +
				(imgSrc ? '<img class="celebrate-img" src="' + U.esc(imgSrc) + '" alt="">' : '<div class="celebrate-img group-icon" style="position:static">' + (WN_CONFIG.GROUP_ICONS[sp.group] || "") + "</div>") +
				"<h2 id=\"unlock-title\">" + U.esc(sp.displayName) + "</h2>" +
				'<p class="entry-sci">' + U.esc(sp.sci) + "</p>" +
				'<div class="entry-badges" style="justify-content:center">' + tierBadge(items[0].tier) + statusBadge(sp) + "</div>" +
				'<div class="modal-foot" style="justify-content:center">' +
					'<button type="button" class="btn btn-primary btn-sm" data-act="photo" data-key="' + sp.key + '">\u{1F4F7} Add your photo</button>' +
					'<button type="button" class="btn btn-ghost btn-sm" data-act="close">Nice</button>' +
				"</div>";
		} else {
			const shown = items.slice(0, 5);
			html = '<div class="celebrate-kicker">' + U.esc(title || "Zone visited") + "</div>" +
				'<div class="celebrate-stack">' + shown.map(it => {
					const sp = WN_DATA.getSpecies(it.key);
					const src = WN_DATA.imageFor(it.key, "thumb");
					return src ? '<img src="' + U.esc(src) + '" alt="' + U.esc(sp.displayName) + '">' : '<span class="more">' + (WN_CONFIG.GROUP_ICONS[sp.group] || "") + "</span>";
				}).join("") + (items.length > 5 ? '<span class="more">+' + (items.length - 5) + "</span>" : "") + "</div>" +
				"<h2 id=\"unlock-title\">" + items.length + " new entries</h2>" +
				'<p class="summary">' + U.esc(items.map(it => WN_DATA.getSpecies(it.key).displayName).slice(0, 6).join(", ")) + (items.length > 6 ? "…" : "") + "</p>" +
				'<div class="entry-badges" style="justify-content:center">' + tierBadge(items[0].tier) + "</div>" +
				'<div class="modal-foot" style="justify-content:center"><button type="button" class="btn btn-ghost btn-sm" data-act="close">Nice</button></div>';
		}
		unlockCard.innerHTML = html + '<div class="celebrate-timer"></div>';
		unlockModal.classList.remove("is-held");
		unlockModal.hidden = true;           // restart the CSS animations
		void unlockCard.offsetWidth;
		unlockModal.hidden = false;
		clearTimeout(unlockTimer);
		unlockTimer = setTimeout(closeCelebration, WN_CONFIG.CELEBRATE_MS);
	}

	function closeCelebration() {
		clearTimeout(unlockTimer);
		unlockModal.hidden = true;
		setTimeout(nextCelebration, 150);
	}

	// Moving the mouse over the card, touching it or tabbing into it pauses the
	// auto-close so the buttons are reachable. (pointermove, not pointerenter, so a
	// cursor that merely happens to be resting there does not hold it open.)
	["pointermove", "pointerdown", "focusin"].forEach(ev => unlockCard.addEventListener(ev, () => {
		clearTimeout(unlockTimer);
		unlockModal.classList.add("is-held");
	}));
	unlockModal.addEventListener("click", async (e) => {
		if (e.target === unlockModal) { closeCelebration(); return; }
		const btn = e.target.closest("[data-act]");
		if (!btn) return;
		if (btn.dataset.act === "close") { closeCelebration(); return; }
		if (btn.dataset.act === "photo") {
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

	// Escape closes whichever overlay is open
	document.addEventListener("keydown", (e) => {
		if (e.key !== "Escape") return;
		if (!unlockModal.hidden) closeCelebration();
		else if (!entryModal.hidden) hideEntry();
		else if (!zoneSheet.hidden) hideZone();
	});

	return { $, $$, showTab, onTab, tab, notice, toast, renderStats, statusBadge, tierBadge, speciesImg, showZone, refreshZoneSheet, hideZone, currentZone, showEntry, hideEntry, setEntryActions, safetyBanner, celebrate };
})();
