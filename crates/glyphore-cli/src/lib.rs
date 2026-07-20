//! MapLibre glyph PBF generation for Rust.
//!
//! This facade re-exports [`FontFace`], [`generate_range`], and [`Error`] from
//! `glyphore-core`.
//!
//! # Command-line interface
//!
//! Install and build every covered range from a directory of fonts:
//!
//! ```text
//! cargo install glyphore
//! glyphore build ./fonts -o ./glyphs
//! ```
//!
//! # Feature flags
//!
//! The default `cli` feature builds the `glyphore` command-line interface and
//! enables its argument parser. Disable default features when only the Rust API
//! is needed.
//!
//! # Rust example
//!
//! ```no_run
//! use glyphore::{FontFace, generate_range};
//!
//! fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let bytes = std::fs::read("NotoSans-Regular.ttf")?;
//!     let face = FontFace::parse(&bytes)?;
//!     let pbf = generate_range(&face, 0)?;
//!     std::fs::write("0-255.pbf", pbf)?;
//!     Ok(())
//! }
//! ```

#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub use glyphore_core::{Error, FontFace, generate_range};
