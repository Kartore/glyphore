import {
	generateRange,
	loadFont,
	type GlyphFont,
	type LoadFontOptions,
} from "@kartore/glyphore";

declare const bytes: Uint8Array;

async function browserExample(options?: LoadFontOptions): Promise<void> {
	using font: GlyphFont = await loadFont(bytes, options);
	generateRange(font, font.info.coveredRanges[0] ?? 0);

	// @ts-expect-error Font metadata is read-only.
	font.info.familyName = "replacement";
	// @ts-expect-error Covered ranges are read-only.
	font.info.coveredRanges.push(256);
	// @ts-expect-error Range generation is a standalone function.
	font.generateRange(0);
	// @ts-expect-error Cleanup uses the Disposable protocol.
	font.dispose();
}

void browserExample;
