//! packed-core — the archive engine.
//!
//! One implementation of format detection, listing, extraction and creation
//! for every platform (the desktop app links it natively; a CLI drives it for
//! tests). Network access deliberately lives OUTSIDE this crate.
//!
//! Phase 0 covers ZIP, TAR and the single-stream compressors
//! (gzip/bzip2/xz/zstd) plus combined `.tar.*` containers. 7z, RAR (read-only)
//! and brotli/lz4 land in phase 1 behind the same `Archive` trait.

pub mod compress;
pub mod create;
pub mod edit;
pub mod error;
pub mod extract;
pub mod format;
pub mod list;

pub use error::CoreError;
pub use format::{detect, Format};
pub use list::{ArchiveEntry, Listing};
