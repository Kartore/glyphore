import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = resolve(packageDirectory, "..");
const manifestPath = resolve(
	repositoryRoot,
	"crates/glyphore-wasm/Cargo.toml",
);
const manifest = readFileSync(manifestPath, "utf8");
const versionMatch = manifest.match(/^wasm-bindgen = "=([^"]+)"$/m);

if (versionMatch === null) {
	throw new Error("glyphore-wasm must pin wasm-bindgen with an exact `=` version");
}

const wasmBindgenVersion = versionMatch[1];
const installedVersion = capture("wasm-bindgen", ["--version"]);
if (installedVersion !== `wasm-bindgen ${wasmBindgenVersion}`) {
	throw new Error(
		`wasm-bindgen CLI ${wasmBindgenVersion} is required; install it with ` +
			`\`cargo install wasm-bindgen-cli --version ${wasmBindgenVersion} --locked\` ` +
			`(found ${JSON.stringify(installedVersion)})`,
	);
}

capture("wasm-opt", ["--version"]);

const packageOutput = resolve(packageDirectory, "pkg");
const inputWasm = resolve(
	repositoryRoot,
	"target/wasm32-unknown-unknown/release/glyphore_wasm.wasm",
);

run("cargo", [
	"build",
	"-p",
	"glyphore-wasm",
	"--release",
	"--target",
	"wasm32-unknown-unknown",
]);

rmSync(packageOutput, { recursive: true, force: true });
mkdirSync(packageOutput, { recursive: true });
run("wasm-bindgen", [
	"--target",
	"web",
	"--out-dir",
	packageOutput,
	inputWasm,
]);

const wasmFiles = readdirSync(packageOutput).filter((name) =>
	name.endsWith("_bg.wasm"),
);
if (wasmFiles.length !== 1) {
	throw new Error(`expected one generated wasm file, found ${wasmFiles.length}`);
}

const outputWasm = resolve(packageOutput, wasmFiles[0]);
const optimizedWasm = `${outputWasm}.optimized`;
run("wasm-opt", [
	"-Oz",
	"--enable-bulk-memory",
	"--enable-nontrapping-float-to-int",
	outputWasm,
	"-o",
	optimizedWasm,
]);
renameSync(optimizedWasm, outputWasm);

console.log(
	`built ${wasmFiles[0]} (${statSync(outputWasm).size.toLocaleString("en-US")} bytes)`,
);

function capture(command, arguments_) {
	const result = spawnSync(command, arguments_, {
		cwd: repositoryRoot,
		encoding: "utf8",
	});
	if (result.error !== undefined) {
		throw new Error(`${command} is required on PATH: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(
			`${command} ${arguments_.join(" ")} failed:\n${result.stderr.trim()}`,
		);
	}
	return result.stdout.trim();
}

function run(command, arguments_) {
	const result = spawnSync(command, arguments_, {
		cwd: repositoryRoot,
		stdio: "inherit",
	});
	if (result.error !== undefined) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`${command} ${arguments_.join(" ")} failed`);
	}
}
