//! glyphore core — deterministic MapLibre glyph PBF (SDF) generation.
//!
//! Pure logic only: no filesystem access, no clocks, no randomness, no
//! wasm-bindgen. Everything here must be byte-deterministic and compatible
//! with node-fontnik output conventions (24px, 3px buffer, radius 8,
//! cutoff 0.25).
//!
//! See `docs/plan.md` at the repository root for the design plan.
