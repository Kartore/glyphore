import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import {
	freeFont,
	generateRange,
	init,
	parseFont,
} from "@kartore/glyphore/node";

// Keep the benchmark inert if it is passed to Node's test runner directly.
// Run it with `node test/bench.mjs` or `pnpm bench`.
if (process.env.NODE_TEST_CONTEXT === undefined) {
	await main();
}

async function main() {
	await init();

	const fixturePath = new URL(
		"../../crates/glyphore-core/tests/fixtures/NotoSans-Regular.ttf",
		import.meta.url,
	);
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

async function benchmarkFont(label, path) {
	const bytes = await readFile(path);
	let started = performance.now();
	const parsed = parseFont(bytes);
	const parseMilliseconds = performance.now() - started;

	let totalPbfBytes = 0;
	started = performance.now();
	let generateMilliseconds;
	try {
		for (const start of parsed.info.coveredRanges) {
			totalPbfBytes += generateRange(parsed.handle, start).length;
		}
		generateMilliseconds = performance.now() - started;
	} finally {
		freeFont(parsed.handle);
	}

	return {
		label,
		fontBytes: bytes.length,
		glyphCount: parsed.info.glyphCount,
		coveredRangeCount: parsed.info.coveredRanges.length,
		parseMilliseconds: round(parseMilliseconds),
		generateMilliseconds: round(generateMilliseconds),
		totalPbfBytes,
	};
}

function round(value) {
	return Math.round(value * 100) / 100;
}
