import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { generateRange, loadFont } from "@kartore/glyphore/node";

// Keep the benchmark inert if it is passed to Node's test runner directly.
// Run it with `node test/bench.ts` or `pnpm bench`.
if (process.env.NODE_TEST_CONTEXT === undefined) {
	await main();
}

async function main(): Promise<void> {
	const fixturePath = new URL(
		"../../crates/glyphore-core/tests/fixtures/NotoSans-Regular.ttf",
		import.meta.url,
	);
	{
		using _warmup = await loadFont(await readFile(fixturePath));
	}
	const results = [await benchmarkFont("Noto Sans Regular", fixturePath)];

	if (process.env.GLYPHORE_BENCH_FONT === undefined) {
		console.error("CJK benchmark skipped: GLYPHORE_BENCH_FONT is not set");
	} else {
		results.push(
			await benchmarkFont("GLYPHORE_BENCH_FONT", process.env.GLYPHORE_BENCH_FONT),
		);
	}

	console.log(JSON.stringify({ fonts: results }, null, 2));
}

async function benchmarkFont(label: string, path: string | URL) {
	const bytes = await readFile(path);
	let started = performance.now();
	using font = await loadFont(bytes);
	const parseMilliseconds = performance.now() - started;

	let totalPbfBytes = 0;
	started = performance.now();
	for (const start of font.info.coveredRanges) {
		totalPbfBytes += generateRange(font, start).length;
	}
	const generateMilliseconds = performance.now() - started;

	return {
		label,
		fontBytes: bytes.length,
		glyphCount: font.info.glyphCount,
		coveredRangeCount: font.info.coveredRanges.length,
		parseMilliseconds: round(parseMilliseconds),
		generateMilliseconds: round(generateMilliseconds),
		totalPbfBytes,
	};
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}
