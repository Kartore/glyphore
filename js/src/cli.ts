#!/usr/bin/env node

import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import {
	parseArgs,
	type ParseArgsOptionsConfig,
} from "node:util";

import {
	generateRange,
	loadFont,
	type FontInfo,
	type GlyphFont,
} from "./node.js";

const USAGE = [
	"Usage:",
	"  glyphore build <fonts-dir> -o <out-dir> [--skip-invalid]",
	"  glyphore info <font-file> [--json]",
].join("\n");

class UsageError extends Error {}

interface ParsedFont {
	fileName: string;
	font: GlyphFont;
}

try {
	await main();
} catch (error) {
	console.error(`error: ${errorMessage(error)}`);
	if (error instanceof UsageError) {
		console.error(`\n${USAGE}`);
	}
	process.exitCode = 1;
}

async function main(): Promise<void> {
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

async function build(arguments_: readonly string[]): Promise<void> {
	const { positionals, values } = parseArguments(arguments_, {
		output: { type: "string", short: "o" },
		"skip-invalid": { type: "boolean" },
		help: { type: "boolean", short: "h" },
	});
	if (values.help === true) {
		console.log(USAGE);
		return;
	}
	if (positionals.length !== 1) {
		throw new UsageError("expected one fonts directory");
	}
	const inputDirectory = positionals[0];
	if (inputDirectory === undefined) {
		throw new UsageError("expected one fonts directory");
	}
	const outputDirectory = values.output;
	if (typeof outputDirectory !== "string") {
		throw new UsageError("the `-o, --output <out-dir>` option is required");
	}

	await requireInputDirectory(inputDirectory);
	const files = await listFontFiles(inputDirectory);
	const fonts = await parseFonts(
		inputDirectory,
		files,
		values["skip-invalid"] === true,
	);

	try {
		await mkdir(outputDirectory, { recursive: true });
		for (const { font } of fonts) {
			const fontDirectory = join(outputDirectory, font.info.fontstackName);
			await mkdir(fontDirectory, { recursive: true });
			for (const start of font.info.coveredRanges) {
				const bytes = generateRange(font, start);
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
		disposeFonts(fonts);
	}
}

async function info(arguments_: readonly string[]): Promise<void> {
	const { positionals, values } = parseArguments(arguments_, {
		json: { type: "boolean" },
		help: { type: "boolean", short: "h" },
	});
	if (values.help === true) {
		console.log(USAGE);
		return;
	}
	if (positionals.length !== 1) {
		throw new UsageError("expected one font file");
	}
	const fontFile = positionals[0];
	if (fontFile === undefined) {
		throw new UsageError("expected one font file");
	}

	const bytes = await readFile(fontFile).catch((error: unknown) => {
		throw new Error(`failed to read ${fontFile}: ${errorMessage(error)}`);
	});
	using font = await loadFont(bytes).catch((error: unknown) => {
		throw new Error(`failed to parse \`${fontFile}\`: ${errorMessage(error)}`);
	});

	if (values.json === true) {
		console.log(JSON.stringify(font.info));
	} else {
		printFontInfo(font.info);
	}
}

function parseArguments(
	arguments_: readonly string[],
	options: ParseArgsOptionsConfig,
) {
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

async function requireInputDirectory(directory: string): Promise<void> {
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

async function listFontFiles(directory: string): Promise<string[]> {
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

async function parseFonts(
	directory: string,
	files: readonly string[],
	skipInvalid: boolean,
): Promise<ParsedFont[]> {
	const fontstacks = new Map<string, string>();
	const fonts: ParsedFont[] = [];
	try {
		for (const fileName of files) {
			const path = join(directory, fileName);
			const bytes = await readFile(path).catch((error: unknown) => {
				throw new Error(`failed to read ${path}: ${errorMessage(error)}`);
			});
			let font: GlyphFont;
			try {
				font = await loadFont(bytes);
			} catch (error) {
				const message = errorMessage(error);
				if (skipInvalid) {
					console.error(`skipping \`${fileName}\`: ${message}`);
					continue;
				}
				throw new Error(`failed to parse \`${fileName}\`: ${message}`);
			}

			const fontstackName = font.info.fontstackName;
			const existing = fontstacks.get(fontstackName);
			if (existing !== undefined) {
				font[Symbol.dispose]();
				throw new Error(
					`fontstack collision \`${fontstackName}\` between ` +
						`\`${existing}\` and \`${fileName}\``,
				);
			}
			fontstacks.set(fontstackName, fileName);
			fonts.push({ fileName, font });
		}
		if (fonts.length === 0) {
			throw new Error("no valid font files found");
		}
		return fonts;
	} catch (error) {
		disposeFonts(fonts);
		throw error;
	}
}

function disposeFonts(fonts: readonly ParsedFont[]): void {
	for (const { font } of fonts) {
		font[Symbol.dispose]();
	}
}

function printFontInfo(font: FontInfo): void {
	console.log(`fontstack: ${font.fontstackName}`);
	console.log(`family: ${font.familyName}`);
	console.log(`style: ${font.styleName}`);
	console.log(`glyphs: ${font.glyphCount}`);
	console.log(`covered ranges: ${font.coveredRanges.length}`);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
