/* ==========================================================================
   Wild Neighbours - Pokedex grid
   --------------------------------------------------------------------------
   Every species in the catalogue gets a card. Locked cards are greyed with a
   "???" name; unlocked cards show the species in colour with a tier badge,
   and a camera icon if the user attached a photo.
   ========================================================================== */

const WN_POKEDEX = (function () {
	"use strict";

	const U = WN_UTIL, $ = WN_UI.$;
	const grid = $("#pokedex-grid");
	const filters = { group: "all", state: "all", query: "" };
	let nearbyKeys = () => new Set();
	let renderTimer = null;

	function init(nearbyFn) {
		nearbyKeys = nearbyFn;
		WN_UI.$$("#group-filter .chip").forEach(b => b.addEventListener("click", () => setFilter("group", b.dataset.group, b)));
		WN_UI.$$("#state-filter .chip").forEach(b => b.addEventListener("click", () => setFilter("state", b.dataset.state, b)));
		$("#pokedex-search").addEventListener("input", (e) => { filters.query = e.target.value.trim().toLowerCase(); scheduleRender(); });
		grid.addEventListener("click", (e) => {
			const card = e.target.closest("[data-key]");
			if (card) WN_UI.showEntry(card.dataset.key);
		});
		document.addEventListener("wn:collection", scheduleRender);
		document.addEventListener("wn:image", scheduleRender);
		render();
	}

	function setFilter(name, value, btn) {
		filters[name] = value;
		WN_UI.$$("#" + name + "-filter .chip").forEach(b => b.classList.toggle("is-active", b === btn));
		render();
	}

	function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 60); }

	function render() {
		const nearby = nearbyKeys();
		const entries = WN_STORE.allEntries();
		let list = WN_DATA.allSpecies().filter(sp => {
			if (filters.group !== "all" && sp.group !== filters.group) return false;
			const entry = entries[sp.key];
			if (filters.state === "unlocked" && !entry) return false;
			if (filters.state === "locked" && entry) return false;
			if (filters.state === "nearby" && !nearby.has(sp.key)) return false;
			if (filters.query) {
				// locked entries can only be searched by scientific name; keep the mystery
				const hay = (entry ? sp.displayName + " " : "") + sp.sci;
				if (!hay.toLowerCase().includes(filters.query)) return false;
			}
			return true;
		});
		list.sort((a, b) => a.displayName.localeCompare(b.displayName));

		grid.innerHTML = list.map(sp => {
			const entry = entries[sp.key];
			const locked = !entry;
			return '<li><button type="button" class="card ' + (locked ? "is-locked" : "is-unlocked") + '" data-key="' + sp.key + '" aria-label="' + (locked ? "Locked entry" : U.esc(sp.displayName)) + '">' +
				'<div class="card-img">' + WN_UI.speciesImg(sp, "thumb") +
					(entry ? '<span class="tier tier-' + entry.tier + '" title="' + WN_CONFIG.TIERS[entry.tier].name + '"><span aria-hidden="true">' + WN_CONFIG.TIERS[entry.tier].icon + "</span>" + WN_CONFIG.TIERS[entry.tier].short + "</span>" : "") +
					'<div class="card-icons">' +
						(entry && entry.hasPhoto ? '<span class="card-icon" title="You added a photo">\u{1F4F7}</span>' : "") +
						(nearby.has(sp.key) && locked ? '<span class="card-icon" title="Recorded in a zone near you">\u{1F4CD}</span>' : "") +
					"</div>" +
				"</div>" +
				'<div class="card-body">' +
					'<div class="card-name">' + (locked ? "???" : U.esc(sp.displayName)) + "</div>" +
					'<div class="card-sci">' + (locked ? WN_CONFIG.GROUP_LABELS[sp.group] + " · " + (sp.threatened ? "threatened" : "hidden") : U.esc(sp.sci)) + "</div>" +
					'<div style="margin-top:6px">' + WN_UI.statusBadge(sp) + "</div>" +
				"</div>" +
			"</button></li>";
		}).join("") || '<li class="empty">Nothing matches those filters.</li>';

		// progress line
		const all = WN_DATA.allSpecies().length;
		const tiers = { 1: 0, 2: 0, 3: 0 };
		Object.values(entries).forEach(e => { tiers[e.tier] = (tiers[e.tier] || 0) + 1; });
		const found = Object.keys(entries).length;
		$("#pokedex-progress").textContent = found + " of " + all + " species found · " +
			tiers[3] + " sighted · " + tiers[2] + " by signs · " + tiers[1] + " by zone visit";
	}

	return { init, render: scheduleRender };
})();
