/* ==========================================================================
   Wild Neighbours - Badges tab
   --------------------------------------------------------------------------
   Ranger card (level, XP, stats), "next up" goals, every badge grouped by
   category, and a friends leaderboard. Friends are added by opening their
   share link: the link carries only a nickname, counts and badge ids, and the
   card is saved on this device. No accounts, no server.
   ========================================================================== */

const WN_BADGES = (function () {
	"use strict";

	const U = WN_UTIL, $ = WN_UI.$, I = WN_UI.I;
	const PR = WN_PROGRESS;
	const RARITY_LABEL = { bronze: "Bronze", silver: "Silver", gold: "Gold", legendary: "Legendary" };
	let snap = null;
	let filter = "all";            // all | earned | todo
	let metric = "x";              // leaderboard metric: x (XP), s (species), d (distance), b (badges)
	let editing = false;
	let seenTimer = null;

	const page = $("#badges-page");

	function init() {
		document.addEventListener("wn:progress", (e) => { snap = e.detail; if (WN_UI.tab() === "badges" && !editing) render(); });
		WN_UI.onTab((tab, changed) => {
			if (tab !== "badges") return;
			render(changed);
			clearTimeout(seenTimer);
			seenTimer = setTimeout(() => { WN_STORE.markBadgesSeen(); WN_UI.renderLevel(PR.snapshot().level, 0); }, 2500);
		});

		page.addEventListener("click", (e) => {
			const t = e.target.closest("[data-badge],[data-friend],[data-act],[data-filter],[data-metric]");
			if (!t) return;
			if (t.dataset.badge) showBadge(t.dataset.badge);
			else if (t.dataset.friend) showCompare(t.dataset.friend);
			else if (t.dataset.filter) { filter = t.dataset.filter; renderBadges(); }
			else if (t.dataset.metric) { metric = t.dataset.metric; renderFriends(); }
			else if (t.dataset.act === "share" || t.dataset.act === "add") openFriendSheet(t.dataset.act === "add");
			else if (t.dataset.act === "edit-name") startEdit();
		});

		$("#btn-share-card").addEventListener("click", shareCard);
		$("#btn-copy-card").addEventListener("click", async () => {
			const link = shareLink();
			if (await copyText(link.url || link.code)) WN_UI.toast(link.url ? "Link copied. Send it to a friend." : "Code copied. Send it to a friend.");
			else WN_UI.toast("Could not copy. Use Share instead.");
		});
		$("#btn-add-friend").addEventListener("click", () => addFromText($("#friend-input").value));
		$("#compare-body").addEventListener("click", (e) => {
			const t = e.target.closest("[data-act]");
			if (!t) return;
			if (t.dataset.act === "send-back") shareCard();
			if (t.dataset.act === "remove-friend") {
				const f = WN_STORE.friends()[t.dataset.id];
				WN_STORE.removeFriend(t.dataset.id);
				WN_UI.closeSheet("compare-sheet");
				WN_UI.toast((f ? f.n : "Friend") + " removed from your leaderboard");
				render();
			}
		});
	}

	/* ---- helpers ----------------------------------------------------------- */

	function fmtProgress(ev) {
		const b = ev.badge;
		const v = Math.min(ev.value, b.goal);
		return b.metric === "distanceKm" ? v.toFixed(1) + " / " + b.goal + " km" : v + " / " + b.goal;
	}
	function statTile(icon, colour, value, label) {
		return '<div class="stat-tile" style="--c:' + colour + '"><span class="stat-ico">' + I(icon) + "</span><b>" + value + "</b><small>" + label + "</small></div>";
	}

	/* ---- rendering ----------------------------------------------------------- */

	function render(animate) {
		snap = PR.snapshot();
		renderRanger();
		renderNextUp();
		renderBadges(animate);
		renderFriends();
	}

	function renderRanger() {
		const p = WN_STORE.profile(), s = snap.stats, lv = snap.level, C = WN_CONFIG.PALETTE;
		const earned = Object.keys(snap.earned).length;
		const nameHtml = editing
			? '<input type="text" id="nick-input" maxlength="24" value="' + U.esc(p.nickname) + '" aria-label="Your ranger name">'
			: "<span>" + U.esc(p.nickname) + '</span><button type="button" data-act="edit-name" aria-label="Edit your name">' + I("pencil") + "</button>";
		$("#ranger-card").innerHTML =
			'<div class="ranger-card">' +
				'<div class="ranger-top">' + WN_UI.avatar(p.nickname, p.id) +
					'<div class="ranger-id"><div class="ranger-name">' + nameHtml + '</div><div class="ranger-rank">' + U.esc(lv.rank) + "</div></div>" +
					'<div class="ranger-level"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="ring-track" cx="18" cy="18" r="15"/><circle class="ring-fill" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="100" stroke-dashoffset="' + (100 - Math.round(lv.progress * 100)) + '"/></svg>' +
						'<span class="ranger-level-text"><small>Level</small><b>' + lv.level + "</b></span></div>" +
				"</div>" +
				'<div class="xp-row"><div class="xp-bar"><span data-w="' + (lv.progress * 100).toFixed(1) + '"></span></div>' +
					'<div class="xp-meta"><span><b>' + lv.xp.toLocaleString() + "</b> XP</span><span>" + (lv.need - lv.into) + " XP to level " + (lv.level + 1) + "</span></div></div>" +
				'<div class="stat-tiles">' +
					statTile("book", C.wattle, s.species, "species") +
					statTile("binoculars", C.amber, s.sighted, "sighted") +
					statTile("pin", C.eucalyptus, s.zones, "zones") +
					statTile("route", C.kingfisher, U.formatDistance(s.distanceM), "walked") +
					statTile("medal", C.jacaranda, earned + "<small style=\"display:inline;font-size:.7rem\">/" + PR.BADGES.length + "</small>", "badges") +
					statTile("flame", C.coral, s.currentStreak, s.currentStreak === 1 ? "day streak" : "day streak") +
				"</div>" +
				'<div class="ranger-actions">' +
					'<button type="button" class="btn btn-primary" data-act="share">' + I("share") + "Share my card</button>" +
					'<button type="button" class="btn btn-ghost" data-act="add">' + I("users") + "Add friend</button>" +
				"</div>" +
			"</div>";
		// fill the XP bar after paint so it animates
		const bar = $("#ranger-card .xp-bar span");
		requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = bar.dataset.w + "%"; }));
		if (editing) {
			const input = $("#nick-input");
			input.focus();
			input.select();
			const save = () => {
				if (!editing) return;
				editing = false;
				const v = input.value.replace(/[<>]/g, "").trim().slice(0, 24);
				if (v) WN_STORE.setProfile("nickname", v);
				renderRanger();
				renderFriends();
			};
			input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { editing = false; renderRanger(); } });
			input.addEventListener("blur", save);
		}
	}
	function startEdit() { editing = true; renderRanger(); }

	function renderNextUp() {
		const next = PR.nextUp(snap.evaluations, snap.earned, 3);
		if (!next.length) { $("#next-up").innerHTML = ""; return; }
		$("#next-up").innerHTML = '<div class="section-head"><div><p class="eyebrow">Keep going</p><h3>Next up</h3></div></div><div class="next-up">' +
			next.map(ev => '<button type="button" class="next-card" data-badge="' + ev.badge.id + '">' + WN_UI.medal(ev.badge, { progress: ev.progress }) +
				'<span class="next-text"><b>' + U.esc(ev.badge.name) + "</b><small>" + U.esc(ev.badge.desc) + '</small><span class="mini-bar"><span style="width:' + (ev.progress * 100).toFixed(1) + '%"></span></span></span>' +
				'<span class="next-count">' + fmtProgress(ev) + "</span></button>").join("") + "</div>";
	}

	function renderBadges(animate) {
		const earnedIds = snap.earned;
		const total = PR.BADGES.length, got = Object.keys(earnedIds).length;
		const byId = new Map(snap.evaluations.map(ev => [ev.badge.id, ev]));
		let html = '<div class="section-head"><div><p class="eyebrow">Collection</p><h3>Badges</h3><p class="summary"><strong>' + got + "</strong> of " + total + " earned</p></div>" +
			'<div class="chip-row" role="group" aria-label="Filter badges">' +
				["all:All", "earned:Earned", "todo:To do"].map(x => { const [id, label] = x.split(":"); return '<button type="button" class="chip' + (filter === id ? " is-active" : "") + '" data-filter="' + id + '">' + label + "</button>"; }).join("") +
			"</div></div>" +
			'<div class="badge-summary"><span class="mini-bar"><span style="width:' + (got / total * 100).toFixed(1) + '%"></span></span></div>' +
			'<div class="rarity-legend">' + ["bronze", "silver", "gold", "legendary"].map(r => '<span><span class="medal ' + r + '"></span>' + RARITY_LABEL[r] + " +" + WN_CONFIG.XP.badge[r] + " XP</span>").join("") + "</div>";
		let n = 0;
		PR.CATEGORIES.forEach(cat => {
			const all = PR.BADGES.filter(b => b.cat === cat.id);
			const list = all.filter(b => filter === "all" || (filter === "earned" ? earnedIds[b.id] : !earnedIds[b.id]));
			if (!list.length) return;
			const catGot = all.filter(b => earnedIds[b.id]).length;
			html += '<div class="badge-cat"><div class="badge-cat-head"><h4>' + cat.name + "</h4><span>" + catGot + "/" + all.length + '</span></div><p class="badge-cat-blurb">' + cat.blurb + '</p><div class="badge-grid">' +
				list.map(b => {
					const ev = byId.get(b.id);
					const e = earnedIds[b.id];
					const hidden = b.secret && !e;
					const sub = e ? "Earned " + U.formatDate(e.earnedAt.slice(0, 10)) : hidden ? "???" : fmtProgress(ev);
					const d = animate ? Math.min(n++ * 22, 500) : 0;
					return '<button type="button" class="badge-tile ' + (e ? "is-earned" : "is-locked") + '" data-badge="' + b.id + '" style="--d:' + d + 'ms">' +
						'<span style="position:relative">' + WN_UI.medal(b, { earned: Boolean(e), progress: ev.progress, shine: e && !e.seen }) + (e && !e.seen ? '<span class="new-flag">NEW</span>' : "") + "</span>" +
						'<span class="badge-name">' + (hidden ? "Secret badge" : U.esc(b.name)) + '</span><span class="badge-sub">' + sub + "</span></button>";
				}).join("") + "</div></div>";
		});
		$("#badge-area").innerHTML = html;
	}

	function boardValue(card, m) {
		if (m === "b") return card.b.length;
		return card[m] || 0;
	}
	function boardLabel(m, v) {
		if (m === "d") return { value: U.formatDistance(v), unit: "walked" };
		if (m === "s") return { value: v, unit: "species" };
		if (m === "b") return { value: v, unit: "badges" };
		return { value: v.toLocaleString(), unit: "XP" };
	}

	function renderFriends() {
		const friends = Object.values(WN_STORE.friends());
		const me = PR.myCard();
		let html = '<div class="section-head"><div><p class="eyebrow">Friends</p><h3>Leaderboard</h3></div>' +
			'<button type="button" class="btn btn-ghost btn-sm" data-act="add">' + I("plus") + "Add</button></div>";
		if (!friends.length) {
			html += '<div class="empty-friends"><div class="avatar-row">' + WN_UI.avatar("Kookaburra Kid", "a1", "sm") + WN_UI.avatar("Gentle Glider", "b2", "sm") + WN_UI.avatar("Bold Goanna", "c3", "sm") + "</div>" +
				"<p>Swap ranger cards with friends to see who is the better ranger. Links carry only names, counts and badges.</p>" +
				'<div class="btn-row" style="justify-content:center"><button type="button" class="btn btn-primary btn-sm" data-act="share">' + I("share") + "Share my card</button></div></div>";
			$("#friends-section").innerHTML = html;
			return;
		}
		const rows = friends.map(f => ({ card: f, me: false })).concat([{ card: me, me: true }])
			.sort((a, b) => (boardValue(b.card, metric) - boardValue(a.card, metric)) || (a.me ? -1 : 1));
		html += '<div class="chip-row board-tabs" role="group" aria-label="Rank by">' +
			[["x", "XP"], ["s", "Species"], ["d", "Distance"], ["b", "Badges"]].map(([id, label]) => '<button type="button" class="chip' + (metric === id ? " is-active" : "") + '" data-metric="' + id + '">' + label + "</button>").join("") + "</div>" +
			'<div class="board">' + rows.map((r, i) => {
				const c = r.card, lv = PR.levelFor(c.x), bl = boardLabel(metric, boardValue(c, metric));
				const sub = "Lv " + lv.level + " · " + lv.rank + (r.me ? "" : c.u ? " · card from " + U.formatDate(c.u) : "");
				return '<button type="button" class="board-row' + (r.me ? " is-me" : "") + '"' + (r.me ? "" : ' data-friend="' + c.id + '"') + ' style="--d:' + (i * 40) + 'ms">' +
					'<span class="board-rank r' + (i + 1) + '">' + (i + 1) + "</span>" + WN_UI.avatar(c.n, c.id, "sm") +
					'<span class="board-who"><b>' + (r.me ? "You (" + U.esc(c.n) + ")" : U.esc(c.n)) + "</b><small>" + U.esc(sub) + "</small></span>" +
					'<span class="board-score"><b>' + bl.value + "</b><small>" + bl.unit + "</small></span></button>";
			}).join("") + "</div>";
		$("#friends-section").innerHTML = html;
	}

	/* ---- badge detail ---------------------------------------------------------- */

	function showBadge(id) {
		if (!snap) snap = PR.snapshot();
		const ev = snap.evaluations.find(x => x.badge.id === id);
		if (!ev) return;
		const b = ev.badge, e = snap.earned[id], hidden = b.secret && !e;
		$("#badge-sheet-body").innerHTML = '<div class="badge-detail">' +
			WN_UI.medal(b, { earned: Boolean(e), progress: ev.progress, shine: Boolean(e) }) +
			"<h3>" + (hidden ? "Secret badge" : U.esc(b.name)) + "</h3>" +
			'<span class="rarity-tag ' + b.rarity + '">' + RARITY_LABEL[b.rarity] + "</span>" +
			"<p>" + U.esc(hidden ? b.hint : b.desc) + "</p>" +
			(e ? '<p class="progress-text" style="margin-top:14px">Earned ' + U.formatDate(e.earnedAt.slice(0, 10)) + "</p>"
				: hidden ? "" : '<span class="mini-bar"><span style="width:' + (ev.progress * 100).toFixed(1) + '%"></span></span><p class="progress-text">' + fmtProgress(ev) + "</p>") +
			'<span class="xp-reward">' + I("bolt") + "+" + WN_CONFIG.XP.badge[b.rarity] + " XP</span>" +
			"</div>";
		WN_UI.openSheet("badge-sheet");
	}

	/* ---- friends: share, add, compare -------------------------------------------- */

	function shareLink() {
		const code = PR.encodeCard(PR.myCard());
		const url = /^https?:$/.test(location.protocol) ? location.origin + location.pathname + "#friend=" + code : null;
		return { code, url };
	}

	async function copyText(text) {
		try { await navigator.clipboard.writeText(text); return true; } catch (err) { /* fall back below */ }
		try {
			const ta = document.createElement("textarea");
			ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
			document.body.appendChild(ta); ta.select();
			const ok = document.execCommand("copy");
			ta.remove();
			return ok;
		} catch (err) { return false; }
	}

	async function shareCard() {
		const link = shareLink();
		const card = PR.myCard(), lv = PR.levelFor(card.x);
		const text = "I'm a Level " + lv.level + " " + lv.rank + " on Wild Neighbours: " + card.s + " species, " + card.b.length + " badges and " +
			U.formatDistance(card.d) + " walked. Open my ranger card to compare:";
		if (link.url && navigator.share) {
			try { await navigator.share({ title: "My Wild Neighbours ranger card", text, url: link.url }); return; }
			catch (err) { if (err && err.name === "AbortError") return; }
		}
		if (await copyText(link.url ? text + " " + link.url : link.code)) WN_UI.toast(link.url ? "Link copied. Send it to a friend." : "Code copied. Send it to a friend.");
		else WN_UI.toast("Could not share from this browser.");
	}

	function openFriendSheet(focusAdd) {
		$("#friend-input").value = "";
		WN_UI.openSheet("friend-sheet");
		if (focusAdd) setTimeout(() => $("#friend-input").focus(), 350);
	}

	/** Add a friend from a pasted link or code (or an opened #friend= link). */
	function addFromText(text, quiet) {
		const code = PR.extractCode(text);
		const card = code && PR.decodeCard(code);
		if (!card) { WN_UI.toast("That does not look like a Wild Neighbours link."); return false; }
		if (card.id === WN_STORE.profile().id) { WN_UI.toast("That is your own card. Send it to a friend instead."); return false; }
		const result = WN_STORE.saveFriend(card);
		WN_UI.closeSheet("friend-sheet");
		if (!quiet) WN_UI.toast(result === "added" ? card.n + " joined your leaderboard" : card.n + "'s card was updated");
		WN_PROGRESS.schedule();     // friend badges
		render();
		showCompare(card.id, result === "added");
		return true;
	}

	/** Side-by-side comparison with a saved friend. */
	function showCompare(id, justAdded) {
		const them = WN_STORE.friends()[id];
		if (!them) return;
		const me = PR.myCard(), lvMe = PR.levelFor(me.x), lvThem = PR.levelFor(them.x);
		const rows = [
			["XP", me.x, them.x, v => v.toLocaleString()],
			["Species", me.s, them.s, String],
			["Sighted", me.t3, them.t3, String],
			["Zones", me.z, them.z, String],
			["Walked", me.d, them.d, v => U.formatDistance(v)],
			["Badges", me.b.length, them.b.length, String],
			["Best streak", me.st, them.st, v => v + (v === 1 ? " day" : " days")],
			["Areas", me.a, them.a, String]
		];
		let mine = 0, theirs = 0;
		rows.forEach(([, a, b]) => { if (a > b) mine++; else if (b > a) theirs++; });
		const verdict = mine > theirs ? "You lead in " + mine + " of " + rows.length : theirs > mine ? U.esc(them.n) + " leads in " + theirs + " of " + rows.length : "Neck and neck";
		const onlyMe = me.b.filter(x => !them.b.includes(x)).map(x => PR.BY_ID.get(x)).filter(Boolean);
		const onlyThem = them.b.filter(x => !me.b.includes(x)).map(x => PR.BY_ID.get(x)).filter(Boolean);
		const medals = (list) => list.length
			? list.slice(0, 10).map(b => WN_UI.medal(b, { earned: true })).join("") + (list.length > 10 ? '<span class="more">+' + (list.length - 10) + "</span>" : "")
			: '<span class="more">None yet</span>';

		$("#compare-body").innerHTML =
			'<div class="vs-head">' +
				'<div class="vs-side">' + WN_UI.avatar(me.n, me.id) + "<b>You</b><small>Lv " + lvMe.level + " · " + U.esc(lvMe.rank) + "</small></div>" +
				'<span class="vs-mark">vs</span>' +
				'<div class="vs-side">' + WN_UI.avatar(them.n, them.id) + "<b>" + U.esc(them.n) + "</b><small>Lv " + lvThem.level + " · " + U.esc(lvThem.rank) + "</small></div>" +
			"</div>" +
			'<p class="vs-verdict">' + verdict + "</p>" +
			'<div class="cmp-list">' + rows.map(([label, a, b, fmt]) => {
				const max = Math.max(a, b, 1);
				return '<div class="cmp-row">' +
					'<div class="cmp-side me' + (a > b ? " lead" : "") + '"><b>' + fmt(a) + '</b><span class="cmp-bar"><span data-w="' + (a / max * 100).toFixed(1) + '"></span></span></div>' +
					'<div class="cmp-label">' + label + "</div>" +
					'<div class="cmp-side them' + (b > a ? " lead" : "") + '"><span class="cmp-bar"><span data-w="' + (b / max * 100).toFixed(1) + '"></span></span><b>' + fmt(b) + "</b></div>" +
				"</div>";
			}).join("") + "</div>" +
			'<div class="badge-diff"><h4>Only you have</h4><div class="medal-row">' + medals(onlyMe) + "</div></div>" +
			'<div class="badge-diff"><h4>Only ' + U.esc(them.n) + ' has</h4><div class="medal-row">' + medals(onlyThem) + "</div></div>" +
			'<div class="btn-row">' +
				'<button type="button" class="btn btn-primary" data-act="send-back">' + I("share") + (justAdded ? "Send yours back" : "Share my card") + "</button>" +
				'<button type="button" class="btn btn-danger" data-act="remove-friend" data-id="' + U.esc(them.id) + '">Remove</button>' +
			"</div>" +
			'<p class="hint-text" style="margin-top:12px">Card from ' + (them.u ? U.formatDate(them.u) : "an earlier date") + ". Ask " + U.esc(them.n) + " for a fresh link to update it.</p>";
		WN_UI.openSheet("compare-sheet");
		const bars = document.querySelectorAll("#compare-body .cmp-bar span");
		requestAnimationFrame(() => requestAnimationFrame(() => bars.forEach(s => { s.style.width = s.dataset.w + "%"; })));
	}

	return { init, render, showBadge, showCompare, addFromText, shareCard, shareLink };
})();
