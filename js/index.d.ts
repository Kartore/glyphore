/** A numeric handle for a font stored in WebAssembly memory. */
export type FontHandle = number;

/** Metadata extracted from a parsed font. */
export type FontInfo = {
	familyName: string;
	styleName: string;
	/** The value for `text-font` and the glyph URL's `{fontstack}` placeholder. */
	fontstackName: string;
	/** Sorted starts of 256-codepoint ranges containing at least one glyph. */
	coveredRanges: number[];
	/** Number of Unicode cmap codepoints assigned to nonzero glyphs. */
	glyphCount: number;
};

/** Initializes the bundled WebAssembly module exactly once. */
export function init(
	input?: BufferSource | Promise<Response> | Response,
): Promise<void>;

/**
 * Parses and stores a font in WebAssembly memory.
 *
 * The returned handle must eventually be passed to `freeFont` or the font's
 * memory remains allocated for the lifetime of the WebAssembly instance.
 */
export function parseFont(bytes: Uint8Array): {
	handle: FontHandle;
	info: FontInfo;
};

/** Generates the glyph PBF for `start..=start + 255`. */
export function generateRange(
	handle: FontHandle,
	start: number,
): Uint8Array;

/**
 * Releases a stored font. Calling this twice for the same issued handle is a no-op.
 */
export function freeFont(handle: FontHandle): void;
