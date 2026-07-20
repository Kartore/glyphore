import initWasm, {
	freeFont as freeFontWasm,
	generateRange as generateRangeWasm,
	parseFont as parseFontWasm,
	type InitInput,
} from "../pkg/glyphore_wasm.js";
import type { FontInfo, GlyphFont, WasmInput } from "./types.js";

interface WasmFontInfo {
	familyName: string;
	styleName: string;
	fontstackName: string;
	coveredRanges: number[];
	glyphCount: number;
}

interface WasmParsedFont {
	handle: number;
	info: WasmFontInfo;
}

interface FontState {
	handle: number | undefined;
	readonly unregisterToken: object;
}

let initialization: Promise<void> | undefined;
const fontStates = new WeakMap<GlyphFont, FontState>();

const fontFinalizer = new FinalizationRegistry<number>((handle) => {
	freeFontWasm(handle);
});

export async function loadFontWithWasm(
	bytes: Uint8Array,
	wasmInput: () => WasmInput,
): Promise<GlyphFont> {
	await initializeWasm(wasmInput);
	const parsed = parseFontWasm(bytes) as WasmParsedFont;
	return createGlyphFont(parsed);
}

/**
 * Generates the glyph PBF for `start..=start + 255`.
 *
 * `start` must be a multiple of 256.
 *
 * @throws An `Error` when the range is invalid or the font has been disposed.
 * @throws A `TypeError` when `font` was not returned by `loadFont`.
 */
export function generateRange(font: GlyphFont, start: number): Uint8Array {
	const state = fontStates.get(font);
	if (state === undefined) {
		throw new TypeError("font was not returned by loadFont");
	}
	if (state.handle === undefined) {
		throw new Error("font has been disposed");
	}
	return generateRangeWasm(state.handle, start);
}

function initializeWasm(wasmInput: () => WasmInput): Promise<void> {
	if (initialization === undefined) {
		let attempt: Promise<void>;
		attempt = Promise.resolve()
			.then(wasmInput)
			.then((input) =>
				initWasm({ module_or_path: input as InitInput }),
			)
			.then(() => undefined)
			.catch((error: unknown) => {
				if (initialization === attempt) {
					initialization = undefined;
				}
				throw error;
			});
		initialization = attempt;
	}
	return initialization;
}

function freezeFontInfo(info: WasmFontInfo): FontInfo {
	return Object.freeze({
		familyName: info.familyName,
		styleName: info.styleName,
		fontstackName: info.fontstackName,
		coveredRanges: Object.freeze([...info.coveredRanges]),
		glyphCount: info.glyphCount,
	});
}

function createGlyphFont(parsed: WasmParsedFont): GlyphFont {
	const state: FontState = {
		handle: parsed.handle,
		unregisterToken: {},
	};
	const font = Object.freeze({
		info: freezeFontInfo(parsed.info),
		[Symbol.dispose]() {
			disposeFont(state);
		},
	});
	fontStates.set(font, state);
	fontFinalizer.register(font, parsed.handle, state.unregisterToken);
	return font;
}

function disposeFont(state: FontState): void {
	if (state.handle === undefined) {
		return;
	}

	freeFontWasm(state.handle);
	state.handle = undefined;
	fontFinalizer.unregister(state.unregisterToken);
}
