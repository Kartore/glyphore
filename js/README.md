# @kartore/glyphore

Generate MapLibre glyph SDF PBF ranges from TTF and OTF fonts in browsers,
Node, and the command line.

## Install

```sh
pnpm add @kartore/glyphore
```

## CLI

```sh
npx @kartore/glyphore build fonts/ -o glyphs/
npx @kartore/glyphore info fonts/NotoSans-Regular.ttf
npx @kartore/glyphore info fonts/NotoSans-Regular.ttf --json
```

`build` scans `.ttf` and `.otf` files and writes
`<out>/<family style>/<start>-<end>.pbf`. Spaces in the fontstack directory
name are preserved. Only ranges containing mapped glyphs are written;
`build_pbf_glyphs` differs by also writing empty BMP ranges.

Use `--skip-invalid` to report and skip fonts that cannot be parsed. Without
it, an invalid font stops the build before any output is created.

Use each generated directory with a single-entry `text-font` array, such as
`["Noto Sans Regular"]`. MapLibre joins multiple `text-font` entries with
commas when expanding `{fontstack}`; glyphore does not generate those combined
directories.

## Browser

```js
import {
	freeFont,
	generateRange,
	init,
	parseFont,
} from "@kartore/glyphore";

await init();
const { handle, info } = parseFont(fontBytes);
try {
	const pbf = generateRange(handle, 0);
	console.log(info.fontstackName, pbf);
} finally {
	freeFont(handle);
}
```

Use a one-element array when configuring a MapLibre symbol layer:

```js
// After the style has loaded:
map.setLayoutProperty("place-label", "text-font", [info.fontstackName]);
```

With that single entry, MapLibre substitutes `info.fontstackName` for the glyph
URL's `{fontstack}` placeholder. `info.coveredRanges` lists the sorted range
starts that contain glyphs. `generateRange` accepts any range start that is a
multiple of 256; the values in `info.coveredRanges` are ready to pass directly.

## Node

```js
import { readFile } from "node:fs/promises";
import {
	freeFont,
	generateRange,
	init,
	parseFont,
} from "@kartore/glyphore/node";

await init();
const bytes = await readFile("NotoSans-Regular.ttf");
const { handle } = parseFont(bytes);
try {
	const pbf = generateRange(handle, 8192);
} finally {
	freeFont(handle);
}
```

`parseFont` keeps the parsed font in WebAssembly memory. Always call
`freeFont` when the handle is no longer needed; otherwise the font remains
allocated until the WebAssembly instance is discarded. A second `freeFont`
call for the same handle is harmless, while generating with a released handle
throws an `Error`.

Generated PBF files contain data derived from the source font. Check the
font's license before redistributing them.

## Development

Install the repository's pinned Rust toolchain, the wasm target, the matching
wasm-bindgen CLI, Binaryen's `wasm-opt`, Node, and pnpm:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.125 --locked
pnpm -C js build
pnpm -C js test
pnpm -C js bench
```

Set `GLYPHORE_BENCH_FONT` to a CJK font path to include it in the benchmark.
The build stops if `wasm-bindgen` has a different version or `wasm-opt` is not
available. The generated `pkg/` directory is intentionally not committed.
