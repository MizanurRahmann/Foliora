use rusqlite::Connection;
use tauri::State;

use crate::db::{self, Db, Health};
use crate::error::{AppError, AppResult};
use crate::shelves::{self, Shelf};

fn with_conn<T>(db: &Db, f: impl FnOnce(&mut Connection) -> AppResult<T>) -> AppResult<T> {
    let mut conn = db
        .0
        .lock()
        .map_err(|_| AppError::Database("database lock poisoned".into()))?;
    f(&mut conn)
}

#[tauri::command]
pub fn health_check(db: State<Db>) -> AppResult<Health> {
    with_conn(&db, |conn| db::health(conn))
}

#[tauri::command]
pub fn list_shelves(db: State<Db>) -> AppResult<Vec<Shelf>> {
    with_conn(&db, |conn| shelves::list(conn))
}

// The write commands return the refreshed list so the UI never has to merge changes itself.

#[tauri::command]
pub fn create_shelf(db: State<Db>, name: String, capacity: i64) -> AppResult<Vec<Shelf>> {
    with_conn(&db, |conn| {
        shelves::create(conn, &name, capacity)?;
        shelves::list(conn)
    })
}

#[tauri::command]
pub fn update_shelf(db: State<Db>, id: i64, name: String, capacity: i64) -> AppResult<Vec<Shelf>> {
    with_conn(&db, |conn| {
        shelves::update(conn, id, &name, capacity)?;
        shelves::list(conn)
    })
}

#[tauri::command]
pub fn reorder_shelves(db: State<Db>, ids: Vec<i64>) -> AppResult<Vec<Shelf>> {
    with_conn(&db, |conn| {
        shelves::reorder(conn, &ids)?;
        shelves::list(conn)
    })
}

#[tauri::command]
pub fn delete_shelf(db: State<Db>, id: i64) -> AppResult<Vec<Shelf>> {
    with_conn(&db, |conn| {
        shelves::delete(conn, id)?;
        shelves::list(conn)
    })
}
