#![forbid(unsafe_code)]

use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use clap::{Args, Parser, Subcommand};
use glyphore::{FontFace, generate_range};

const USAGE: &str = concat!(
	"Usage:\n",
	"  glyphore build <fonts-dir> -o <out-dir> [--skip-invalid]\n",
	"  glyphore info <font-file> [--json]",
);

#[derive(Parser)]
#[command(name = "glyphore", about = "MapLibre glyph PBF generator")]
struct Cli {
	#[command(subcommand)]
	command: Command,
}

#[derive(Subcommand)]
enum Command {
	/// Builds glyph PBF ranges from a directory of fonts.
	Build(BuildArgs),
	/// Prints metadata for one font.
	Info(InfoArgs),
}

#[derive(Args)]
struct BuildArgs {
	/// Directory containing .ttf and .otf files.
	#[arg(value_name = "FONTS_DIR")]
	fonts_dir: PathBuf,
	/// Directory to receive the generated glyph PBF files.
	#[arg(short = 'o', long = "output", value_name = "OUT_DIR")]
	output_dir: PathBuf,
	/// Skips fonts that cannot be parsed instead of failing the build.
	#[arg(long)]
	skip_invalid: bool,
}

#[derive(Args)]
struct InfoArgs {
	/// TTF or OTF font file to inspect.
	#[arg(value_name = "FONT_FILE")]
	font_file: PathBuf,
	/// Prints the font metadata as JSON.
	#[arg(long)]
	json: bool,
}

struct CliFailure {
	message: String,
	show_usage: bool,
}

impl CliFailure {
	fn runtime(message: impl Into<String>) -> Self {
		Self {
			message: message.into(),
			show_usage: false,
		}
	}

	fn usage(message: impl Into<String>) -> Self {
		Self {
			message: message.into(),
			show_usage: true,
		}
	}
}

struct ParsedFont {
	file_name: String,
	face: FontFace,
}

fn main() -> ExitCode {
	let cli = match Cli::try_parse() {
		Ok(cli) => cli,
		Err(error) => {
			let exit_code = error.exit_code();
			if let Err(print_error) = error.print() {
				eprintln!("error: failed to print CLI help: {print_error}");
			}
			return if exit_code == 0 {
				ExitCode::SUCCESS
			} else {
				ExitCode::FAILURE
			};
		}
	};

	match run(cli) {
		Ok(()) => ExitCode::SUCCESS,
		Err(error) => {
			eprintln!("error: {}", error.message);
			if error.show_usage {
				eprintln!("\n{USAGE}");
			}
			ExitCode::FAILURE
		}
	}
}

fn run(cli: Cli) -> Result<(), CliFailure> {
	match cli.command {
		Command::Build(arguments) => build(arguments),
		Command::Info(arguments) => info(arguments),
	}
}

fn build(arguments: BuildArgs) -> Result<(), CliFailure> {
	if !arguments.fonts_dir.is_dir() {
		return Err(CliFailure::usage(format!(
			"input directory does not exist: {}",
			arguments.fonts_dir.display(),
		)));
	}

	let fonts = read_fonts(&arguments.fonts_dir, arguments.skip_invalid)?;
	write_fonts(&arguments.output_dir, &fonts)
}

fn info(arguments: InfoArgs) -> Result<(), CliFailure> {
	let bytes = fs::read(&arguments.font_file).map_err(|error| {
		CliFailure::runtime(format!(
			"failed to read {}: {error}",
			arguments.font_file.display(),
		))
	})?;
	let face = FontFace::parse(&bytes).map_err(|error| {
		CliFailure::runtime(format!(
			"failed to parse `{}`: {error}",
			arguments.font_file.display(),
		))
	})?;

	if arguments.json {
		println!("{}", font_info_json(&face));
	} else {
		print_font_info(&face);
	}
	Ok(())
}

fn read_fonts(directory: &Path, skip_invalid: bool) -> Result<Vec<ParsedFont>, CliFailure> {
	let entries = fs::read_dir(directory).map_err(|error| {
		CliFailure::runtime(format!(
			"failed to read input directory {}: {error}",
			directory.display(),
		))
	})?;
	let mut files = Vec::new();
	for entry in entries {
		let entry = entry.map_err(|error| {
			CliFailure::runtime(format!(
				"failed to read input directory {}: {error}",
				directory.display(),
			))
		})?;
		let file_type = entry.file_type().map_err(|error| {
			CliFailure::runtime(format!(
				"failed to inspect {}: {error}",
				entry.path().display(),
			))
		})?;
		let path = entry.path();
		if !file_type.is_file() || !is_font_path(&path) {
			continue;
		}
		let file_name = entry.file_name().into_string().map_err(|_| {
			CliFailure::runtime(format!(
				"font filename is not valid UTF-8: {}",
				path.display(),
			))
		})?;
		files.push((file_name, path));
	}
	files.sort_by(|left, right| left.0.cmp(&right.0));
	if files.is_empty() {
		return Err(CliFailure::runtime(format!(
			"no TTF or OTF files found in {}",
			directory.display(),
		)));
	}

	let mut fontstacks = BTreeMap::new();
	let mut fonts = Vec::with_capacity(files.len());
	for (file_name, path) in files {
		let bytes = fs::read(&path).map_err(|error| {
			CliFailure::runtime(format!("failed to read {}: {error}", path.display()))
		})?;
		let face = match FontFace::parse(&bytes) {
			Ok(face) => face,
			Err(error) if skip_invalid => {
				eprintln!("skipping `{file_name}`: {error}");
				continue;
			}
			Err(error) => {
				return Err(CliFailure::runtime(format!(
					"failed to parse `{file_name}`: {error}",
				)));
			}
		};

		let fontstack_name = face.fontstack_name().to_owned();
		if let Some(existing) = fontstacks.insert(fontstack_name.clone(), file_name.clone()) {
			return Err(CliFailure::runtime(format!(
				"fontstack collision `{fontstack_name}` between `{existing}` and `{file_name}`",
			)));
		}
		fonts.push(ParsedFont { file_name, face });
	}
	if fonts.is_empty() {
		return Err(CliFailure::runtime("no valid font files found"));
	}
	Ok(fonts)
}

fn is_font_path(path: &Path) -> bool {
	matches!(
		path.extension(),
		Some(extension) if extension == OsStr::new("ttf") || extension == OsStr::new("otf")
	)
}

fn write_fonts(directory: &Path, fonts: &[ParsedFont]) -> Result<(), CliFailure> {
	fs::create_dir_all(directory).map_err(|error| {
		CliFailure::runtime(format!(
			"failed to create output directory {}: {error}",
			directory.display(),
		))
	})?;

	for font in fonts {
		let ranges = font.face.covered_ranges();
		let font_directory = directory.join(font.face.fontstack_name());
		fs::create_dir_all(&font_directory).map_err(|error| {
			CliFailure::runtime(format!(
				"failed to create output directory {}: {error}",
				font_directory.display(),
			))
		})?;
		for start in &ranges {
			let bytes = generate_range(&font.face, *start).map_err(|error| {
				CliFailure::runtime(format!(
					"failed to generate range {start} for `{}`: {error}",
					font.file_name,
				))
			})?;
			let path = font_directory.join(format!("{start}-{}.pbf", start + 255));
			fs::write(&path, bytes).map_err(|error| {
				CliFailure::runtime(format!("failed to write {}: {error}", path.display()))
			})?;
		}
		println!("{}: {} ranges", font.face.fontstack_name(), ranges.len());
	}
	Ok(())
}

fn print_font_info(face: &FontFace) {
	println!("fontstack: {}", face.fontstack_name());
	println!("family: {}", face.family_name());
	println!("style: {}", face.style_name());
	println!("glyphs: {}", face.glyph_count());
	println!("covered ranges: {}", face.covered_ranges().len());
}

fn font_info_json(face: &FontFace) -> String {
	let ranges = face
		.covered_ranges()
		.into_iter()
		.map(|start| start.to_string())
		.collect::<Vec<_>>()
		.join(",");
	format!(
		concat!(
			"{{\"familyName\":{},\"styleName\":{},",
			"\"fontstackName\":{},\"coveredRanges\":[{}],\"glyphCount\":{}}}"
		),
		json_string(face.family_name()),
		json_string(face.style_name()),
		json_string(face.fontstack_name()),
		ranges,
		face.glyph_count(),
	)
}

fn json_string(value: &str) -> String {
	let mut output = String::with_capacity(value.len() + 2);
	output.push('"');
	for character in value.chars() {
		match character {
			'"' => output.push_str("\\\""),
			'\\' => output.push_str("\\\\"),
			'\u{0008}' => output.push_str("\\b"),
			'\t' => output.push_str("\\t"),
			'\n' => output.push_str("\\n"),
			'\u{000c}' => output.push_str("\\f"),
			'\r' => output.push_str("\\r"),
			character if character <= '\u{001f}' => {
				output.push_str(&format!("\\u{:04x}", u32::from(character)));
			}
			character => output.push(character),
		}
	}
	output.push('"');
	output
}
