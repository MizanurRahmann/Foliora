//! Moving and exchanging shelf items. The placement rules decide what is allowed; the database
//! triggers stay as a backstop.

use rusqlite::{Connection, OptionalExtension, params};

use crate::error::{AppError, AppResult};
use crate::placement::{can_place, plan_swap};
use crate::shelves;

/// Moves an item so it starts at `start` on `shelf_id`. Moving an item onto its own place is allowed.
pub fn move_item(conn: &mut Connection, item_id: i64, shelf_id: i64, start: i64) -> AppResult<()> {
    let layouts = shelves::layouts(conn)?;
    let span = layouts
        .iter()
        .flat_map(|shelf| &shelf.items)
        .find(|item| item.id == item_id)
        .map(|item| item.span)
        .ok_or(AppError::NotFound("Item"))?;
    let target = layouts
        .iter()
        .find(|shelf| shelf.id == shelf_id)
        .ok_or(AppError::NotFound("Shelf"))?;

    if start < 1 || start + span - 1 > target.capacity {
        return Err(AppError::ExceedsCapacity);
    }
    if !can_place(target.capacity, &target.items, span, start, &[item_id]) {
        return Err(AppError::SlotOccupied);
    }

    // One UPDATE is atomic, so the item is either in the new place or still in the old one.
    conn.execute(
        "UPDATE shelf_items SET shelf_id = ?1, start_slot = ?2 WHERE id = ?3",
        params![shelf_id, start, item_id],
    )?;
    Ok(())
}

/// Exchanges two books. Both move or neither does.
pub fn swap_books(conn: &mut Connection, a_id: i64, b_id: i64) -> AppResult<()> {
    if a_id == b_id {
        return Err(AppError::Validation("Choose two different books to exchange".into()));
    }
    let row = |conn: &Connection, id: i64| -> AppResult<(Option<i64>, String)> {
        conn.query_row("SELECT book_id, created_at FROM shelf_items WHERE id = ?1", [id], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .optional()?
        .ok_or(AppError::NotFound("Item"))
    };
    let (a_book, a_created) = row(conn, a_id)?;
    let (b_book, b_created) = row(conn, b_id)?;
    let (Some(a_book), Some(b_book)) = (a_book, b_book) else {
        return Err(AppError::Validation("Decorative elements cannot exchange places with other items".into()));
    };

    let layouts = shelves::layouts(conn)?;
    let (a_new, b_new) = plan_swap(&layouts, a_id, b_id).ok_or(AppError::SwapNotPossible)?;
    let span_of = |id: i64| {
        layouts.iter().flat_map(|shelf| &shelf.items).find(|item| item.id == id).map(|item| item.span)
    };
    let (a_span, b_span) = (span_of(a_id).unwrap_or(1), span_of(b_id).unwrap_or(1));

    // Delete and reinsert: updating in place could briefly give two items the same start slot.
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM shelf_items WHERE id IN (?1, ?2)", [a_id, b_id])?;
    let mut insert = tx.prepare(
        "INSERT INTO shelf_items (id, shelf_id, book_id, start_slot, span_slots, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )?;
    insert.execute(params![a_id, a_new.shelf_id, a_book, a_new.start, a_span, a_created])?;
    insert.execute(params![b_id, b_new.shelf_id, b_book, b_new.start, b_span, b_created])?;
    drop(insert);
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    /// Adds a bare book and places it; returns the shelf item id.
    fn place(conn: &Connection, title: &str, shelf: i64, start: i64, span: i64) -> i64 {
        conn.execute(
            "INSERT INTO books (title, page_count, file_size_bytes, file_path, original_file_name, file_hash,
                                storage_mode, primary_color, secondary_color)
             VALUES (?1, 10, 1, ?1, ?1, ?1, 'LINK', '#112233', '#aabbcc')",
            [title],
        )
        .unwrap();
        let book_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO shelf_items (shelf_id, book_id, start_slot, span_slots) VALUES (?1, ?2, ?3, ?4)",
            params![shelf, book_id, start, span],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn place_decoration(conn: &Connection, shelf: i64, start: i64, span: i64) -> i64 {
        conn.execute(
            "INSERT INTO decoration_catalog (name, category, asset_key)
             VALUES ('Item', 'x', 'key-' || (SELECT COUNT(*) FROM decoration_catalog))",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO decorations (catalog_id) VALUES (last_insert_rowid())", []).unwrap();
        let decoration_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO shelf_items (shelf_id, decoration_id, start_slot, span_slots) VALUES (?1, ?2, ?3, ?4)",
            params![shelf, decoration_id, start, span],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn position(conn: &Connection, item: i64) -> (i64, i64) {
        conn.query_row("SELECT shelf_id, start_slot FROM shelf_items WHERE id = ?1", [item], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .unwrap()
    }

    fn snapshot(conn: &Connection) -> Vec<(i64, i64, i64, i64)> {
        let mut stmt = conn
            .prepare("SELECT id, shelf_id, start_slot, span_slots FROM shelf_items ORDER BY id")
            .unwrap();
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .unwrap()
            .map(Result::unwrap)
            .collect()
    }

    // The seed data has four shelves with 24 slots each, ids 1 to 4.

    #[test]
    fn moves_within_a_shelf() {
        let mut conn = open_in_memory().unwrap();
        let item = place(&conn, "A", 1, 1, 1);
        move_item(&mut conn, item, 1, 10).unwrap();
        assert_eq!(position(&conn, item), (1, 10));
    }

    #[test]
    fn moves_to_another_shelf() {
        let mut conn = open_in_memory().unwrap();
        let item = place(&conn, "A", 1, 1, 2);
        move_item(&mut conn, item, 3, 5).unwrap();
        assert_eq!(position(&conn, item), (3, 5));
    }

    #[test]
    fn a_multi_slot_item_may_overlap_its_own_old_place() {
        let mut conn = open_in_memory().unwrap();
        let item = place(&conn, "Wide", 1, 3, 4);
        move_item(&mut conn, item, 1, 4).unwrap();
        assert_eq!(position(&conn, item), (1, 4));
    }

    #[test]
    fn refuses_an_occupied_destination() {
        let mut conn = open_in_memory().unwrap();
        let a = place(&conn, "A", 1, 1, 1);
        place(&conn, "B", 1, 5, 2);
        let before = snapshot(&conn);
        for start in [5, 6] {
            let err = move_item(&mut conn, a, 1, start).unwrap_err();
            assert_eq!(err.code(), "SLOT_OCCUPIED");
        }
        assert_eq!(snapshot(&conn), before);
    }

    #[test]
    fn refuses_an_item_that_would_overlap_from_the_left() {
        let mut conn = open_in_memory().unwrap();
        let wide = place(&conn, "Wide", 1, 1, 4);
        place(&conn, "B", 2, 5, 1);
        let err = move_item(&mut conn, wide, 2, 3).unwrap_err();
        assert_eq!(err.code(), "SLOT_OCCUPIED");
        assert_eq!(position(&conn, wide), (1, 1));
    }

    #[test]
    fn refuses_to_go_past_the_shelf_end() {
        let mut conn = open_in_memory().unwrap();
        let wide = place(&conn, "Wide", 1, 1, 4);
        assert_eq!(move_item(&mut conn, wide, 1, 22).unwrap_err().code(), "EXCEEDS_CAPACITY");
        assert_eq!(move_item(&mut conn, wide, 1, 0).unwrap_err().code(), "EXCEEDS_CAPACITY");
        move_item(&mut conn, wide, 1, 21).unwrap();
        assert_eq!(position(&conn, wide), (1, 21));
    }

    #[test]
    fn refuses_unknown_item_or_shelf() {
        let mut conn = open_in_memory().unwrap();
        let a = place(&conn, "A", 1, 1, 1);
        assert_eq!(move_item(&mut conn, 999, 1, 1).unwrap_err().code(), "NOT_FOUND");
        assert_eq!(move_item(&mut conn, a, 999, 1).unwrap_err().code(), "NOT_FOUND");
    }

    #[test]
    fn a_book_cannot_be_put_over_a_decoration() {
        let mut conn = open_in_memory().unwrap();
        let book = place(&conn, "A", 1, 1, 1);
        place_decoration(&conn, 1, 6, 2);
        assert_eq!(move_item(&mut conn, book, 1, 7).unwrap_err().code(), "SLOT_OCCUPIED");
    }

    #[test]
    fn a_decoration_cannot_be_put_over_a_book_or_another_decoration() {
        let mut conn = open_in_memory().unwrap();
        place(&conn, "A", 1, 3, 1);
        let vase = place_decoration(&conn, 1, 10, 2);
        assert_eq!(move_item(&mut conn, vase, 1, 3).unwrap_err().code(), "SLOT_OCCUPIED");
        let clock = place_decoration(&conn, 1, 15, 1);
        assert_eq!(move_item(&mut conn, clock, 1, 11).unwrap_err().code(), "SLOT_OCCUPIED");
        move_item(&mut conn, clock, 1, 12).unwrap();
    }

    #[test]
    fn swaps_books_of_equal_span_across_shelves() {
        let mut conn = open_in_memory().unwrap();
        let a = place(&conn, "A", 1, 2, 1);
        let b = place(&conn, "B", 2, 9, 1);
        swap_books(&mut conn, a, b).unwrap();
        assert_eq!(position(&conn, a), (2, 9));
        assert_eq!(position(&conn, b), (1, 2));
    }

    #[test]
    fn swaps_unequal_books_across_shelves() {
        let mut conn = open_in_memory().unwrap();
        let wide = place(&conn, "Wide", 1, 2, 4);
        let thin = place(&conn, "Thin", 2, 9, 1);
        swap_books(&mut conn, wide, thin).unwrap();
        assert_eq!(position(&conn, wide), (2, 9));
        assert_eq!(position(&conn, thin), (1, 2));
    }

    #[test]
    fn same_shelf_swap_keeps_the_block_boundaries() {
        let mut conn = open_in_memory().unwrap();
        let left = place(&conn, "Left", 1, 2, 4); // slots 2-5
        let right = place(&conn, "Right", 1, 7, 1); // slot 7
        swap_books(&mut conn, left, right).unwrap();
        assert_eq!(position(&conn, right), (1, 2));
        assert_eq!(position(&conn, left), (1, 4)); // now ends at slot 7
    }

    #[test]
    fn same_shelf_swap_works_whichever_book_is_dragged() {
        let mut conn = open_in_memory().unwrap();
        let left = place(&conn, "Left", 1, 2, 1);
        let right = place(&conn, "Right", 1, 5, 3); // slots 5-7
        swap_books(&mut conn, right, left).unwrap();
        assert_eq!(position(&conn, right), (1, 2));
        assert_eq!(position(&conn, left), (1, 7));
    }

    #[test]
    fn keeps_items_between_swapped_books_in_place() {
        let mut conn = open_in_memory().unwrap();
        let left = place(&conn, "Left", 1, 1, 1);
        let middle = place(&conn, "Middle", 1, 2, 1);
        let right = place(&conn, "Right", 1, 3, 1);
        swap_books(&mut conn, left, right).unwrap();
        assert_eq!(position(&conn, middle), (1, 2));
        assert_eq!(position(&conn, left), (1, 3));
        assert_eq!(position(&conn, right), (1, 1));
    }

    #[test]
    fn refuses_a_swap_that_does_not_fit() {
        let mut conn = open_in_memory().unwrap();
        // Shelf 1 has 24 slots. The wide book would land on the last slot.
        let wide = place(&conn, "Wide", 2, 1, 4);
        let thin = place(&conn, "Thin", 1, 24, 1);
        let before = snapshot(&conn);
        assert_eq!(swap_books(&mut conn, wide, thin).unwrap_err().code(), "SWAP_NOT_POSSIBLE");
        assert_eq!(snapshot(&conn), before);
    }

    #[test]
    fn refuses_a_swap_blocked_by_another_item() {
        let mut conn = open_in_memory().unwrap();
        let wide = place(&conn, "Wide", 2, 1, 4);
        let thin = place(&conn, "Thin", 1, 5, 1);
        place(&conn, "Neighbour", 1, 6, 1);
        let before = snapshot(&conn);
        assert_eq!(swap_books(&mut conn, wide, thin).unwrap_err().code(), "SWAP_NOT_POSSIBLE");
        assert_eq!(snapshot(&conn), before);
    }

    #[test]
    fn decorations_cannot_exchange_places() {
        let mut conn = open_in_memory().unwrap();
        let book = place(&conn, "A", 1, 1, 1);
        let vase = place_decoration(&conn, 1, 5, 1);
        let before = snapshot(&conn);
        assert_eq!(swap_books(&mut conn, book, vase).unwrap_err().code(), "VALIDATION");
        assert_eq!(swap_books(&mut conn, vase, book).unwrap_err().code(), "VALIDATION");
        assert_eq!(snapshot(&conn), before);
    }

    #[test]
    fn refuses_to_swap_a_book_with_itself_or_a_missing_item() {
        let mut conn = open_in_memory().unwrap();
        let a = place(&conn, "A", 1, 1, 1);
        assert_eq!(swap_books(&mut conn, a, a).unwrap_err().code(), "VALIDATION");
        assert_eq!(swap_books(&mut conn, a, 999).unwrap_err().code(), "NOT_FOUND");
    }

    #[test]
    fn a_swap_keeps_ids_and_book_links() {
        let mut conn = open_in_memory().unwrap();
        let a = place(&conn, "A", 1, 1, 1);
        let b = place(&conn, "B", 3, 4, 1);
        let books_before: Vec<(i64, i64)> = {
            let mut stmt = conn.prepare("SELECT id, book_id FROM shelf_items ORDER BY id").unwrap();
            stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap().map(Result::unwrap).collect()
        };
        swap_books(&mut conn, a, b).unwrap();
        let books_after: Vec<(i64, i64)> = {
            let mut stmt = conn.prepare("SELECT id, book_id FROM shelf_items ORDER BY id").unwrap();
            stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap().map(Result::unwrap).collect()
        };
        assert_eq!(books_before, books_after);
    }
}
