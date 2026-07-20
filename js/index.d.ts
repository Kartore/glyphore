/** A numeric handle for a font stored in WebAssembly memory. */
export type FontHandle = number;

/** Metadata extracted from a parsed font. */
export type FontInfo = {
	familyName: string;
	styleName: string;
	/**
	 * The PBF font name. For a single-font MapLibre stack, use this as the only
	 * entry in the layer's `text-font` array.
	 */
	fontstackName: string;
	/** Sorted starts of 256-codepoint ranges containing at least one glyph. */
	coveredRanges: number[];
	/** Number of Unicode cmap codepoints assigned to nonzero glyphs. */
	glyphCount: number;
};

/**
 * Initializes the bundled WebAssembly module exactly once.
 *
 * Call and await this before using any font function.
 */
export function init(
	input?: BufferSource | Promise<Response> | Response,
): Promise<void>;

/**
 * Parses and stores a font in WebAssembly memory.
 *
 * The returned handle must eventually be passed to `freeFont` or the font's
 * memory remains allocated for the lifetime of the WebAssembly instance.
 * Throws an `Error` when `bytes` is not a supported font.
 */
export function parseFont(bytes: Uint8Array): {
	handle: FontHandle;
	info: FontInfo;
};

/**
 * Generates the glyph PBF for `start..=start + 255`.
 *
 * `start` must be a multiple of 256. Throws an `Error` for an invalid start or
 * an unknown or released handle.
 */
export function generateRange(
	handle: FontHandle,
	start: number,
): Uint8Array;

/**
 * Releases a stored font. Calling this twice for the same issued handle is a
 * no-op. Throws an `Error` when the handle was never issued.
 */
export function freeFont(handle: FontHandle): void;
