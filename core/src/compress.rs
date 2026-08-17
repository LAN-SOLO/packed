//! Compression profiles — the UI slider from "fast" to "maximum". Each level
//! maps to concrete algorithm parameters; the engine picks sensible codecs.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    /// zstd -3 / lz4 — maximum throughput
    Fast,
    /// zstd -12 — everyday default
    Balanced,
    /// zstd -19 / xz -6 — good ratio, acceptable time
    Small,
    /// zstd --ultra -22 / LZMA2 max — best ratio, slow
    Maximum,
}

impl Default for Level {
    fn default() -> Self {
        Level::Balanced
    }
}

impl Level {
    /// zstd compression level for this profile.
    pub fn zstd(self) -> i32 {
        match self {
            Level::Fast => 3,
            Level::Balanced => 12,
            Level::Small => 19,
            Level::Maximum => 22,
        }
    }

    /// libbzip2 level (1–9).
    pub fn bzip2(self) -> u32 {
        match self {
            Level::Fast => 1,
            Level::Balanced => 6,
            Level::Small => 9,
            Level::Maximum => 9,
        }
    }

    /// xz/LZMA2 preset (0–9).
    pub fn xz(self) -> u32 {
        match self {
            Level::Fast => 1,
            Level::Balanced => 6,
            Level::Small => 8,
            Level::Maximum => 9,
        }
    }

    /// gzip/Deflate level (0–9).
    pub fn deflate(self) -> u32 {
        match self {
            Level::Fast => 1,
            Level::Balanced => 6,
            Level::Small => 9,
            Level::Maximum => 9,
        }
    }
}
