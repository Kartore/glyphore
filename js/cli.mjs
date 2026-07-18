#!/usr/bin/env node

import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { parseArgs } from "node:util";

import { freeFont, generateRange, init, parseFont } from "./node.mjs";

const USAGE = [
	"Usage:",
	"  glyphore build <fonts-dir> -o <out-dir> [--skip-invalid]",
	"  glyphore info <font-file> [--json]",
].join("\n");

class UsageError extends Error {}

try {
	await main();
} catch (error) {
	console.error(`error: ${errorMessage(error)}`);
	if (error instanceof UsageError) {
		console.error(`\n${USAGE}`);
	}
	process.exitCode = 1;
}

async function main() {
	const [command, ...arguments_] = process.argv.slice(2);
	switch (command) {
		case "build":
			await build(arguments_);
			break;
		case "info":
			await info(arguments_);
			break;
		case "--help":
		case "-h":
			console.log(USAGE);
			break;
		default:
			throw new UsageError("expected the `build` or `info` subcommand");
	}
}

async function build(arguments_) {
	const { positionals, values } = parseArguments(arguments_, {
		output: { type: "string", short: "o" },
		"skip-invalid": { type: "boolean" },
		help: { type: "boolean", short: "h" },
	});
	if (values.help) {
		console.log(USAGE);
		return;
	}
	if (positionals.length !== 1) {
		throw new UsageError("expected one fonts directory");
	}
	if (values.output === undefined) {
		throw new UsageError("the `-o, --output <out-dir>` option is required");
	}

	const inputDirectory = positionals[0];
	await requireInputDirectory(inputDirectory);
	const files = await listFontFiles(inputDirectory);
	await init();
	const fonts = await parseFonts(
		inputDirectory,
		files,
		values["skip-invalid"] ?? false,
	);

	try {
		await mkdir(values.output, { recursive: true });
		for (const font of fonts) {
			const fontDirectory = join(values.output, font.info.fontstackName);
			await mkdir(fontDirectory, { recursive: true });
			for (const start of font.info.coveredRanges) {
				const bytes = generateRange(font.handle, start);
				await writeFile(
					join(fontDirectory, `${start}-${start + 255}.pbf`),
					bytes,
				);
			}
			console.log(
				`${font.info.fontstackName}: ${font.info.coveredRanges.length} ranges`,
			);
		}
	} finally {
		freeFonts(fonts);
	}
}

async function info(arguments_) {
	const { positionals, values } = parseArguments(arguments_, {
		json: { type: "boolean" },
		help: { type: "boolean", short: "h" },
	});
	if (values.help) {
		console.log(USAGE);
		return;
	}
	if (positionals.length !== 1) {
		throw new UsageError("expected one font file");
	}

	const fontFile = positionals[0];
	const bytes = await readFile(fontFile).catch((error) => {
		throw new Error(`failed to read ${fontFile}: ${errorMessage(error)}`);
	});
	await init();
	let parsed;
	try {
		parsed = parseFont(bytes);
	} catch (error) {
		throw new Error(`failed to parse \`${fontFile}\`: ${errorMessage(error)}`);
	}

	try {
		if (values.json) {
			console.log(JSON.stringify(parsed.info));
		} else {
			printFontInfo(parsed.info);
		}
	} finally {
		freeFont(parsed.handle);
	}
}

function parseArguments(arguments_, options) {
	try {
		return parseArgs({
			args: arguments_,
			allowPositionals: true,
			options,
			strict: true,
		});
	} catch (error) {
		throw new UsageError(errorMessage(error));
	}
}

async function requireInputDirectory(directory) {
	let metadata;
	try {
		metadata = await stat(directory);
	} catch {
		throw new UsageError(`input directory does not exist: ${directory}`);
	}
	if (!metadata.isDirectory()) {
		throw new UsageError(`input path is not a directory: ${directory}`);
	}
}

async function listFontFiles(directory) {
	const entries = (await readdir(directory, { withFileTypes: true }))
		.filter(
			(entry) =>
				entry.isFile() &&
				(extname(entry.name) === ".ttf" || extname(entry.name) === ".otf"),
		)
		.sort((left, right) =>
			Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)),
		);
	if (entries.length === 0) {
		throw new Error(`no TTF or OTF files found in ${directory}`);
	}
	return entries.map((entry) => entry.name);
}

async function parseFonts(directory, files, skipInvalid) {
	const fontstacks = new Map();
	const fonts = [];
	try {
		for (const fileName of files) {
			const path = join(directory, fileName);
			const bytes = await readFile(path).catch((error) => {
				throw new Error(`failed to read ${path}: ${errorMessage(error)}`);
			});
			let parsed;
			try {
				parsed = parseFont(bytes);
			} catch (error) {
				const message = errorMessage(error);
				if (skipInvalid) {
					console.error(`skipping \`${fileName}\`: ${message}`);
					continue;
				}
				throw new Error(`failed to parse \`${fileName}\`: ${message}`);
			}

			fonts.push({ fileName, ...parsed });
			const existing = fontstacks.get(parsed.info.fontstackName);
			if (existing !== undefined) {
				throw new Error(
					`fontstack collision \`${parsed.info.fontstackName}\` between ` +
						`\`${existing}\` and \`${fileName}\``,
				);
			}
			fontstacks.set(parsed.info.fontstackName, fileName);
		}
		if (fonts.length === 0) {
			throw new Error("no valid font files found");
		}
		return fonts;
	} catch (error) {
		freeFonts(fonts);
		throw error;
	}
}

function freeFonts(fonts) {
	for (const font of fonts) {
		freeFont(font.handle);
	}
}

function printFontInfo(font) {
	console.log(`fontstack: ${font.fontstackName}`);
	console.log(`family: ${font.familyName}`);
	console.log(`style: ${font.styleName}`);
	console.log(`glyphs: ${font.glyphCount}`);
	console.log(`covered ranges: ${font.coveredRanges.length}`);
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
