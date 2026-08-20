//! Extract archives to a destination directory, with path-traversal (Zip-Slip)
//! protection: no entry may escape the destination root.

use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};

use crate::error::{CoreError, Result};
use crate::format::{detect, Format};

/// Reject absolute paths, `..` components and anything that would escape `dest`.
/// Returns the safe, joined output path.
pub fn safe_join(dest: &Path, entry: &str) -> Result<PathBuf> {
    let rel = Path::new(entry);
    let mut out = dest.to_path_buf();
    for comp in rel.components() {
        match comp {
            Component::Normal(c) => out.push(c),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(CoreError::UnsafePath(entry.to_string()));
            }
        }
    }
    // final belt-and-suspenders check
    if !out.starts_with(dest) {
        return Err(CoreError::UnsafePath(entry.to_string()));
    }
    Ok(out)
}

/// Extract every entry of `path` into `dest`. `password` is used for encrypted
/// ZIP entries; pass None for unencrypted archives.
pub fn extract_all(path: &Path, dest: &Path, password: Option<&str>) -> Result<usize> {
    extract_all_with_progress(path, dest, password, &mut |_, _| {})
}

/// Like [`extract_all`], but reports progress after every extracted file:
/// `progress(files_done, entry_name)`.
pub fn extract_all_with_progress(
    path: &Path,
    dest: &Path,
    password: Option<&str>,
    progress: &mut dyn FnMut(usize, &str),
) -> Result<usize> {
    std::fs::create_dir_all(dest)?;
    match detect(path)? {
        Format::Zip => extract_zip(path, dest, password, progress),
        Format::Tar => extract_tar(std::fs::File::open(path)?, dest, progress),
        Format::TarGz => extract_tar(
            flate2::read::GzDecoder::new(std::fs::File::open(path)?),
            dest,
            progress,
        ),
        Format::TarBz2 => extract_tar(
            bzip2::read::BzDecoder::new(std::fs::File::open(path)?),
            dest,
            progress,
        ),
        Format::TarXz => extract_tar(
            xz2::read::XzDecoder::new(std::fs::File::open(path)?),
            dest,
            progress,
        ),
        Format::TarZst => extract_tar(
            zstd::stream::read::Decoder::new(std::fs::File::open(path)?)?,
            dest,
            progress,
        ),
        f @ (Format::Gzip | Format::Bzip2 | Format::Xz | Format::Zstd) => {
            extract_single_stream(path, dest, f, progress)
        }
        other => Err(CoreError::Other(format!(
            "extracting {} arrives in phase 1",
            other.label()
        ))),
    }
}

fn extract_zip(
    path: &Path,
    dest: &Path,
    password: Option<&str>,
    progress: &mut dyn FnMut(usize, &str),
) -> Result<usize> {
    let file = std::fs::File::open(path)?;
    let mut zip = zip::ZipArchive::new(file)?;
    let mut count = 0;
    for i in 0..zip.len() {
        // peek to decide encryption + validate the path before consuming
        let (name, is_dir, encrypted) = {
            let raw = zip.by_index_raw(i)?;
            (raw.name().to_string(), raw.is_dir(), raw.encrypted())
        };
        let out = safe_join(dest, &name)?;
        if is_dir {
            std::fs::create_dir_all(&out)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut entry = if encrypted {
            let pw = password.ok_or(CoreError::PasswordRequired)?;
            zip.by_index_decrypt(i, pw.as_bytes())
                .map_err(|_| CoreError::WrongPassword)?
        } else {
            zip.by_index(i)?
        };
        let mut writer = std::fs::File::create(&out)?;
        io::copy(&mut entry, &mut writer)?;
        count += 1;
        progress(count, &name);
    }
    Ok(count)
}

fn extract_tar<R: Read>(
    reader: R,
    dest: &Path,
    progress: &mut dyn FnMut(usize, &str),
) -> Result<usize> {
    let mut archive = tar::Archive::new(reader);
    let mut count = 0;
    for entry in archive.entries()? {
        let mut entry = entry?;
        let name = entry.path()?.to_string_lossy().to_string();
        let out = safe_join(dest, &name)?;
        if entry.header().entry_type().is_dir() {
            std::fs::create_dir_all(&out)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent)?;
        }
        entry.unpack(&out)?;
        count += 1;
        progress(count, &name);
    }
    Ok(count)
}

fn extract_single_stream(
    path: &Path,
    dest: &Path,
    format: Format,
    progress: &mut dyn FnMut(usize, &str),
) -> Result<usize> {
    let base = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.rsplit_once('.').map(|(b, _)| b.to_string()).unwrap_or_else(|| n.to_string()))
        .unwrap_or_else(|| "data".to_string());
    let out = safe_join(dest, &base)?;
    let input = std::fs::File::open(path)?;
    let mut reader: Box<dyn Read> = match format {
        Format::Gzip => Box::new(flate2::read::GzDecoder::new(input)),
        Format::Bzip2 => Box::new(bzip2::read::BzDecoder::new(input)),
        Format::Xz => Box::new(xz2::read::XzDecoder::new(input)),
        Format::Zstd => Box::new(zstd::stream::read::Decoder::new(input)?),
        _ => return Err(CoreError::UnknownFormat),
    };
    let mut writer = std::fs::File::create(&out)?;
    io::copy(&mut reader, &mut writer)?;
    progress(1, &base);
    Ok(1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn rejects_zip_slip() {
        let dest = Path::new("/tmp/packed-dest");
        assert!(safe_join(dest, "../../etc/passwd").is_err());
        assert!(safe_join(dest, "/etc/passwd").is_err());
        assert!(safe_join(dest, "a/../../b").is_err());
    }

    #[test]
    fn accepts_normal_paths() {
        let dest = Path::new("/tmp/packed-dest");
        assert_eq!(
            safe_join(dest, "sub/dir/file.txt").unwrap(),
            Path::new("/tmp/packed-dest/sub/dir/file.txt")
        );
        assert_eq!(
            safe_join(dest, "./file.txt").unwrap(),
            Path::new("/tmp/packed-dest/file.txt")
        );
    }
}
