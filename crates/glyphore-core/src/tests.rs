use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use super::*;

const FONT_BYTES: &[u8] = include_bytes!("../tests/fixtures/NotoSans-Regular.ttf");
const GOLDEN_RANGES: [u32; 3] = [0, 256, 8192];

fn fixture_face() -> FontFace {
	FontFace::parse(FONT_BYTES).expect("fixture font should parse")
}

fn golden_path(start: u32) -> PathBuf {
	Path::new(env!("CARGO_MANIFEST_DIR"))
		.join("tests/golden")
		.join(format!("{start}-{}.pbf", start + 255))
}

#[test]
fn exposes_names_and_cmap_information() {
	let face = fixture_face();
	assert_eq!(face.family_name(), "Noto Sans");
	assert_eq!(face.style_name(), "Regular");
	assert_eq!(face.fontstack_name(), "Noto Sans Regular");
	assert_eq!(face.glyph_count(), face.charmap.len());

	let expected_ranges = face
		.charmap
		.keys()
		.map(|codepoint| codepoint & !0xff)
		.collect::<BTreeSet<_>>()
		.into_iter()
		.collect::<Vec<_>>();
	assert_eq!(face.covered_ranges(), expected_ranges);
	assert!(
		face.covered_ranges()
			.windows(2)
			.all(|pair| pair[0] < pair[1])
	);
}

#[test]
fn rejects_invalid_font_and_unaligned_range() {
	assert!(matches!(
		FontFace::parse(b"not a font"),
		Err(Error::InvalidFont(_))
	));
	let face = fixture_face();
	assert!(matches!(
		generate_range(&face, 1),
		Err(Error::InvalidRangeStart(1))
	));
}

#[test]
fn empty_range_is_a_valid_named_pbf() {
	let face = fixture_face();
	let start = 0x10000;
	assert!(!face.covered_ranges().contains(&start));
	let decoded = pbf::decode_pbf(&generate_range(&face, start).expect("valid range"));
	assert_eq!(decoded.name, "Noto Sans Regular");
	assert_eq!(decoded.range, "65536-65791");
	assert!(decoded.glyphs.is_empty());
}

#[test]
fn empty_glyph_uses_fontnik_metrics() {
	let face = fixture_face();
	let decoded = pbf::decode_pbf(&generate_range(&face, 0).expect("valid range"));
	let space = &decoded.glyphs[&u32::from(' ')];
	assert_eq!(space.bitmap, vec![0; 36]);
	assert_eq!((space.width, space.height, space.left), (0, 0, 0));
	assert_eq!(space.top, -26);
}

#[test]
fn freetype_advance_rounds_u02f3_to_eight() {
	let face = fixture_face();
	let glyph_index = face.charmap[&0x02f3];
	let parsed = ttf_parser::Face::parse(FONT_BYTES, 0).expect("fixture font should parse");
	let units = parsed
		.glyph_hor_advance(GlyphId(glyph_index))
		.expect("U+02F3 should have a horizontal advance");
	assert_eq!(units, 682);
	assert_eq!(glyph::freetype_advance(682, 2048, FONT_SIZE_PX), 8);
	assert_eq!(face.advances[usize::from(glyph_index)], 8);

	let (fontdue_metrics, _) = face
		.font
		.rasterize_indexed(glyph_index, FONT_SIZE_PX as f32);
	assert!(fontdue_metrics.advance_width < 8.0);
}

#[test]
fn generation_is_byte_deterministic() {
	let face = fixture_face();
	let first = generate_range(&face, 256).expect("valid range");
	let second = generate_range(&face, 256).expect("valid range");
	assert_eq!(first, second);
}

#[test]
fn generated_ranges_match_golden_bytes() {
	let face = fixture_face();
	for start in GOLDEN_RANGES {
		let expected = std::fs::read(golden_path(start)).expect("committed golden should exist");
		let actual = generate_range(&face, start).expect("valid range");
		assert_eq!(actual, expected, "golden mismatch for range {start}");
	}
}

#[test]
#[ignore = "regenerates committed golden files"]
fn regen_golden() {
	let face = fixture_face();
	std::fs::create_dir_all(Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden"))
		.expect("create golden directory");
	for start in GOLDEN_RANGES {
		std::fs::write(
			golden_path(start),
			generate_range(&face, start).expect("valid range"),
		)
		.expect("write golden PBF");
	}
}

#[test]
fn matches_fontnik_reference_metrics() {
	let face = fixture_face();
	for (start, reference_bytes) in [
		(0, include_bytes!("../tests/reference/0-255.pbf").as_slice()),
		(
			256,
			include_bytes!("../tests/reference/256-511.pbf").as_slice(),
		),
	] {
		let actual = pbf::decode_pbf(&generate_range(&face, start).expect("valid range"));
		let reference = pbf::decode_pbf(reference_bytes);
		assert_eq!(actual.name, "Noto Sans Regular");
		assert_eq!(reference.name, "Noto Sans Regular");
		assert_eq!(actual.range, reference.range);
		assert_eq!(
			actual.glyphs.keys().collect::<Vec<_>>(),
			reference.glyphs.keys().collect::<Vec<_>>(),
			"glyph IDs differ for range {start}"
		);

		let mut absolute_difference = 0u64;
		let mut pixel_count = 0u64;
		let mut bitmap_length_mismatches = Vec::new();
		for (id, expected) in &reference.glyphs {
			let generated = &actual.glyphs[id];
			assert_eq!(
				(
					generated.advance,
					generated.left,
					generated.top,
					generated.width,
					generated.height,
				),
				(
					expected.advance,
					expected.left,
					expected.top,
					expected.width,
					expected.height,
				),
				"metric mismatch for U+{id:04X}"
			);
			if generated.bitmap.len() != expected.bitmap.len() {
				bitmap_length_mismatches.push(format!(
					"U+{id:04X}: generated {}, reference {}",
					generated.bitmap.len(),
					expected.bitmap.len()
				));
				continue;
			}
			for (&generated, &expected) in generated.bitmap.iter().zip(&expected.bitmap) {
				absolute_difference +=
					u64::from((i32::from(generated) - i32::from(expected)).unsigned_abs());
				pixel_count += 1;
			}
		}
		assert!(
			bitmap_length_mismatches.is_empty(),
			"bitmap length mismatches for range {start}: {bitmap_length_mismatches:?}"
		);

		let mean_absolute_difference = absolute_difference as f64 / pixel_count.max(1) as f64;
		assert!(
			mean_absolute_difference < 1.5,
			"bitmap mean absolute difference for range {start} was {mean_absolute_difference}"
		);
	}
}
