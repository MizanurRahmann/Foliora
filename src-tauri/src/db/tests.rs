use rusqlite::{Connection, params};

use super::*;
use crate::error::AppError;

fn db() -> Connection {
    open_in_memory().unwrap()
}

pub(crate) fn add_book(conn: &Connection, title: &str) -> i64 {
    conn.execute(
        "INSERT INTO books (title, page_count, file_size_bytes, file_path, original_file_name,
                            file_hash, storage_mode, primary_color, secondary_color)
         VALUES (?1, 10, 1, 'x.pdf', 'x.pdf', 'h', 'COPY', '#112233', '#aabbcc')",
        [title],
    )
    .unwrap();
    conn.last_insert_rowid()
}

pub(crate) fn place(conn: &Connection, shelf: i64, book: i64, start: i64, span: i64) -> AppResult<()> {
    conn.execute(
        "INSERT INTO shelf_items (shelf_id, book_id, start_slot, span_slots) VALUES (?1, ?2, ?3, ?4)",
        params![shelf, book, start, span],
    )?;
    Ok(())
}

fn temp_path(name: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!("foliora-{}-{name}", uuid::Uuid::new_v4()))
}

#[test]
fn migrates_to_latest_and_seeds_default_shelves() {
    let conn = db();
    assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);

    let h = health(&conn).unwrap();
    assert_eq!(h.shelf_count, 4);

    let capacities: Vec<i64> = conn
        .prepare("SELECT capacity FROM shelves ORDER BY sort_order")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .map(Result::unwrap)
        .collect();
    assert_eq!(capacities, vec![24; 4]);
}

#[test]
fn second_migrate_is_a_noop() {
    let mut conn = db();
    migrate(&mut conn, None).unwrap();
    assert_eq!(health(&conn).unwrap().shelf_count, 4);
}

#[test]
fn rejects_database_from_a_newer_version() {
    let mut conn = db();
    conn.execute_batch(&format!("PRAGMA user_version = {}", SCHEMA_VERSION + 1))
        .unwrap();
    let err = migrate(&mut conn, None).unwrap_err();
    assert!(matches!(err, AppError::DbTooNew { .. }));
}

#[test]
fn open_creates_file_enables_foreign_keys_and_reopens_cleanly() {
    let path = temp_path("open.db");
    {
        let conn = open(&path).unwrap();
        let fk: i64 = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
        assert_eq!(fk, 1);
        conn.execute("UPDATE shelves SET name = 'Kept' WHERE id = 1", []).unwrap();
    }
    let conn = open(&path).unwrap();
    let (count, name): (u32, String) = conn
        .query_row("SELECT (SELECT COUNT(*) FROM shelves), name FROM shelves WHERE id = 1", [], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .unwrap();
    assert_eq!((count, name.as_str()), (4, "Kept"));
    drop(conn);

    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
    }
}

#[test]
fn backup_writes_a_copy_and_replaces_an_old_one() {
    let path = temp_path("backup.db");
    let conn = open(&path).unwrap();
    let backup_path = format!("{}.bak", path.display());

    backup(&conn, &path).unwrap();
    backup(&conn, &path).unwrap();

    let copy = Connection::open(&backup_path).unwrap();
    assert_eq!(health(&copy).unwrap().shelf_count, 4);

    drop(copy);
    drop(conn);
    for suffix in ["", "-wal", "-shm", ".bak"] {
        let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
    }
}

#[test]
fn rejects_overlapping_items() {
    let conn = db();
    let (a, b) = (add_book(&conn, "a"), add_book(&conn, "b"));
    place(&conn, 1, a, 2, 3).unwrap(); // slots 2-4

    for (start, span) in [(1, 2), (4, 2), (3, 1), (2, 3)] {
        let err = place(&conn, 1, b, start, span).unwrap_err();
        assert!(matches!(err, AppError::SlotOccupied), "start {start} span {span}");
    }
    place(&conn, 1, b, 5, 1).unwrap();
}

#[test]
fn same_slots_on_a_different_shelf_are_fine() {
    let conn = db();
    let (a, b) = (add_book(&conn, "a"), add_book(&conn, "b"));
    place(&conn, 1, a, 1, 2).unwrap();
    place(&conn, 2, b, 1, 2).unwrap();
}

#[test]
fn rejects_items_beyond_shelf_capacity() {
    let conn = db();
    let a = add_book(&conn, "a");
    assert!(matches!(place(&conn, 1, a, 24, 2).unwrap_err(), AppError::ExceedsCapacity));
    place(&conn, 1, a, 23, 2).unwrap();
}

#[test]
fn move_is_validated_and_exchange_by_reinsert_works() {
    let conn = db();
    let (a, b) = (add_book(&conn, "a"), add_book(&conn, "b"));
    place(&conn, 1, a, 1, 1).unwrap();
    place(&conn, 1, b, 2, 4).unwrap();

    let err = conn
        .execute("UPDATE shelf_items SET start_slot = 2 WHERE book_id = ?1", [a])
        .map_err(AppError::from)
        .unwrap_err();
    assert!(matches!(err, AppError::SlotOccupied));

    conn.execute_batch(
        "BEGIN IMMEDIATE;
         DELETE FROM shelf_items;
         INSERT INTO shelf_items (shelf_id, book_id, start_slot, span_slots) VALUES (1, 2, 1, 4);
         INSERT INTO shelf_items (shelf_id, book_id, start_slot, span_slots) VALUES (1, 1, 5, 1);
         COMMIT;",
    )
    .unwrap();

    let rows: Vec<(i64, i64)> = conn
        .prepare("SELECT book_id, start_slot FROM shelf_items ORDER BY start_slot")
        .unwrap()
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .map(Result::unwrap)
        .collect();
    assert_eq!(rows, vec![(2, 1), (1, 5)]);
}

#[test]
fn failed_transaction_leaves_arrangement_unchanged() {
    let mut conn = db();
    let (a, b) = (add_book(&conn, "a"), add_book(&conn, "b"));
    place(&conn, 1, a, 1, 1).unwrap();
    place(&conn, 1, b, 2, 1).unwrap();

    let tx = conn.transaction().unwrap();
    tx.execute("DELETE FROM shelf_items WHERE book_id = ?1", [a]).unwrap();
    tx.execute(
        "INSERT INTO shelf_items (shelf_id, book_id, start_slot, span_slots) VALUES (1, ?1, 2, 1)",
        [a],
    )
    .unwrap_err();
    drop(tx);

    let start: i64 = conn
        .query_row("SELECT start_slot FROM shelf_items WHERE book_id = ?1", [a], |r| r.get(0))
        .unwrap();
    assert_eq!(start, 1);
}

#[test]
fn shelf_capacity_cannot_shrink_below_occupied_space() {
    let conn = db();
    let a = add_book(&conn, "a");
    place(&conn, 1, a, 13, 3).unwrap(); // slots 13-15

    let err = conn
        .execute("UPDATE shelves SET capacity = 10 WHERE id = 1", [])
        .map_err(AppError::from)
        .unwrap_err();
    assert!(matches!(err, AppError::CapacityTooSmall { .. }));

    conn.execute("UPDATE shelves SET capacity = 15 WHERE id = 1", []).unwrap();
}

#[test]
fn shelf_capacity_is_limited_to_1_through_60() {
    let conn = db();
    for capacity in [0, 61] {
        let err = conn
            .execute("UPDATE shelves SET capacity = ?1 WHERE id = 2", [capacity])
            .map_err(AppError::from)
            .unwrap_err();
        assert!(matches!(err, AppError::Constraint(_)), "capacity {capacity}");
    }
}

#[test]
fn shelf_with_items_cannot_be_deleted_but_empty_one_can() {
    let conn = db();
    let a = add_book(&conn, "a");
    place(&conn, 1, a, 1, 1).unwrap();

    let err = conn
        .execute("DELETE FROM shelves WHERE id = 1", [])
        .map_err(AppError::from)
        .unwrap_err();
    assert!(matches!(err, AppError::Constraint(_)));

    conn.execute("DELETE FROM shelves WHERE id = 2", []).unwrap();
}

#[test]
fn deleting_a_book_or_decoration_removes_its_placement() {
    let conn = db();
    let a = add_book(&conn, "a");
    place(&conn, 1, a, 1, 1).unwrap();

    conn.execute_batch(
        "INSERT INTO decoration_catalog (name, category, asset_key) VALUES ('Vase', 'DECORATION', 'vase');
         INSERT INTO decorations (catalog_id) VALUES (1);
         INSERT INTO shelf_items (shelf_id, decoration_id, start_slot, span_slots) VALUES (1, 1, 2, 2);",
    )
    .unwrap();

    conn.execute("DELETE FROM books WHERE id = ?1", [a]).unwrap();
    conn.execute("DELETE FROM decorations WHERE id = 1", []).unwrap();

    let remaining: i64 = conn
        .query_row("SELECT COUNT(*) FROM shelf_items", [], |r| r.get(0))
        .unwrap();
    assert_eq!(remaining, 0);
}

#[test]
fn referenced_catalog_entry_cannot_be_deleted() {
    let conn = db();
    conn.execute_batch(
        "INSERT INTO decoration_catalog (name, category, asset_key) VALUES ('Vase', 'DECORATION', 'vase');
         INSERT INTO decorations (catalog_id) VALUES (1);",
    )
    .unwrap();
    let err = conn
        .execute("DELETE FROM decoration_catalog WHERE id = 1", [])
        .map_err(AppError::from)
        .unwrap_err();
    assert!(matches!(err, AppError::Constraint(_)));
}

#[test]
fn item_must_reference_exactly_one_of_book_or_decoration() {
    let conn = db();
    let a = add_book(&conn, "a");
    conn.execute_batch(
        "INSERT INTO decoration_catalog (name, category, asset_key) VALUES ('Vase', 'DECORATION', 'vase');
         INSERT INTO decorations (catalog_id) VALUES (1);",
    )
    .unwrap();

    let neither = conn.execute(
        "INSERT INTO shelf_items (shelf_id, start_slot, span_slots) VALUES (1, 1, 1)",
        [],
    );
    let both = conn.execute(
        "INSERT INTO shelf_items (shelf_id, book_id, decoration_id, start_slot, span_slots)
         VALUES (1, ?1, 1, 1, 1)",
        [a],
    );
    assert!(neither.is_err() && both.is_err());
}

#[test]
fn a_book_has_at_most_one_placement() {
    let conn = db();
    let a = add_book(&conn, "a");
    place(&conn, 1, a, 1, 1).unwrap();
    assert!(matches!(place(&conn, 2, a, 1, 1).unwrap_err(), AppError::Constraint(_)));
}

#[test]
fn updated_at_is_refreshed_on_update() {
    let conn = db();
    let a = add_book(&conn, "a");
    conn.execute("UPDATE books SET updated_at = '2000-01-01 00:00:00' WHERE id = ?1", [a])
        .unwrap();
    conn.execute("UPDATE books SET title = 'b' WHERE id = ?1", [a]).unwrap();

    let updated: String = conn
        .query_row("SELECT updated_at FROM books WHERE id = ?1", [a], |r| r.get(0))
        .unwrap();
    assert_ne!(updated, "2000-01-01 00:00:00");
}

#[test]
fn invalid_book_values_are_rejected() {
    let conn = db();
    let bad_color = conn.execute(
        "INSERT INTO books (title, page_count, file_size_bytes, file_path, original_file_name,
                            file_hash, storage_mode, primary_color, secondary_color)
         VALUES ('t', 1, 1, 'x', 'x', 'h', 'COPY', 'red', '#aabbcc')",
        [],
    );
    let bad_storage = conn.execute(
        "INSERT INTO books (title, page_count, file_size_bytes, file_path, original_file_name,
                            file_hash, storage_mode, primary_color, secondary_color)
         VALUES ('t', 1, 1, 'x', 'x', 'h', 'MOVE', '#112233', '#aabbcc')",
        [],
    );
    assert!(bad_color.is_err() && bad_storage.is_err());
}

#[test]
fn errors_serialize_with_code_and_message() {
    let json = serde_json::to_value(AppError::SlotOccupied).unwrap();
    assert_eq!(json["code"], "SLOT_OCCUPIED");
    assert!(json["message"].as_str().unwrap().contains("occupied"));
}
