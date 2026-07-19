use glyphore::{Error, FontFace, generate_range};

#[test]
fn facade_reexports_the_core_api_without_cli_features() {
	assert!(matches!(
		FontFace::parse(b"not a font"),
		Err(Error::InvalidFont(_))
	));
	let _: fn(&FontFace, u32) -> Result<Vec<u8>, Error> = generate_range;
}
