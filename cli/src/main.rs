//! Minimal CLI over packed-core. Not the product (that's the Tauri app) — this
//! exists so the engine is drivable from scripts and CI.
//!
//! Usage:
//!   packed detect <archive>
//!   packed list <archive>
//!   packed extract <archive> <dest> [password]
//!   packed create <out.(zip|tar|tar.gz|tar.zst|tar.xz|tar.bz2)> <level> <input...>
//!         level = fast | balanced | small | maximum

use std::path::PathBuf;
use std::process::ExitCode;

use packed_core::compress::Level;
use packed_core::create::{collect, create};
use packed_core::extract::extract_all;
use packed_core::list::list;
use packed_core::{detect, format::Format};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("packed: {e}");
            ExitCode::FAILURE
        }
    }
}

fn run(args: &[String]) -> Result<(), String> {
    let cmd = args.first().map(String::as_str).unwrap_or("");
    match cmd {
        "detect" => {
            let path = arg(args, 1)?;
            let f = detect(&PathBuf::from(path)).map_err(|e| e.to_string())?;
            println!("{}", f.label());
        }
        "list" => {
            let path = arg(args, 1)?;
            let l = list(&PathBuf::from(path)).map_err(|e| e.to_string())?;
            println!("format: {}  encrypted: {}", l.format.label(), l.encrypted);
            for e in l.entries {
                println!(
                    "  {}{}  {} B",
                    e.name,
                    if e.encrypted { " [enc]" } else { "" },
                    e.size
                );
            }
        }
        "extract" => {
            let path = PathBuf::from(arg(args, 1)?);
            let dest = PathBuf::from(arg(args, 2)?);
            let password = args.get(3).map(String::as_str);
            let n = extract_all(&path, &dest, password).map_err(|e| e.to_string())?;
            println!("extracted {n} file(s) to {}", dest.display());
        }
        "create" => {
            let out = PathBuf::from(arg(args, 1)?);
            let level = parse_level(arg(args, 2)?)?;
            let format = format_for(&out)?;
            let paths: Vec<PathBuf> = args[3..].iter().map(PathBuf::from).collect();
            if paths.is_empty() {
                return Err("create needs at least one input path".into());
            }
            let inputs = collect(&paths).map_err(|e| e.to_string())?;
            create(&out, format, &inputs, level, None).map_err(|e| e.to_string())?;
            println!("created {} ({} entries)", out.display(), inputs.len());
        }
        _ => {
            return Err(
                "usage: packed <detect|list|extract|create> ... (see source header)".into(),
            )
        }
    }
    Ok(())
}

fn arg<'a>(args: &'a [String], i: usize) -> Result<&'a str, String> {
    args.get(i).map(String::as_str).ok_or_else(|| "missing argument".to_string())
}

fn parse_level(s: &str) -> Result<Level, String> {
    Ok(match s {
        "fast" => Level::Fast,
        "balanced" => Level::Balanced,
        "small" => Level::Small,
        "maximum" | "max" => Level::Maximum,
        other => return Err(format!("unknown level '{other}' (fast|balanced|small|maximum)")),
    })
}

fn format_for(out: &std::path::Path) -> Result<Format, String> {
    // reuse detection's extension logic by faking a probe on the name
    packed_core::format::detect(out).or_else(|_| {
        // detect() reads the file; for a not-yet-created output it fails on I/O,
        // so fall back to extension via a temp empty file probe
        let name = out.to_string_lossy().to_ascii_lowercase();
        Ok(if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
            Format::TarGz
        } else if name.ends_with(".tar.zst") || name.ends_with(".tzst") {
            Format::TarZst
        } else if name.ends_with(".tar.xz") || name.ends_with(".txz") {
            Format::TarXz
        } else if name.ends_with(".tar.bz2") || name.ends_with(".tbz2") {
            Format::TarBz2
        } else if name.ends_with(".tar") {
            Format::Tar
        } else if name.ends_with(".zip") {
            Format::Zip
        } else if name.ends_with(".zst") {
            Format::Zstd
        } else if name.ends_with(".gz") {
            Format::Gzip
        } else if name.ends_with(".xz") {
            Format::Xz
        } else if name.ends_with(".bz2") {
            Format::Bzip2
        } else {
            return Err("cannot infer output format from filename".to_string());
        })
    })
}
