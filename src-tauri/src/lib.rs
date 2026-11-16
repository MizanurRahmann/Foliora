mod commands;
mod db;
mod error;
#[allow(dead_code)] // Used by the book commands from Phase 4 on.
mod placement;
mod shelves;

use std::sync::Mutex;

use tauri::Manager;

use crate::db::Db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("foliora.db"))?;
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health_check,
            commands::list_shelves,
            commands::create_shelf,
            commands::update_shelf,
            commands::reorder_shelves,
            commands::delete_shelf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
