use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicUsize, Ordering};

static NEXT_TEMP_DIRECTORY: AtomicUsize = AtomicUsize::new(0);

const INFO_JSON: &str = concat!(
	"{\"familyName\":\"Noto Sans\",\"styleName\":\"Regular\",",
	"\"fontstackName\":\"Noto Sans Regular\",\"coveredRanges\":",
	"[0,256,512,768,1024,1280,7424,7680,7936,8192,8448,8704,",
	"8960,9472,9728,10496,11264,11776,42752,64256,65024,65280],",
	"\"glyphCount\":2188}\n",
);

struct TempDirectory(PathBuf);

impl TempDirectory {
	fn new(label: &str) -> Self {
		let sequence = NEXT_TEMP_DIRECTORY.fetch_add(1, Ordering::Relaxed);
		let path = std::env::temp_dir().join(format!(
			"glyphore-cli-{label}-{}-{sequence}",
			std::process::id(),
		));
		fs::create_dir_all(&path).unwrap();
		Self(path)
	}

	fn path(&self) -> &Path {
		&self.0
	}
}

impl Drop for TempDirectory {
	fn drop(&mut self) {
		let _ = fs::remove_dir_all(&self.0);
	}
}

fn fixture_font() -> PathBuf {
	Path::new(env!("CARGO_MANIFEST_DIR"))
		.join("../glyphore-core/tests/fixtures/NotoSans-Regular.ttf")
}

fn fixture_directory() -> PathBuf {
	fixture_font().parent().unwrap().to_owned()
}

fn golden_directory() -> PathBuf {
	Path::new(env!("CARGO_MANIFEST_DIR")).join("../glyphore-core/tests/golden")
}

fn run_cli(arguments: &[&str]) -> Output {
	Command::new(env!("CARGO_BIN_EXE_glyphore"))
		.args(arguments)
		.output()
		.unwrap()
}

fn assert_success(output: &Output) {
	assert!(
		output.status.success(),
		"CLI failed:\nstdout:\n{}\nstderr:\n{}",
		String::from_utf8_lossy(&output.stdout),
		String::from_utf8_lossy(&output.stderr),
	);
}

fn font_output_directory(output: &Path) -> PathBuf {
	output.join("Noto Sans Regular")
}

fn assert_complete_output(output: &Path) {
	let mut directories = fs::read_dir(output)
		.unwrap()
		.map(|entry| entry.unwrap().file_name().into_string().unwrap())
		.collect::<Vec<_>>();
	directories.sort();
	assert_eq!(directories, ["Noto Sans Regular"]);

	let font_directory = font_output_directory(output);
	let mut ranges = fs::read_dir(&font_directory)
		.unwrap()
		.map(|entry| entry.unwrap().file_name().into_string().unwrap())
		.collect::<Vec<_>>();
	ranges.sort();
	assert_eq!(ranges.len(), 22);
	for start in [0, 256, 8192] {
		let name = format!("{start}-{}.pbf", start + 255);
		assert_eq!(
			fs::read(font_directory.join(&name)).unwrap(),
			fs::read(golden_directory().join(name)).unwrap(),
		);
	}
}

#[test]
fn build_writes_covered_ranges_matching_core_golden_files() {
	let temporary = TempDirectory::new("build");
	let output = temporary.path().join("output");
	let result = run_cli(&[
		"build",
		fixture_directory().to_str().unwrap(),
		"-o",
		output.to_str().unwrap(),
	]);
	assert_success(&result);
	assert_eq!(result.stdout, b"Noto Sans Regular: 22 ranges\n");
	assert_complete_output(&output);
}

#[test]
fn info_matches_the_font_info_snapshot() {
	let font = fixture_font();
	let result = run_cli(&["info", font.to_str().unwrap(), "--json"]);
	assert_success(&result);
	assert_eq!(String::from_utf8(result.stdout).unwrap(), INFO_JSON);

	let result = run_cli(&["info", font.to_str().unwrap()]);
	assert_success(&result);
	assert_eq!(
		String::from_utf8(result.stdout).unwrap(),
		concat!(
			"fontstack: Noto Sans Regular\n",
			"family: Noto Sans\n",
			"style: Regular\n",
			"glyphs: 2188\n",
			"covered ranges: 22\n",
		),
	);
}

#[test]
fn invalid_fonts_fail_without_output_and_can_be_skipped() {
	let temporary = TempDirectory::new("invalid");
	let input = temporary.path().join("input");
	fs::create_dir(&input).unwrap();
	fs::copy(fixture_font(), input.join("NotoSans-Regular.ttf")).unwrap();
	fs::write(input.join("broken.ttf"), "not a font").unwrap();

	let failed_output = temporary.path().join("failed-output");
	let result = run_cli(&[
		"build",
		input.to_str().unwrap(),
		"-o",
		failed_output.to_str().unwrap(),
	]);
	assert_eq!(result.status.code(), Some(1));
	assert!(String::from_utf8_lossy(&result.stderr).contains("broken.ttf"));
	assert!(!failed_output.exists());

	let skipped_output = temporary.path().join("skipped-output");
	let result = run_cli(&[
		"build",
		input.to_str().unwrap(),
		"-o",
		skipped_output.to_str().unwrap(),
		"--skip-invalid",
	]);
	assert_success(&result);
	assert!(String::from_utf8_lossy(&result.stderr).contains("skipping `broken.ttf`"));
	assert_complete_output(&skipped_output);
}

#[test]
fn duplicate_fontstack_names_are_errors() {
	let temporary = TempDirectory::new("duplicate");
	let input = temporary.path().join("input");
	fs::create_dir(&input).unwrap();
	fs::copy(fixture_font(), input.join("first.ttf")).unwrap();
	fs::copy(fixture_font(), input.join("second.otf")).unwrap();

	let output = temporary.path().join("output");
	let result = run_cli(&[
		"build",
		input.to_str().unwrap(),
		"-o",
		output.to_str().unwrap(),
	]);
	assert_eq!(result.status.code(), Some(1));
	assert!(
		String::from_utf8_lossy(&result.stderr).contains("fontstack collision `Noto Sans Regular`")
	);
	assert!(!output.exists());
}
