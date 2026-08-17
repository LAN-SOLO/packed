//! Create archives from a set of input files/directories.

use std::io::{self, Write};
use std::path::{Path, PathBuf};

use crate::compress::Level;
use crate::error::{CoreError, Result};
use crate::format::Format;

/// An input item to add to the archive: a source path on disk, stored under
/// `name` inside the archive.
pub struct Input {
    pub source: PathBuf,
    pub name: String,
}

impl Input {
    pub fn new(source: impl Into<PathBuf>, name: impl Into<String>) -> Self {
        Input {
            source: source.into(),
            name: name.into(),
        }
    }
}

/// Expand a list of paths into archive inputs, walking directories recursively.
/// Names are made relative to each root's parent so folder structure is kept.
pub fn collect(paths: &[PathBuf]) -> Result<Vec<Input>> {
    let mut inputs = Vec::new();
    for root in paths {
        let base = root.parent().unwrap_or(Path::new(""));
        collect_into(root, base, &mut inputs)?;
    }
    Ok(inputs)
}

fn collect_into(path: &Path, base: &Path, out: &mut Vec<Input>) -> Result<()> {
    let meta = std::fs::metadata(path)?;
    if meta.is_dir() {
        for entry in std::fs::read_dir(path)? {
            collect_into(&entry?.path(), base, out)?;
        }
    } else {
        let name = path
            .strip_prefix(base)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        out.push(Input::new(path.to_path_buf(), name));
    }
    Ok(())
}

/// Create an archive at `dest` in `format` from `inputs` at compression `level`.
/// `password` (ZIP only) enables AES-256 encryption.
pub fn create(
    dest: &Path,
    format: Format,
    inputs: &[Input],
    level: Level,
    password: Option<&str>,
) -> Result<()> {
    if !format.is_writable() {
        return Err(CoreError::WriteUnsupported(format.label()));
    }
    match format {
        Format::Zip => create_zip(dest, inputs, level, password),
        Format::Tar => create_tar(dest, inputs, |w| Ok(Box::new(w))),
        Format::TarGz => create_tar(dest, inputs, |w| {
            Ok(Box::new(flate2::write::GzEncoder::new(
                w,
                flate2::Compression::new(level.deflate()),
            )))
        }),
        Format::TarBz2 => create_tar(dest, inputs, |w| {
            Ok(Box::new(bzip2::write::BzEncoder::new(
                w,
                bzip2::Compression::new(level.bzip2()),
            )))
        }),
        Format::TarXz => create_tar(dest, inputs, |w| {
            Ok(Box::new(xz2::write::XzEncoder::new(w, level.xz())))
        }),
        Format::TarZst => create_tar(dest, inputs, |w| {
            let enc = zstd::stream::write::Encoder::new(w, level.zstd())?.auto_finish();
            Ok(Box::new(enc))
        }),
        // single-stream: exactly one input, compressed as a raw blob
        f @ (Format::Gzip | Format::Bzip2 | Format::Xz | Format::Zstd) => {
            create_single_stream(dest, inputs, level, f)
        }
        other => Err(CoreError::WriteUnsupported(other.label())),
    }
}

fn create_zip(dest: &Path, inputs: &[Input], level: Level, password: Option<&str>) -> Result<()> {
    use zip::write::SimpleFileOptions;
    let file = std::fs::File::create(dest)?;
    let mut zip = zip::ZipWriter::new(file);
    let mut opts = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(level.deflate() as i64))
        .unix_permissions(0o644);
    if let Some(pw) = password {
        opts = opts.with_aes_encryption(zip::AesMode::Aes256, pw);
    }
    for input in inputs {
        zip.start_file(&input.name, opts)?;
        let mut src = std::fs::File::open(&input.source)?;
        io::copy(&mut src, &mut zip)?;
    }
    zip.finish()?;
    Ok(())
}

fn create_tar<'a, F>(dest: &Path, inputs: &[Input], wrap: F) -> Result<()>
where
    F: FnOnce(std::fs::File) -> Result<Box<dyn Write + 'a>>,
{
    let file = std::fs::File::create(dest)?;
    let writer = wrap(file)?;
    let mut builder = tar::Builder::new(writer);
    for input in inputs {
        builder.append_path_with_name(&input.source, &input.name)?;
    }
    // finish() flushes tar; the wrapped encoder finalizes on drop (auto_finish)
    builder.into_inner()?.flush()?;
    Ok(())
}

fn create_single_stream(dest: &Path, inputs: &[Input], level: Level, format: Format) -> Result<()> {
    if inputs.len() != 1 {
        return Err(CoreError::Other(format!(
            "{} holds a single file; pack a .tar.{} for multiple files",
            format.label(),
            format.label()
        )));
    }
    let out = std::fs::File::create(dest)?;
    let mut writer: Box<dyn Write> = match format {
        Format::Gzip => Box::new(flate2::write::GzEncoder::new(
            out,
            flate2::Compression::new(level.deflate()),
        )),
        Format::Bzip2 => Box::new(bzip2::write::BzEncoder::new(
            out,
            bzip2::Compression::new(level.bzip2()),
        )),
        Format::Xz => Box::new(xz2::write::XzEncoder::new(out, level.xz())),
        Format::Zstd => Box::new(zstd::stream::write::Encoder::new(out, level.zstd())?.auto_finish()),
        _ => return Err(CoreError::UnknownFormat),
    };
    let mut src = std::fs::File::open(&inputs[0].source)?;
    io::copy(&mut src, &mut writer)?;
    writer.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extract::extract_all;
    use crate::list::list;

    fn write_file(dir: &Path, name: &str, body: &[u8]) -> PathBuf {
        let p = dir.join(name);
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(&p, body).unwrap();
        p
    }

    fn roundtrip(format: Format, ext: &str, password: Option<&str>) {
        let dir = tempfile::tempdir().unwrap();
        let a = write_file(dir.path(), "hello.txt", b"hello packed world");
        let b = write_file(dir.path(), "sub/nested.txt", b"nested content here");
        let archive = dir.path().join(format!("out.{ext}"));
        let inputs = vec![
            Input::new(a, "hello.txt"),
            Input::new(b, "sub/nested.txt"),
        ];
        create(&archive, format, &inputs, Level::Balanced, password).unwrap();

        // listing sees both entries
        let listing = list(&archive).unwrap();
        let names: Vec<&str> = listing.entries.iter().map(|e| e.name.as_str()).collect();
        assert!(names.iter().any(|n| n.ends_with("hello.txt")), "{names:?}");
        assert!(names.iter().any(|n| n.ends_with("nested.txt")), "{names:?}");
        if password.is_some() {
            assert!(listing.encrypted);
        }

        // extraction reproduces the bytes
        let out = dir.path().join("extracted");
        let n = extract_all(&archive, &out, password).unwrap();
        assert_eq!(n, 2);
        assert_eq!(std::fs::read(out.join("hello.txt")).unwrap(), b"hello packed world");
        assert_eq!(
            std::fs::read(out.join("sub/nested.txt")).unwrap(),
            b"nested content here"
        );
    }

    #[test]
    fn zip_roundtrip() {
        roundtrip(Format::Zip, "zip", None);
    }

    #[test]
    fn zip_aes256_roundtrip() {
        roundtrip(Format::Zip, "zip", Some("s3cret-pass"));
    }

    #[test]
    fn tar_roundtrip() {
        roundtrip(Format::Tar, "tar", None);
    }

    #[test]
    fn tar_gz_roundtrip() {
        roundtrip(Format::TarGz, "tar.gz", None);
    }

    #[test]
    fn tar_zst_roundtrip() {
        roundtrip(Format::TarZst, "tar.zst", None);
    }

    #[test]
    fn tar_xz_roundtrip() {
        roundtrip(Format::TarXz, "tar.xz", None);
    }

    #[test]
    fn tar_bz2_roundtrip() {
        roundtrip(Format::TarBz2, "tar.bz2", None);
    }

    #[test]
    fn wrong_zip_password_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let a = write_file(dir.path(), "secret.txt", b"top secret");
        let archive = dir.path().join("enc.zip");
        create(
            &archive,
            Format::Zip,
            &[Input::new(a, "secret.txt")],
            Level::Fast,
            Some("correct"),
        )
        .unwrap();
        let out = dir.path().join("out");
        assert!(matches!(
            extract_all(&archive, &out, Some("wrong")),
            Err(CoreError::WrongPassword)
        ));
        assert!(matches!(
            extract_all(&archive, &out, None),
            Err(CoreError::PasswordRequired)
        ));
    }

    #[test]
    fn rar_creation_refused() {
        let dir = tempfile::tempdir().unwrap();
        let err = create(&dir.path().join("x.rar"), Format::Rar, &[], Level::Fast, None);
        assert!(matches!(err, Err(CoreError::WriteUnsupported(_))));
    }

    #[test]
    fn zstd_single_stream_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let a = write_file(dir.path(), "data.bin", b"single stream payload xxxxxxxxxxxx");
        let archive = dir.path().join("data.zst");
        create(
            &archive,
            Format::Zstd,
            &[Input::new(a, "data.bin")],
            Level::Small,
            None,
        )
        .unwrap();
        let out = dir.path().join("out");
        extract_all(&archive, &out, None).unwrap();
        assert_eq!(
            std::fs::read(out.join("data")).unwrap(),
            b"single stream payload xxxxxxxxxxxx"
        );
    }
}
