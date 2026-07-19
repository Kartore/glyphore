# glyphore

Glyph PBF (SDF) generator for [MapLibre GL](https://maplibre.org/)
styles. A pure-Rust core powers the same JavaScript/WebAssembly API in
browsers and Node.

Unlike existing glyph tools (`build_pbf_glyphs`, node-fontnik), glyphore is
focused on two things:

1. **Pure Rust, no FreeType** — the same generator compiles to WebAssembly and
   runs in the browser.
2. **Range-level library API** — generate a single 256-codepoint range on
   demand. Built for live style editors ([Kartore](https://github.com/Kartore)):
   drop a font file and use it immediately, no hosting round-trip.

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
  - run: npx @kartore/glyphore build fonts/ -o glyphs/
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

Use `info.fontstackName` for MapLibre's `text-font` value and the glyph URL's
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

See the [`glyphore` crate README](crates/glyphore-cli/README.md) for feature
selection and the low-level [`glyphore-core` README](crates/glyphore-core/README.md)
for direct core usage.

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
