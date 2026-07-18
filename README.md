# glyphore

Glyph PBF (SDF) generator for [MapLibre GL](https://maplibre.org/)
styles. Pure-Rust core with JS/WASM bindings (browser & Node) and a CLI.

Unlike existing glyph tools (`build_pbf_glyphs`, node-fontnik), glyphore is
built around four guarantees:

1. **Pure Rust, no FreeType** — the same generator compiles to WebAssembly and
   runs in the browser.
2. **Range-level library API** — generate a single 256-codepoint range on
   demand. Built for live style editors ([Kartore](https://github.com/Kartore)):
   drop a font file and use it immediately, no hosting round-trip.
3. **Byte-deterministic output** — the same font always produces the same PBF
   bytes on every platform. Editor previews match CI-hosted assets exactly.
4. **CLI compatible with `build_pbf_glyphs` output layout** — drop-in
   replacement for glyph build pipelines.


## Planned interfaces

```
glyphore build <fonts-dir> -o <out-dir>
glyphore info <font-file>
```

```ts
import { init, parseFont, generateRange } from '@kartore/glyphore';

await init();
const { handle, info } = parseFont(fontBytes);
const pbf = generateRange(handle, 0); // U+0000-U+00FF as glyph PBF
```

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT license](LICENSE-MIT) at your option.
