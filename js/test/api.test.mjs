import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
	freeFont,
	generateRange,
	init,
	parseFont,
} from "@kartore/glyphore/node";

const fixtureFont = await readFile(
	new URL(
		"../../crates/glyphore-core/tests/fixtures/NotoSans-Regular.ttf",
		import.meta.url,
	),
);
const goldenDirectory = new URL(
	"../../crates/glyphore-core/tests/golden/",
	import.meta.url,
);
const goldenRanges = [0, 256, 8192];

test("Node entry API", async (context) => {
	let primary;

	await context.test("font APIs fail clearly before init", () => {
		assert.throws(() => parseFont(fixtureFont), /not initialized/);
		assert.throws(() => generateRange(1, 0), /not initialized/);
		assert.throws(() => freeFont(1), /not initialized/);
	});

	await context.test("init caches one promise", async () => {
		const firstInitialization = init();
		const secondInitialization = init();
		assert.strictEqual(secondInitialization, firstInitialization);
		await firstInitialization;
	});

	await context.test("parseFont returns the expected FontInfo", () => {
		primary = parseFont(fixtureFont);
		assert.ok(Number.isInteger(primary.handle));
		assert.ok(primary.handle > 0);
		assert.deepEqual(primary.info, {
			familyName: "Noto Sans",
			styleName: "Regular",
			fontstackName: "Noto Sans Regular",
			coveredRanges: primary.info.coveredRanges,
			glyphCount: 2188,
		});
		assert.ok(Array.isArray(primary.info.coveredRanges));
		assert.ok(primary.info.coveredRanges.includes(0));
		assert.ok(primary.info.coveredRanges.includes(8192));
		assert.ok(
			primary.info.coveredRanges
				.slice(1)
				.every((start, index) => start > primary.info.coveredRanges[index]),
		);
	});

	await context.test("generateRange matches every selected core golden byte", async () => {
		for (const start of goldenRanges) {
			const expected = await readFile(
				new URL(`${start}-${start + 255}.pbf`, goldenDirectory),
			);
			const actual = generateRange(primary.handle, start);
			assert.ok(actual instanceof Uint8Array);
			assert.equal(Buffer.compare(Buffer.from(actual), expected), 0);
		}
	});

	await context.test("invalid inputs and handles are Errors", () => {
		assert.throws(
			() => parseFont(new Uint8Array([0, 1, 2, 3])),
			(error) => error instanceof Error && error.message.includes("invalid font"),
		);
		assert.throws(() => generateRange(primary.handle, 1), /range start 1/);
		assert.throws(() => generateRange(0, 0), /unknown font handle 0/);
		assert.throws(() => freeFont(0), /unknown font handle 0/);
	});

	await context.test("released handles fail generation and tolerate double free", () => {
		const released = parseFont(fixtureFont);
		freeFont(released.handle);
		assert.throws(
			() => generateRange(released.handle, 0),
			new RegExp(`unknown font handle ${released.handle}`),
		);
		assert.doesNotThrow(() => freeFont(released.handle));
	});

	await context.test("font handles are independent", async () => {
		const first = parseFont(fixtureFont);
		const second = parseFont(fixtureFont);
		assert.notEqual(first.handle, second.handle);
		freeFont(first.handle);

		const expected = await readFile(new URL("0-255.pbf", goldenDirectory));
		const actual = generateRange(second.handle, 0);
		assert.equal(Buffer.compare(Buffer.from(actual), expected), 0);
		freeFont(second.handle);
	});

	await context.test("primary handle can be released", () => {
		freeFont(primary.handle);
		assert.throws(
			() => generateRange(primary.handle, 0),
			new RegExp(`unknown font handle ${primary.handle}`),
		);
	});
});
