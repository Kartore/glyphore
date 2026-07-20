//! Core MapLibre glyph PBF (SDF) generation for glyphore.
//!
//! Pure logic only: no filesystem access, no clocks, no randomness, no
//! wasm-bindgen. Output follows node-fontnik conventions (24px, 3px buffer,
//! radius 8, cutoff 0.25).
//!
//! Parse font bytes once with [`FontFace::parse`], inspect the sorted range
//! starts with [`FontFace::covered_ranges`], and pass each start to
//! [`generate_range`].
//!
//! # Example
//!
//! ```no_run
//! use glyphore_core::{FontFace, generate_range};
//!
//! fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let bytes = std::fs::read("NotoSans-Regular.ttf")?;
//!     let face = FontFace::parse(&bytes)?;
//!
//!     for start in face.covered_ranges() {
//!         let pbf = generate_range(&face, start)?;
//!         std::fs::write(format!("{start}-{}.pbf", start + 255), pbf)?;
//!     }
//!     Ok(())
//! }
//! ```

use std::collections::{BTreeMap, BTreeSet};

use ttf_parser::{GlyphId, name_id};

mod glyph;
mod pbf;

const FONT_SIZE_PX: u32 = 24;

/// An error produced while parsing a font or generating a glyph range.
#[derive(Debug, thiserror::Error)]
pub enum Error {
	/// The input cannot be parsed as a font.
	#[error("invalid font: {0}")]
	InvalidFont(String),
	/// The input is a valid font, but uses an unsupported feature.
	#[error("unsupported font: {0}")]
	UnsupportedFont(String),
	/// A range must start at a multiple of 256.
	#[error("range start {0} is not a multiple of 256")]
	InvalidRangeStart(u32),
}

/// A parsed font prepared for glyph generation.
pub struct FontFace {
	font: fontdue::Font,
	family_name: String,
	style_name: String,
	fontstack_name: String,
	ascender_round: i32,
	charmap: BTreeMap<u32, u16>,
	advances: Vec<u32>,
}

impl FontFace {
	/// Parses the first face in a TTF, OTF, or font collection.
	///
	/// # Errors
	///
	/// Returns [`Error::InvalidFont`] when `bytes` cannot be parsed as a font,
	/// or [`Error::UnsupportedFont`] when the face uses an unsupported feature
	/// or lacks a required family or style name.
	pub fn parse(bytes: &[u8]) -> Result<FontFace, Error> {
		let face = ttf_parser::Face::parse(bytes, 0)
			.map_err(|error| Error::InvalidFont(error.to_string()))?;

		if face.tables().colr.is_some() {
			return Err(Error::UnsupportedFont(
				"COLR color fonts are not supported".to_owned(),
			));
		}

		let family_name = preferred_name(
			&face,
			name_id::TYPOGRAPHIC_FAMILY,
			name_id::FAMILY,
			"family",
		)?;
		let style_name = preferred_name(
			&face,
			name_id::TYPOGRAPHIC_SUBFAMILY,
			name_id::SUBFAMILY,
			"style",
		)?;
		let fontstack_name = format!("{family_name} {style_name}");

		let units_per_em = face.units_per_em();
		let ascender_round = (f64::from(face.ascender()) * f64::from(FONT_SIZE_PX)
			/ f64::from(units_per_em))
		.round() as i32;
		let charmap = extract_charmap(&face);
		let advances = (0..face.number_of_glyphs())
			.map(|glyph_index| {
				face.glyph_hor_advance(GlyphId(glyph_index))
					.map(|advance| {
						glyph::freetype_advance(u32::from(advance), units_per_em, FONT_SIZE_PX)
					})
					.unwrap_or(0)
			})
			.collect();

		let font = fontdue::Font::from_bytes(
			bytes,
			fontdue::FontSettings {
				scale: FONT_SIZE_PX as f32,
				collection_index: 0,
				..fontdue::FontSettings::default()
			},
		)
		.map_err(|message| Error::InvalidFont(message.to_owned()))?;

		Ok(FontFace {
			font,
			family_name,
			style_name,
			fontstack_name,
			ascender_round,
			charmap,
			advances,
		})
	}

	/// Returns name ID 16 (typographic family), falling back to name ID 1.
	pub fn family_name(&self) -> &str {
		&self.family_name
	}

	/// Returns name ID 17 (typographic subfamily), falling back to name ID 2.
	pub fn style_name(&self) -> &str {
		&self.style_name
	}

	/// Returns the MapLibre font stack name in `"{family} {style}"` form.
	pub fn fontstack_name(&self) -> &str {
		&self.fontstack_name
	}

	/// Returns sorted starts of 256-codepoint ranges containing at least one glyph.
	pub fn covered_ranges(&self) -> Vec<u32> {
		self.charmap
			.keys()
			.map(|codepoint| codepoint & !0xff)
			.collect::<BTreeSet<_>>()
			.into_iter()
			.collect()
	}

	/// Returns the number of codepoints mapped to nonzero glyphs by the Unicode cmap.
	pub fn glyph_count(&self) -> usize {
		self.charmap.len()
	}
}

/// Generates one MapLibre glyph PBF for `start..=start + 255`.
///
/// A range with no mapped glyphs still produces a valid PBF containing the
/// font stack name and range string.
///
/// # Errors
///
/// Returns [`Error::InvalidRangeStart`] when `start` is not a multiple of 256.
pub fn generate_range(face: &FontFace, start: u32) -> Result<Vec<u8>, Error> {
	if !start.is_multiple_of(256) {
		return Err(Error::InvalidRangeStart(start));
	}

	let end = start + 255;
	let glyphs = face
		.charmap
		.range(start..=end)
		.map(|(&codepoint, &glyph_index)| glyph::generate(face, codepoint, glyph_index))
		.collect::<Vec<_>>();
	let range = format!("{start}-{end}");
	Ok(pbf::encode_fontstack(
		face.fontstack_name(),
		&range,
		&glyphs,
	))
}

fn preferred_name(
	face: &ttf_parser::Face<'_>,
	preferred_id: u16,
	fallback_id: u16,
	kind: &str,
) -> Result<String, Error> {
	for name_id in [preferred_id, fallback_id] {
		if let Some(value) = face
			.names()
			.into_iter()
			.filter(|name| name.name_id == name_id && name.is_unicode())
			.filter_map(|name| name.to_string())
			.find(|value| !value.is_empty())
		{
			return Ok(value);
		}
	}

	Err(Error::UnsupportedFont(format!(
		"missing Unicode {kind} name (name IDs {preferred_id} and {fallback_id})"
	)))
}

fn extract_charmap(face: &ttf_parser::Face<'_>) -> BTreeMap<u32, u16> {
	let mut charmap = BTreeMap::new();
	let Some(cmap) = face.tables().cmap else {
		return charmap;
	};

	for subtable in cmap
		.subtables
		.into_iter()
		.filter(|table| table.is_unicode())
	{
		subtable.codepoints(|codepoint| {
			if char::from_u32(codepoint).is_none() {
				return;
			}
			if let Some(glyph_id) = subtable.glyph_index(codepoint)
				&& glyph_id.0 != 0
			{
				charmap.insert(codepoint, glyph_id.0);
			}
		});
	}

	charmap
}

#[cfg(test)]
mod tests;
