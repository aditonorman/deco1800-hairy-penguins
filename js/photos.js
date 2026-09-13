/* ==========================================================================
   Wild Neighbours - personal photos
   --------------------------------------------------------------------------
   A user can attach ONE photo to any unlocked Pokedex entry. The photo is a
   private keepsake: it is resized on the device, stored in IndexedDB, never
   uploaded, never shared and never used to verify anything.
   ========================================================================== */

const WN_PHOTOS = (function () {
	"use strict";

	const input = document.getElementById("photo-input");
	let pending = null;   // resolver for the file picker currently open

	input.addEventListener("change", () => {
		const file = input.files && input.files[0];
		input.value = "";               // allow picking the same file again later
		if (pending) { const r = pending; pending = null; r(file || null); }
	});
	// Newer browsers fire "cancel" when the picker closes with no file.
	input.addEventListener("cancel", () => {
		if (pending) { const r = pending; pending = null; r(null); }
	});

	/** Open the camera / gallery picker. Resolves with a File or null. */
	function pick() {
		return new Promise(resolve => {
			if (pending) pending(null);
			pending = resolve;
			input.click();
		});
	}

	/**
	 * Shrink an image file so it fits in PHOTO_MAX_PX and return a JPEG data
	 * URL. Uses createImageBitmap when available (handles EXIF rotation).
	 */
	async function toDataUrl(file) {
		const max = WN_CONFIG.PHOTO_MAX_PX;
		let source, width, height, cleanup = () => {};
		if ("createImageBitmap" in window) {
			try {
				source = await createImageBitmap(file, { imageOrientation: "from-image" });
			} catch (err) {
				source = await createImageBitmap(file);
			}
			width = source.width; height = source.height;
			cleanup = () => source.close && source.close();
		} else {
			source = await new Promise((resolve, reject) => {
				const img = new Image();
				img.onload = () => resolve(img);
				img.onerror = reject;
				img.src = URL.createObjectURL(file);
			});
			width = source.naturalWidth; height = source.naturalHeight;
			cleanup = () => URL.revokeObjectURL(source.src);
		}
		const scale = Math.min(1, max / Math.max(width, height));
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(width * scale);
		canvas.height = Math.round(height * scale);
		canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
		cleanup();
		return canvas.toDataURL("image/jpeg", WN_CONFIG.PHOTO_QUALITY);
	}

	/**
	 * Full flow: pick -> resize -> store. Resolves with the data URL, or null
	 * if the user cancelled. Throws if the file could not be read.
	 */
	async function attach(speciesKey) {
		const file = await pick();
		if (!file) return null;
		if (!file.type.startsWith("image/")) throw new Error("That file is not an image.");
		const dataUrl = await toDataUrl(file);
		await WN_STORE.photos.put(speciesKey, dataUrl);
		WN_STORE.setPhotoFlag(speciesKey, true);
		return dataUrl;
	}

	async function remove(speciesKey) {
		await WN_STORE.photos.remove(speciesKey);
		WN_STORE.setPhotoFlag(speciesKey, false);
	}

	function get(speciesKey) { return WN_STORE.photos.get(speciesKey); }

	return { attach, remove, get };
})();
