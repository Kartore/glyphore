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

```sh
pnpm add @kartore/glyphore
```

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
