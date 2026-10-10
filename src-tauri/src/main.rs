#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(commands::ManagedProcesses::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                if let Some(processes) = window.try_state::<commands::ManagedProcesses>() {
                    processes.terminate_all();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::install_apk,
            commands::send_file_to_device,
            commands::retrieve_file_from_device,
            commands::adb_shell_command,
            commands::disconnect_device,
            commands::reboot_device,
            commands::start_logcat,
            commands::stop_logcat,
            commands::clear_logcat,
            commands::stop_mirror,
            commands::host_platform,
            commands::tool_status,
            commands::list_devices,
            commands::get_display_settings,
            commands::set_brightness,
            commands::set_brightness_mode,
            commands::capture_screenshot,
            commands::launch_mirror,
            commands::adb_pair,
            commands::adb_connect
        ])
        .run(tauri::generate_context!())
        .expect("Impossible de démarrer Device Bridge");
}
