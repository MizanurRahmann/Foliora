CREATE TABLE shelves (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 60),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE books (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    author TEXT,
    page_count INTEGER NOT NULL CHECK (page_count > 0),
    file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes >= 0),
    file_path TEXT NOT NULL,
    original_file_name TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    storage_mode TEXT NOT NULL
        CHECK (storage_mode IN ('COPY', 'LINK')),
    file_status TEXT NOT NULL DEFAULT 'AVAILABLE'
        CHECK (file_status IN ('AVAILABLE', 'MISSING')),
    book_size TEXT NOT NULL DEFAULT 'B5'
        CHECK (book_size IN ('A5', 'B5')),
    orientation TEXT NOT NULL DEFAULT 'VERTICAL'
        CHECK (orientation IN ('VERTICAL', 'HORIZONTAL')),
    cover_style TEXT NOT NULL DEFAULT 'BOTTOM_BAND'
        CHECK (cover_style IN ('BOTTOM_BAND', 'CENTER_LABEL', 'DOUBLE_STRIPE')),
    primary_color TEXT NOT NULL
        CHECK (primary_color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
    secondary_color TEXT NOT NULL
        CHECK (secondary_color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
    last_read_page INTEGER NOT NULL DEFAULT 1 CHECK (last_read_page >= 1),
    last_opened_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Phase 1 creates the decoration tables up front so shelf_items can reference decorations.
CREATE TABLE decoration_catalog (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    asset_key TEXT NOT NULL UNIQUE,
    default_span INTEGER NOT NULL DEFAULT 1 CHECK (default_span > 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE decorations (
    id INTEGER PRIMARY KEY,
    catalog_id INTEGER NOT NULL
        REFERENCES decoration_catalog(id) ON DELETE RESTRICT,
    custom_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shelf_items (
    id INTEGER PRIMARY KEY,
    shelf_id INTEGER NOT NULL
        REFERENCES shelves(id) ON DELETE RESTRICT,
    book_id INTEGER UNIQUE
        REFERENCES books(id) ON DELETE CASCADE,
    decoration_id INTEGER UNIQUE
        REFERENCES decorations(id) ON DELETE CASCADE,
    start_slot INTEGER NOT NULL CHECK (start_slot > 0),
    span_slots INTEGER NOT NULL CHECK (span_slots > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (shelf_id, start_slot),
    CHECK (
        (book_id IS NOT NULL AND decoration_id IS NULL)
        OR
        (book_id IS NULL AND decoration_id IS NOT NULL)
    )
);

CREATE TABLE app_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL
);

CREATE INDEX idx_books_title ON books(title);
CREATE INDEX idx_books_file_hash ON books(file_hash);
CREATE INDEX idx_decorations_catalog ON decorations(catalog_id);

CREATE TRIGGER shelf_items_validate_insert
BEFORE INSERT ON shelf_items
BEGIN
    SELECT RAISE(ABORT, 'Item exceeds shelf capacity')
    WHERE NEW.start_slot + NEW.span_slots - 1 >
          (SELECT capacity FROM shelves WHERE id = NEW.shelf_id);

    SELECT RAISE(ABORT, 'Shelf position is occupied')
    WHERE EXISTS (
        SELECT 1 FROM shelf_items e
        WHERE e.shelf_id = NEW.shelf_id
          AND NEW.start_slot <= e.start_slot + e.span_slots - 1
          AND NEW.start_slot + NEW.span_slots - 1 >= e.start_slot
    );
END;

CREATE TRIGGER shelf_items_validate_update
BEFORE UPDATE OF shelf_id, start_slot, span_slots ON shelf_items
BEGIN
    SELECT RAISE(ABORT, 'Item exceeds shelf capacity')
    WHERE NEW.start_slot + NEW.span_slots - 1 >
          (SELECT capacity FROM shelves WHERE id = NEW.shelf_id);

    SELECT RAISE(ABORT, 'Shelf position is occupied')
    WHERE EXISTS (
        SELECT 1 FROM shelf_items e
        WHERE e.shelf_id = NEW.shelf_id
          AND e.id != OLD.id
          AND NEW.start_slot <= e.start_slot + e.span_slots - 1
          AND NEW.start_slot + NEW.span_slots - 1 >= e.start_slot
    );
END;

CREATE TRIGGER shelves_validate_capacity
BEFORE UPDATE OF capacity ON shelves
BEGIN
    SELECT RAISE(ABORT, 'Capacity is smaller than occupied space')
    WHERE EXISTS (
        SELECT 1 FROM shelf_items
        WHERE shelf_id = NEW.id
          AND start_slot + span_slots - 1 > NEW.capacity
    );
END;

CREATE TRIGGER shelves_touch AFTER UPDATE ON shelves
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE shelves SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER books_touch AFTER UPDATE ON books
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE books SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER shelf_items_touch AFTER UPDATE ON shelf_items
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE shelf_items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

INSERT INTO shelves (name, capacity, sort_order) VALUES
    ('Shelf 1', 24, 1),
    ('Shelf 2', 24, 2),
    ('Shelf 3', 24, 3),
    ('Shelf 4', 24, 4);
