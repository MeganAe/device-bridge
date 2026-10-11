use serde::Serialize;
use std::{
    collections::HashMap,
    env, fs,
    io::{BufRead, BufReader, Read},
    path::PathBuf,
    process::{Child, Command, Output, Stdio},
    sync::Mutex,
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct ManagedProcesses {
    children: Mutex<HashMap<String, Child>>,
}

impl ManagedProcesses {
    fn store(&self, key: String, child: Child) -> Result<(), String> {
        let mut children = self.children.lock().map_err(|_| "État des processus indisponible.".to_string())?;
        if let Some(mut previous) = children.remove(&key) {
            let _ = previous.kill();
            let _ = previous.wait();
        }
        children.insert(key, child);
        Ok(())
    }

    fn stop(&self, key: &str) {
        if let Ok(mut children) = self.children.lock() {
            if let Some(mut child) = children.remove(key) {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }

    pub fn terminate_all(&self) {
        if let Ok(mut children) = self.children.lock() {
            for child in children.values_mut() {
                let _ = child.kill();
                let _ = child.wait();
            }
            children.clear();
        }
    }
}

impl Drop for ManagedProcesses {
    fn drop(&mut self) {
        if let Ok(children) = self.children.get_mut() {
            for child in children.values_mut() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub adb_found: bool,
    pub adb_version: Option<String>,
    pub adb_bundled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub serial: String,
    pub state: String,
    pub model: Option<String>,
    pub product: Option<String>,
    pub android_version: Option<String>,
    pub battery_level: Option<u8>,
    pub connection_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplaySettings {
    pub brightness: u16,
    pub automatic: bool,
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

#[cfg(target_os = "windows")]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_console(_command: &mut Command) {}

fn output_text(output: &Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stdout.is_empty() {
        return stdout;
    }
    String::from_utf8_lossy(&output.stderr).trim().to_string()
}

#[tauri::command]
pub fn tool_status(app: AppHandle) -> ToolStatus {
    let adb = resolve_tool(&app, "adb");
    ToolStatus {
        adb_found: adb.is_some(),
        adb_version: None,
        adb_bundled: adb.as_ref().map(|(_, bundled)| *bundled).unwrap_or(false),
    }
}

fn adb_path(app: &AppHandle) -> Result<PathBuf, String> {
    resolve_tool(app, "adb")
        .map(|(path, _)| path)
        .ok_or_else(|| "ADB n’est pas disponible dans cette installation.".to_string())
}

fn adb_output(app: &AppHandle, args: &[&str]) -> Result<Output, String> {
    let mut command = Command::new(adb_path(app)?);
    hide_console(&mut command);
    let output = command
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
        let (android_version, battery_level) = if state == "device" {
            let version = adb_output(&app, &["-s", serial, "shell", "getprop", "ro.build.version.release"])
                .ok()
                .map(|result| String::from_utf8_lossy(&result.stdout).trim().to_string())
                .filter(|value| !value.is_empty());
            let battery = adb_output(&app, &["-s", serial, "shell", "dumpsys", "battery"])
                .ok()
                .and_then(|result| {
                    String::from_utf8_lossy(&result.stdout)
                        .lines()
                        .find_map(|line| line.trim().strip_prefix("level:").and_then(|value| value.trim().parse::<u8>().ok()))
                });
            (version, battery)
        } else {
            (None, None)
        };
        devices.push(DeviceInfo {
            serial: serial.to_string(),
            state: state.to_string(),
            model: field_value(&fields, "model:"),
            product: field_value(&fields, "product:"),
            android_version,
            battery_level,
            connection_type: if serial.contains(':') { "Wi-Fi".to_string() } else { "USB".to_string() },
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

#[tauri::command]
pub fn disconnect_device(app: AppHandle, serial: String) -> Result<String, String> {
    validate_serial(&serial)?;
    if !serial.contains(':') {
        return Err("Cet appareil est connecté par USB. Débranchez le câble pour le déconnecter.".to_string());
    }
    let output = adb_output(&app, &["disconnect", serial.as_str()])?;
    Ok(output_text(&output))
}

#[tauri::command]
pub fn reboot_device(app: AppHandle, serial: String) -> Result<(), String> {
    validate_serial(&serial)?;
    adb_output(&app, &["-s", serial.as_str(), "reboot"])?;
    Ok(())
}

fn validate_local_file(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if !path.is_file() {
        return Err("Le fichier sélectionné n’existe plus ou n’est pas accessible.".to_string());
    }
    Ok(path)
}

#[tauri::command]
pub async fn install_apk(app: AppHandle, serial: String, apk_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_serial(&serial)?;
        let path = validate_local_file(&apk_path)?;
        if path.extension().and_then(|value| value.to_str()).map(|value| value.eq_ignore_ascii_case("apk")) != Some(true) {
            return Err("Choisissez un fichier APK Android (.apk).".to_string());
        }
        let path_string = path.to_string_lossy().to_string();
        let output = adb_output(&app, &["-s", serial.as_str(), "install", "-r", path_string.as_str()])?;
        Ok(output_text(&output))
    })
    .await
    .map_err(|error| format!("Tâche d’installation interrompue : {error}"))?
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TransferProgress {
    transfer_id: String,
    serial: String,
    percent: Option<u8>,
    message: String,
}

fn validate_transfer_id(transfer_id: &str) -> Result<(), String> {
    if transfer_id.is_empty()
        || transfer_id.len() > 80
        || !transfer_id.chars().all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("Identifiant de transfert invalide.".to_string());
    }
    Ok(())
}

fn publish_transfer_line(
    app: &AppHandle,
    transfer_id: &str,
    serial: &str,
    output: &mut String,
    raw_line: &[u8],
) {
    let message = String::from_utf8_lossy(raw_line).trim().to_string();
    if message.is_empty() {
        return;
    }
    if output.len() < 65_536 {
        output.push_str(&message);
        output.push('\n');
    }
    let percent = message
        .find('%')
        .and_then(|end| message[..end].split(|character: char| !character.is_ascii_digit()).filter_map(|part| part.parse::<u8>().ok()).last())
        .filter(|value| *value <= 100);
    let display_message: String = message.chars().take(2048).collect();
    let _ = app.emit("transfer-progress", TransferProgress {
        transfer_id: transfer_id.to_string(),
        serial: serial.to_string(),
        percent,
        message: display_message,
    });
}

fn read_transfer_output<R: Read + Send + 'static>(
    mut reader: R,
    app: AppHandle,
    transfer_id: String,
    serial: String,
) -> Result<String, String> {
    let mut collected = String::new();
    let mut pending = Vec::new();
    let mut buffer = [0_u8; 4096];
    loop {
        let count = reader.read(&mut buffer).map_err(|error| format!("Impossible de lire la progression du transfert : {error}"))?;
        if count == 0 {
            break;
        }
        for byte in &buffer[..count] {
            if *byte == b'\n' || *byte == b'\r' {
                publish_transfer_line(&app, &transfer_id, &serial, &mut collected, &pending);
                pending.clear();
            } else {
                pending.push(*byte);
                if pending.len() >= 16_384 {
                    publish_transfer_line(&app, &transfer_id, &serial, &mut collected, &pending);
                    pending.clear();
                }
            }
        }
    }
    publish_transfer_line(&app, &transfer_id, &serial, &mut collected, &pending);
    Ok(collected)
}

fn run_adb_transfer(app: &AppHandle, serial: &str, transfer_id: &str, args: &[String]) -> Result<String, String> {
    validate_transfer_id(transfer_id)?;
    let mut command = Command::new(adb_path(app)?);
    hide_console(&mut command);
    let mut child = command
        .args(args.iter().map(String::as_str))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Impossible de démarrer le transfert ADB : {error}"))?;
    let stdout = child.stdout.take().ok_or_else(|| "Sortie ADB indisponible.".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "Sortie d’erreur ADB indisponible.".to_string())?;

    let stdout_app = app.clone();
    let stdout_id = transfer_id.to_string();
    let stdout_serial = serial.to_string();
    let stdout_thread = thread::spawn(move || read_transfer_output(stdout, stdout_app, stdout_id, stdout_serial));
    let stderr_app = app.clone();
    let stderr_id = transfer_id.to_string();
    let stderr_serial = serial.to_string();
    let stderr_thread = thread::spawn(move || read_transfer_output(stderr, stderr_app, stderr_id, stderr_serial));

    let status = child.wait().map_err(|error| format!("Impossible d’attendre la fin du transfert ADB : {error}"))?;
    let stdout_text = stdout_thread.join().map_err(|_| "Lecture de la sortie ADB interrompue.".to_string())??;
    let stderr_text = stderr_thread.join().map_err(|_| "Lecture de la progression ADB interrompue.".to_string())??;
    if status.success() {
        let _ = app.emit("transfer-progress", TransferProgress {
            transfer_id: transfer_id.to_string(),
            serial: serial.to_string(),
            percent: Some(100),
            message: "Transfert terminé.".to_string(),
        });
        Ok(if stderr_text.is_empty() { stdout_text } else { stderr_text })
    } else {
        let details = if stderr_text.is_empty() { stdout_text } else { stderr_text };
        Err(if details.is_empty() {
            format!("Le transfert ADB a échoué ({}).", status)
        } else {
            details
        })
    }
}

#[tauri::command]
pub async fn send_file_to_device(
    app: AppHandle,
    serial: String,
    local_path: String,
    transfer_id: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_serial(&serial)?;
        validate_transfer_id(&transfer_id)?;
        let path = validate_local_file(&local_path)?;
        let file_name = path.file_name().and_then(|value| value.to_str()).ok_or_else(|| "Nom de fichier non valide.".to_string())?;
        if file_name.is_empty() || file_name.starts_with('-') || file_name.chars().any(char::is_control) {
            return Err("Nom de fichier non valide.".to_string());
        }
        let local = path.to_string_lossy().to_string();
        let remote = format!("/sdcard/Download/{file_name}");
        let args = vec!["-s".to_string(), serial.clone(), "push".to_string(), "-p".to_string(), local, remote.clone()];
        run_adb_transfer(&app, &serial, &transfer_id, &args)?;
        Ok(remote)
    })
    .await
    .map_err(|error| format!("Tâche de transfert interrompue : {error}"))?
}

#[tauri::command]
pub async fn retrieve_file_from_device(
    app: AppHandle,
    serial: String,
    remote_path: String,
    local_path: String,
    transfer_id: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_serial(&serial)?;
        validate_transfer_id(&transfer_id)?;
        if !remote_path.starts_with('/') || remote_path.starts_with('-') || remote_path.chars().any(char::is_control) || remote_path.split('/').any(|part| part == "..") {
            return Err("Saisissez un chemin absolu Android valide, par exemple /sdcard/Download/fichier.pdf.".to_string());
        }
        let destination = PathBuf::from(local_path);
        let parent = destination.parent().ok_or_else(|| "Dossier de destination invalide.".to_string())?;
        fs::create_dir_all(parent).map_err(|error| format!("Impossible de préparer le dossier de destination : {error}"))?;
        let local = destination.to_string_lossy().to_string();
        let args = vec!["-s".to_string(), serial.clone(), "pull".to_string(), "-p".to_string(), remote_path, local.clone()];
        run_adb_transfer(&app, &serial, &transfer_id, &args)?;
        Ok(local)
    })
    .await
    .map_err(|error| format!("Tâche de transfert interrompue : {error}"))?
}

#[tauri::command]
pub fn adb_shell_command(app: AppHandle, serial: String, command: String) -> Result<String, String> {
    validate_serial(&serial)?;
    let command = command.trim();
    if command.is_empty() || command.len() > 4096 || command.chars().any(|character| character == '\0' || character == '\n' || character == '\r') {
        return Err("Saisissez une seule commande Android (4 096 caractères maximum).".to_string());
    }
    let output = adb_output(&app, &["-s", serial.as_str(), "shell", command])?;
    Ok(output_text(&output))
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LogcatLine {
    serial: String,
    line: String,
}

#[tauri::command]
pub fn start_logcat(app: AppHandle, processes: State<'_, ManagedProcesses>, serial: String) -> Result<(), String> {
    validate_serial(&serial)?;
    let mut command = Command::new(adb_path(&app)?);
    hide_console(&mut command);
    let mut child = command
        .args(["-s", serial.as_str(), "logcat", "-v", "time"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Impossible de démarrer logcat : {error}"))?;
    let stdout = child.stdout.take().ok_or_else(|| "Flux logcat indisponible.".to_string())?;
    processes.store(format!("logcat:{serial}"), child)?;
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            match line {
                Ok(line) => { let _ = app.emit("logcat-line", LogcatLine { serial: serial.clone(), line }); }
                Err(_) => break,
            }
        }
        let _ = app.emit("logcat-ended", serial);
    });
    Ok(())
}

#[tauri::command]
pub fn stop_logcat(processes: State<'_, ManagedProcesses>, serial: String) -> Result<(), String> {
    validate_serial(&serial)?;
    processes.stop(&format!("logcat:{serial}"));
    Ok(())
}

#[tauri::command]
pub fn clear_logcat(app: AppHandle, serial: String) -> Result<(), String> {
    validate_serial(&serial)?;
    adb_output(&app, &["-s", serial.as_str(), "logcat", "-c"])?;
    Ok(())
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

