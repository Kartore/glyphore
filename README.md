# glyphore

Glyph PBF (SDF) generator for [MapLibre GL](https://maplibre.org/)
styles. Build static glyph directories with the CLI, or generate individual
256-codepoint ranges on demand from Rust, browsers, and Node.

The range API is designed for live style editors such as
[Kartore](https://github.com/Kartore): drop a font file and make it available
immediately, without a separate glyph build and hosting step.

## Install

### JavaScript

```sh
pnpm add @kartore/glyphore
```

### Rust with Cargo

Add the Rust API without the CLI dependency:

```sh
cargo add glyphore --no-default-features
```

Use the lower-level engine directly when building another integration layer:

```sh
cargo add glyphore-core
```

Install the native command-line interface with Cargo:

```sh
cargo install glyphore
```

## CLI

Build every covered glyph range from the TTF and OTF files in a directory:

```sh
npx @kartore/glyphore build fonts/ -o glyphs/
npx @kartore/glyphore info fonts/NotoSans-Regular.ttf
```

The output uses each font's internal fontstack name as its directory, including
spaces: `glyphs/Noto Sans Regular/0-255.pbf`. Only ranges containing mapped
glyphs are written; unlike `build_pbf_glyphs`, empty ranges are omitted.

These per-font directories are directly usable with a single-entry
`text-font` array. MapLibre joins multiple `text-font` entries with commas when
expanding `{fontstack}`; glyphore does not generate those combined directories.

The native CLI installed through Cargo offers the same commands and output
layout:

```sh
glyphore build fonts/ -o glyphs/
```

For GitHub Actions, the build can run with Node alone:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 24
  # Pin glyphore so the generator cannot change when the latest tag advances.
  - run: npx --yes @kartore/glyphore@0.1.1 build fonts/ -o glyphs/
```

Generated PBF files contain data derived from the source font. Check the
font's license before redistributing them.

## Browser

```ts
import {
	freeFont,
	generateRange,
	init,
	parseFont,
} from "@kartore/glyphore";

await init();
const { handle, info } = parseFont(fontBytes);
try {
	// U+0000–U+00FF. Range starts must be multiples of 256.
	const pbf = generateRange(handle, 0);
	console.log(info.fontstackName, pbf);
} finally {
	// Parsed fonts remain in WebAssembly memory until explicitly released.
	freeFont(handle);
}
```

Use `[info.fontstackName]` as a symbol layer's `text-font` array. With that
single entry, MapLibre substitutes the same name for the glyph URL's
`{fontstack}` placeholder. `info.coveredRanges` contains the sorted range
starts that have at least one glyph.

For Node, import the same API from `@kartore/glyphore/node`; its `init()` reads
the bundled WebAssembly file from the package. See [the package README](js/README.md)
for complete browser and Node examples.

## Rust

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

See the [`glyphore` API documentation](https://docs.rs/glyphore) for feature
selection and the low-level
[`glyphore-core` API documentation](https://docs.rs/glyphore-core) for direct
core usage.

## Development

```sh
cargo fmt --check
cargo clippy --workspace -- -D warnings
cargo test --workspace
pnpm -C js build
pnpm -C js test
```

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT license](LICENSE-MIT) at your option.
