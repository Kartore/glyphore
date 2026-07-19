//! MapLibre glyph PBF generation for Rust.
//!
//! The default `cli` feature builds the `glyphore` command-line interface.
//! Disable default features when only the Rust API is needed.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub use glyphore_core::{Error, FontFace, generate_range};
