/// <reference lib="esnext.disposable" preserve="true" />

/** Metadata extracted from a parsed font. */
export interface FontInfo {
	/** Font family name. */
	readonly familyName: string;
	/** Font style name. */
	readonly styleName: string;
	/**
	 * The PBF font name. For a single-font MapLibre stack, use this as the only
	 * entry in the layer's `text-font` array.
	 */
	readonly fontstackName: string;
	/** Sorted starts of 256-codepoint ranges containing at least one glyph. */
	readonly coveredRanges: readonly number[];
	/** Number of Unicode cmap codepoints assigned to nonzero glyphs. */
	readonly glyphCount: number;
}

/** A loaded font resource held in WebAssembly memory. */
export interface GlyphFont extends Disposable {
	/** Metadata extracted while parsing the font. */
	readonly info: FontInfo;

	/** Releases the font. Calling this more than once is a no-op. */
	[Symbol.dispose](): void;
}

/** A custom source used to initialize the bundled WebAssembly module. */
export type WasmSource = string | URL | ArrayBuffer | Uint8Array;

/** A custom source, or a promise for one, used to initialize WebAssembly. */
export type WasmInput = WasmSource | Promise<WasmSource>;

/** Advanced options for loading a font. */
export interface LoadFontOptions {
	/**
	 * Overrides the bundled WebAssembly input. Only the first `loadFont` call
	 * initializes the module; later calls reuse that initialization.
	 */
	readonly wasm?: WasmInput;
}
