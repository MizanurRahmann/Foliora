use rusqlite::{Connection, params};
use serde::Serialize;

use crate::error::{AppError, AppResult, BlockingItem};
use crate::placement::{Placed, ShelfLayout};

pub const MIN_CAPACITY: i64 = 1;
pub const MAX_CAPACITY: i64 = 60;
const MAX_NAME_CHARS: usize = 100;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookSummary {
    pub id: i64,
    pub title: String,
    pub author: Option<String>,
    pub page_count: i64,
    pub book_size: String,
    pub orientation: String,
    pub cover_style: String,
    pub primary_color: String,
    pub secondary_color: String,
    pub file_status: String,
    pub storage_mode: String,
    pub file_size_bytes: i64,
    pub original_file_name: String,
    pub created_at: String,
}

/// A placement on a shelf. Exactly one of `book` and `decoration_id` is set.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfItem {
    pub id: i64,
    pub start: i64,
    pub span: i64,
    pub book: Option<BookSummary>,
    pub decoration_id: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Shelf {
    pub id: i64,
    pub name: String,
    pub capacity: i64,
    pub sort_order: i64,
    pub items: Vec<ShelfItem>,
}

pub fn list(conn: &Connection) -> AppResult<Vec<Shelf>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.name, s.capacity, s.sort_order,
                si.id, si.start_slot, si.span_slots, si.decoration_id,
                b.id, b.title, b.author, b.page_count, b.book_size, b.orientation,
                b.cover_style, b.primary_color, b.secondary_color, b.file_status,
                b.storage_mode, b.file_size_bytes, b.original_file_name, b.created_at
         FROM shelves s
         LEFT JOIN shelf_items si ON si.shelf_id = s.id
         LEFT JOIN books b ON b.id = si.book_id
         ORDER BY s.sort_order, s.id, si.start_slot",
    )?;
    let mut rows = stmt.query([])?;

    let mut shelves: Vec<Shelf> = Vec::new();
    while let Some(row) = rows.next()? {
        let shelf_id: i64 = row.get(0)?;
        if shelves.last().is_none_or(|shelf| shelf.id != shelf_id) {
            shelves.push(Shelf {
                id: shelf_id,
                name: row.get(1)?,
                capacity: row.get(2)?,
                sort_order: row.get(3)?,
                items: Vec::new(),
            });
        }

        let Some(item_id) = row.get::<_, Option<i64>>(4)? else {
            continue;
        };
        let book = match row.get::<_, Option<i64>>(8)? {
            Some(id) => Some(BookSummary {
                id,
                title: row.get(9)?,
                author: row.get(10)?,
                page_count: row.get(11)?,
                book_size: row.get(12)?,
                orientation: row.get(13)?,
                cover_style: row.get(14)?,
                primary_color: row.get(15)?,
                secondary_color: row.get(16)?,
                file_status: row.get(17)?,
                storage_mode: row.get(18)?,
                file_size_bytes: row.get(19)?,
                original_file_name: row.get(20)?,
                created_at: row.get(21)?,
            }),
            None => None,
        };
        let item = ShelfItem {
            id: item_id,
            start: row.get(5)?,
            span: row.get(6)?,
            book,
            decoration_id: row.get(7)?,
        };
        if let Some(shelf) = shelves.last_mut() {
            shelf.items.push(item);
        }
    }
    Ok(shelves)
}

/// Occupancy of every shelf in display order, as the placement rules expect it.
pub fn layouts(conn: &Connection) -> AppResult<Vec<ShelfLayout>> {
    Ok(list(conn)?
        .into_iter()
        .map(|shelf| ShelfLayout {
            id: shelf.id,
            capacity: shelf.capacity,
            items: shelf
                .items
                .iter()
                .map(|item| Placed { id: item.id, start: item.start, span: item.span })
                .collect(),
        })
        .collect())
}

fn validate(name: &str, capacity: i64) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Validation("Shelf name is required".into()));
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::Validation(format!(
            "Shelf name must be at most {MAX_NAME_CHARS} characters"
        )));
    }
    if !(MIN_CAPACITY..=MAX_CAPACITY).contains(&capacity) {
        return Err(AppError::Validation(format!(
            "Capacity must be between {MIN_CAPACITY} and {MAX_CAPACITY}"
        )));
    }
    Ok(name.to_owned())
}

fn shelf_exists(conn: &Connection, id: i64) -> AppResult<bool> {
    Ok(conn.query_row("SELECT EXISTS (SELECT 1 FROM shelves WHERE id = ?1)", [id], |r| r.get(0))?)
}

fn item_count(conn: &Connection, shelf_id: i64) -> AppResult<i64> {
    Ok(conn.query_row("SELECT COUNT(*) FROM shelf_items WHERE shelf_id = ?1", [shelf_id], |r| r.get(0))?)
}

pub fn create(conn: &Connection, name: &str, capacity: i64) -> AppResult<()> {
    let name = validate(name, capacity)?;
    conn.execute(
        "INSERT INTO shelves (name, capacity, sort_order)
         VALUES (?1, ?2, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM shelves))",
        params![name, capacity],
    )?;
    Ok(())
}

pub fn update(conn: &Connection, id: i64, name: &str, capacity: i64) -> AppResult<()> {
    let name = validate(name, capacity)?;
    if !shelf_exists(conn, id)? {
        return Err(AppError::NotFound("Shelf"));
    }

    let blocking = items_beyond(conn, id, capacity)?;
    if !blocking.is_empty() {
        let min_capacity = conn.query_row(
            "SELECT MAX(start_slot + span_slots - 1) FROM shelf_items WHERE shelf_id = ?1",
            [id],
            |r| r.get(0),
        )?;
        return Err(AppError::CapacityTooSmall { min_capacity, blocking });
    }

    conn.execute(
        "UPDATE shelves SET name = ?1, capacity = ?2 WHERE id = ?3",
        params![name, capacity, id],
    )?;
    Ok(())
}

fn items_beyond(conn: &Connection, shelf_id: i64, capacity: i64) -> AppResult<Vec<BlockingItem>> {
    let mut stmt = conn.prepare(
        "SELECT si.id, b.title, si.start_slot, si.span_slots
         FROM shelf_items si
         LEFT JOIN books b ON b.id = si.book_id
         WHERE si.shelf_id = ?1 AND si.start_slot + si.span_slots - 1 > ?2
         ORDER BY si.start_slot",
    )?;
    let items = stmt
        .query_map(params![shelf_id, capacity], |r| {
            Ok(BlockingItem { id: r.get(0)?, title: r.get(1)?, start: r.get(2)?, span: r.get(3)? })
        })?
        .collect::<Result<_, _>>()?;
    Ok(items)
}

/// `ids` must be every shelf id exactly once, in the new display order.
pub fn reorder(conn: &mut Connection, ids: &[i64]) -> AppResult<()> {
    let tx = conn.transaction()?;

    let mut current: Vec<i64> = tx
        .prepare("SELECT id FROM shelves")?
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    let mut requested = ids.to_vec();
    current.sort_unstable();
    requested.sort_unstable();
    if current != requested {
        return Err(AppError::Validation(
            "The shelf list is out of date. Reload and try again".into(),
        ));
    }

    for (index, id) in ids.iter().enumerate() {
        tx.execute("UPDATE shelves SET sort_order = ?1 WHERE id = ?2", params![index as i64 + 1, id])?;
    }
    tx.commit()?;
    Ok(())
}

pub fn delete(conn: &mut Connection, id: i64) -> AppResult<()> {
    let tx = conn.transaction()?;
    if !shelf_exists(&tx, id)? {
        return Err(AppError::NotFound("Shelf"));
    }
    let count = item_count(&tx, id)?;
    if count > 0 {
        return Err(AppError::ShelfNotEmpty { item_count: count });
    }

    tx.execute("DELETE FROM shelves WHERE id = ?1", [id])?;
    tx.execute(
        "UPDATE shelves SET sort_order = (
             SELECT rn FROM (
                 SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, id) AS rn FROM shelves
             ) ranked WHERE ranked.id = shelves.id
         )",
        [],
    )?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;
    use crate::db::tests::{add_book, place};

    fn names(shelves: &[Shelf]) -> Vec<&str> {
        shelves.iter().map(|s| s.name.as_str()).collect()
    }

    fn ids(shelves: &[Shelf]) -> Vec<i64> {
        shelves.iter().map(|s| s.id).collect()
    }

    #[test]
    fn lists_default_shelves_in_order_with_no_items() {
        let conn = open_in_memory().unwrap();
        let shelves = list(&conn).unwrap();

        assert_eq!(names(&shelves), ["Shelf 1", "Shelf 2", "Shelf 3", "Shelf 4"]);
        assert!(shelves.iter().all(|s| s.capacity == 24 && s.items.is_empty()));
        assert_eq!(shelves.iter().map(|s| s.sort_order).collect::<Vec<_>>(), [1, 2, 3, 4]);
    }

    #[test]
    fn lists_items_by_slot_with_book_summaries() {
        let conn = open_in_memory().unwrap();
        let (a, b) = (add_book(&conn, "Alpha"), add_book(&conn, "Beta"));
        place(&conn, 1, b, 5, 2).unwrap();
        place(&conn, 1, a, 1, 1).unwrap();

        let shelves = list(&conn).unwrap();
        let first = &shelves[0];
        assert_eq!(first.items.len(), 2);
        assert_eq!((first.items[0].start, first.items[0].span), (1, 1));
        assert_eq!((first.items[1].start, first.items[1].span), (5, 2));

        let book = first.items[0].book.as_ref().unwrap();
        assert_eq!(book.title, "Alpha");
        assert_eq!(book.cover_style, "BOTTOM_BAND");
        assert!(shelves[1].items.is_empty());
    }

    #[test]
    fn lists_decoration_items_without_a_book() {
        let conn = open_in_memory().unwrap();
        conn.execute_batch(
            "INSERT INTO decoration_catalog (name, category, asset_key) VALUES ('Vase', 'DECORATION', 'vase');
             INSERT INTO decorations (catalog_id) VALUES (1);
             INSERT INTO shelf_items (shelf_id, decoration_id, start_slot, span_slots) VALUES (1, 1, 3, 2);",
        )
        .unwrap();

        let item = &list(&conn).unwrap()[0].items[0];
        assert!(item.book.is_none());
        assert_eq!(item.decoration_id, Some(1));
    }

    #[test]
    fn create_appends_and_trims_the_name() {
        let conn = open_in_memory().unwrap();
        create(&conn, "  Reading list  ", 10).unwrap();

        let last = list(&conn).unwrap().pop().unwrap();
        assert_eq!((last.name.as_str(), last.capacity, last.sort_order), ("Reading list", 10, 5));
    }

    #[test]
    fn create_rejects_bad_input() {
        let conn = open_in_memory().unwrap();
        for (name, capacity) in [("", 10), ("   ", 10), ("ok", 0), ("ok", 61), (&"x".repeat(101), 10)] {
            let err = create(&conn, name, capacity).unwrap_err();
            assert!(matches!(err, AppError::Validation(_)), "{name:?} {capacity}");
        }
        assert_eq!(list(&conn).unwrap().len(), 4);
    }

    #[test]
    fn update_renames_and_resizes() {
        let conn = open_in_memory().unwrap();
        update(&conn, 1, "Programming", 12).unwrap();

        let first = &list(&conn).unwrap()[0];
        assert_eq!((first.name.as_str(), first.capacity), ("Programming", 12));
    }

    #[test]
    fn update_unknown_shelf_is_not_found() {
        let conn = open_in_memory().unwrap();
        assert!(matches!(update(&conn, 99, "x", 5).unwrap_err(), AppError::NotFound(_)));
    }

    #[test]
    fn shrinking_below_occupied_space_lists_the_blocking_items() {
        let conn = open_in_memory().unwrap();
        let (a, b) = (add_book(&conn, "Alpha"), add_book(&conn, "Beta"));
        place(&conn, 1, a, 1, 1).unwrap();
        place(&conn, 1, b, 13, 3).unwrap(); // slots 13-15

        let err = update(&conn, 1, "Shelf 1", 10).unwrap_err();
        let AppError::CapacityTooSmall { min_capacity, blocking } = err else {
            panic!("expected CapacityTooSmall, got {err:?}");
        };
        assert_eq!(min_capacity, 15);
        assert_eq!(blocking.len(), 1);
        assert_eq!(blocking[0].title.as_deref(), Some("Beta"));
        assert_eq!((blocking[0].start, blocking[0].span), (13, 3));

        assert_eq!(list(&conn).unwrap()[0].capacity, 24);
        update(&conn, 1, "Shelf 1", 15).unwrap();
    }

    #[test]
    fn capacity_error_serializes_with_details() {
        let conn = open_in_memory().unwrap();
        let a = add_book(&conn, "Alpha");
        place(&conn, 1, a, 20, 1).unwrap();

        let json = serde_json::to_value(update(&conn, 1, "Shelf 1", 5).unwrap_err()).unwrap();
        assert_eq!(json["code"], "CAPACITY_TOO_SMALL");
        assert_eq!(json["details"]["minCapacity"], 20);
        assert_eq!(json["details"]["items"][0]["title"], "Alpha");
    }

    #[test]
    fn reorder_applies_the_new_order() {
        let mut conn = open_in_memory().unwrap();
        reorder(&mut conn, &[4, 2, 3, 1]).unwrap();

        let shelves = list(&conn).unwrap();
        assert_eq!(ids(&shelves), [4, 2, 3, 1]);
        assert_eq!(shelves.iter().map(|s| s.sort_order).collect::<Vec<_>>(), [1, 2, 3, 4]);
    }

    #[test]
    fn reorder_rejects_missing_extra_or_repeated_ids() {
        let mut conn = open_in_memory().unwrap();
        for bad in [&[1, 2, 3][..], &[1, 2, 3, 4, 5], &[1, 1, 2, 3], &[]] {
            let err = reorder(&mut conn, bad).unwrap_err();
            assert!(matches!(err, AppError::Validation(_)), "{bad:?}");
        }
        assert_eq!(ids(&list(&conn).unwrap()), [1, 2, 3, 4]);
    }

    #[test]
    fn delete_removes_an_empty_shelf_and_closes_the_gap() {
        let mut conn = open_in_memory().unwrap();
        delete(&mut conn, 2).unwrap();

        let shelves = list(&conn).unwrap();
        assert_eq!(ids(&shelves), [1, 3, 4]);
        assert_eq!(shelves.iter().map(|s| s.sort_order).collect::<Vec<_>>(), [1, 2, 3]);
    }

    #[test]
    fn delete_refuses_a_shelf_with_items() {
        let mut conn = open_in_memory().unwrap();
        let a = add_book(&conn, "Alpha");
        place(&conn, 1, a, 1, 1).unwrap();

        let err = delete(&mut conn, 1).unwrap_err();
        assert!(matches!(err, AppError::ShelfNotEmpty { item_count: 1 }));
        assert_eq!(list(&conn).unwrap().len(), 4);
    }

    #[test]
    fn delete_unknown_shelf_is_not_found() {
        let mut conn = open_in_memory().unwrap();
        assert!(matches!(delete(&mut conn, 99).unwrap_err(), AppError::NotFound(_)));
    }

    #[test]
    fn all_shelves_can_be_deleted() {
        let mut conn = open_in_memory().unwrap();
        for id in 1..=4 {
            delete(&mut conn, id).unwrap();
        }
        assert!(list(&conn).unwrap().is_empty());
    }
}
