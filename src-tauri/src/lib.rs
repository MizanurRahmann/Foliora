mod books;
mod commands;
mod db;
mod error;
mod files;
#[allow(dead_code)] // Move and swap use the rest of it in Phase 5.
mod placement;
mod shelves;
#[cfg(test)]
mod testutil;

use std::sync::Mutex;

use tauri::Manager;

use crate::db::Db;
use crate::files::Storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let books_dir = dir.join("books");
            let conn = db::open(&dir.join("foliora.db"))?;

            // Leftovers of an interrupted import are harmless, so a failed cleanup must not stop the app.
            let _ = files::sweep(&books_dir, &books::file_refs(&conn)?);
            books::refresh_status(&conn, &books_dir)?;

            app.manage(Db(Mutex::new(conn)));
            app.manage(Storage(books_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health_check,
            commands::list_shelves,
            commands::create_shelf,
            commands::update_shelf,
            commands::reorder_shelves,
            commands::delete_shelf,
            commands::inspect_pdf,
            commands::add_book,
            commands::update_book,
            commands::remove_book,
            commands::relink_book,
            commands::refresh_file_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
