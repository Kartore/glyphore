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

```ts
import { generateRange, loadFont } from "@kartore/glyphore";

{
	using font = await loadFont(fontBytes);
	const pbf = generateRange(font, 0);
	console.log(font.info.fontstackName, pbf);
	map.setLayoutProperty("place-label", "text-font", [
		font.info.fontstackName,
	]);
}
```

With that single entry, MapLibre substitutes `font.info.fontstackName` for the
glyph URL's `{fontstack}` placeholder. `font.info.coveredRanges` lists the
sorted range starts that contain glyphs. `generateRange(font, start)` accepts
any range start that is a multiple of 256; the values in
`font.info.coveredRanges` are ready to pass directly.

## Node

```ts
import { readFile } from "node:fs/promises";
import { generateRange, loadFont } from "@kartore/glyphore/node";

const bytes = await readFile("NotoSans-Regular.ttf");

{
	using font = await loadFont(bytes);
	const pbf = generateRange(font, 8192);
}
```

`loadFont` initializes WebAssembly automatically and keeps the parsed font in
its memory. The returned resource implements the standard `Disposable`
protocol, so `using` releases it when control leaves the block, including on
an exception or early return. `generateRange(font, start)` is a standalone
function. A finalizer provides fallback cleanup if `using` is omitted, but its
timing is not guaranteed.

Generated PBF files contain data derived from the source font. Check the
font's license before redistributing them.

## Development

Install the repository's pinned Rust toolchain, the wasm target, the matching
wasm-bindgen CLI, Binaryen's `wasm-opt`, Node, and pnpm:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.125 --locked
pnpm build
pnpm typecheck
pnpm test
pnpm bench
```

Set `GLYPHORE_BENCH_FONT` to a CJK font path to include it in the benchmark.
The build stops if `wasm-bindgen` has a different version or `wasm-opt` is not
available. The generated `pkg/` and `dist/` directories are intentionally not
committed.
