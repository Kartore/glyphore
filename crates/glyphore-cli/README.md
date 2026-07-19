# glyphore

MapLibre glyph PBF generation for Rust, with a native command-line interface.

## CLI

```sh
cargo install glyphore
glyphore build ./fonts -o ./public/glyphs
glyphore info ./fonts/NotoSans-Regular.ttf
```

The complete commands are:

```text
glyphore build <fonts-dir> -o <out-dir> [--skip-invalid]
glyphore info <font-file> [--json]
```

`build` writes each font's covered 256-codepoint ranges below a directory named
with its internal fontstack name. `--skip-invalid` reports and excludes fonts
that cannot be parsed. `info --json` prints the extracted font metadata as JSON.

## Rust API

The library target re-exports the glyph API from `glyphore-core`. To use the
API without compiling the CLI dependency, disable default features:

```sh
cargo add glyphore --no-default-features
```

Or add it to `Cargo.toml`:

```toml
[dependencies]
glyphore = { version = "0.1.0", default-features = false }
```

```rust
use glyphore::{FontFace, generate_range};

fn main() -> Result<(), Box<dyn std::error::Error>> {
	let bytes = std::fs::read("NotoSans-Regular.ttf")?;
	let face = FontFace::parse(&bytes)?;
	let pbf = generate_range(&face, 0)?;
	std::fs::write("0-255.pbf", pbf)?;
	Ok(())
}
```

## Features

- `cli` (default): builds the `glyphore` executable and enables argument
  parsing with `clap`.
- With default features disabled, only the Rust library API and
  `glyphore-core` dependency remain.

Generated PBF files contain data derived from the source font. Check the
font's license before redistributing them.

## License

Licensed under either Apache-2.0 or MIT, at your option.
