# glyphore-core

Low-level Rust engine for generating MapLibre-compatible glyph PBF ranges from
TTF and OTF fonts.

Most applications should depend on the `glyphore` facade crate. Use
`glyphore-core` directly when building another integration layer or when the
smallest dependency surface is preferred.

## Install

```sh
cargo add glyphore-core
```

Or add it to `Cargo.toml`:

```toml
[dependencies]
glyphore-core = "0.1.0"
```

## Usage

```rust
use glyphore_core::{FontFace, generate_range};

fn main() -> Result<(), Box<dyn std::error::Error>> {
	let bytes = std::fs::read("NotoSans-Regular.ttf")?;
	let face = FontFace::parse(&bytes)?;

	for start in face.covered_ranges() {
		let pbf = generate_range(&face, start)?;
		std::fs::write(format!("{start}-{}.pbf", start + 255), pbf)?;
	}
	Ok(())
}
```

The crate performs no filesystem access itself. Callers provide font bytes and
decide where generated ranges are written.

Generated PBF files contain data derived from the source font. Check the
font's license before redistributing them.

## License

Licensed under either Apache-2.0 or MIT, at your option.
