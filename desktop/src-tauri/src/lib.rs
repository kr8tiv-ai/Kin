use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

/// Toggle the main window's visibility. Creates the window on first call if
/// it was closed or hasn't been opened yet.
fn toggle_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Build the system tray icon. The icon path is resolved relative
            // to `tauri.conf.json > app > trayIcon > iconPath` at compile
            // time, but we also set it explicitly here for clarity.
            TrayIconBuilder::new("kin-tray")
                .tooltip("KIN Companion")
                .on_tray_icon_event(|tray, event| {
                    // Left-click toggles window visibility
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        // Hide the window instead of closing the app so the tray stays alive.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Prevent the default close behavior — just hide the window.
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running KIN desktop app");
}
