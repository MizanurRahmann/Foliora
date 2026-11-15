# Floiora - Database Schema Specification

## 1. Overview

Floiora uses SQLite as its local database. The database manages shelves, books, decorative objects, shelf-item positions, and application preferences.

The main design principle is to keep book and decoration information separate from shelf placement. This allows an item to exist independently of a shelf and makes it possible to move items without changing their core information.

## 2. Tables
| Table                | Responsibility                                                   |
| -------------------- | ---------------------------------------------------------------- |
| `shelves`            | Stores shelf information and capacity.                           |
| `books`              | Stores book metadata and PDF file references.                    |
| `decoration_catalog` | Stores definitions of available decorative objects.              |
| `decorations`        | Stores individual decorative objects added by the user.          |
| `shelf_items`        | Stores the position and space occupied by books and decorations. |
| `app_settings`       | Stores application preferences.                                  |

## 3. Entity Relationships

``` mermaid
erDiagram
    SHELVES ||--o{ SHELF_ITEMS : contains
    BOOKS ||--o| SHELF_ITEMS : occupies
    DECORATIONS ||--o| SHELF_ITEMS : occupies
    DECORATION_CATALOG ||--o{ DECORATIONS : defines

    SHELVES {
        integer id PK
        text name
        integer capacity
        integer sort_order
        text created_at
        text updated_at
    }

    BOOKS {
        integer id PK
        text title
        text author
        integer page_count
        integer file_size_bytes
        text file_path
        text storage_mode
        text file_status
        text book_size
        text orientation
        text cover_style
        text created_at
        text updated_at
    }

    DECORATION_CATALOG {
        integer id PK
        text name
        text category
        text asset_key
        integer default_span
        integer is_active
    }

    DECORATIONS {
        integer id PK
        integer catalog_id FK
        text custom_name
        text created_at
    }

    SHELF_ITEMS {
        integer id PK
        integer shelf_id FK
        integer book_id FK
        integer decoration_id FK
        integer start_slot
        integer span_slots
        text created_at
        text updated_at
    }

    APP_SETTINGS {
        integer id PK
        text setting_key
        text setting_value
    }
```

## 4. Table Specifications

### 4.1. `shelves`

Stores information about each shelf.
| Column       | Type    | Description                                        |
| ------------ | ------- | -------------------------------------------------- |
| `id`         | INTEGER | Primary key                                        |
| `name`       | TEXT    | Shelf name                                         |
| `capacity`   | INTEGER | Total available spaces; must be greater than zero. |
| `sort_order` | INTEGER | Display order                                      |
| `created_at` | TEXT    | Creation timestamp                                 |
| `updated_at` | TEXT    | Last update timestamp                              |

Example:
| id | name             | capacity | sort_order |
| -- | ---------------- | -------- | ---------- |
| 1  | Programming      | 12       | 1          |
| 2  | Personal Library | 15       | 2          |
| 3  | Reading List     | 10       | 3          |

### 4.2. `books`

Stores book information independently of its shelf location.
| Column            | Type    | Description                                     |
| ----------------- | ------- | ----------------------------------------------- |
| `id`              | INTEGER | Primary key                                     |
| `title`           | TEXT    | Book title                                      |
| `author`          | TEXT    | Author name; nullable.                          |
| `page_count`      | INTEGER | Total pages; nullable.                          |
| `file_size_bytes` | INTEGER | PDF file size in bytes.                         |
| `file_path`       | TEXT    | Path to the PDF file.                           |
| `storage_mode`    | TEXT    | `COPY` or `LINK`.                               |
| `file_status`     | TEXT    | `AVAILABLE` or `MISSING`.                       |
| `book_size`       | TEXT    | `A5` or `B5`; default `B5`.                     |
| `orientation`     | TEXT    | `VERTICAL` or `HORIZONTAL`; default `VERTICAL`. |
| `cover_style`     | TEXT    | Selected cover style.                           |
| `created_at`      | TEXT    | Creation timestamp.                             |
| `updated_at`      | TEXT    | Last update timestamp.                          |

Example:
| id | title                                 | author           | book_size | orientation |
| -- | ------------------------------------- | ---------------- | --------- | ----------- |
| 1  | Clean Code                            | Robert C. Martin | B5        | VERTICAL    |
| 2  | Designing Data-Intensive Applications | Martin Kleppmann | A5        | VERTICAL    |
| 3  | The Pragmatic Programmer              | David Thomas     | B5        | HORIZONTAL  |

A book's shelf position is not stored in this table. Its position is stored in `shelf_items`.

### 4.3. `decoration_catalog`

Stores definitions of decorative objects available to users.
| Column         | Type    | Description                                |
| -------------- | ------- | ------------------------------------------ |
| `id`           | INTEGER | Primary key                                |
| `name`         | TEXT    | Decoration name                            |
| `category`     | TEXT    | Object category                            |
| `asset_key`    | TEXT    | Image or asset identifier                  |
| `default_span` | INTEGER | Default number of shelf spaces occupied.   |
| `is_active`    | INTEGER | Whether the item is available; `0` or `1`. |

Example:
| id | name           | category   | default_span |
| -- | -------------- | ---------- | ------------ |
| 1  | Classic Vase   | DECORATION | 2            |
| 2  | Desk Clock     | DECORATION | 1            |
| 3  | Paper Calendar | STATIONERY | 1            |
| 4  | Indoor Plant   | PLANT      | 2            |
| 5  | Globe          | DECORATION | 2            |

This table represents the available collection, not the individual objects placed on shelves.

### 4.4. `decorations`

Stores individual decorative objects added by users.
| Column        | Type    | Description                         |
| ------------- | ------- | ----------------------------------- |
| `id`          | INTEGER | Primary key                         |
| `catalog_id`  | INTEGER | References `decoration_catalog.id`. |
| `custom_name` | TEXT    | Optional user-defined name.         |
| `created_at`  | TEXT    | Creation timestamp.                 |

For example, a user may add three clocks to different shelves. They share the same catalog definition, but each is an independent decoration instance with its own shelf position.

### 4.5. `shelf_items`

This is the central positioning table. It manages the placement of both books and decorative objects.
| Column          | Type    | Description                            |
| --------------- | ------- | -------------------------------------- |
| `id`            | INTEGER | Primary key                            |
| `shelf_id`      | INTEGER | References `shelves.id`.               |
| `book_id`       | INTEGER | References `books.id`; nullable.       |
| `decoration_id` | INTEGER | References `decorations.id`; nullable. |
| `start_slot`    | INTEGER | Starting position on the shelf.        |
| `span_slots`    | INTEGER | Number of spaces occupied.             |
| `created_at`    | TEXT    | Placement creation timestamp.          |
| `updated_at`    | TEXT    | Last position update timestamp.        |

Exactly one of `book_id` or `decoration_id` must be populated for each row.

Example: a shelf with 10 spaces.
| Item   | Start Slot | Span | Occupied Slots |
| ------ | ---------- | ---- | -------------- |
| Book A | 1          | 2    | 1, 2           |
| Book B | 3          | 1    | 3              |
| Vase   | 4          | 2    | 4, 5           |
| Book C | 6          | 3    | 6, 7, 8        |
| Clock  | 9          | 1    | 9              |

Slot 10 remains available.

This table allows Floiora to determine:

-   Where an item is located.
-   How much shelf space it occupies.
-   Whether a destination is available.
-   Whether two books can exchange positions.
-   Which items belong to a particular shelf.

### 4.6. `app_settings`

Stores application-level preferences.
| Column          | Type    | Description                |
| --------------- | ------- | -------------------------- |
| `id`            | INTEGER | Primary key                |
| `setting_key`   | TEXT    | Unique setting identifier. |
| `setting_value` | TEXT    | Setting value.             |

Example:
| setting_key           | setting_value |
| --------------------- | ------------- |
| `theme`               | `dark`        |
| `default_book_size`   | `B5`          |
| `default_orientation` | `VERTICAL`    |

## 5. SQLite Schema (DDL)

The following SQL defines the initial database schema.

``` sql
PRAGMA foreign_keys = ON;

-- 1. Shelves
CREATE TABLE shelves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Books
CREATE TABLE books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT,
    page_count INTEGER CHECK (page_count IS NULL OR page_count >= 0),
    file_size_bytes INTEGER,
    file_path TEXT NOT NULL,
    storage_mode TEXT NOT NULL
        CHECK (storage_mode IN ('COPY', 'LINK')),
    file_status TEXT NOT NULL DEFAULT 'AVAILABLE'
        CHECK (file_status IN ('AVAILABLE', 'MISSING')),
    book_size TEXT NOT NULL DEFAULT 'B5'
        CHECK (book_size IN ('A5', 'B5')),
    orientation TEXT NOT NULL DEFAULT 'VERTICAL'
        CHECK (orientation IN ('VERTICAL', 'HORIZONTAL')),
    cover_style TEXT NOT NULL DEFAULT 'DEFAULT',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Decoration Catalog
CREATE TABLE decoration_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    asset_key TEXT NOT NULL,
    default_span INTEGER NOT NULL DEFAULT 1
        CHECK (default_span > 0),
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1))
);

-- 4. Decorations
CREATE TABLE decorations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    catalog_id INTEGER NOT NULL,
    custom_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (catalog_id)
        REFERENCES decoration_catalog(id)
        ON DELETE RESTRICT
);

-- 5. Shelf Items
CREATE TABLE shelf_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shelf_id INTEGER NOT NULL,
    book_id INTEGER UNIQUE,
    decoration_id INTEGER UNIQUE,
    start_slot INTEGER NOT NULL CHECK (start_slot > 0),
    span_slots INTEGER NOT NULL CHECK (span_slots > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (shelf_id)
        REFERENCES shelves(id)
        ON DELETE CASCADE,

    FOREIGN KEY (book_id)
        REFERENCES books(id)
        ON DELETE CASCADE,

    FOREIGN KEY (decoration_id)
        REFERENCES decorations(id)
        ON DELETE CASCADE,

    CHECK (
        (book_id IS NOT NULL AND decoration_id IS NULL)
        OR
        (book_id IS NULL AND decoration_id IS NOT NULL)
    )
);

-- 6. Application Settings
CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT NOT NULL UNIQUE,
    setting_value TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_shelf_items_shelf
ON shelf_items(shelf_id);

CREATE INDEX idx_books_title
ON books(title);

CREATE INDEX idx_decorations_catalog
ON decorations(catalog_id);
```

## 6. Database Constraints and Business Rules

### 6.1. Prevent Overlapping Items

SQLite's ordinary unique constraints cannot prevent two items from
occupying overlapping ranges of shelf slots.

For example:

-   Book A occupies slots 1--3.
-   Book B occupies slots 3--5.

This must not be allowed.

Use database triggers to validate shelf capacity and prevent overlapping
placements.

``` sql
CREATE TRIGGER prevent_shelf_item_overlap
BEFORE INSERT ON shelf_items
BEGIN
    SELECT CASE
        WHEN NEW.start_slot + NEW.span_slots - 1 >
            (SELECT capacity FROM shelves WHERE id = NEW.shelf_id)
        THEN RAISE(ABORT, 'Item exceeds shelf capacity')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM shelf_items existing
            WHERE existing.shelf_id = NEW.shelf_id
              AND NEW.start_slot <=
                  existing.start_slot + existing.span_slots - 1
              AND NEW.start_slot + NEW.span_slots - 1 >=
                  existing.start_slot
        )
        THEN RAISE(ABORT, 'Shelf position is occupied')
    END;
END;

CREATE TRIGGER prevent_shelf_item_overlap_update
BEFORE UPDATE OF shelf_id, start_slot, span_slots ON shelf_items
BEGIN
    SELECT CASE
        WHEN NEW.start_slot + NEW.span_slots - 1 >
            (SELECT capacity FROM shelves WHERE id = NEW.shelf_id)
        THEN RAISE(ABORT, 'Item exceeds shelf capacity')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM shelf_items existing
            WHERE existing.shelf_id = NEW.shelf_id
              AND existing.id != OLD.id
              AND NEW.start_slot <=
                  existing.start_slot + existing.span_slots - 1
              AND NEW.start_slot + NEW.span_slots - 1 >=
                  existing.start_slot
        )
        THEN RAISE(ABORT, 'Shelf position is occupied')
    END;
END;
```

### 6.2. Prevent Invalid Shelf Capacity Changes

If a shelf has 15 spaces and an item occupies slots 13--15, its capacity
must not be reduced to 10.

The application should validate the new capacity before updating the
shelf.

### 6.3. Maintain Referential Integrity

-   Deleting a shelf should remove its shelf-item placements but
    preserve the books and decorations.
-   Deleting a book should remove its shelf placement.
-   Deleting a decoration should remove its shelf placement.
-   A decoration catalog entry referenced by existing decorations should
    not be deleted.
-   A book or decoration can have at most one shelf placement.
-   Every shelf item must reference exactly one book or one decoration.

## 7. Important Design Decisions

1.  **Books and positions are separate:** A book's identity and PDF
    information should not depend on its shelf location.

2.  **One positioning table:** Books and decorations share
    `shelf_items`, making shelf occupancy easier to manage.

3.  **One book, one position:** A book can only be placed in one
    location at a time. It may also remain unassigned.

4.  **Deleting a shelf should not delete books:** Deleting a shelf
    removes its item placements but preserves the books themselves.

5.  **Deleting a book should remove its placement:** The associated
    shelf spaces become available.

6.  **PDF files are managed separately:** SQLite stores file references
    and metadata, not the PDF binary content.

7.  **Position updates should be atomic:** Moving or exchanging books
    should either complete successfully or leave the original
    arrangement unchanged.

8.  **Enable foreign keys on every database connection:** SQLite
    foreign-key enforcement must be enabled for each connection.

## 8. Suggested Implementation Order

-   [ ] Create `shelves`.
-   [ ] Create `books`.
-   [ ] Create `decoration_catalog`.
-   [ ] Create `decorations`.
-   [ ] Create `shelf_items`.
-   [ ] Create `app_settings`.
-   [ ] Add indexes and positioning constraints.
-   [ ] Add initial decorative catalog data.
-   [ ] Test foreign-key behavior and shelf occupancy constraints.
-   [ ] Test moving and exchanging items within database transactions.

## 9. Initial Development Scope

For the first database implementation, prioritize these three tables:

-   `shelves`
-   `books`
-   `shelf_items`

These are sufficient to build the first functional bookshelf experience.

Introduce `decoration_catalog` and `decorations` when decorative
elements are added to the application.

The schema is an initial design and can evolve as the product
requirements become more detailed.
