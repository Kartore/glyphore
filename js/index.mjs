import initWasm, {
	freeFont as freeFontWasm,
	generateRange as generateRangeWasm,
	parseFont as parseFontWasm,
} from "./pkg/glyphore_wasm.js";

let initialization;
let initialized = false;

/**
 * Initializes the bundled WebAssembly module exactly once.
 *
 * @param {BufferSource | Promise<Response> | Response} [input]
 * @returns {Promise<void>}
 */
export function init(input) {
	if (initialization === undefined) {
		const wasmInput =
			input === undefined
				? new URL("./pkg/glyphore_wasm_bg.wasm", import.meta.url)
				: input;
		initialization = Promise.resolve(wasmInput)
			.then((resolvedInput) => initWasm({ module_or_path: resolvedInput }))
			.then(() => {
				initialized = true;
			});
	}
	return initialization;
}

/** Parses and stores a font in WebAssembly memory. */
export function parseFont(bytes) {
	assertInitialized();
	return parseFontWasm(bytes);
}

/** Generates one MapLibre glyph PBF. */
export function generateRange(handle, start) {
	assertInitialized();
	return generateRangeWasm(handle, start);
}

/** Releases a font stored in WebAssembly memory. */
export function freeFont(handle) {
	assertInitialized();
	return freeFontWasm(handle);
}

function assertInitialized() {
	if (!initialized) {
		throw new Error("@kartore/glyphore is not initialized; call and await init() first");
	}
}
