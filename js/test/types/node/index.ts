import { Buffer } from "node:buffer";

import {
	generateRange,
	loadFont,
	type GlyphFont,
} from "@kartore/glyphore/node";

async function nodeExample(bytes: Buffer): Promise<void> {
	using font: GlyphFont = await loadFont(bytes);
	generateRange(font, font.info.coveredRanges[0] ?? 0);
}

void nodeExample;
