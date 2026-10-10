#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
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
