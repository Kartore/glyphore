//! wasm-bindgen bindings for glyphore-core.
//!
//! Thin wrapper only — all logic lives in `glyphore-core`. The npm package in
//! `npm/glyphore` wraps the generated wasm with browser/Node entry points.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

use std::cell::{Cell, RefCell};
use std::collections::BTreeMap;

use glyphore_core::FontFace;
use js_sys::{Array, Object, Reflect, Uint8Array};
use wasm_bindgen::prelude::*;

thread_local! {
	static FONTS: RefCell<BTreeMap<u32, FontFace>> = const { RefCell::new(BTreeMap::new()) };
	static NEXT_HANDLE: Cell<u32> = const { Cell::new(1) };
}

/// Parses a font, stores it in WebAssembly memory, and returns its handle and metadata.
#[wasm_bindgen(js_name = parseFont)]
pub fn parse_font(bytes: &[u8]) -> Result<JsValue, JsError> {
	let face = FontFace::parse(bytes).map_err(core_error)?;
	let info = font_info_to_js(&face)?;
	let handle = allocate_handle()?;
	let result = Object::new();
	set_property(&result, "handle", &JsValue::from_f64(f64::from(handle)))?;
	set_property(&result, "info", info.as_ref())?;

	FONTS.with(|fonts| {
		let previous = fonts.borrow_mut().insert(handle, face);
		debug_assert!(previous.is_none());
	});
	Ok(result.into())
}

/// Generates one deterministic MapLibre glyph PBF for a stored font.
#[wasm_bindgen(js_name = generateRange)]
pub fn generate_range(handle: u32, start: u32) -> Result<Uint8Array, JsError> {
	let bytes = FONTS.with(|fonts| {
		let fonts = fonts.borrow();
		let face = fonts.get(&handle).ok_or_else(|| unknown_handle(handle))?;
		glyphore_core::generate_range(face, start).map_err(core_error)
	})?;
	Ok(Uint8Array::from(bytes.as_slice()))
}

/// Releases a stored font. Releasing the same issued handle again is a no-op.
#[wasm_bindgen(js_name = freeFont)]
pub fn free_font(handle: u32) -> Result<(), JsError> {
	let removed = FONTS.with(|fonts| fonts.borrow_mut().remove(&handle).is_some());
	if removed || was_issued(handle) {
		Ok(())
	} else {
		Err(unknown_handle(handle))
	}
}

fn font_info_to_js(face: &FontFace) -> Result<Object, JsError> {
	let ranges = Array::new();
	for start in face.covered_ranges() {
		ranges.push(&JsValue::from_f64(f64::from(start)));
	}

	let info = Object::new();
	set_property(&info, "familyName", &JsValue::from_str(face.family_name()))?;
	set_property(&info, "styleName", &JsValue::from_str(face.style_name()))?;
	set_property(
		&info,
		"fontstackName",
		&JsValue::from_str(face.fontstack_name()),
	)?;
	set_property(&info, "coveredRanges", ranges.as_ref())?;
	set_property(
		&info,
		"glyphCount",
		&JsValue::from_f64(face.glyph_count() as f64),
	)?;
	Ok(info)
}

fn allocate_handle() -> Result<u32, JsError> {
	NEXT_HANDLE.with(|next| {
		let handle = next.get();
		let following = handle
			.checked_add(1)
			.ok_or_else(|| JsError::new("font handle space exhausted"))?;
		next.set(following);
		Ok(handle)
	})
}

fn was_issued(handle: u32) -> bool {
	handle != 0 && NEXT_HANDLE.with(|next| handle < next.get())
}

fn set_property(object: &Object, name: &str, value: &JsValue) -> Result<(), JsError> {
	Reflect::set(object.as_ref(), &JsValue::from_str(name), value)
		.map(|_| ())
		.map_err(|_| JsError::new(&format!("failed to set `{name}` on a result object")))
}

fn core_error(error: glyphore_core::Error) -> JsError {
	JsError::new(&error.to_string())
}

fn unknown_handle(handle: u32) -> JsError {
	JsError::new(&format!("unknown font handle {handle}"))
}
