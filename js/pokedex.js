/* ==========================================================================
   Wild Neighbours - Pokedex
   --------------------------------------------------------------------------
   A numbered card for every species, coloured by animal type. Locked cards
   are greyed with a "?" and no name; unlocked cards show the photo, a tier
   badge and rarity pips, plus a camera icon if you attached a photo.
   The group tiles at the top double as filters and show progress per group.
   ========================================================================== */

const WN_POKEDEX = (function () {
	"use strict";

	const U = WN_UTIL, $ = WN_UI.$, $$ = WN_UI.$$, I = WN_UI.I;
	const grid = $("#pokedex-grid");
	const filters = { group: "all", state: "all", query: "", sort: "no" };
	const NEW_MS = 30 * 60 * 1000;       // unlocked in the last 30 minutes = "new"
	let nearbyKeys = () => new Set();
	let timer = null;

	function init(nearbyFn) {
		nearbyKeys = nearbyFn;
		$("#group-filter").addEventListener("click", (e) => {
			const t = e.target.closest("[data-group]");
			if (t) { filters.group = t.dataset.group; render(true); }
		});
		$$("#state-filter .chip").forEach(b => b.addEventListener("click", () => {
			filters.state = b.dataset.state;
			$$("#state-filter .chip").forEach(x => x.classList.toggle("is-active", x === b));
			render(true);
		}));
		$("#pokedex-search").addEventListener("input", (e) => { filters.query = e.target.value.trim().toLowerCase(); schedule(); });
		$("#dex-sort").addEventListener("change", (e) => { filters.sort = e.target.value; render(true); });
		grid.addEventListener("click", (e) => {
			const card = e.target.closest("[data-key]");
			if (card) WN_UI.showEntry(card.dataset.key);
		});
		document.addEventListener("wn:collection", () => schedule());
		document.addEventListener("wn:image", () => schedule());
		WN_UI.onTab((tab, changed) => { if (tab === "pokedex" && changed) render(true); });
		render(false);
	}

	function schedule() { clearTimeout(timer); timer = setTimeout(() => render(false), 80); }

	/* ---- header: ring, summary, group tiles --------------------------------- */

	function renderHead(entries) {
		const all = WN_DATA.allSpecies();
		const found = Object.keys(entries).length;
		const tiers = { 1: 0, 2: 0, 3: 0 };
		Object.values(entries).forEach(e => { tiers[e.tier] = (tiers[e.tier] || 0) + 1; });
		const pct = all.length ? found / all.length * 100 : 0;
		$("#pokedex-progress").innerHTML = "<strong>" + found + "</strong> of " + all.length + " found · " +
			tiers[3] + " sighted · " + tiers[2] + " by signs · " + tiers[1] + " by zone visit";
		$("#dex-pct").textContent = found && pct < 1 ? "<1%" : Math.round(pct) + "%";
		$("#dex-ring").style.strokeDashoffset = String(100 - Math.max(found ? 2 : 0, Math.round(pct)));

		const counts = {};
		WN_CONFIG.GROUP_ORDER.forEach(g => { counts[g] = { found: 0, total: 0 }; });
		all.forEach(sp => {
			const c = counts[sp.group];
			if (!c) return;
			c.total++;
			if (entries[sp.key]) c.found++;
		});
		const tile = (id, label, icon, f, t, typeCls) =>
			'<button type="button" class="group-tile ' + typeCls + (filters.group === id ? " is-active" : "") + '" data-group="' + id + '" aria-pressed="' + (filters.group === id) + '">' +
				'<span class="group-tile-top"><span class="group-tile-ico">' + I(icon) + '</span><span class="group-tile-count">' + f + "<small>/" + t + "</small></span></span>" +
				'<span class="group-tile-name">' + label + "</span>" +
				'<span class="mini-bar"><span style="width:' + (t ? Math.max(f ? 3 : 0, f / t * 100) : 0).toFixed(1) + '%"></span></span>' +
			"</button>";
		$("#group-filter").innerHTML =
			tile("all", "All animals", "paw", found, all.length, "t-all") +
			WN_CONFIG.GROUP_ORDER.map(g => tile(g, WN_CONFIG.GROUP_PLURALS[g], WN_CONFIG.GROUP_ICONS[g], counts[g].found, counts[g].total, "t-" + g)).join("");
	}

	/* ---- grid ---------------------------------------------------------------- */

	function sortList(list, entries) {
		const byNo = (a, b) => a.no - b.no;
		if (filters.sort === "name") return list.sort((a, b) => a.displayName.localeCompare(b.displayName));
		if (filters.sort === "recent") {
			return list.sort((a, b) => {
				const ea = entries[a.key], eb = entries[b.key];
				if (ea && eb) return (eb.tierAt || "").localeCompare(ea.tierAt || "");
				if (ea) return -1;
				if (eb) return 1;
				return byNo(a, b);
			});
		}
		if (filters.sort === "rare") {
			// fewest records first; species with no recent records go last
			const rank = (s) => s.recordCount > 0 ? s.recordCount : 1e9;
			return list.sort((a, b) => (rank(a) - rank(b)) || byNo(a, b));
		}
		return list.sort(byNo);
	}

	function render(animate) {
		const nearby = nearbyKeys();
		const entries = WN_STORE.allEntries();
		renderHead(entries);
		const now = Date.now();
		let list = WN_DATA.allSpecies().filter(sp => {
			if (filters.group !== "all" && sp.group !== filters.group) return false;
			const entry = entries[sp.key];
			if (filters.state === "unlocked" && !entry) return false;
			if (filters.state === "locked" && entry) return false;
			if (filters.state === "nearby" && !nearby.has(sp.key)) return false;
			if (filters.query) {
				// hidden entries can only be found by scientific name or number; keep the mystery
				const hay = (entry ? sp.displayName + " " : "") + sp.sci + " " + sp.no;
				if (!hay.toLowerCase().includes(filters.query)) return false;
			}
			return true;
		});
		list = sortList(list, entries);

		grid.innerHTML = list.map((sp, i) => {
			const entry = entries[sp.key];
			const locked = !entry;
			const fresh = entry && now - new Date(entry.tierAt || entry.unlockedAt).getTime() < NEW_MS;
			const anim = animate && i < 24;
			return '<li><button type="button" class="card t-' + sp.group + (locked ? " is-locked" : " is-unlocked") + (fresh ? " is-new" : "") + (anim ? " is-anim" : "") + '"' +
				(anim ? ' style="--d:' + (i * 28) + 'ms"' : "") + ' data-key="' + sp.key + '" aria-label="' + (locked ? "Hidden entry number " + sp.no : U.esc(sp.displayName)) + '">' +
				'<div class="card-img">' + WN_UI.speciesImg(sp, "thumb") +
					(locked ? '<span class="card-q" aria-hidden="true">?</span>' : "") +
					(entry ? '<span class="tier tier-' + entry.tier + '">' + I(WN_CONFIG.TIERS[entry.tier].icon) + WN_CONFIG.TIERS[entry.tier].short + "</span>" : "") +
					'<span class="card-icons">' +
						(entry && entry.hasPhoto ? '<span class="card-icon" title="You added a photo">' + I("camera", "", "Has your photo") + "</span>" : "") +
						(nearby.has(sp.key) && locked ? '<span class="card-icon" title="Recorded in a zone near you">' + I("target", "", "Near you") + "</span>" : "") +
					"</span>" +
					'<span class="card-no">No. ' + WN_UI.pad(sp.no) + "</span>" +
				"</div>" +
				'<div class="card-body">' +
					'<div class="card-name">' + (locked ? "???" : U.esc(sp.displayName)) + "</div>" +
					'<div class="card-meta">' + WN_UI.typeChip(sp) + WN_UI.rarityPips(sp) + "</div>" +
				"</div>" +
			"</button></li>";
		}).join("") || '<li class="empty">Nothing matches those filters.</li>';
	}

	return { init, render: schedule };
})();
