import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixtureFont = fileURLToPath(
	new URL(
		"../../crates/glyphore-core/tests/fixtures/NotoSans-Regular.ttf",
		import.meta.url,
	),
);
const fixtureDirectory = fileURLToPath(
	new URL("../../crates/glyphore-core/tests/fixtures/", import.meta.url),
);
const goldenDirectory = fileURLToPath(
	new URL("../../crates/glyphore-core/tests/golden/", import.meta.url),
);
const fontstackName = "Noto Sans Regular";
const infoJson =
	'{"familyName":"Noto Sans","styleName":"Regular",' +
	'"fontstackName":"Noto Sans Regular","coveredRanges":' +
	"[0,256,512,768,1024,1280,7424,7680,7936,8192,8448,8704," +
	"8960,9472,9728,10496,11264,11776,42752,64256,65024,65280]," +
	'"glyphCount":2188}\n';

test("CLI", async (context) => {
	const temporaryRoot = await mkdtemp(join(tmpdir(), "glyphore-cli-"));
	context.after(() => rm(temporaryRoot, { recursive: true, force: true }));

	await context.test("Node and Rust builds match for every covered range", async () => {
		const nodeOutput = join(temporaryRoot, "node-output");
		const rustOutput = join(temporaryRoot, "rust-output");
		const node = runNodeCli([
			"build",
			fixtureDirectory,
			"-o",
			nodeOutput,
		]);
		const rust = runRustCli([
			"build",
			fixtureDirectory,
			"-o",
			rustOutput,
		]);
		assert.equal(node.status, 0, node.stderr);
		assert.equal(rust.status, 0, rust.stderr);
		assert.equal(node.stdout, "Noto Sans Regular: 22 ranges\n");
		assert.equal(rust.stdout, node.stdout);
		await assertMatchingOutputs(nodeOutput, rustOutput);
	});

	await context.test("info output matches between Node and Rust", () => {
		const nodeJson = runNodeCli(["info", fixtureFont, "--json"]);
		const rustJson = runRustCli(["info", fixtureFont, "--json"]);
		assert.equal(nodeJson.status, 0, nodeJson.stderr);
		assert.equal(rustJson.status, 0, rustJson.stderr);
		assert.equal(nodeJson.stdout, infoJson);
		assert.equal(rustJson.stdout, infoJson);

		const nodeHuman = runNodeCli(["info", fixtureFont]);
		const rustHuman = runRustCli(["info", fixtureFont]);
		assert.equal(nodeHuman.status, 0, nodeHuman.stderr);
		assert.equal(rustHuman.status, 0, rustHuman.stderr);
		assert.equal(rustHuman.stdout, nodeHuman.stdout);
	});

	await context.test("invalid fonts fail without output and can be skipped", async () => {
		const input = join(temporaryRoot, "invalid-input");
		await mkdir(input);
		await copyFile(fixtureFont, join(input, "NotoSans-Regular.ttf"));
		await writeFile(join(input, "broken.ttf"), "not a font");

		for (const [name, runCli] of [
			["node", runNodeCli],
			["rust", runRustCli],
		] as const) {
			const failedOutput = join(temporaryRoot, `${name}-invalid-output`);
			const failed = runCli(["build", input, "-o", failedOutput]);
			assert.equal(failed.status, 1);
			assert.match(failed.stderr, /broken\.ttf/);
			assert.equal(existsSync(failedOutput), false);

			const skippedOutput = join(temporaryRoot, `${name}-skipped-output`);
			const skipped = runCli([
				"build",
				input,
				"-o",
				skippedOutput,
				"--skip-invalid",
			]);
			assert.equal(skipped.status, 0, skipped.stderr);
			assert.match(skipped.stderr, /skipping `broken\.ttf`/);
			assert.equal(
				(await readdir(join(skippedOutput, fontstackName))).length,
				22,
			);
		}
	});

	await context.test("duplicate fontstack names are errors", async () => {
		const input = join(temporaryRoot, "duplicate-input");
		await mkdir(input);
		await copyFile(fixtureFont, join(input, "first.ttf"));
		await copyFile(fixtureFont, join(input, "second.otf"));

		for (const [name, runCli] of [
			["node", runNodeCli],
			["rust", runRustCli],
		] as const) {
			const output = join(temporaryRoot, `${name}-duplicate-output`);
			const result = runCli(["build", input, "-o", output]);
			assert.equal(result.status, 1);
			assert.match(
				result.stderr,
				/fontstack collision `Noto Sans Regular`/,
			);
			assert.equal(existsSync(output), false);
		}
	});
});

function runNodeCli(arguments_: readonly string[]) {
	return spawnSync(process.execPath, [cliPath, ...arguments_], {
		encoding: "utf8",
	});
}

function runRustCli(arguments_: readonly string[]) {
	return spawnSync(
		"cargo",
		["run", "--quiet", "--package", "glyphore", "--", ...arguments_],
		{
			cwd: repositoryRoot,
			encoding: "utf8",
		},
	);
}

async function assertMatchingOutputs(
	nodeOutput: string,
	rustOutput: string,
): Promise<void> {
	assert.deepEqual(await readdir(nodeOutput), [fontstackName]);
	assert.deepEqual(await readdir(rustOutput), [fontstackName]);
	const nodeFontDirectory = join(nodeOutput, fontstackName);
	const rustFontDirectory = join(rustOutput, fontstackName);
	const nodeFiles = (await readdir(nodeFontDirectory)).sort();
	const rustFiles = (await readdir(rustFontDirectory)).sort();
	assert.equal(nodeFiles.length, 22);
	assert.deepEqual(rustFiles, nodeFiles);

	for (const name of nodeFiles) {
		const [nodeBytes, rustBytes] = await Promise.all([
			readFile(join(nodeFontDirectory, name)),
			readFile(join(rustFontDirectory, name)),
		]);
		assert.equal(Buffer.compare(nodeBytes, rustBytes), 0, name);
	}

	for (const start of [0, 256, 8192]) {
		const name = `${start}-${start + 255}.pbf`;
		const [actual, expected] = await Promise.all([
			readFile(join(nodeFontDirectory, name)),
			readFile(join(goldenDirectory, name)),
		]);
		assert.equal(Buffer.compare(actual, expected), 0, name);
	}
}
