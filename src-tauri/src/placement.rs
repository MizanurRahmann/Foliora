//! Pure shelf-placement rules. Mirrors `src/modules/shelf/placement.ts`; both are tested against
//! `tests/placement-cases.json`. Slots are 1-based and an item covers `start..start + span`.

use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum BookSize {
    A5,
    B5,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Orientation {
    Vertical,
    Horizontal,
}

/// Vertical books over this many pages need two slots.
const THICK_BOOK_PAGES: u32 = 800;

impl BookSize {
    pub fn as_str(self) -> &'static str {
        match self {
            BookSize::A5 => "A5",
            BookSize::B5 => "B5",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "A5" => Some(BookSize::A5),
            "B5" => Some(BookSize::B5),
            _ => None,
        }
    }
}

impl Orientation {
    pub fn as_str(self) -> &'static str {
        match self {
            Orientation::Vertical => "VERTICAL",
            Orientation::Horizontal => "HORIZONTAL",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "VERTICAL" => Some(Orientation::Vertical),
            "HORIZONTAL" => Some(Orientation::Horizontal),
            _ => None,
        }
    }
}

pub fn book_span(size: BookSize, orientation: Orientation, pages: u32) -> i64 {
    match (orientation, size) {
        (Orientation::Vertical, _) if pages > THICK_BOOK_PAGES => 2,
        (Orientation::Vertical, _) => 1,
        (Orientation::Horizontal, BookSize::A5) => 4,
        (Orientation::Horizontal, BookSize::B5) => 5,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub struct Placed {
    pub id: i64,
    pub start: i64,
    pub span: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ShelfLayout {
    pub id: i64,
    pub capacity: i64,
    pub items: Vec<Placed>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Slot {
    pub shelf_id: i64,
    pub start: i64,
}

fn overlaps(a_start: i64, a_span: i64, b_start: i64, b_span: i64) -> bool {
    a_start < b_start + b_span && b_start < a_start + a_span
}

/// `ignore` lists items that are being moved and so must not block their own destination.
pub fn can_place(capacity: i64, items: &[Placed], span: i64, start: i64, ignore: &[i64]) -> bool {
    if span < 1 || start < 1 || start + span - 1 > capacity {
        return false;
    }
    !items
        .iter()
        .filter(|item| !ignore.contains(&item.id))
        .any(|item| overlaps(start, span, item.start, item.span))
}

/// Shelves are searched in the order given, which is the display order.
pub fn first_fit(shelves: &[ShelfLayout], span: i64) -> Option<Slot> {
    shelves.iter().find_map(|shelf| {
        (1..=shelf.capacity - span + 1)
            .find(|&start| can_place(shelf.capacity, &shelf.items, span, start, &[]))
            .map(|start| Slot { shelf_id: shelf.id, start })
    })
}

/// Where two books end up after exchanging places. Does not check that they fit.
pub fn swap_targets(a: Slot, a_span: i64, b: Slot, b_span: i64) -> (Slot, Slot) {
    if a.shelf_id != b.shelf_id {
        return (b, a);
    }

    // Same shelf: the right-hand book takes the left start, the left-hand book ends where the right one did.
    let (left, left_span, right, right_span) = if a.start < b.start {
        (a, a_span, b, b_span)
    } else {
        (b, b_span, a, a_span)
    };
    let right_new = Slot { shelf_id: a.shelf_id, start: left.start };
    let left_new = Slot { shelf_id: a.shelf_id, start: right.start + right_span - left_span };

    if a.start < b.start {
        (left_new, right_new)
    } else {
        (right_new, left_new)
    }
}

/// Returns the new slots for `a_id` and `b_id`, or `None` if either is missing or the exchange does not fit.
pub fn plan_swap(shelves: &[ShelfLayout], a_id: i64, b_id: i64) -> Option<(Slot, Slot)> {
    if a_id == b_id {
        return None;
    }
    let find = |id: i64| {
        shelves.iter().find_map(|shelf| {
            shelf
                .items
                .iter()
                .find(|item| item.id == id)
                .map(|item| (shelf, *item))
        })
    };
    let (a_shelf, a) = find(a_id)?;
    let (b_shelf, b) = find(b_id)?;

    let (a_new, b_new) = swap_targets(
        Slot { shelf_id: a_shelf.id, start: a.start },
        a.span,
        Slot { shelf_id: b_shelf.id, start: b.start },
        b.span,
    );

    let ignore = [a_id, b_id];
    let fits = |slot: Slot, span: i64| {
        shelves
            .iter()
            .find(|shelf| shelf.id == slot.shelf_id)
            .is_some_and(|shelf| can_place(shelf.capacity, &shelf.items, span, slot.start, &ignore))
    };
    let collide = a_new.shelf_id == b_new.shelf_id
        && overlaps(a_new.start, a.span, b_new.start, b.span);

    (fits(a_new, a.span) && fits(b_new, b.span) && !collide).then_some((a_new, b_new))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    struct Cases {
        #[serde(rename = "bookSpan")]
        book_span: Vec<SpanCase>,
        #[serde(rename = "canPlace")]
        can_place: Vec<PlaceCase>,
        #[serde(rename = "firstFit")]
        first_fit: Vec<FitCase>,
        swap: Vec<SwapCase>,
    }

    #[derive(Deserialize)]
    struct SpanCase {
        name: String,
        size: BookSize,
        orientation: Orientation,
        pages: u32,
        expect: i64,
    }

    #[derive(Deserialize)]
    struct PlaceCase {
        name: String,
        capacity: i64,
        items: Vec<Placed>,
        #[serde(default)]
        ignore: Vec<i64>,
        span: i64,
        start: i64,
        expect: bool,
    }

    #[derive(Deserialize)]
    struct FitCase {
        name: String,
        shelves: Vec<ShelfLayout>,
        span: i64,
        expect: Option<Slot>,
    }

    #[derive(Deserialize)]
    struct SwapCase {
        name: String,
        shelves: Vec<ShelfLayout>,
        a: i64,
        b: i64,
        expect: Option<SwapExpect>,
    }

    #[derive(Deserialize)]
    struct SwapExpect {
        a: Slot,
        b: Slot,
    }

    fn cases() -> Cases {
        serde_json::from_str(include_str!("../../tests/placement-cases.json")).unwrap()
    }

    #[test]
    fn book_span_cases() {
        for c in cases().book_span {
            assert_eq!(book_span(c.size, c.orientation, c.pages), c.expect, "{}", c.name);
        }
    }

    #[test]
    fn can_place_cases() {
        for c in cases().can_place {
            let got = can_place(c.capacity, &c.items, c.span, c.start, &c.ignore);
            assert_eq!(got, c.expect, "{}", c.name);
        }
    }

    #[test]
    fn first_fit_cases() {
        for c in cases().first_fit {
            assert_eq!(first_fit(&c.shelves, c.span), c.expect, "{}", c.name);
        }
    }

    #[test]
    fn swap_cases() {
        for c in cases().swap {
            let got = plan_swap(&c.shelves, c.a, c.b);
            let want = c.expect.map(|e| (e.a, e.b));
            assert_eq!(got, want, "{}", c.name);
        }
    }

    #[test]
    fn swapping_twice_restores_the_layout() {
        let shelf = ShelfLayout {
            id: 1,
            capacity: 10,
            items: vec![
                Placed { id: 1, start: 1, span: 1 },
                Placed { id: 2, start: 2, span: 4 },
            ],
        };
        let (a, b) = plan_swap(std::slice::from_ref(&shelf), 1, 2).unwrap();
        let swapped = ShelfLayout {
            items: vec![
                Placed { id: 1, start: a.start, span: 1 },
                Placed { id: 2, start: b.start, span: 4 },
            ],
            ..shelf.clone()
        };
        let (a2, b2) = plan_swap(&[swapped], 1, 2).unwrap();
        assert_eq!((a2.start, b2.start), (1, 2));
    }
}
