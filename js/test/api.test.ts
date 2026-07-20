import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
	generateRange as generateBrowserRange,
	loadFont as loadBrowserFont,
} from "@kartore/glyphore";
import {
	generateRange,
	loadFont,
	type GlyphFont,
} from "@kartore/glyphore/node";

const fixtureFont = await readFile(
	new URL(
		"../../crates/glyphore-core/tests/fixtures/NotoSans-Regular.ttf",
		import.meta.url,
	),
);
const wasmBytes = await readFile(
	new URL("../pkg/glyphore_wasm_bg.wasm", import.meta.url),
);
const goldenDirectory = new URL(
	"../../crates/glyphore-core/tests/golden/",
	import.meta.url,
);
const goldenRanges = [0, 256, 8192];

test("JavaScript API", async (context) => {
	const fonts = new Set<GlyphFont>();
	context.after(() => {
		for (const font of fonts) {
			font[Symbol.dispose]();
		}
	});

	await context.test("browser entry accepts an explicit wasm input", async () => {
		using font = await loadBrowserFont(fixtureFont, { wasm: wasmBytes });
		fonts.add(font);
		assert.equal(font.info.fontstackName, "Noto Sans Regular");
		assert.ok(generateBrowserRange(font, 0) instanceof Uint8Array);
	});

	const primary = await loadFont(fixtureFont);
	fonts.add(primary);

	await context.test("loadFont returns metadata without exposing a handle", () => {
		assert.equal("handle" in primary, false);
		assert.equal("generateRange" in primary, false);
		assert.equal("dispose" in primary, false);
		assert.equal(Object.getPrototypeOf(primary), Object.prototype);
		assert.equal(typeof primary[Symbol.dispose], "function");
		assert.ok(Object.isFrozen(primary));
		assert.deepEqual(primary.info, {
			familyName: "Noto Sans",
			styleName: "Regular",
			fontstackName: "Noto Sans Regular",
			coveredRanges: primary.info.coveredRanges,
			glyphCount: 2188,
		});
		assert.ok(Object.isFrozen(primary.info));
		assert.ok(Object.isFrozen(primary.info.coveredRanges));
		assert.ok(primary.info.coveredRanges.includes(0));
		assert.ok(primary.info.coveredRanges.includes(8192));
		assert.ok(
			primary.info.coveredRanges
				.slice(1)
				.every(
					(start, index) => start > primary.info.coveredRanges[index]!,
				),
		);
	});

	await context.test("generateRange matches every selected core golden byte", async () => {
		for (const start of goldenRanges) {
			const expected = await readFile(
				new URL(`${start}-${start + 255}.pbf`, goldenDirectory),
			);
			const actual = generateRange(primary, start);
			assert.ok(actual instanceof Uint8Array);
			assert.equal(Buffer.compare(Buffer.from(actual), expected), 0);
		}
	});

	await context.test("invalid fonts and ranges are Errors", async () => {
		await assert.rejects(
			loadFont(new Uint8Array([0, 1, 2, 3])),
			(error) => error instanceof Error && error.message.includes("invalid font"),
		);
		assert.throws(() => generateRange(primary, 1), /range start 1/);
		assert.throws(
			() => generateRange({} as GlyphFont, 0),
			/font was not returned by loadFont/,
		);
	});

	await context.test("Symbol.dispose is idempotent", async () => {
		const disposed = await loadFont(fixtureFont);
		fonts.add(disposed);
		disposed[Symbol.dispose]();
		assert.throws(
			() => generateRange(disposed, 0),
			/font has been disposed/,
		);
		assert.doesNotThrow(() => disposed[Symbol.dispose]());
	});

	await context.test("using disposes at scope exit", async () => {
		let disposed: GlyphFont;
		{
			using font = await loadFont(fixtureFont);
			fonts.add(font);
			disposed = font;
			assert.ok(generateRange(font, 0) instanceof Uint8Array);
		}
		assert.throws(
			() => generateRange(disposed, 0),
			/font has been disposed/,
		);
	});

	await context.test("loaded fonts have independent lifetimes", async () => {
		const [first, second] = await Promise.all([
			loadFont(fixtureFont),
			loadFont(fixtureFont),
		]);
		fonts.add(first);
		fonts.add(second);
		first[Symbol.dispose]();

		const expected = await readFile(new URL("0-255.pbf", goldenDirectory));
		const actual = generateRange(second, 0);
		assert.equal(Buffer.compare(Buffer.from(actual), expected), 0);
		second[Symbol.dispose]();
	});

	await context.test("primary font can be disposed", () => {
		primary[Symbol.dispose]();
		assert.throws(
			() => generateRange(primary, 0),
			/font has been disposed/,
		);
	});
});
