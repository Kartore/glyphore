#[cfg(test)]
use std::collections::BTreeMap;

use crate::glyph::Glyph;

const WIRE_VARINT: u8 = 0;
const WIRE_LENGTH_DELIMITED: u8 = 2;

pub(crate) fn encode_fontstack(name: &str, range: &str, glyphs: &[Glyph]) -> Vec<u8> {
	let mut fontstack = Vec::new();
	write_bytes(1, name.as_bytes(), &mut fontstack);
	write_bytes(2, range.as_bytes(), &mut fontstack);
	for glyph in glyphs {
		let encoded = encode_glyph(glyph);
		write_bytes(3, &encoded, &mut fontstack);
	}

	let mut root = Vec::new();
	write_bytes(1, &fontstack, &mut root);
	root
}

fn encode_glyph(glyph: &Glyph) -> Vec<u8> {
	let mut output = Vec::new();
	write_unsigned(1, u64::from(glyph.id), &mut output);
	if !glyph.bitmap.is_empty() {
		write_bytes(2, &glyph.bitmap, &mut output);
		write_unsigned(3, u64::from(glyph.width), &mut output);
		write_unsigned(4, u64::from(glyph.height), &mut output);
	}
	write_signed(5, glyph.left, &mut output);
	write_signed(6, glyph.top, &mut output);
	write_unsigned(7, u64::from(glyph.advance), &mut output);
	output
}

fn write_key(field: u8, wire_type: u8, output: &mut Vec<u8>) {
	write_varint(u64::from((field << 3) | wire_type), output);
}

fn write_unsigned(field: u8, value: u64, output: &mut Vec<u8>) {
	write_key(field, WIRE_VARINT, output);
	write_varint(value, output);
}

fn write_signed(field: u8, value: i32, output: &mut Vec<u8>) {
	let value = i64::from(value);
	let zigzag = ((value << 1) ^ (value >> 31)) as u64;
	write_unsigned(field, zigzag, output);
}

fn write_bytes(field: u8, value: &[u8], output: &mut Vec<u8>) {
	write_key(field, WIRE_LENGTH_DELIMITED, output);
	write_varint(value.len() as u64, output);
	output.extend_from_slice(value);
}

fn write_varint(mut value: u64, output: &mut Vec<u8>) {
	while value >= 0x80 {
		output.push((value as u8 & 0x7f) | 0x80);
		value >>= 7;
	}
	output.push(value as u8);
}

#[cfg(test)]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct DecodedGlyph {
	pub(crate) id: u32,
	pub(crate) bitmap: Vec<u8>,
	pub(crate) width: u32,
	pub(crate) height: u32,
	pub(crate) left: i32,
	pub(crate) top: i32,
	pub(crate) advance: u32,
}

#[cfg(test)]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct DecodedPbf {
	pub(crate) name: String,
	pub(crate) range: String,
	pub(crate) glyphs: BTreeMap<u32, DecodedGlyph>,
}

#[cfg(test)]
pub(crate) fn decode_pbf(data: &[u8]) -> DecodedPbf {
	let mut reader = Reader { data, position: 0 };
	let mut decoded = DecodedPbf::default();
	while !reader.done() {
		assert_eq!(reader.varint(), (1 << 3) | 2, "expected fontstack message");
		let mut fontstack = Reader {
			data: reader.bytes(),
			position: 0,
		};
		while !fontstack.done() {
			match fontstack.varint() >> 3 {
				1 => {
					decoded.name = String::from_utf8(fontstack.bytes().to_vec())
						.expect("fontstack name must be UTF-8");
				}
				2 => {
					decoded.range =
						String::from_utf8(fontstack.bytes().to_vec()).expect("range must be UTF-8");
				}
				3 => {
					let glyph = decode_glyph(fontstack.bytes());
					decoded.glyphs.insert(glyph.id, glyph);
				}
				field => panic!("unknown fontstack field {field}"),
			}
		}
	}
	decoded
}

#[cfg(test)]
fn decode_glyph(data: &[u8]) -> DecodedGlyph {
	let mut reader = Reader { data, position: 0 };
	let mut glyph = DecodedGlyph::default();
	while !reader.done() {
		match reader.varint() >> 3 {
			1 => glyph.id = reader.varint() as u32,
			2 => glyph.bitmap = reader.bytes().to_vec(),
			3 => glyph.width = reader.varint() as u32,
			4 => glyph.height = reader.varint() as u32,
			5 => glyph.left = reader.svarint() as i32,
			6 => glyph.top = reader.svarint() as i32,
			7 => glyph.advance = reader.varint() as u32,
			field => panic!("unknown glyph field {field}"),
		}
	}
	glyph
}

#[cfg(test)]
struct Reader<'a> {
	data: &'a [u8],
	position: usize,
}

#[cfg(test)]
impl<'a> Reader<'a> {
	fn varint(&mut self) -> u64 {
		let mut value = 0;
		let mut shift = 0;
		loop {
			let byte = self.data[self.position];
			self.position += 1;
			value |= u64::from(byte & 0x7f) << shift;
			if byte & 0x80 == 0 {
				return value;
			}
			shift += 7;
		}
	}

	fn svarint(&mut self) -> i64 {
		let raw = self.varint();
		((raw >> 1) as i64) ^ -((raw & 1) as i64)
	}

	fn bytes(&mut self) -> &'a [u8] {
		let length = self.varint() as usize;
		let end = self.position + length;
		let value = &self.data[self.position..end];
		self.position = end;
		value
	}

	fn done(&self) -> bool {
		self.position >= self.data.len()
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn varint_known_values() {
		for (value, expected) in [
			(0, vec![0]),
			(1, vec![1]),
			(127, vec![127]),
			(128, vec![0x80, 1]),
			(300, vec![0xac, 2]),
		] {
			let mut encoded = Vec::new();
			write_varint(value, &mut encoded);
			assert_eq!(encoded, expected);
			assert_eq!(
				Reader {
					data: &encoded,
					position: 0,
				}
				.varint(),
				value
			);
		}
	}

	#[test]
	fn svarint_round_trip_including_negative_values() {
		for value in [i32::MIN, -26, -1, 0, 1, 26, i32::MAX] {
			let mut encoded = Vec::new();
			write_signed(5, value, &mut encoded);
			let mut reader = Reader {
				data: &encoded,
				position: 0,
			};
			assert_eq!(reader.varint(), (5 << 3) as u64);
			assert_eq!(reader.svarint(), i64::from(value));
		}
	}

	#[test]
	fn glyph_round_trip_preserves_negative_metrics() {
		let expected = Glyph {
			id: 65,
			bitmap: vec![0, 127, 255],
			width: 1,
			height: 3,
			left: -2,
			top: -26,
			advance: 8,
		};
		let encoded = encode_fontstack("Test Regular", "0-255", &[expected]);
		let decoded = decode_pbf(&encoded);
		assert_eq!(decoded.name, "Test Regular");
		assert_eq!(decoded.range, "0-255");
		assert_eq!(
			decoded.glyphs[&65],
			DecodedGlyph {
				id: 65,
				bitmap: vec![0, 127, 255],
				width: 1,
				height: 3,
				left: -2,
				top: -26,
				advance: 8,
			}
		);
	}
}
