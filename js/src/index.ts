import { loadFontWithWasm } from "./runtime.js";
import type { GlyphFont, LoadFontOptions } from "./types.js";

export { generateRange } from "./runtime.js";

export type {
	FontInfo,
	GlyphFont,
	LoadFontOptions,
	WasmInput,
	WasmSource,
} from "./types.js";

/**
 * Loads a font and keeps it in WebAssembly memory.
 *
 * The bundled WebAssembly module is initialized automatically on the first
 * call. Bind the returned font with `using` to release it at scope exit.
 *
 * @throws An `Error` when `bytes` is not a supported font or WebAssembly
 * initialization fails.
 */
export function loadFont(
	bytes: Uint8Array,
	options: LoadFontOptions = {},
): Promise<GlyphFont> {
	return loadFontWithWasm(
		bytes,
		() =>
			options.wasm ??
			new URL("../pkg/glyphore_wasm_bg.wasm", import.meta.url),
	);
}
