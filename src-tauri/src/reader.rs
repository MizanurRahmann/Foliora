//! What the reader needs from the backend: the PDF bytes and the reading position.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use rusqlite::{Connection, OptionalExtension, params};

use crate::error::{AppError, AppResult};
use crate::files;

/// Returns the bytes of a book's PDF. The path comes from the database, never from the caller.
/// A file that cannot be found marks the book as missing and fails with `FILE_MISSING`.
pub fn read_book_file(conn: &Connection, books_dir: &Path, book_id: i64) -> AppResult<Vec<u8>> {
    let (mode, stored, status): (String, String, String) = conn
        .query_row(
            "SELECT storage_mode, file_path, file_status FROM books WHERE id = ?1",
            [book_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?
        .ok_or(AppError::NotFound("Book"))?;

    let path = if mode == "COPY" {
        files::managed_path(books_dir, &stored)?
    } else {
        Path::new(&stored).to_path_buf()
    };

    let set_status = |wanted: &str| -> AppResult<()> {
        if status != wanted {
            conn.execute("UPDATE books SET file_status = ?1 WHERE id = ?2", params![wanted, book_id])?;
        }
        Ok(())
    };

    match fs::read(&path) {
        Ok(bytes) => {
            set_status("AVAILABLE")?;
            Ok(bytes)
        }
        Err(err) if matches!(err.kind(), ErrorKind::NotFound | ErrorKind::PermissionDenied) || !path.is_file() => {
            set_status("MISSING")?;
            Err(AppError::FileMissing)
        }
        Err(err) => Err(err.into()),
    }
}

/// Stores the page the reader is on and when the book was opened. Pages past the end are clamped.
pub fn save_progress(conn: &Connection, book_id: i64, page: i64) -> AppResult<()> {
    if page < 1 {
        return Err(AppError::Validation("Page numbers start at 1".into()));
    }
    let changed = conn.execute(
        "UPDATE books SET last_read_page = MIN(?1, page_count), last_opened_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![page, book_id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound("Book"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::books::{AddBookRequest, BookFields, CoverStyle, StorageMode, add};
    use crate::db::open_in_memory;
    use crate::placement::{BookSize, Orientation};
    use crate::testutil::{TempDir, make_pdf};

    fn add_book(conn: &mut Connection, dir: &TempDir, books_dir: &Path, mode: StorageMode, name: &str) -> i64 {
        let path = make_pdf(dir.path(), name, 12, Some("T"), None);
        let request = AddBookRequest {
            source_path: path.to_string_lossy().into_owned(),
            storage_mode: mode,
            fields: BookFields {
                title: name.into(),
                author: None,
                book_size: BookSize::B5,
                orientation: Orientation::Vertical,
                cover_style: CoverStyle::BottomBand,
                primary_color: "#112233".into(),
                secondary_color: "#aabbcc".into(),
            },
        };
        add(conn, books_dir, &request).unwrap()
    }

    fn status(conn: &Connection, id: i64) -> String {
        conn.query_row("SELECT file_status FROM books WHERE id = ?1", [id], |r| r.get(0)).unwrap()
    }

    #[test]
    fn returns_the_bytes_of_a_copied_and_a_linked_book() {
        let dir = TempDir::new();
        let books_dir = dir.path().join("books");
        let mut conn = open_in_memory().unwrap();
        for (mode, name) in [(StorageMode::Copy, "copy.pdf"), (StorageMode::Link, "link.pdf")] {
            let id = add_book(&mut conn, &dir, &books_dir, mode, name);
            let bytes = read_book_file(&conn, &books_dir, id).unwrap();
            assert!(bytes.starts_with(b"%PDF"));
        }
    }

    #[test]
    fn a_missing_file_fails_and_marks_the_book_missing() {
        let dir = TempDir::new();
        let books_dir = dir.path().join("books");
        let mut conn = open_in_memory().unwrap();
        let id = add_book(&mut conn, &dir, &books_dir, StorageMode::Link, "gone.pdf");
        fs::remove_file(dir.path().join("gone.pdf")).unwrap();

        assert_eq!(read_book_file(&conn, &books_dir, id).unwrap_err().code(), "FILE_MISSING");
        assert_eq!(status(&conn, id), "MISSING");
    }

    #[test]
    fn a_file_that_comes_back_is_marked_available_again() {
        let dir = TempDir::new();
        let books_dir = dir.path().join("books");
        let mut conn = open_in_memory().unwrap();
        let id = add_book(&mut conn, &dir, &books_dir, StorageMode::Link, "back.pdf");
        let path = dir.path().join("back.pdf");
        let bytes = fs::read(&path).unwrap();
        fs::remove_file(&path).unwrap();
        assert!(read_book_file(&conn, &books_dir, id).is_err());

        fs::write(&path, bytes).unwrap();
        read_book_file(&conn, &books_dir, id).unwrap();
        assert_eq!(status(&conn, id), "AVAILABLE");
    }

    #[test]
    fn an_unknown_book_is_not_found() {
        let conn = open_in_memory().unwrap();
        let err = read_book_file(&conn, Path::new("/nonexistent"), 42).unwrap_err();
        assert_eq!(err.code(), "NOT_FOUND");
    }

    #[test]
    fn progress_is_saved_and_clamped_to_the_page_count() {
        let dir = TempDir::new();
        let books_dir = dir.path().join("books");
        let mut conn = open_in_memory().unwrap();
        let id = add_book(&mut conn, &dir, &books_dir, StorageMode::Copy, "p.pdf");
        let read = |conn: &Connection| -> (i64, Option<String>) {
            conn.query_row("SELECT last_read_page, last_opened_at FROM books WHERE id = ?1", [id], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap()
        };
        assert_eq!(read(&conn), (1, None));

        save_progress(&conn, id, 7).unwrap();
        let (page, opened) = read(&conn);
        assert_eq!(page, 7);
        assert!(opened.is_some());

        save_progress(&conn, id, 500).unwrap();
        assert_eq!(read(&conn).0, 12);
    }

    #[test]
    fn progress_rejects_bad_input() {
        let conn = open_in_memory().unwrap();
        assert_eq!(save_progress(&conn, 1, 0).unwrap_err().code(), "VALIDATION");
        assert_eq!(save_progress(&conn, 999, 3).unwrap_err().code(), "NOT_FOUND");
    }
}
