//! Edit existing ZIP archives in place: add, rename and delete entries.
//!
//! The archive is rewritten entry by entry into a temporary file in the same
//! directory and then atomically swapped over the original — a crash never
//! leaves a half-written archive behind. Unencrypted entries are copied raw
//! (no recompression); encrypted entries need the password and are decrypted
//! and re-encrypted, because the AES extra field doesn't survive a raw copy.

use std::collections::HashSet;
use std::io;
use std::path::Path;

use crate::compress::Level;
use crate::create::Input;
use crate::error::{CoreError, Result};
use crate::format::{detect, Format};

/// Rename one entry. A trailing `/` on `from` renames the whole subtree.
pub struct Rename {
    pub from: String,
    pub to: String,
}

/// A batch of edits applied to a ZIP archive in one rewrite.
#[derive(Default)]
pub struct ZipEdit {
    /// Entry names to remove; a trailing `/` removes the whole subtree.
    pub deletes: Vec<String>,
    pub renames: Vec<Rename>,
    /// Files from disk to append, stored under their `Input::name`.
    pub add_files: Vec<Input>,
    /// New empty directories to create inside the archive.
    pub add_dirs: Vec<String>,
}

#[derive(Debug)]
pub struct EditResult {
    pub entries: usize,
    pub removed: usize,
    pub renamed: usize,
    pub added: usize,
}

/// Reject names that would escape the archive root or break on some platform.
fn validate_name(name: &str) -> Result<()> {
    let bad = name.is_empty()
        || name.starts_with('/')
        || name.contains('\\')
        || name
            .split('/')
            .any(|c| c == ".." || c == "." || c.is_empty() && !name.ends_with('/'));
    // the empty-component check above still allows exactly one trailing slash
    let double_slash = name.contains("//");
    if bad || double_slash {
        return Err(CoreError::UnsafePath(name.to_string()));
    }
    Ok(())
}

/// Final name of an existing entry after deletes and renames.
/// `None` = the entry is deleted.
fn map_name(name: &str, edit: &ZipEdit) -> Option<String> {
    for d in &edit.deletes {
        if name == d || (d.ends_with('/') && name.starts_with(d.as_str())) {
            return None;
        }
    }
    let mut out = name.to_string();
    for r in &edit.renames {
        if r.from.ends_with('/') {
            let mut to = r.to.clone();
            if !to.ends_with('/') {
                to.push('/');
            }
            if out == r.from {
                out = to;
            } else if out.starts_with(r.from.as_str()) {
                out = format!("{to}{}", &out[r.from.len()..]);
            }
        } else if out == r.from {
            out = r.to.clone();
        }
    }
    Some(out)
}

/// Apply `edit` to the ZIP archive at `path`. New files are compressed with
/// `level`; `password` encrypts them with AES-256 and is required whenever the
/// archive already contains encrypted entries (they are re-encrypted with it).
pub fn edit_zip(
    path: &Path,
    edit: &ZipEdit,
    level: Level,
    password: Option<&str>,
) -> Result<EditResult> {
    if detect(path)? != Format::Zip {
        return Err(CoreError::Other(
            "editing is available for ZIP archives only".to_string(),
        ));
    }
    for r in &edit.renames {
        validate_name(&r.to)?;
    }
    for i in &edit.add_files {
        validate_name(&i.name)?;
    }
    for d in &edit.add_dirs {
        validate_name(d)?;
    }

    let src = std::fs::File::open(path)?;
    let mut zip = zip::ZipArchive::new(src)?;

    // plan final names and reject collisions before touching anything
    let final_names: Vec<Option<String>> = (0..zip.len())
        .map(|i| {
            let name = zip.by_index_raw(i)?.name().to_string();
            Ok(map_name(&name, edit))
        })
        .collect::<Result<_>>()?;
    let mut seen = HashSet::new();
    let normalized_dirs: Vec<String> = edit
        .add_dirs
        .iter()
        .map(|d| if d.ends_with('/') { d.clone() } else { format!("{d}/") })
        .collect();
    for name in final_names
        .iter()
        .flatten()
        .map(String::as_str)
        .chain(edit.add_files.iter().map(|i| i.name.as_str()))
        .chain(normalized_dirs.iter().map(String::as_str))
    {
        if !seen.insert(name) {
            return Err(CoreError::Other(format!(
                "name already exists in the archive: {name}"
            )));
        }
    }

    // rewrite into a temp file next to the original, then swap atomically
    let dir = path.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."));
    let tmp = tempfile::Builder::new()
        .prefix(".packed-edit-")
        .suffix(".zip")
        .tempfile_in(dir)?;
    let mut writer = zip::ZipWriter::new(tmp);

    use zip::write::SimpleFileOptions;
    let mut opts = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(level.deflate() as i64))
        .unix_permissions(0o644);
    if let Some(pw) = password {
        opts = opts.with_aes_encryption(zip::AesMode::Aes256, pw);
    }

    let mut removed = 0usize;
    let mut renamed = 0usize;
    for (i, final_name) in final_names.iter().enumerate() {
        let Some(final_name) = final_name.clone() else {
            removed += 1;
            continue;
        };
        if !zip.by_index_raw(i)?.encrypted() {
            let file = zip.by_index_raw(i)?;
            if final_name == file.name() {
                writer.raw_copy_file(file)?;
            } else {
                renamed += 1;
                writer.raw_copy_file_rename(file, final_name.as_str())?;
            }
        } else {
            // the AES extra field doesn't survive a raw copy, so encrypted
            // entries are decrypted (password required) and written fresh
            let pw = password.ok_or(CoreError::PasswordRequired)?;
            let mut file = zip
                .by_index_decrypt(i, pw.as_bytes())
                .map_err(|_| CoreError::WrongPassword)?;
            if file.name() != final_name {
                renamed += 1;
            }
            if file.is_dir() {
                writer.add_directory(final_name.trim_end_matches('/'), SimpleFileOptions::default())?;
            } else {
                writer.start_file(&final_name, opts)?;
                io::copy(&mut file, &mut writer)?;
            }
        }
    }

    for d in &normalized_dirs {
        writer.add_directory(d.trim_end_matches('/'), SimpleFileOptions::default())?;
    }
    for input in &edit.add_files {
        writer.start_file(&input.name, opts)?;
        let mut src = std::fs::File::open(&input.source)?;
        io::copy(&mut src, &mut writer)?;
    }

    let entries = zip.len() - removed + normalized_dirs.len() + edit.add_files.len();
    let tmp = writer.finish()?;
    tmp.persist(path).map_err(|e| CoreError::Io(e.error))?;
    Ok(EditResult {
        entries,
        removed,
        renamed,
        added: edit.add_files.len() + normalized_dirs.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::create::{create, Input};
    use crate::extract::extract_all;
    use crate::list::list;
    use std::path::PathBuf;

    fn write_file(dir: &Path, name: &str, body: &[u8]) -> PathBuf {
        let p = dir.join(name);
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(&p, body).unwrap();
        p
    }

    fn sample_zip(dir: &Path, password: Option<&str>) -> PathBuf {
        let a = write_file(dir, "a.txt", b"alpha");
        let b = write_file(dir, "sub/b.txt", b"beta");
        let c = write_file(dir, "sub/c.txt", b"gamma");
        let archive = dir.join("edit-me.zip");
        let inputs = vec![
            Input::new(a, "a.txt"),
            Input::new(b, "sub/b.txt"),
            Input::new(c, "sub/c.txt"),
        ];
        create(&archive, Format::Zip, &inputs, Level::Fast, password).unwrap();
        archive
    }

    fn names(path: &Path) -> Vec<String> {
        list(path).unwrap().entries.iter().map(|e| e.name.clone()).collect()
    }

    #[test]
    fn add_rename_delete_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let archive = sample_zip(dir.path(), None);
        let extra = write_file(dir.path(), "new.txt", b"fresh content");

        let res = edit_zip(
            &archive,
            &ZipEdit {
                deletes: vec!["sub/c.txt".into()],
                renames: vec![Rename { from: "a.txt".into(), to: "renamed.txt".into() }],
                add_files: vec![Input::new(extra, "docs/new.txt")],
                add_dirs: vec!["empty".into()],
            },
            Level::Fast,
            None,
        )
        .unwrap();
        assert_eq!(res.removed, 1);
        assert_eq!(res.renamed, 1);
        assert_eq!(res.added, 2);

        let n = names(&archive);
        assert!(n.contains(&"renamed.txt".to_string()), "{n:?}");
        assert!(n.contains(&"docs/new.txt".to_string()), "{n:?}");
        assert!(n.contains(&"empty/".to_string()), "{n:?}");
        assert!(!n.contains(&"a.txt".to_string()), "{n:?}");
        assert!(!n.contains(&"sub/c.txt".to_string()), "{n:?}");

        let out = dir.path().join("out");
        extract_all(&archive, &out, None).unwrap();
        assert_eq!(std::fs::read(out.join("renamed.txt")).unwrap(), b"alpha");
        assert_eq!(std::fs::read(out.join("sub/b.txt")).unwrap(), b"beta");
        assert_eq!(std::fs::read(out.join("docs/new.txt")).unwrap(), b"fresh content");
    }

    #[test]
    fn rename_folder_moves_subtree() {
        let dir = tempfile::tempdir().unwrap();
        let archive = sample_zip(dir.path(), None);
        edit_zip(
            &archive,
            &ZipEdit {
                renames: vec![Rename { from: "sub/".into(), to: "data/".into() }],
                ..Default::default()
            },
            Level::Fast,
            None,
        )
        .unwrap();
        let n = names(&archive);
        assert!(n.contains(&"data/b.txt".to_string()), "{n:?}");
        assert!(n.contains(&"data/c.txt".to_string()), "{n:?}");
        assert!(!n.iter().any(|x| x.starts_with("sub/")), "{n:?}");
    }

    #[test]
    fn delete_folder_removes_subtree() {
        let dir = tempfile::tempdir().unwrap();
        let archive = sample_zip(dir.path(), None);
        edit_zip(
            &archive,
            &ZipEdit { deletes: vec!["sub/".into()], ..Default::default() },
            Level::Fast,
            None,
        )
        .unwrap();
        assert_eq!(names(&archive), vec!["a.txt".to_string()]);
    }

    #[test]
    fn collisions_and_unsafe_names_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let archive = sample_zip(dir.path(), None);

        // rename onto an existing entry
        let err = edit_zip(
            &archive,
            &ZipEdit {
                renames: vec![Rename { from: "a.txt".into(), to: "sub/b.txt".into() }],
                ..Default::default()
            },
            Level::Fast,
            None,
        );
        assert!(matches!(err, Err(CoreError::Other(_))), "{err:?}");

        // path traversal in a new name
        let extra = write_file(dir.path(), "x.txt", b"x");
        let err = edit_zip(
            &archive,
            &ZipEdit {
                add_files: vec![Input::new(extra, "../evil.txt")],
                ..Default::default()
            },
            Level::Fast,
            None,
        );
        assert!(matches!(err, Err(CoreError::UnsafePath(_))), "{err:?}");

        // failed edits must leave the archive untouched
        let n = names(&archive);
        assert_eq!(n.len(), 3, "{n:?}");
    }

    #[test]
    fn encrypted_archives_need_the_password() {
        let dir = tempfile::tempdir().unwrap();
        let archive = sample_zip(dir.path(), Some("s3cret"));
        let extra = write_file(dir.path(), "plus.txt", b"added later");

        // without password: refused; with wrong password: refused
        let err = edit_zip(&archive, &ZipEdit::default(), Level::Fast, None);
        assert!(matches!(err, Err(CoreError::PasswordRequired)), "{err:?}");
        let err = edit_zip(&archive, &ZipEdit::default(), Level::Fast, Some("wrong"));
        assert!(matches!(err, Err(CoreError::WrongPassword)), "{err:?}");

        edit_zip(
            &archive,
            &ZipEdit {
                add_files: vec![Input::new(extra, "plus.txt")],
                ..Default::default()
            },
            Level::Fast,
            Some("s3cret"),
        )
        .unwrap();
        let listing = list(&archive).unwrap();
        assert!(listing.encrypted);
        let out = dir.path().join("out");
        let n = extract_all(&archive, &out, Some("s3cret")).unwrap();
        assert_eq!(n, 4);
        assert_eq!(std::fs::read(out.join("a.txt")).unwrap(), b"alpha");
        assert_eq!(std::fs::read(out.join("plus.txt")).unwrap(), b"added later");
    }

    #[test]
    fn non_zip_edit_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let a = write_file(dir.path(), "a.txt", b"alpha");
        let archive = dir.path().join("x.tar");
        create(&archive, Format::Tar, &[Input::new(a, "a.txt")], Level::Fast, None).unwrap();
        let err = edit_zip(&archive, &ZipEdit::default(), Level::Fast, None);
        assert!(matches!(err, Err(CoreError::Other(_))), "{err:?}");
    }
}
