mod db;
mod error;

use std::sync::Mutex;
use tauri::{Manager, State};
use crate::db::{Db, Health};
use crate::error::{AppError, AppResult};

#[tauri::command]
fn health_check(db: State<Db>) -> AppResult<Health> {
    let conn = db.0.lock().map_err(|_| AppError::Database("database lock poisoned".into()))?;
    db::health(&conn)
}

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
        .invoke_handler(tauri::generate_handler![health_check])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
