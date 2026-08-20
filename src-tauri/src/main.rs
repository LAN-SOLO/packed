// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use packed_core::compress::Level;
use packed_core::create::{collect, create};
use packed_core::extract::extract_all;
use packed_core::Format;
use serde::Serialize;
use std::path::PathBuf;

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
        let listing = packed_core::list::list(&PathBuf::from(&path)).map_err(|e| e.to_string())?;
        let total_size = listing.entries.iter().map(|e| e.size).sum();
        Ok(ListingDto {
            format: listing.format.label().to_string(),
            format_writable: listing.format.is_writable(),
            encrypted: listing.encrypted,
            total_size,
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
#[tauri::command]
async fn extract_archive(
    path: String,
    dest: String,
    password: Option<String>,
) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        extract_all(
            &PathBuf::from(&path),
            &PathBuf::from(&dest),
            password.as_deref().filter(|p| !p.is_empty()),
        )
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Create an archive at `dest` from `sources`; returns the number of files packed.
#[tauri::command]
async fn create_archive(
    dest: String,
    format: String,
    sources: Vec<String>,
    level: Level,
    password: Option<String>,
) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let fmt = format_from_str(&format)?;
        let paths: Vec<PathBuf> = sources.iter().map(PathBuf::from).collect();
        let inputs = collect(&paths).map_err(|e| e.to_string())?;
        if inputs.is_empty() {
            return Err("keine Dateien ausgewählt".to_string());
        }
        create(
            &PathBuf::from(&dest),
            fmt,
            &inputs,
            level,
            password.as_deref().filter(|p| !p.is_empty()),
        )
        .map_err(|e| e.to_string())?;
        Ok(inputs.len())
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
            create_archive,
            reveal_path,
            check_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running packed");
}
