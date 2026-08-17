//! Archive format detection by magic bytes, with an extension fallback.

use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum Format {
    Zip,
    SevenZ,
    Rar,
    Tar,
    Gzip,
    Bzip2,
    Xz,
    Zstd,
    Lz4,
    Brotli,
    /// tar wrapped in a single-stream compressor, e.g. `.tar.gz`
    TarGz,
    TarBz2,
    TarXz,
    TarZst,
}

impl Format {
    /// Can packed CREATE this format? (RAR and 7z-read-only differ per phase.)
    pub fn is_writable(self) -> bool {
        !matches!(self, Format::Rar)
    }

    pub fn label(self) -> &'static str {
        match self {
            Format::Zip => "ZIP",
            Format::SevenZ => "7z",
            Format::Rar => "RAR",
            Format::Tar => "TAR",
            Format::Gzip => "gzip",
            Format::Bzip2 => "bzip2",
            Format::Xz => "xz",
            Format::Zstd => "zstd",
            Format::Lz4 => "lz4",
            Format::Brotli => "brotli",
            Format::TarGz => "tar.gz",
            Format::TarBz2 => "tar.bz2",
            Format::TarXz => "tar.xz",
            Format::TarZst => "tar.zst",
        }
    }
}

/// Magic-byte signatures. Order matters: check the longest/most specific first.
fn from_magic(buf: &[u8]) -> Option<Format> {
    let starts = |sig: &[u8]| buf.len() >= sig.len() && &buf[..sig.len()] == sig;
    if starts(&[0x50, 0x4B, 0x03, 0x04]) || starts(&[0x50, 0x4B, 0x05, 0x06]) {
        return Some(Format::Zip);
    }
    if starts(&[0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]) {
        return Some(Format::SevenZ);
    }
    if starts(b"Rar!\x1A\x07") {
        return Some(Format::Rar);
    }
    if starts(&[0xFD, b'7', b'z', b'X', b'Z', 0x00]) {
        return Some(Format::Xz);
    }
    if starts(&[0x28, 0xB5, 0x2F, 0xFD]) {
        return Some(Format::Zstd);
    }
    if starts(&[0x1F, 0x8B]) {
        return Some(Format::Gzip);
    }
    if starts(b"BZh") {
        return Some(Format::Bzip2);
    }
    if starts(&[0x04, 0x22, 0x4D, 0x18]) {
        return Some(Format::Lz4);
    }
    // TAR: "ustar" magic lives at offset 257
    if buf.len() >= 262 && &buf[257..262] == b"ustar" {
        return Some(Format::Tar);
    }
    None
}

/// Extension fallback — also the only way to tell `.tar.gz` from a bare `.gz`,
/// since the magic bytes are identical (the tar is *inside* the gzip stream).
fn from_extension(path: &Path) -> Option<Format> {
    let name = path.file_name()?.to_str()?.to_ascii_lowercase();
    let ext2 = |suf: &str| name.ends_with(suf);
    if ext2(".tar.gz") || ext2(".tgz") {
        return Some(Format::TarGz);
    }
    if ext2(".tar.bz2") || ext2(".tbz2") || ext2(".tbz") {
        return Some(Format::TarBz2);
    }
    if ext2(".tar.xz") || ext2(".txz") {
        return Some(Format::TarXz);
    }
    if ext2(".tar.zst") || ext2(".tzst") {
        return Some(Format::TarZst);
    }
    let ext = name.rsplit('.').next()?;
    Some(match ext {
        "zip" => Format::Zip,
        "7z" => Format::SevenZ,
        "rar" => Format::Rar,
        "tar" => Format::Tar,
        "gz" => Format::Gzip,
        "bz2" => Format::Bzip2,
        "xz" => Format::Xz,
        "zst" | "zstd" => Format::Zstd,
        "lz4" => Format::Lz4,
        "br" => Format::Brotli,
        _ => return None,
    })
}

/// Detect the format of a file: magic bytes first (authoritative for the
/// container), then refine `.tar.*` cases via the extension.
pub fn detect(path: &Path) -> crate::error::Result<Format> {
    use std::io::Read;
    let mut buf = [0u8; 512];
    let n = std::fs::File::open(path)
        .and_then(|mut f| f.read(&mut buf))
        .unwrap_or(0);
    let magic = from_magic(&buf[..n]);
    let ext = from_extension(path);

    // If the extension says tar.<comp> and magic says the matching compressor,
    // trust the extension (the tar is nested and invisible to magic).
    match (magic, ext) {
        (Some(Format::Gzip), Some(Format::TarGz)) => Ok(Format::TarGz),
        (Some(Format::Bzip2), Some(Format::TarBz2)) => Ok(Format::TarBz2),
        (Some(Format::Xz), Some(Format::TarXz)) => Ok(Format::TarXz),
        (Some(Format::Zstd), Some(Format::TarZst)) => Ok(Format::TarZst),
        (Some(m), _) => Ok(m),
        (None, Some(e)) => Ok(e),
        (None, None) => Err(crate::error::CoreError::UnknownFormat),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn magic_detection() {
        assert_eq!(from_magic(&[0x50, 0x4B, 0x03, 0x04]), Some(Format::Zip));
        assert_eq!(from_magic(b"BZh9"), Some(Format::Bzip2));
        assert_eq!(from_magic(&[0x28, 0xB5, 0x2F, 0xFD, 0x00]), Some(Format::Zstd));
        assert_eq!(from_magic(b"Rar!\x1A\x07\x00"), Some(Format::Rar));
        assert_eq!(from_magic(b"not an archive"), None);
    }

    #[test]
    fn extension_disambiguates_tar_gz() {
        assert_eq!(from_extension(Path::new("x.tar.gz")), Some(Format::TarGz));
        assert_eq!(from_extension(Path::new("x.tgz")), Some(Format::TarGz));
        assert_eq!(from_extension(Path::new("x.gz")), Some(Format::Gzip));
        assert_eq!(from_extension(Path::new("x.zst")), Some(Format::Zstd));
    }

    #[test]
    fn rar_is_not_writable() {
        assert!(!Format::Rar.is_writable());
        assert!(Format::Zip.is_writable());
        assert!(Format::TarZst.is_writable());
    }
}
