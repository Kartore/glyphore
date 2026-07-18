use crate::{FONT_SIZE_PX, FontFace};

const BUFFER: usize = 3;
const RADIUS: usize = 8;
const CUTOFF: f64 = 0.25;

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct Glyph {
	pub(crate) id: u32,
	pub(crate) bitmap: Vec<u8>,
	pub(crate) width: u32,
	pub(crate) height: u32,
	pub(crate) left: i32,
	pub(crate) top: i32,
	pub(crate) advance: u32,
}

pub(crate) fn freetype_advance(advance_units: u32, units_per_em: u16, size_px: u32) -> u32 {
	let x_scale = (i64::from(size_px * 64) << 16) / i64::from(units_per_em);
	let advance_26_6 = (i64::from(advance_units) * x_scale + 0x8000) >> 16;
	(advance_26_6 >> 6) as u32
}

pub(crate) fn generate(face: &FontFace, codepoint: u32, glyph_index: u16) -> Glyph {
	let advance = face.advances[usize::from(glyph_index)];
	let (metrics, coverage) = face
		.font
		.rasterize_indexed(glyph_index, FONT_SIZE_PX as f32);

	if metrics.width == 0 || metrics.height == 0 {
		// fontnik keeps the 3px border even when the unbuffered glyph is empty.
		let buffered_side = BUFFER * 2;
		return Glyph {
			id: codepoint,
			bitmap: vec![0; buffered_side * buffered_side],
			top: -face.ascender_round,
			advance,
			..Glyph::default()
		};
	}

	let buffered = sdf_glyph_renderer::BitmapGlyph::from_unbuffered(
		&coverage,
		metrics.width,
		metrics.height,
		BUFFER,
	)
	.expect("fontdue coverage dimensions must match its metrics");
	let bitmap = buffered
		.render_sdf(RADIUS)
		.into_iter()
		.map(|distance| {
			let value = 255.0 - 255.0 * (distance + CUTOFF);
			value.round().clamp(0.0, 255.0) as u8
		})
		.collect();
	let bitmap_top = metrics.ymin + metrics.height as i32;

	Glyph {
		id: codepoint,
		bitmap,
		width: metrics.width as u32,
		height: metrics.height as u32,
		left: metrics.xmin,
		top: bitmap_top - face.ascender_round,
		advance,
	}
}
