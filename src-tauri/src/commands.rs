use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    path::PathBuf,
    process::{Command, Output, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{path::BaseDirectory, AppHandle, Manager};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub adb_found: bool,
    pub adb_version: Option<String>,
    pub adb_bundled: bool,
    pub scrcpy_found: bool,
    pub scrcpy_version: Option<String>,
    pub scrcpy_bundled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub serial: String,
    pub state: String,
    pub model: Option<String>,
    pub product: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplaySettings {
    pub brightness: u16,
    pub automatic: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MirrorOptions {
    /// None means the native device resolution.
    pub max_size: Option<u16>,
    /// None means no additional frame-rate cap.
    pub max_fps: Option<u16>,
    pub bitrate_mbps: u8,
    pub video_codec: String,
    pub audio_enabled: bool,
    pub record_video: bool,
}

impl Default for MirrorOptions {
    fn default() -> Self {
        Self {
            max_size: Some(1920),
            max_fps: Some(60),
            bitrate_mbps: 8,
            video_codec: "h264".to_string(),
            audio_enabled: true,
            record_video: false,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorStartResult {
    pub recording_file: Option<String>,
}

#[tauri::command]
pub fn host_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

fn executable_candidates(name: &str) -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        vec![format!("{name}.exe"), format!("{name}.bat"), name.to_string()]
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec![name.to_string()]
    }
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    let candidates = executable_candidates(name);
    let path = env::var_os("PATH")?;
    for directory in env::split_paths(&path) {
        for candidate in &candidates {
            let full_path = directory.join(candidate);
            if full_path.is_file() {
                return Some(full_path);
            }
        }
    }
    None
}

/// Prefer the copy shipped inside the application. PATH is retained only as a
/// convenience for developer builds without prepared resources.
fn resolve_tool(app: &AppHandle, name: &str) -> Option<(PathBuf, bool)> {
    let candidates = executable_candidates(name);
    if let Ok(tools_dir) = app.path().resolve("tools", BaseDirectory::Resource) {
        for candidate in &candidates {
            let path = tools_dir.join(candidate);
            if path.is_file() {
                return Some((path, true));
            }
        }
    }
    find_on_path(name).map(|path| (path, false))
}

fn output_text(output: &Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stdout.is_empty() {
        return stdout;
    }
    String::from_utf8_lossy(&output.stderr).trim().to_string()
}

fn probe_tool(app: &AppHandle, name: &str, args: &[&str]) -> (Option<String>, bool) {
    let Some((path, bundled)) = resolve_tool(app, name) else {
        return (None, false);
    };
    let version = Command::new(path)
        .args(args)
        .output()
        .ok()
        .map(|output| {
            let text = output_text(&output);
            if text.is_empty() {
                "Présent".to_string()
            } else {
                text.lines().next().unwrap_or("Présent").to_string()
            }
        })
        .or_else(|| Some("Présent".to_string()));
    (version, bundled)
}

#[tauri::command]
pub fn tool_status(app: AppHandle) -> ToolStatus {
    let (adb_version, adb_bundled) = probe_tool(&app, "adb", &["version"]);
    let (scrcpy_version, scrcpy_bundled) = probe_tool(&app, "scrcpy", &["--version"]);
    ToolStatus {
        adb_found: adb_version.is_some(),
        adb_version,
        adb_bundled,
        scrcpy_found: scrcpy_version.is_some(),
        scrcpy_version,
        scrcpy_bundled,
    }
}

fn adb_path(app: &AppHandle) -> Result<PathBuf, String> {
    resolve_tool(app, "adb")
        .map(|(path, _)| path)
        .ok_or_else(|| "ADB n’est pas disponible dans cette installation.".to_string())
}

fn adb_output(app: &AppHandle, args: &[&str]) -> Result<Output, String> {
    let output = Command::new(adb_path(app)?)
        .args(args)
        .output()
        .map_err(|error| format!("Impossible de lancer ADB : {error}"))?;
    if output.status.success() {
        Ok(output)
    } else {
        let details = output_text(&output);
        Err(if details.is_empty() {
            format!("ADB a terminé avec le code {}.", output.status)
        } else {
            details
        })
    }
}

fn validate_serial(serial: &str) -> Result<(), String> {
    if serial.trim().is_empty()
        || serial.starts_with('-')
        || serial.chars().any(char::is_whitespace)
        || serial.chars().any(|character| character.is_control())
    {
        return Err("Identifiant d’appareil invalide.".to_string());
    }
    Ok(())
}

fn field_value<'a>(fields: &'a [&'a str], prefix: &str) -> Option<String> {
    fields
        .iter()
        .find_map(|field| field.strip_prefix(prefix).map(|value| value.replace('_', " ")))
}

#[tauri::command]
pub fn list_devices(app: AppHandle) -> Result<Vec<DeviceInfo>, String> {
    let output = adb_output(&app, &["devices", "-l"])?;
    let text = String::from_utf8_lossy(&output.stdout);
    let mut devices = Vec::new();

    for line in text.lines().skip(1) {
        let mut columns = line.split_whitespace();
        let Some(serial) = columns.next() else { continue };
        let Some(state) = columns.next() else { continue };
        let fields: Vec<&str> = columns.collect();
        devices.push(DeviceInfo {
            serial: serial.to_string(),
            state: state.to_string(),
            model: field_value(&fields, "model:"),
            product: field_value(&fields, "product:"),
        });
    }
    Ok(devices)
}

fn device_setting(app: &AppHandle, serial: &str, key: &str) -> Result<String, String> {
    validate_serial(serial)?;
    let output = adb_output(
        app,
        &["-s", serial, "shell", "settings", "get", "system", key],
    )?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub fn get_display_settings(app: AppHandle, serial: String) -> Result<DisplaySettings, String> {
    let brightness = device_setting(&app, &serial, "screen_brightness")?
        .parse::<u16>()
        .unwrap_or(128)
        .clamp(1, 255);
    let mode = device_setting(&app, &serial, "screen_brightness_mode")?;
    Ok(DisplaySettings {
        brightness,
        automatic: mode == "1",
    })
}

#[tauri::command]
pub fn set_brightness(app: AppHandle, serial: String, brightness: u16) -> Result<(), String> {
    validate_serial(&serial)?;
    if !(1..=255).contains(&brightness) {
        return Err("La luminosité doit être comprise entre 1 et 255.".to_string());
    }
    adb_output(
        &app,
        &["-s", serial.as_str(), "shell", "settings", "put", "system", "screen_brightness_mode", "0"],
    )?;
    let value = brightness.to_string();
    adb_output(
        &app,
        &["-s", serial.as_str(), "shell", "settings", "put", "system", "screen_brightness", value.as_str()],
    )?;
    Ok(())
}

#[tauri::command]
pub fn set_brightness_mode(app: AppHandle, serial: String, automatic: bool) -> Result<(), String> {
    validate_serial(&serial)?;
    let mode = if automatic { "1" } else { "0" };
    adb_output(
        &app,
        &["-s", serial.as_str(), "shell", "settings", "put", "system", "screen_brightness_mode", mode],
    )?;
    Ok(())
}

fn validate_endpoint(endpoint: &str) -> Result<(), String> {
    let allowed = endpoint.chars().all(|character| {
        character.is_ascii_alphanumeric() || matches!(character, '.' | ':' | '-' | '[' | ']')
    });
    if !allowed || !endpoint.contains(':') || endpoint.starts_with('-') {
        return Err("Adresse invalide. Utilisez le format adresse IP:port affiché par Android.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn adb_pair(app: AppHandle, endpoint: String, pairing_code: String) -> Result<String, String> {
    validate_endpoint(&endpoint)?;
    if pairing_code.len() != 6 || !pairing_code.chars().all(|character| character.is_ascii_digit()) {
        return Err("Le code d’appairage Android doit contenir 6 chiffres.".to_string());
    }
    let output = adb_output(&app, &["pair", endpoint.as_str(), pairing_code.as_str()])?;
    Ok(output_text(&output))
}

#[tauri::command]
pub fn adb_connect(app: AppHandle, endpoint: String) -> Result<String, String> {
    validate_endpoint(&endpoint)?;
    let output = adb_output(&app, &["connect", endpoint.as_str()])?;
    Ok(output_text(&output))
}

fn home_dir(app: &AppHandle) -> Result<PathBuf, String> {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .or_else(|| app.path().app_local_data_dir().ok())
        .ok_or_else(|| "Dossier utilisateur introuvable.".to_string())
}

fn media_file(app: &AppHandle, library: &str, prefix: &str, extension: &str) -> Result<PathBuf, String> {
    let base = home_dir(app)?;
    let directory = base.join(library).join("Device Bridge");
    fs::create_dir_all(&directory).map_err(|error| format!("Impossible de créer le dossier média : {error}"))?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    Ok(directory.join(format!("{prefix}-{timestamp}.{extension}")))
}

#[tauri::command]
pub fn capture_screenshot(app: AppHandle, serial: String) -> Result<String, String> {
    validate_serial(&serial)?;
    let output = adb_output(
        &app,
        &["-s", serial.as_str(), "exec-out", "screencap", "-p"],
    )?;
    if !output.stdout.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Le téléphone n’a pas renvoyé une capture PNG valide.".to_string());
    }
    let file = media_file(&app, "Pictures", "capture", "png")?;
    fs::write(&file, output.stdout).map_err(|error| format!("Impossible d’enregistrer la capture : {error}"))?;
    Ok(file.to_string_lossy().to_string())
}

fn validate_mirror_options(options: &MirrorOptions) -> Result<(), String> {
    if let Some(size) = options.max_size {
        if size != 0 && !(320..=7680).contains(&size) {
            return Err("La résolution maximale doit être comprise entre 320 et 7680 pixels.".to_string());
        }
    }
    if let Some(fps) = options.max_fps {
        if !(10..=240).contains(&fps) {
            return Err("La fréquence d’images doit être comprise entre 10 et 240 FPS.".to_string());
        }
    }
    if !(1..=40).contains(&options.bitrate_mbps) {
        return Err("Le débit vidéo doit être compris entre 1 et 40 Mbit/s.".to_string());
    }
    if !["h264", "h265", "av1", "vp8", "vp9"].contains(&options.video_codec.as_str()) {
        return Err("Codec vidéo non pris en charge.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn launch_mirror(
    app: AppHandle,
    serial: String,
    options: MirrorOptions,
) -> Result<MirrorStartResult, String> {
    validate_serial(&serial)?;
    validate_mirror_options(&options)?;
    let (scrcpy, bundled) = resolve_tool(&app, "scrcpy")
        .ok_or_else(|| "scrcpy n’est pas disponible dans cette installation.".to_string())?;

    let mut args = vec!["--serial".to_string(), serial];
    if let Some(size) = options.max_size.filter(|value| *value > 0) {
        args.push(format!("--max-size={size}"));
    }
    if let Some(fps) = options.max_fps {
        args.push(format!("--max-fps={fps}"));
    }
    args.push(format!("--video-bit-rate={}M", options.bitrate_mbps));
    args.push(format!("--video-codec={}", options.video_codec));
    if !options.audio_enabled {
        args.push("--no-audio".to_string());
    }

    let recording_file = if options.record_video {
        let video_library = if cfg!(target_os = "macos") { "Movies" } else { "Videos" };
        let file = media_file(&app, video_library, "enregistrement", "mp4")?;
        args.push(format!("--record={}", file.to_string_lossy()));
        Some(file.to_string_lossy().to_string())
    } else {
        None
    };

    let mut command = Command::new(scrcpy);
    if bundled {
        // scrcpy resolves adb by name; prioritize the copy bundled with the app.
        if let Some((adb, true)) = resolve_tool(&app, "adb") {
            if let Some(tools_dir) = adb.parent() {
                let mut entries = vec![tools_dir.to_path_buf()];
                if let Some(existing_path) = env::var_os("PATH") {
                    entries.extend(env::split_paths(&existing_path));
                }
                let updated_path = env::join_paths(entries)
                    .map_err(|error| format!("Impossible de préparer les outils intégrés : {error}"))?;
                command.env("PATH", updated_path);
            }
        }
    }

    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Impossible de démarrer scrcpy : {error}"))?;

    Ok(MirrorStartResult { recording_file })
}
