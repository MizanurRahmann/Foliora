use std::path::Path;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::books::{self, AddBookRequest, BookFields, Duplicate};
use crate::db::{self, Db, Health};
use crate::error::{AppError, AppResult};
use crate::files::{self, PdfInfo, Storage};
use crate::{items, reader};
use crate::shelves::{self, Shelf};

fn with_conn<T>(db: &Db, f: impl FnOnce(&mut Connection) -> AppResult<T>) -> AppResult<T> {
    let mut conn = db
        .0
        .lock()
        .map_err(|_| AppError::Database("database lock poisoned".into()))?;
    f(&mut conn)
}

// File work (hashing, copying) runs off the main thread so the window stays responsive.
async fn blocking<T: Send + 'static>(
    app: &AppHandle,
    work: impl FnOnce(&Db, &Path) -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<Db>();
        let storage = app.state::<Storage>();
        work(&db, &storage.0)
    })
    .await
    .map_err(|err| AppError::Io(err.to_string()))?
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inspection {
    #[serde(flatten)]
    info: PdfInfo,
    duplicate_of: Option<Duplicate>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddBookResult {
    book_id: i64,
    shelves: Vec<Shelf>,
}

#[tauri::command]
pub async fn inspect_pdf(app: AppHandle, path: String) -> AppResult<Inspection> {
    blocking(&app, move |db, _| {
        let info = files::inspect(Path::new(&path))?;
        let duplicate_of = with_conn(db, |conn| books::find_duplicate(conn, &info.hash))?;
        Ok(Inspection { info, duplicate_of })
    })
    .await
}

#[tauri::command]
pub async fn add_book(app: AppHandle, request: AddBookRequest) -> AppResult<AddBookResult> {
    blocking(&app, move |db, books_dir| {
        with_conn(db, |conn| {
            let book_id = books::add(conn, books_dir, &request)?;
            Ok(AddBookResult { book_id, shelves: shelves::list(conn)? })
        })
    })
    .await
}

#[tauri::command]
pub fn update_book(db: State<Db>, id: i64, fields: BookFields) -> AppResult<Vec<Shelf>> {
    with_conn(&db, |conn| {
        books::update(conn, id, &fields)?;
        shelves::list(conn)
    })
}

#[tauri::command]
pub fn remove_book(
    db: State<Db>,
    storage: State<Storage>,
    id: i64,
    delete_file: bool,
) -> AppResult<Vec<Shelf>> {
    with_conn(&db, |conn| {
        let stored_copy = books::remove(conn, id)?;
        if let Some(name) = stored_copy {
            // The book is already gone. A delete that fails here leaves an orphan that the next
            // start sweeps; a kept file is renamed so that sweep skips it.
            let _ = if delete_file {
                files::remove_managed(&storage.0, &name)
            } else {
                files::keep_managed(&storage.0, &name).map(|_| ())
            };
        }
        shelves::list(conn)
    })
}

#[tauri::command]
pub async fn relink_book(
    app: AppHandle,
    id: i64,
    path: String,
    accept_changed: bool,
) -> AppResult<Vec<Shelf>> {
    blocking(&app, move |db, _| {
        let new_path = Path::new(&path);
        let info = files::inspect(new_path)?;
        with_conn(db, |conn| {
            books::relink(conn, id, new_path, &info, accept_changed)?;
            shelves::list(conn)
        })
    })
    .await
}

#[tauri::command]
pub fn refresh_file_status(db: State<Db>, storage: State<Storage>) -> AppResult<Vec<Shelf>> {
    with_conn(&db, |conn| {
        books::refresh_status(conn, &storage.0)?;
        shelves::list(conn)
    })
}

#[tauri::command]
pub fn move_item(db: State<Db>, item_id: i64, shelf_id: i64, start_slot: i64) -> AppResult<Vec<Shelf>> {
    with_conn(&db, |conn| {
        items::move_item(conn, item_id, shelf_id, start_slot)?;
        shelves::list(conn)
    })
}

#[tauri::command]
pub fn swap_books(db: State<Db>, item_a: i64, item_b: i64) -> AppResult<Vec<Shelf>> {
    with_conn(&db, |conn| {
        items::swap_books(conn, item_a, item_b)?;
        shelves::list(conn)
    })
}

/// The PDF is sent as raw bytes. The path is looked up here, so the webview never names a file to read.
#[tauri::command]
pub async fn read_book_file(app: AppHandle, book_id: i64) -> AppResult<tauri::ipc::Response> {
    let bytes = blocking(&app, move |db, books_dir| {
        with_conn(db, |conn| reader::read_book_file(conn, books_dir, book_id))
    })
    .await?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn save_reading_progress(db: State<Db>, book_id: i64, page: i64) -> AppResult<()> {
    with_conn(&db, |conn| reader::save_progress(conn, book_id, page))
}
