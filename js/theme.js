/* ==========================================================================
   Wild Neighbours - light / dark theme
   --------------------------------------------------------------------------
   Loaded in <head> before the stylesheet, so the right colours are on the
   page before anything paints (no white flash in dark mode, or the reverse).

   The choice is "auto" (follow the phone or laptop setting), "light" or
   "dark", kept in localStorage under "wn-theme". It only sets
   <html data-theme="light|dark">; every colour lives in css/style.css.
   Nothing else in the app depends on this file, so if it fails the app
   still works in the light theme.
   ========================================================================== */

window.WN_THEME = (function () {
	"use strict";

	const KEY = "wn-theme";
	const CHOICES = ["auto", "light", "dark"];
	const BAR = { light: "#f2f7f0", dark: "#0f1813" };    // browser bar colour, matches --bg
	const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

	function stored() {
		try { const v = localStorage.getItem(KEY); return CHOICES.includes(v) ? v : "auto"; } catch (e) { return "auto"; }
	}
	function resolve(choice) {
		if (choice === "light" || choice === "dark") return choice;
		return media && media.matches ? "dark" : "light";
	}

	let choice = stored();

	/** Put the theme on <html>, the browser bar and any controls on the page. */
	function apply() {
		const theme = resolve(choice);
		const root = document.documentElement;
		root.setAttribute("data-theme", theme);
		root.setAttribute("data-theme-choice", choice);
		document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", BAR[theme]));
		syncControls();
		return theme;
	}

	/** Remember a choice ("auto", "light" or "dark") and show it. */
	function set(next) {
		if (!CHOICES.includes(next)) return current();
		choice = next;
		try { if (next === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, next); } catch (e) { /* private mode: still applies for this visit */ }
		return apply();
	}

	function current() { return resolve(choice); }

	/** The header button: flip between light and dark. */
	function toggle() { return set(current() === "dark" ? "light" : "dark"); }

	function syncControls() {
		const theme = resolve(choice);
		document.querySelectorAll("[data-theme-choice-btn]").forEach(btn => {
			const on = btn.getAttribute("data-theme-choice-btn") === choice;
			btn.classList.toggle("is-active", on);
			btn.setAttribute("aria-pressed", on ? "true" : "false");
		});
		const headerBtn = document.getElementById("btn-theme");
		if (headerBtn) {
			headerBtn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
			headerBtn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
		}
	}

	function bind() {
		document.querySelectorAll("[data-theme-choice-btn]").forEach(btn => {
			btn.addEventListener("click", () => set(btn.getAttribute("data-theme-choice-btn")));
		});
		const headerBtn = document.getElementById("btn-theme");
		if (headerBtn) headerBtn.addEventListener("click", toggle);
		syncControls();
	}

	// Follow the system setting live while on "auto".
	if (media) {
		const onChange = () => { if (choice === "auto") apply(); };
		if (media.addEventListener) media.addEventListener("change", onChange);
		else if (media.addListener) media.addListener(onChange);
	}
	// Another tab changed it.
	window.addEventListener("storage", (e) => { if (e.key === KEY) { choice = stored(); apply(); } });

	apply();
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
	else bind();

	return { set, toggle, current, choice: () => choice };
})();
