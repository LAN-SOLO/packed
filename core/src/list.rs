//! List the contents of an archive without extracting.

use serde::Serialize;
use std::io::{Read, Seek};
use std::path::Path;

use crate::error::{CoreError, Result};
use crate::format::{detect, Format};

#[derive(Debug, Clone, Serialize)]
pub struct ArchiveEntry {
    pub name: String,
    pub size: u64,
    pub compressed_size: u64,
    pub is_dir: bool,
    pub encrypted: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Listing {
    pub format: Format,
    pub entries: Vec<ArchiveEntry>,
    /// true if any entry is encrypted (a password will be needed to extract)
    pub encrypted: bool,
}

pub fn list(path: &Path) -> Result<Listing> {
    let format = detect(path)?;
    match format {
        Format::Zip => list_zip(path),
        Format::Tar => list_tar(std::fs::File::open(path)?, format),
        Format::TarGz => list_tar(flate2::read::GzDecoder::new(std::fs::File::open(path)?), format),
        Format::TarBz2 => {
            list_tar(bzip2::read::BzDecoder::new(std::fs::File::open(path)?), format)
        }
        Format::TarXz => list_tar(xz2::read::XzDecoder::new(std::fs::File::open(path)?), format),
        Format::TarZst => list_tar(
            zstd::stream::read::Decoder::new(std::fs::File::open(path)?)?,
            format,
        ),
        // single-stream compressors: one logical member (the decompressed blob)
        Format::Gzip | Format::Bzip2 | Format::Xz | Format::Zstd | Format::Lz4 | Format::Brotli => {
            Ok(Listing {
                format,
                entries: vec![ArchiveEntry {
                    name: stripped_name(path),
                    size: 0,
                    compressed_size: std::fs::metadata(path).map(|m| m.len()).unwrap_or(0),
                    is_dir: false,
                    encrypted: false,
                }],
                encrypted: false,
            })
        }
        Format::SevenZ | Format::Rar => Err(CoreError::Other(format!(
            "{} listing arrives in phase 1",
            format.label()
        ))),
    }
}

fn stripped_name(path: &Path) -> String {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("data");
    name.rsplit_once('.').map(|(base, _)| base).unwrap_or(name).to_string()
}

fn list_zip(path: &Path) -> Result<Listing> {
    let file = std::fs::File::open(path)?;
    let mut zip = zip::ZipArchive::new(file)?;
    let mut entries = Vec::with_capacity(zip.len());
    let mut any_encrypted = false;
    for i in 0..zip.len() {
        // `by_index_raw` reads metadata even for encrypted entries
        let entry = zip.by_index_raw(i)?;
        let encrypted = entry.encrypted();
        any_encrypted |= encrypted;
        entries.push(ArchiveEntry {
            name: entry.name().to_string(),
            size: entry.size(),
            compressed_size: entry.compressed_size(),
            is_dir: entry.is_dir(),
            encrypted,
        });
    }
    Ok(Listing {
        format: Format::Zip,
        entries,
        encrypted: any_encrypted,
    })
}

fn list_tar<R: Read>(reader: R, format: Format) -> Result<Listing> {
    let mut archive = tar::Archive::new(reader);
    let mut entries = Vec::new();
    for entry in archive.entries()? {
        let entry = entry?;
        let header = entry.header();
        let name = entry.path()?.to_string_lossy().to_string();
        entries.push(ArchiveEntry {
            name,
            size: header.size().unwrap_or(0),
            compressed_size: header.size().unwrap_or(0),
            is_dir: header.entry_type().is_dir(),
            encrypted: false,
        });
    }
    Ok(Listing {
        format,
        entries,
        encrypted: false,
    })
}

/// Marker so `Seek` bound stays available for future random-access readers.
#[allow(dead_code)]
fn _assert_seek<R: Read + Seek>(_r: &R) {}
