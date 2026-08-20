// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use packed_core::compress::Level;
use packed_core::create::{collect, create_with_progress};
use packed_core::extract::{extract_all_with_progress, extract_entries_with_progress};
use packed_core::Format;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Emitter;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub phase: &'static str,
    pub done: u64,
    pub total: u64,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateResultDto {
    pub files: usize,
    pub original_bytes: u64,
    pub packed_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatDto {
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
}

fn dir_size(path: &Path) -> u64 {
    let Ok(meta) = std::fs::metadata(path) else { return 0 };
    if meta.is_file() {
        return meta.len();
    }
    let Ok(entries) = std::fs::read_dir(path) else { return 0 };
    entries
        .flatten()
        .map(|e| dir_size(&e.path()))
        .sum()
}

#[derive(Serialize)]
pub struct UpdateInfoDto {
    pub version: String,
    pub notes: Option<String>,
    pub date: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryDto {
    pub name: String,
    pub size: u64,
    pub compressed_size: u64,
    pub is_dir: bool,
    pub encrypted: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListingDto {
    pub format: String,
    pub format_writable: bool,
    pub encrypted: bool,
    pub entries: Vec<EntryDto>,
    pub total_size: u64,
    /// Size of the archive file itself on disk.
    pub archive_size: u64,
}

fn format_from_str(s: &str) -> Result<Format, String> {
    Ok(match s {
        "zip" => Format::Zip,
        "tar" => Format::Tar,
        "tar.gz" => Format::TarGz,
        "tar.bz2" => Format::TarBz2,
        "tar.xz" => Format::TarXz,
        "tar.zst" => Format::TarZst,
        "gzip" => Format::Gzip,
        "bzip2" => Format::Bzip2,
        "xz" => Format::Xz,
        "zstd" => Format::Zstd,
        other => return Err(format!("unbekanntes Format: {other}")),
    })
}

/// List an archive's contents without extracting.
#[tauri::command]
async fn inspect_archive(path: String) -> Result<ListingDto, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let pb = PathBuf::from(&path);
        let listing = packed_core::list::list(&pb).map_err(|e| e.to_string())?;
        let total_size = listing.entries.iter().map(|e| e.size).sum();
        let archive_size = std::fs::metadata(&pb).map(|m| m.len()).unwrap_or(0);
        Ok(ListingDto {
            format: listing.format.label().to_string(),
            format_writable: listing.format.is_writable(),
            encrypted: listing.encrypted,
            total_size,
            archive_size,
            entries: listing
                .entries
                .into_iter()
                .map(|e| EntryDto {
                    name: e.name,
                    size: e.size,
                    compressed_size: e.compressed_size,
                    is_dir: e.is_dir,
                    encrypted: e.encrypted,
                })
                .collect(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Extract the whole archive into `dest`; returns the number of files written.
/// Emits `pack-progress` events (done = files so far; total supplied by the UI).
#[tauri::command]
async fn extract_archive(
    app: tauri::AppHandle,
    path: String,
    dest: String,
    password: Option<String>,
) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        extract_all_with_progress(
            &PathBuf::from(&path),
            &PathBuf::from(&dest),
            password.as_deref().filter(|p| !p.is_empty()),
            &mut |done, name| {
                let _ = app.emit(
                    "pack-progress",
                    ProgressEvent {
                        phase: "extract",
                        done: done as u64,
                        total: 0,
                        name: name.to_string(),
                    },
                );
            },
        )
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Extract only the selected entries (names; `dir/` selects the subtree).
#[tauri::command]
async fn extract_entries(
    app: tauri::AppHandle,
    path: String,
    dest: String,
    password: Option<String>,
    names: Vec<String>,
) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        extract_entries_with_progress(
            &PathBuf::from(&path),
            &PathBuf::from(&dest),
            password.as_deref().filter(|p| !p.is_empty()),
            &names,
            &mut |done, name| {
                let _ = app.emit(
                    "pack-progress",
                    ProgressEvent {
                        phase: "extract",
                        done: done as u64,
                        total: 0,
                        name: name.to_string(),
                    },
                );
            },
        )
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Create an archive at `dest` from `sources`. Emits byte-accurate
/// `pack-progress` events and returns files + original/packed sizes.
#[tauri::command]
async fn create_archive(
    app: tauri::AppHandle,
    dest: String,
    format: String,
    sources: Vec<String>,
    level: Level,
    password: Option<String>,
) -> Result<CreateResultDto, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let fmt = format_from_str(&format)?;
        let paths: Vec<PathBuf> = sources.iter().map(PathBuf::from).collect();
        let inputs = collect(&paths).map_err(|e| e.to_string())?;
        if inputs.is_empty() {
            return Err("keine Dateien ausgewählt".to_string());
        }
        let total: u64 = inputs
            .iter()
            .map(|i| std::fs::metadata(&i.source).map(|m| m.len()).unwrap_or(0))
            .sum();
        let dest_path = PathBuf::from(&dest);
        create_with_progress(
            &dest_path,
            fmt,
            &inputs,
            level,
            password.as_deref().filter(|p| !p.is_empty()),
            &mut |done, name| {
                let _ = app.emit(
                    "pack-progress",
                    ProgressEvent {
                        phase: "create",
                        done,
                        total,
                        name: name.to_string(),
                    },
                );
            },
        )
        .map_err(|e| e.to_string())?;
        let packed = std::fs::metadata(&dest_path).map(|m| m.len()).unwrap_or(0);
        Ok(CreateResultDto {
            files: inputs.len(),
            original_bytes: total,
            packed_bytes: packed,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Sizes for the pack list (directories are summed recursively).
#[tauri::command]
async fn stat_paths(paths: Vec<String>) -> Result<Vec<StatDto>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(paths
            .into_iter()
            .map(|p| {
                let pb = PathBuf::from(&p);
                let is_dir = pb.is_dir();
                StatDto {
                    size: dir_size(&pb),
                    is_dir,
                    path: p,
                }
            })
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Show a file in the system file manager.
#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    tauri_plugin_opener::reveal_item_in_dir(PathBuf::from(path)).map_err(|e| e.to_string())
}

/// Check GitHub Releases (latest.json) for a newer version. Returns None when
/// the app is up to date; errors only on an unreachable/invalid endpoint.
#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<Option<UpdateInfoDto>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => Ok(Some(UpdateInfoDto {
            version: update.version.clone(),
            notes: update.body.clone(),
            date: update.date.map(|d| d.to_string()),
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Update-Prüfung fehlgeschlagen: {e}")),
    }
}

/// Download, verify (signed) and install the update in place, then relaunch.
/// User data and settings live outside the app bundle and are untouched.
#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("Update-Prüfung fehlgeschlagen: {e}"))?
        .ok_or("Kein Update verfügbar")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| format!("Update fehlgeschlagen: {e}"))?;
    app.restart();
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            inspect_archive,
            extract_archive,
            extract_entries,
            create_archive,
            stat_paths,
            reveal_path,
            check_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running packed");
}
