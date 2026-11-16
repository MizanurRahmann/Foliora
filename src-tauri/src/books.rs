//! Book records: adding, editing, removing, file status and relinking.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::files::{self, PdfInfo};
use crate::placement::{BookSize, Orientation, ShelfLayout, Slot, book_span, can_place, first_fit};
use crate::shelves;

const MAX_TEXT_CHARS: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum StorageMode {
    Copy,
    Link,
}

impl StorageMode {
    fn as_str(self) -> &'static str {
        match self {
            StorageMode::Copy => "COPY",
            StorageMode::Link => "LINK",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CoverStyle {
    BottomBand,
    CenterLabel,
    DoubleStripe,
}

impl CoverStyle {
    fn as_str(self) -> &'static str {
        match self {
            CoverStyle::BottomBand => "BOTTOM_BAND",
            CoverStyle::CenterLabel => "CENTER_LABEL",
            CoverStyle::DoubleStripe => "DOUBLE_STRIPE",
        }
    }
}

/// What the user can edit about a book.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookFields {
    pub title: String,
    pub author: Option<String>,
    pub book_size: BookSize,
    pub orientation: Orientation,
    pub cover_style: CoverStyle,
    pub primary_color: String,
    pub secondary_color: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddBookRequest {
    pub source_path: String,
    pub storage_mode: StorageMode,
    #[serde(flatten)]
    pub fields: BookFields,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Duplicate {
    pub id: i64,
    pub title: String,
}

fn is_hex_color(value: &str) -> bool {
    value.len() == 7 && value.starts_with('#') && value[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// Returns the trimmed title and author.
fn validate(fields: &BookFields) -> AppResult<(String, Option<String>)> {
    let title = fields.title.trim();
    if title.is_empty() {
        return Err(AppError::Validation("Book name is required".into()));
    }
    if title.chars().count() > MAX_TEXT_CHARS {
        return Err(AppError::Validation(format!("Book name must be at most {MAX_TEXT_CHARS} characters")));
    }
    let author = fields.author.as_deref().map(str::trim).filter(|a| !a.is_empty());
    if author.is_some_and(|a| a.chars().count() > MAX_TEXT_CHARS) {
        return Err(AppError::Validation(format!("Author must be at most {MAX_TEXT_CHARS} characters")));
    }
    if !is_hex_color(&fields.primary_color) || !is_hex_color(&fields.secondary_color) {
        return Err(AppError::Validation("Colors must look like #RRGGBB".into()));
    }
    Ok((title.to_owned(), author.map(str::to_owned)))
}

fn span_for(size: BookSize, orientation: Orientation, page_count: i64) -> i64 {
    book_span(size, orientation, u32::try_from(page_count).unwrap_or(u32::MAX))
}

fn shelf_layout(conn: &Connection, shelf_id: i64) -> AppResult<ShelfLayout> {
    shelves::layouts(conn)?
        .into_iter()
        .find(|shelf| shelf.id == shelf_id)
        .ok_or(AppError::NotFound("Shelf"))
}

fn find_slot(conn: &Connection, span: i64) -> AppResult<Slot> {
    first_fit(&shelves::layouts(conn)?, span).ok_or(AppError::NoSpace)
}

pub fn find_duplicate(conn: &Connection, hash: &str) -> AppResult<Option<Duplicate>> {
    Ok(conn
        .query_row(
            "SELECT id, title FROM books WHERE file_hash = ?1 ORDER BY id LIMIT 1",
            [hash],
            |r| Ok(Duplicate { id: r.get(0)?, title: r.get(1)? }),
        )
        .optional()?)
}

/// Adds the book at the first free place. Nothing is saved or copied unless it fits.
pub fn add(conn: &mut Connection, books_dir: &Path, request: &AddBookRequest) -> AppResult<i64> {
    let (title, author) = validate(&request.fields)?;
    let source = PathBuf::from(&request.source_path);
    let info = files::inspect(&source)?;

    let fields = &request.fields;
    let span = span_for(fields.book_size, fields.orientation, i64::from(info.page_count));
    let slot = find_slot(conn, span)?;

    let stored_path = match request.storage_mode {
        StorageMode::Copy => files::copy_into(&source, books_dir)?,
        StorageMode::Link => fs::canonicalize(&source)?.to_string_lossy().into_owned(),
    };

    let result = insert(conn, request, &title, author.as_deref(), &info, &stored_path, slot, span);
    if result.is_err() && request.storage_mode == StorageMode::Copy {
        let _ = files::remove_managed(books_dir, &stored_path);
    }
    result
}

#[allow(clippy::too_many_arguments)]
fn insert(
    conn: &mut Connection,
    request: &AddBookRequest,
    title: &str,
    author: Option<&str>,
    info: &PdfInfo,
    stored_path: &str,
    slot: Slot,
    span: i64,
) -> AppResult<i64> {
    let fields = &request.fields;
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO books (title, author, page_count, file_size_bytes, file_path, original_file_name,
                            file_hash, storage_mode, book_size, orientation, cover_style,
                            primary_color, secondary_color)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            title,
            author,
            info.page_count,
            info.size_bytes as i64,
            stored_path,
            info.file_name,
            info.hash,
            request.storage_mode.as_str(),
            fields.book_size.as_str(),
            fields.orientation.as_str(),
            fields.cover_style.as_str(),
            fields.primary_color,
            fields.secondary_color,
        ],
    )?;
    let book_id = tx.last_insert_rowid();
    tx.execute(
        "INSERT INTO shelf_items (shelf_id, book_id, start_slot, span_slots) VALUES (?1, ?2, ?3, ?4)",
        params![slot.shelf_id, book_id, slot.start, span],
    )?;
    tx.commit()?;
    Ok(book_id)
}

/// A book together with where it stands.
struct Current {
    storage_mode: String,
    file_hash: String,
    page_count: i64,
    book_size: BookSize,
    orientation: Orientation,
    item_id: i64,
    shelf_id: i64,
    start: i64,
    span: i64,
}

fn current(conn: &Connection, id: i64) -> AppResult<Current> {
    let row = conn
        .query_row(
            "SELECT b.storage_mode, b.file_hash, b.page_count, b.book_size, b.orientation,
                    si.id, si.shelf_id, si.start_slot, si.span_slots
             FROM books b JOIN shelf_items si ON si.book_id = b.id
             WHERE b.id = ?1",
            [id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, i64>(5)?,
                    r.get::<_, i64>(6)?,
                    r.get::<_, i64>(7)?,
                    r.get::<_, i64>(8)?,
                ))
            },
        )
        .optional()?
        .ok_or(AppError::NotFound("Book"))?;

    let book_size = BookSize::parse(&row.3).ok_or_else(|| AppError::Database("unknown book size".into()))?;
    let orientation =
        Orientation::parse(&row.4).ok_or_else(|| AppError::Database("unknown orientation".into()))?;
    Ok(Current {
        storage_mode: row.0,
        file_hash: row.1,
        page_count: row.2,
        book_size,
        orientation,
        item_id: row.5,
        shelf_id: row.6,
        start: row.7,
        span: row.8,
    })
}

/// Checks that the book still fits where it stands once its span becomes `new_span`.
fn ensure_fits_in_place(conn: &Connection, book: &Current, new_span: i64) -> AppResult<()> {
    if new_span == book.span {
        return Ok(());
    }
    let layout = shelf_layout(conn, book.shelf_id)?;
    if can_place(layout.capacity, &layout.items, new_span, book.start, &[book.item_id]) {
        Ok(())
    } else {
        Err(AppError::NoSpaceAtPosition)
    }
}

/// Edits a book. Its position never changes; the edit is refused if its new size does not fit there.
pub fn update(conn: &mut Connection, id: i64, fields: &BookFields) -> AppResult<()> {
    let (title, author) = validate(fields)?;
    let book = current(conn, id)?;
    let new_span = span_for(fields.book_size, fields.orientation, book.page_count);
    ensure_fits_in_place(conn, &book, new_span)?;

    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE books SET title = ?1, author = ?2, book_size = ?3, orientation = ?4, cover_style = ?5,
                          primary_color = ?6, secondary_color = ?7
         WHERE id = ?8",
        params![
            title,
            author,
            fields.book_size.as_str(),
            fields.orientation.as_str(),
            fields.cover_style.as_str(),
            fields.primary_color,
            fields.secondary_color,
            id
        ],
    )?;
    if new_span != book.span {
        tx.execute("UPDATE shelf_items SET span_slots = ?1 WHERE id = ?2", params![new_span, book.item_id])?;
    }
    tx.commit()?;
    Ok(())
}

/// Removes the book and frees its space. Returns the managed file name when the book owned a copy,
/// so the caller can delete it after this commit.
pub fn remove(conn: &mut Connection, id: i64) -> AppResult<Option<String>> {
    let tx = conn.transaction()?;
    let (mode, path): (String, String) = tx
        .query_row("SELECT storage_mode, file_path FROM books WHERE id = ?1", [id], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .optional()?
        .ok_or(AppError::NotFound("Book"))?;
    tx.execute("DELETE FROM books WHERE id = ?1", [id])?;
    tx.commit()?;
    Ok((mode == StorageMode::Copy.as_str()).then_some(path))
}

/// File names of every managed copy that a book refers to.
pub fn file_refs(conn: &Connection) -> AppResult<HashSet<String>> {
    let mut stmt = conn.prepare("SELECT file_path FROM books WHERE storage_mode = 'COPY'")?;
    let names = stmt.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
    Ok(names)
}

/// Re-checks whether each book's PDF can still be found.
pub fn refresh_status(conn: &Connection, books_dir: &Path) -> AppResult<()> {
    let mut stmt = conn.prepare("SELECT id, storage_mode, file_path, file_status FROM books")?;
    let books: Vec<(i64, String, String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
        .collect::<Result<_, _>>()?;

    for (id, mode, path, status) in books {
        let found = if mode == StorageMode::Copy.as_str() {
            files::managed_path(books_dir, &path).is_ok_and(|p| p.is_file())
        } else {
            Path::new(&path).is_file()
        };
        let wanted = if found { "AVAILABLE" } else { "MISSING" };
        if wanted != status {
            conn.execute("UPDATE books SET file_status = ?1 WHERE id = ?2", params![wanted, id])?;
        }
    }
    Ok(())
}

/// Points a linked book at a new file. A file with different content is refused unless
/// `accept_changed`; then the book takes over the new file's page count and hash.
pub fn relink(
    conn: &mut Connection,
    id: i64,
    new_path: &Path,
    info: &PdfInfo,
    accept_changed: bool,
) -> AppResult<()> {
    let book = current(conn, id)?;
    if book.storage_mode != StorageMode::Link.as_str() {
        return Err(AppError::Validation("Only linked books can be relinked".into()));
    }

    let changed = info.hash != book.file_hash;
    if changed && !accept_changed {
        return Err(AppError::FileChanged);
    }

    let new_span = span_for(book.book_size, book.orientation, i64::from(info.page_count));
    if changed {
        ensure_fits_in_place(conn, &book, new_span)?;
    }

    let path = fs::canonicalize(new_path)?.to_string_lossy().into_owned();
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE books SET file_path = ?1, file_status = 'AVAILABLE', original_file_name = ?2,
                          file_hash = ?3, page_count = ?4, file_size_bytes = ?5
         WHERE id = ?6",
        params![path, info.file_name, info.hash, info.page_count, info.size_bytes as i64, id],
    )?;
    if changed && new_span != book.span {
        tx.execute("UPDATE shelf_items SET span_slots = ?1 WHERE id = ?2", params![new_span, book.item_id])?;
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;
    use crate::testutil::{TempDir, make_pdf};

    struct Fixture {
        conn: Connection,
        dir: TempDir,
        books_dir: PathBuf,
    }

    fn fixture() -> Fixture {
        let dir = TempDir::new();
        let books_dir = dir.path().join("books");
        Fixture { conn: open_in_memory().unwrap(), dir, books_dir }
    }

    fn fields(title: &str) -> BookFields {
        BookFields {
            title: title.into(),
            author: Some("Someone".into()),
            book_size: BookSize::B5,
            orientation: Orientation::Vertical,
            cover_style: CoverStyle::BottomBand,
            primary_color: "#112233".into(),
            secondary_color: "#aabbcc".into(),
        }
    }

    fn request(path: &Path, mode: StorageMode, title: &str) -> AddBookRequest {
        AddBookRequest {
            source_path: path.to_string_lossy().into_owned(),
            storage_mode: mode,
            fields: fields(title),
        }
    }

    impl Fixture {
        fn pdf(&self, name: &str, pages: u32) -> PathBuf {
            make_pdf(self.dir.path(), name, pages, Some("Embedded"), None)
        }

        fn add(&mut self, name: &str, mode: StorageMode) -> i64 {
            let path = self.pdf(name, 10);
            add(&mut self.conn, &self.books_dir, &request(&path, mode, name)).unwrap()
        }

        fn items(&self) -> Vec<(i64, i64, i64)> {
            let mut stmt = self
                .conn
                .prepare("SELECT book_id, start_slot, span_slots FROM shelf_items ORDER BY shelf_id, start_slot")
                .unwrap();
            stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                .unwrap()
                .map(Result::unwrap)
                .collect()
        }

        fn count(&self, table: &str) -> i64 {
            self.conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0)).unwrap()
        }

        fn managed_files(&self) -> usize {
            fs::read_dir(&self.books_dir).map(|d| d.count()).unwrap_or(0)
        }

        fn status(&self, id: i64) -> String {
            self.conn
                .query_row("SELECT file_status FROM books WHERE id = ?1", [id], |r| r.get(0))
                .unwrap()
        }

        fn stored_path(&self, id: i64) -> String {
            self.conn
                .query_row("SELECT file_path FROM books WHERE id = ?1", [id], |r| r.get(0))
                .unwrap()
        }
    }

    #[test]
    fn adding_a_copied_book_stores_the_file_and_places_the_book() {
        let mut f = fixture();
        let id = f.add("first.pdf", StorageMode::Copy);

        assert_eq!(f.items(), [(id, 1, 1)]);
        let name = f.stored_path(id);
        let stored = f.books_dir.join(&name);
        assert_eq!(fs::read(&stored).unwrap(), fs::read(f.dir.path().join("first.pdf")).unwrap());

        let (pages, mode, file_name): (i64, String, String) = f
            .conn
            .query_row("SELECT page_count, storage_mode, original_file_name FROM books WHERE id = ?1", [id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .unwrap();
        assert_eq!((pages, mode.as_str(), file_name.as_str()), (10, "COPY", "first.pdf"));
    }

    #[test]
    fn adding_a_linked_book_keeps_the_original_in_place() {
        let mut f = fixture();
        let id = f.add("linked.pdf", StorageMode::Link);

        let expected = fs::canonicalize(f.dir.path().join("linked.pdf")).unwrap();
        assert_eq!(f.stored_path(id), expected.to_string_lossy());
        assert_eq!(f.managed_files(), 0);
    }

    #[test]
    fn books_fill_the_first_free_place() {
        let mut f = fixture();
        let (a, b) = (f.add("a.pdf", StorageMode::Link), f.add("b.pdf", StorageMode::Link));
        assert_eq!(f.items(), [(a, 1, 1), (b, 2, 1)]);

        remove(&mut f.conn, a).unwrap();
        let c = f.add("c.pdf", StorageMode::Link);
        assert_eq!(f.items(), [(c, 1, 1), (b, 2, 1)]);
    }

    #[test]
    fn span_follows_orientation_size_and_pages() {
        let mut f = fixture();
        let path = f.pdf("wide.pdf", 10);
        let mut req = request(&path, StorageMode::Link, "Wide");
        req.fields.orientation = Orientation::Horizontal;
        req.fields.book_size = BookSize::A5;
        let id = add(&mut f.conn, &f.books_dir, &req).unwrap();

        assert_eq!(f.items(), [(id, 1, 4)]);
    }

    #[test]
    fn a_book_without_room_creates_no_row_and_no_file() {
        let mut f = fixture();
        f.conn.execute_batch("DELETE FROM shelves WHERE id > 1; UPDATE shelves SET capacity = 1;").unwrap();
        let first = f.add("first.pdf", StorageMode::Copy);

        let path = f.pdf("second.pdf", 5);
        let err = add(&mut f.conn, &f.books_dir, &request(&path, StorageMode::Copy, "Second")).unwrap_err();

        assert!(matches!(err, AppError::NoSpace));
        assert_eq!(f.count("books"), 1);
        assert_eq!(f.items(), [(first, 1, 1)]);
        assert_eq!(f.managed_files(), 1);
    }

    #[test]
    fn an_unreadable_file_is_rejected_before_anything_is_saved() {
        let mut f = fixture();
        let fake = f.dir.path().join("fake.pdf");
        fs::write(&fake, "not a pdf").unwrap();

        let err = add(&mut f.conn, &f.books_dir, &request(&fake, StorageMode::Copy, "Fake")).unwrap_err();
        assert!(matches!(err, AppError::InvalidPdf(_)));
        assert_eq!((f.count("books"), f.managed_files()), (0, 0));
    }

    #[test]
    fn invalid_fields_are_rejected() {
        let mut f = fixture();
        let path = f.pdf("a.pdf", 1);

        for edit in [
            (|r: &mut AddBookRequest| r.fields.title = "   ".into()) as fn(&mut AddBookRequest),
            |r| r.fields.primary_color = "red".into(),
            |r| r.fields.secondary_color = "#12345".into(),
            |r| r.fields.title = "x".repeat(201),
        ] {
            let mut req = request(&path, StorageMode::Copy, "Ok");
            edit(&mut req);
            let err = add(&mut f.conn, &f.books_dir, &req).unwrap_err();
            assert!(matches!(err, AppError::Validation(_)), "{err:?}");
        }
        assert_eq!((f.count("books"), f.managed_files()), (0, 0));
    }

    #[test]
    fn blank_author_is_stored_as_null() {
        let mut f = fixture();
        let path = f.pdf("a.pdf", 1);
        let mut req = request(&path, StorageMode::Link, "A");
        req.fields.author = Some("   ".into());
        let id = add(&mut f.conn, &f.books_dir, &req).unwrap();

        let author: Option<String> =
            f.conn.query_row("SELECT author FROM books WHERE id = ?1", [id], |r| r.get(0)).unwrap();
        assert_eq!(author, None);
    }

    #[test]
    fn duplicates_are_found_by_content() {
        let mut f = fixture();
        let id = f.add("a.pdf", StorageMode::Link);
        let copy = f.dir.path().join("same-content.pdf");
        fs::copy(f.dir.path().join("a.pdf"), &copy).unwrap();

        let hash = files::inspect(&copy).unwrap().hash;
        let duplicate = find_duplicate(&f.conn, &hash).unwrap().unwrap();
        assert_eq!((duplicate.id, duplicate.title.as_str()), (id, "a.pdf"));
        assert!(find_duplicate(&f.conn, "0".repeat(64).as_str()).unwrap().is_none());
    }

    #[test]
    fn update_changes_the_editable_fields() {
        let mut f = fixture();
        let id = f.add("a.pdf", StorageMode::Link);

        let mut edit = fields("  New title ");
        edit.author = None;
        edit.cover_style = CoverStyle::DoubleStripe;
        edit.primary_color = "#000000".into();
        update(&mut f.conn, id, &edit).unwrap();

        let row: (String, Option<String>, String, String) = f
            .conn
            .query_row("SELECT title, author, cover_style, primary_color FROM books WHERE id = ?1", [id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
            })
            .unwrap();
        assert_eq!(row, ("New title".into(), None, "DOUBLE_STRIPE".into(), "#000000".into()));
        assert_eq!(f.items(), [(id, 1, 1)]);
    }

    #[test]
    fn update_that_grows_the_book_into_free_space_resizes_its_slot() {
        let mut f = fixture();
        let id = f.add("a.pdf", StorageMode::Link);

        let mut edit = fields("a");
        edit.orientation = Orientation::Horizontal;
        update(&mut f.conn, id, &edit).unwrap();

        assert_eq!(f.items(), [(id, 1, 5)]);
    }

    #[test]
    fn update_that_would_overlap_a_neighbour_is_rejected_and_changes_nothing() {
        let mut f = fixture();
        let a = f.add("a.pdf", StorageMode::Link);
        let b = f.add("b.pdf", StorageMode::Link);

        let mut edit = fields("Changed");
        edit.orientation = Orientation::Horizontal;
        let err = update(&mut f.conn, a, &edit).unwrap_err();

        assert!(matches!(err, AppError::NoSpaceAtPosition));
        assert_eq!(f.items(), [(a, 1, 1), (b, 2, 1)]);
        let title: String = f.conn.query_row("SELECT title FROM books WHERE id = ?1", [a], |r| r.get(0)).unwrap();
        assert_eq!(title, "a.pdf");
    }

    #[test]
    fn update_that_would_pass_the_shelf_end_is_rejected() {
        let mut f = fixture();
        f.conn.execute_batch("UPDATE shelves SET capacity = 3 WHERE id = 1").unwrap();
        let (_, _, c) = (f.add("a.pdf", StorageMode::Link), f.add("b.pdf", StorageMode::Link), f.add("c.pdf", StorageMode::Link));

        let mut edit = fields("c");
        edit.orientation = Orientation::Horizontal;
        assert!(matches!(update(&mut f.conn, c, &edit).unwrap_err(), AppError::NoSpaceAtPosition));
    }

    #[test]
    fn update_validates_and_finds_the_book() {
        let mut f = fixture();
        let id = f.add("a.pdf", StorageMode::Link);

        assert!(matches!(update(&mut f.conn, id, &fields("")).unwrap_err(), AppError::Validation(_)));
        assert!(matches!(update(&mut f.conn, 99, &fields("x")).unwrap_err(), AppError::NotFound(_)));
    }

    #[test]
    fn removing_a_copied_book_frees_its_slot_and_names_the_file() {
        let mut f = fixture();
        let id = f.add("a.pdf", StorageMode::Copy);
        let name = f.stored_path(id);

        assert_eq!(remove(&mut f.conn, id).unwrap(), Some(name.clone()));
        assert_eq!((f.count("books"), f.count("shelf_items")), (0, 0));
        // Deleting the file is the caller's job; the record alone is gone.
        assert!(f.books_dir.join(name).exists());
    }

    #[test]
    fn removing_a_linked_book_names_no_file() {
        let mut f = fixture();
        let id = f.add("a.pdf", StorageMode::Link);

        assert_eq!(remove(&mut f.conn, id).unwrap(), None);
        assert!(f.dir.path().join("a.pdf").exists());
    }

    #[test]
    fn removing_an_unknown_book_is_not_found() {
        let mut f = fixture();
        assert!(matches!(remove(&mut f.conn, 99).unwrap_err(), AppError::NotFound(_)));
    }

    #[test]
    fn file_refs_lists_only_managed_copies() {
        let mut f = fixture();
        let copied = f.add("a.pdf", StorageMode::Copy);
        f.add("b.pdf", StorageMode::Link);

        assert_eq!(file_refs(&f.conn).unwrap(), HashSet::from([f.stored_path(copied)]));
    }

    #[test]
    fn startup_cleanup_removes_orphans_but_keeps_referenced_copies() {
        let mut f = fixture();
        let id = f.add("a.pdf", StorageMode::Copy);
        fs::write(f.books_dir.join("orphan.pdf"), "x").unwrap();
        fs::write(f.books_dir.join("half.pdf.tmp"), "x").unwrap();

        files::sweep(&f.books_dir, &file_refs(&f.conn).unwrap()).unwrap();

        assert_eq!(f.managed_files(), 1);
        assert!(f.books_dir.join(f.stored_path(id)).exists());
    }

    #[test]
    fn refresh_status_tracks_missing_and_restored_files() {
        let mut f = fixture();
        let copied = f.add("a.pdf", StorageMode::Copy);
        let linked = f.add("b.pdf", StorageMode::Link);
        refresh_status(&f.conn, &f.books_dir).unwrap();
        assert_eq!((f.status(copied).as_str(), f.status(linked).as_str()), ("AVAILABLE", "AVAILABLE"));

        let managed = f.books_dir.join(f.stored_path(copied));
        let backup = f.dir.path().join("backup.pdf");
        fs::rename(&managed, &backup).unwrap();
        fs::remove_file(f.dir.path().join("b.pdf")).unwrap();
        refresh_status(&f.conn, &f.books_dir).unwrap();
        assert_eq!((f.status(copied).as_str(), f.status(linked).as_str()), ("MISSING", "MISSING"));

        fs::rename(&backup, &managed).unwrap();
        refresh_status(&f.conn, &f.books_dir).unwrap();
        assert_eq!(f.status(copied), "AVAILABLE");
    }

    #[test]
    fn relinking_the_same_content_just_updates_the_path() {
        let mut f = fixture();
        let id = f.add("a.pdf", StorageMode::Link);
        let moved = f.dir.path().join("moved.pdf");
        fs::rename(f.dir.path().join("a.pdf"), &moved).unwrap();
        refresh_status(&f.conn, &f.books_dir).unwrap();
        assert_eq!(f.status(id), "MISSING");

        let info = files::inspect(&moved).unwrap();
        relink(&mut f.conn, id, &moved, &info, false).unwrap();

        assert_eq!(f.status(id), "AVAILABLE");
        assert_eq!(f.stored_path(id), fs::canonicalize(&moved).unwrap().to_string_lossy());
    }

    #[test]
    fn relinking_a_different_file_needs_confirmation() {
        let mut f = fixture();
        let id = f.add("a.pdf", StorageMode::Link);
        let other = make_pdf(f.dir.path(), "other.pdf", 25, None, None);
        let info = files::inspect(&other).unwrap();
        let before = f.stored_path(id);

        let err = relink(&mut f.conn, id, &other, &info, false).unwrap_err();
        assert!(matches!(err, AppError::FileChanged));
        assert_eq!(f.stored_path(id), before);

        relink(&mut f.conn, id, &other, &info, true).unwrap();
        let (pages, hash): (i64, String) = f
            .conn
            .query_row("SELECT page_count, file_hash FROM books WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!((pages, hash), (25, info.hash));
    }

    #[test]
    fn relinking_a_longer_file_can_change_the_span_or_be_refused() {
        let mut f = fixture();
        let id = f.add("a.pdf", StorageMode::Link);
        let thick = make_pdf(f.dir.path(), "thick.pdf", 900, None, None);
        let info = files::inspect(&thick).unwrap();

        relink(&mut f.conn, id, &thick, &info, true).unwrap();
        assert_eq!(f.items(), [(id, 1, 2)]);

        let id2 = f.add("b.pdf", StorageMode::Link);
        let thick2 = make_pdf(f.dir.path(), "thick2.pdf", 950, None, None);
        let info2 = files::inspect(&thick2).unwrap();
        f.conn.execute("UPDATE shelf_items SET start_slot = 24 WHERE book_id = ?1", [id2]).unwrap();

        let err = relink(&mut f.conn, id2, &thick2, &info2, true).unwrap_err();
        assert!(matches!(err, AppError::NoSpaceAtPosition));
        assert_eq!(f.items()[1], (id2, 24, 1));
    }

    #[test]
    fn copied_books_cannot_be_relinked() {
        let mut f = fixture();
        let id = f.add("a.pdf", StorageMode::Copy);
        let other = f.pdf("other.pdf", 3);
        let info = files::inspect(&other).unwrap();

        assert!(matches!(
            relink(&mut f.conn, id, &other, &info, true).unwrap_err(),
            AppError::Validation(_)
        ));
    }
}
