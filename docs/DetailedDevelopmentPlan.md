# Foliora — Detailed Development Plan

This plan turns the [product specification](MainFeature.md) and the [database schema](DataSchema.md) into ordered, testable work. It refines the phases in the [high-level plan](DevelopmentPlan.md).

## 1. Current State

Already in place:

- Tauri 2 + React 19 + TypeScript + Vite + Sass project. Docker files exist.
- Global layout, side menu, and a reusable side panel (`useActivePanel`).
- A shelf UI with 4 shelves × 24 slots (`constants.ts`), backed by `mockBooks.ts`.
- Drag-and-drop of single-slot books between slots (`onMoveBook`).
- An Add Book panel: PDF selection through a browser `File`, metadata read with `pdf-lib`, a cover style and color picker, and a storage-mode choice.
- The Rust side is still the template (`greet` command only). There is no database yet.

Known gaps against the spec:

- A browser `File` has no filesystem path, so COPY and LINK cannot work. Files must be picked through the Tauri dialog.
- Books are assumed to occupy one slot, with no span concept.
- Nothing is persisted.

## 2. Architecture Decisions

| Area | Decision | Reason |
|---|---|---|
| Database access | `rusqlite` (feature `bundled`) in Rust; no SQL from the frontend | Transactions, triggers, and file operations live together. The frontend can't bypass rules. |
| API surface | Typed Tauri commands per use case (`add_book`, `move_item`, `swap_books`, …) | One command is one transaction, which makes it easy to test. |
| Errors | One Rust `AppError` enum, serialized as `{ code, message, details? }` | The UI can switch on `code` (`SLOT_OCCUPIED`, `NO_SPACE`, `FILE_MISSING`, …). |
| Placement rules | Pure functions in TS (`src/modules/shelf/placement.ts`) and Rust (`placement.rs`), checked against one shared test-case file | TS gives instant drag feedback. Rust and the triggers are authoritative. |
| File picking | `@tauri-apps/plugin-dialog` | Returns a real path for COPY and LINK. |
| PDF inspection | Rust: `lopdf` (page count, title, author) and `sha2` (hash) | Works on the real file, and avoids loading large PDFs into JS for import. `pdf-lib` can then be removed. |
| PDF reading | `pdfjs-dist` in the webview | Lazy page rendering, zoom, text layer. |
| Delivering PDF bytes | Command `read_book_file(book_id)` returning `tauri::ipc::Response` (raw bytes) | The backend resolves the path from the DB, so the frontend never supplies a read path and no broad asset scope is needed. |
| Managed files | `<app_data_dir>/books/<uuid>.pdf`, written as `.tmp` and then renamed | No name collisions and no half-written files. |
| Migrations | Embedded SQL files plus `PRAGMA user_version` | Simple and has no extra dependencies. |
| State on the frontend | React state or context per module, refreshed from command results | The app is small. Add a library only if real pain appears. |

### 2.1. Proposed Source Layout

```
src-tauri/
  migrations/0001_init.sql, 0002_decorations.sql   # 0002 is added in Phase 7
  src/
    lib.rs              # builder, plugin and command registration
    error.rs            # AppError
    db/mod.rs           # open connection, pragmas, migrate()
    placement.rs        # span, can_place, first_fit, swap targets
    files.rs            # managed folder, copy, hash, inspect PDF, exists checks
    commands/
      shelves.rs  books.rs  items.rs  reader.rs  settings.rs  decorations.rs
src/
  api/                  # typed wrappers around invoke(), one file per command group
  modules/
    shelf/placement.ts  # mirror of placement.rs
    reader/             # pdf.js viewer + open/close animation
    decorations/
    settings/
tests/placement-cases.json   # shared vectors for TS and Rust placement tests
```

## 3. Phases

Each phase ends with working, committed software. Acceptance criteria are what must be true before moving on.

### Phase 1 — Backend Foundation

Tasks:

1. Add the `rusqlite` (bundled), `thiserror`, `uuid`, `sha2`, `lopdf`, and `tauri-plugin-dialog` crates. Add `@tauri-apps/plugin-dialog` and `vitest` on the frontend.
2. `db::open()`: create `<app_data_dir>/foliora.db` and apply the pragmas (`foreign_keys`, WAL, `busy_timeout`).
3. Migration runner. Back up the database to `foliora.db.bak` before migrating an existing file.
4. `0001_init.sql` exactly as in DataSchema §5–6, plus the default 4 × 24 shelves.
5. Define `AppError` and map trigger messages to error codes.
6. Hold the connection in Tauri state (`Mutex<Connection>`).
7. Replace `greet` with a `health_check` command, and remove `greet` from the frontend.
8. Tighten the capabilities in `capabilities/default.json` to only the plugins in use, and set a CSP in `tauri.conf.json`.

Acceptance:

- The app starts, creates the DB, and runs migrations once. A second start is a no-op.
- `cargo test` runs DB tests against an in-memory database: overlap, capacity, capacity shrink, cascade and restrict behaviour, and the `updated_at` triggers.

### Phase 2 — Placement Core (pure logic)

Tasks:

1. Span table (spec §2.3) in `placement.ts` and `placement.rs`:
   - `bookSpan(size, orientation, pages)`
2. Occupancy:
   - `canPlace(shelf, items, span, start, ignoreIds)`
   - `firstFit(shelves, items, span)`, which searches shelves in display order
3. `swapTargets(a, b)`: the different-shelf and same-shelf rules from DataSchema §6.4.
4. `tests/placement-cases.json`: around 30 cases covering edges, boundaries, unequal spans, and items between swapped books. Both test suites load it.

Acceptance:

- Vitest and `cargo test` both pass the shared cases.
- No UI or DB code is in this phase.

### Phase 3 — Shelves End-to-End

Tasks:

1. Commands:
   - `list_shelves`: shelves with their items and book summaries, in a single query.
   - `create_shelf`, `update_shelf`, `reorder_shelves`, `delete_shelf`
   - Errors: `SHELF_NOT_EMPTY` and `CAPACITY_TOO_SMALL`, the latter listing the blocking items.
2. `src/api/shelves.ts` wrappers.
3. Replace `mockBooks.ts` and `SLOTS_PER_SHELF` with data from `list_shelves`. Each shelf renders its own capacity.
4. Render items by `start_slot` and `span_slots` (CSS grid column span), not one per slot.
5. Manage Shelves view: list, add, rename, change capacity, reorder, and delete, with clear error messages.
6. Empty state when there are no shelves.

Acceptance:

- Shelf changes survive an app restart.
- A non-empty shelf cannot be deleted.
- Capacity cannot shrink below the occupied space, and the UI says why.

### Phase 4 — Book Import, Edit, and Remove

Tasks:

1. Add Book flow:
   1. Pick the file with the dialog plugin (`.pdf` filter).
   2. `inspect_pdf(path)` → `{ title?, author?, pageCount, sizeBytes, hash, duplicateOf? }`.
      - Reject unreadable, encrypted, and non-PDF files with `INVALID_PDF`.
   3. If `duplicateOf` is set, show the warning and let the user cancel or continue.
   4. `add_book(payload)`:
      1. Compute the span and find the first fit. If there is none, return `NO_SPACE` before any file is touched.
      2. For `COPY`, copy to a temp file and rename.
      3. Insert the book and its placement in one transaction.
      4. On failure, delete the copied file.
   5. Highlight the new book for 5 s.
2. Update `NewBookPayload` and `BookData` to match the schema: path, hash, orientation, uppercase enums, and span. Drop `pdf-lib` and `readPdfMetadata.ts`.
3. Book context menu (right-click, and the keyboard menu key): View details, Edit, Move to… (wired in Phase 5), Remove.
4. `update_book`:
   - Recompute the span.
   - Update the book and `span_slots` in one transaction.
   - If it no longer fits, return `NO_SPACE_AT_POSITION`.
5. `remove_book(id, deleteFile)`: commit the DB change first, then delete the managed file if requested. Never delete linked files.
6. File status: on startup, `refresh_file_status` checks all `LINK` books, and the shelf shows a "missing" badge.
7. `relink_book(id, newPath)`: compare the hash, and require the user to confirm if the content differs.

Acceptance:

- COPY and LINK both work.
- Killing the app mid-import leaves neither orphan rows nor orphan files. Stray `.tmp` files are cleaned up on startup.
- Moving or deleting a linked file shows the missing state, and relink fixes it.
- An edit that would overflow is rejected without changes.

### Phase 5 — Moving Items

Tasks:

1. Commands:
   - `move_item(item_id, shelf_id, start_slot)`
   - `swap_books(item_a, item_b)`, which deletes and reinserts in one transaction.
2. Drag and drop:
   - During drag, use `placement.ts` to highlight valid start slots and mark invalid ones.
   - Dropping on a book calls `swap_books`. Dropping on free space calls `move_item`.
   - Animate only after the backend succeeds. On error, snap back and show the message.
3. **Move to…** dialog (keyboard): pick a shelf and slot from the valid targets, using the same commands.
4. Remove any position-changing path from the edit form.

Acceptance:

- Every rule in spec §5 is covered by a test, at both the placement and the command level.
- Rejected drops leave the DB and UI unchanged.
- Everything is reachable without a mouse.

### Phase 6 — Reader

Tasks:

1. `read_book_file(book_id)` returns the raw bytes, or `FILE_MISSING` and updates the status.
2. Reader module on `pdfjs-dist`:
   - Lazy page rendering, next and previous page, go to page, and zoom.
   - Keyboard shortcuts: arrows, PageUp/PageDown, and Esc to close.
3. `save_reading_progress(book_id, page)`: debounced. It also sets `last_opened_at`. The reader opens at `last_read_page`.
4. Open and close animation:
   - Apply CSS 3D transforms only to a cloned element of the clicked book.
   - Show the cover until the first page has rendered, then cross-fade into the reader.
   - Closing reverses the animation back to the shelf slot.
5. A missing or unreadable file opens the relink/remove prompt instead of the reader.

Acceptance:

- A 300+ page, 50 MB PDF opens without freezing the UI.
- The reader reopens on the last page read.
- The animation is smooth on Linux (WebKitGTK).

### Phase 7 — Decorative Elements

Tasks:

1. `0002_decorations.sql`: catalog seed data (vase, clock, calendar, plant, globe, photo frame). The tables already exist from `0001_init.sql`.
2. Assets (SVG preferred) keyed by `asset_key`.
3. Manage Elements panel: browse the active catalog, then add an element to the first fit or pick a slot.
4. Commands: `list_catalog`, `add_decoration`, `remove_decoration`. `move_item` is reused, and swaps involving decorations are rejected.
5. Render decorations on the shelf, with drag and **Move to…** support.

Acceptance:

- Decorations obey spec §4.3 and §5. The same placement tests are extended with decoration cases.

### Phase 8 — Settings and Backup

Tasks:

1. `get_settings` and `set_setting`. Settings: theme, default book size, default orientation, default storage mode.
2. Show the managed folder path (read-only), with an "Open folder" action.
3. Export a backup with the `zip` crate. The archive contains a DB snapshot made with `VACUUM INTO` plus `books/`.
4. Import a backup:
   1. Validate the archive.
   2. Back up the current data.
   3. Replace the data and reload.
   4. Linked books keep their absolute paths and are re-checked.

Acceptance:

- Export, wipe, and import restore an identical library.

### Phase 9 — Hardening

Tasks:

1. Performance pass with 200+ books across 10 shelves:
   - Profile drag over many slots.
   - Avoid `preserve-3d` on shelf books.
   - Memoize shelf rows.
2. Error-handling pass: every `AppError` code has a user-facing message.
3. Accessibility pass: focus order, visible focus, ARIA labels for books and slots, and context-menu keyboard support.
4. Window resize and HiDPI checks.
5. Security pass:
   - CSP.
   - Minimal capabilities.
   - Path checks on every command that takes a path.
   - No `..` in managed relative paths.

### Phase 10 — Build and Distribution

Tasks:

1. Set the app identifier and name (`Foliora`), icons, and version.
2. Linux bundles (`.deb`, AppImage) first, then the other platforms if wanted.
3. Install, upgrade (to check that migrations run on an existing DB), and uninstall tests. Confirm user data survives an upgrade.
4. Optionally, use the Tauri updater.

## 4. Testing Strategy

| Layer | Tool | What is tested |
|---|---|---|
| Placement logic | Vitest + `cargo test` | Shared JSON cases: span, fit, overlap, swap |
| Database | `cargo test`, in-memory SQLite with migrations applied | Triggers, constraints, cascades, transactions and rollback |
| Commands | `cargo test`, with temp app-data directories | Add, remove, relink flows including file cleanup and failure injection |
| UI | Vitest + Testing Library (selectively) | Add Book form validation, drag feedback states |
| Manual | Checklist per phase | Animations, real PDFs, missing files, keyboard-only use |

## 5. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Rule drift between TS and Rust placement code | Shared `placement-cases.json`. The backend stays authoritative. |
| Large PDFs over IPC are slow | Raw-byte `ipc::Response`. If still slow, switch to a scoped asset protocol per opened book. |
| 3D animation stutters on WebKitGTK | Animate a single clone with `transform` and `opacity` only. Test early in Phase 6. |
| Span values look wrong visually | Spans live in one table. Tune them in Phase 3 once real rendering exists. |
| Linked files on removable drives | Mark them as missing rather than failing. Relink flow. |
| Schema changes after release | Migrations only, never edit an applied migration, back up before migrating. |

## 6. Milestones

| Milestone | Phases | Outcome |
|---|---|---|
| M1 — Foundation | 1, 2 | DB, migrations, and placement core, all tested |
| M2 — Bookshelf | 3 | Persistent, manageable shelves |
| M3 — Library | 4 | Import, edit, remove, copy/link, missing-file handling |
| M4 — Organization | 5 | Drag and drop, swap, keyboard move |
| M5 — Reader | 6 | PDF reading with animations and progress |
| M6 — Personalization | 7, 8 | Decorations, settings, backup |
| M7 — Release | 9, 10 | Hardened, installable app |
