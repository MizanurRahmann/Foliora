# Foliora — Product Specification

## 1. Product Overview

Foliora is a digital bookshelf application that allows users to organize, manage, and read their PDF books through an interactive bookshelf interface.

The primary goal is to recreate the experience of managing a physical bookshelf in a digital environment. Users can arrange books, add decorative objects, customize their shelves, and open books to read them.

Unlike a traditional PDF library, Foliora focuses on visual organization and an enjoyable, realistic bookshelf experience.

## 2. Bookshelf Management

A bookshelf is the primary workspace of Foliora. Users can create multiple shelves and organize their books and decorative objects across them.

### 2.1. Shelf Features

- View all available shelves.
- Add new shelves.
- Edit existing shelves (name, capacity, display order).
- Delete shelves.
- Configure the capacity of each shelf.
- View all books and decorative objects belonging to a shelf.
- Organize items within and across shelves.

Rules:

- A new installation starts with 4 shelves of 24 spaces each.
- Shelf capacity must be between 1 and 60 spaces.
- Capacity cannot be reduced below the last occupied space. The user is told which items block the change.
- Only an empty shelf can be deleted. If it still contains items, the user must move or remove them first.
- When there are no shelves, the Home view shows an empty state with a shortcut to create one.

### 2.2. Shelf Layout

- Each shelf contains a fixed number of spaces.
- Each space represents a unit of available storage.
- Books and decorative objects occupy one or more spaces.
- Items can be arranged vertically or horizontally, depending on their type and orientation.
- Items must remain within the available shelf area.
- Occupied spaces cannot be shared by multiple items.
- Items are placed in a single row. Stacking items on top of each other (for example, a vase on a lying book) is not supported in v1.

The bookshelf should visually resemble a real bookshelf, with books and decorative objects arranged naturally.

### 2.3. Space (Span) Rules

The number of spaces a book occupies is derived from its size, orientation, and page count. Users never enter it directly.

| Orientation | Book Size | Page Count | Spaces |
|---|---|---|---|
| Vertical | A5 or B5 | ≤ 800 | 1 |
| Vertical | A5 or B5 | > 800 | 2 |
| Horizontal | A5 | any | 4 |
| Horizontal | B5 | any | 5 |

A decorative element's span is defined by its catalog entry.

These values are defined in one place in the code and may be tuned during UI development. Changing any input (size, orientation, page count) recalculates the span and must be validated against the shelf like a move.

## 3. Book Management

Books are the primary elements of Foliora. Each book represents a PDF document and appears as a visually customizable book on the bookshelf.

### 3.1. Book Appearance

Each book will be displayed as a book-shaped element with a customizable appearance.

Users can configure:

- Book title.
- Author name.
- Book size (B5 or A5).
- Book cover style: `Bottom band`, `Center label`, or `Double stripe`.
- Primary and secondary cover colors.
- Book orientation:
  - Vertical (standing).
  - Horizontal (lying down).

### 3.2. Add a Book

Users can add books through the Add Book option in the application sidebar.

The process includes:

1. Select a PDF file from the device.
2. Validate the selected file (readable, a real PDF, not password-protected).
3. Check for duplicates. If the same file (by content hash) already exists, warn the user and let them cancel or continue.
4. Display available book information.
5. Enter or update the book details.
6. Select the book size.
7. Choose a book cover style and colors.
8. Select the book orientation.
9. Choose a file storage option.
10. Add the book to an available shelf position.

The add operation is all-or-nothing. If no shelf position is available or any step fails, no book record is created and any copied file is removed.

### 3.3. Book Information

The book information form includes:

| Field | Description |
|---|---|
| PDF File | Selected PDF document |
| Book Name | Title of the book |
| Author | Book author |
| Page Count | Total number of pages |
| File Size | Size of the PDF document |
| Book Size | B5 (default) or A5 |
| Cover Style | Visual appearance of the book |
| Cover Colors | Primary and secondary color |
| Orientation | Vertical or horizontal |
| Storage Option | Copy or link the PDF |

Book name, author, and page count should be populated from available PDF metadata whenever possible. If the metadata is missing, the title defaults to the file name. Users can update the information before adding the book. Page count is read from the PDF and is not user-editable.

### 3.4. PDF Storage Options

Users can choose between two storage options:

**Copy PDF**

- Copy the selected PDF into Foliora's managed folder inside the application data directory.
- Files are stored under a generated name, so name collisions cannot occur.
- Keep the book accessible through Foliora independently of the original file location.

**Link PDF**

- Keep the PDF in its original location.
- Link the book to the existing PDF without creating another copy.
- Linked files are checked when the application starts and when the book is opened.
- If the file is unavailable, the book is shown with a "missing" indicator. The user can:
  - **Relink** by selecting the file's new location. If its content differs from the original, the user is warned before confirming.
  - Remove the book.

### 3.5. Book Placement

- After adding a book, Foliora automatically places it in the first available position that fits its span, searching shelves in display order.
- The book must fit within the available shelf capacity.
- The newly added book should be highlighted through a tooltip or small modal for five seconds.
- If no suitable position is available, inform the user before the book is created, so nothing is saved.

### 3.6. Open and Read a Book

When a user left-clicks a book:

1. The book opens with a 3D book-opening animation.
2. The associated PDF document appears in a reading interface.
3. The user can read and navigate through the document.
4. The user can close the reading interface.
5. The book performs a closing animation.
6. The book returns to its original shelf position.

The reading experience should feel like opening and closing a physical book.

Reader requirements:

- Page navigation (next, previous, go to page) and zoom.
- Pages are rendered lazily, so large PDFs open quickly.
- The last-read page is saved and restored the next time the book is opened.
- If the file is missing or cannot be read, the book does not open. The user sees the relink or remove options instead.

### 3.7. Move a Book

Users can rearrange books using drag-and-drop interactions.

Rules:

- A book can be moved to another position on the same shelf.
- A book can be moved to another shelf.
- A book can exchange positions with another book when dropped onto that book.
- A book cannot be placed where a decorative element occupies the required space.
- A book cannot be placed if the destination does not have sufficient capacity.
- Invalid movements should be rejected, leaving the arrangement unchanged.

**Exchange rule:**

- **Different shelves:** each book takes the other's start space.
- **Same shelf:** the two books swap order within the block they span. The right-hand book moves to the left-hand book's start, and the left-hand book moves so it ends where the right-hand book ended.
- The exchange is valid only if both books then fit within their shelves without overlapping any other item.
- Books with equal spans can always exchange.

A move or exchange is applied completely or not at all.

Drag and drop is the primary way to change positions. For keyboard accessibility, the context menu also offers **Move to…**, which uses the same rules. The edit form cannot change position.

### 3.8. Edit a Book

When a user right-clicks a book, a context menu or side panel appears.

The available actions include:

- Edit book information.
- View book details.
- Remove the book.

The edit interface should reuse the Add Book form and display the existing book information.

Users can update:

- Book name.
- Author.
- Book size.
- Cover style and colors.
- Orientation.

Replacing the associated PDF is not supported in v1, except through the relink flow for missing linked files.

The book's shelf position cannot be changed through the edit form. If a change to size or orientation alters the book's span and it no longer fits at its current position, the edit is rejected and the user is told to move the book first.

### 3.9. Remove a Book

Users can remove a book from their bookshelf.

Removing a book should release its occupied shelf spaces.

If the PDF was copied into Foliora's managed folder, the user should be given the option to remove the stored file as well.

If the PDF was linked, removing the book should not delete the original file.

## 4. Decorative Element Management

Decorative elements allow users to personalize their bookshelves and make them look more like physical bookshelves.

Unlike books, decorative elements are visual objects rather than documents.

### 4.1. Available Elements

Examples of decorative elements include:

- Vase.
- Clock.
- Paper calendar.
- Indoor plant.
- Globe.
- Photo frame.
- Other decorative objects.

Each decorative element should have its own visual appearance.

### 4.2. Add a Decorative Element

- Users can access the decorative element library.
- Users can select an element from the available collection.
- The selected element can be placed in an available shelf position.
- Each element occupies one or more shelf spaces.
- If sufficient space is unavailable, the element cannot be added.

### 4.3. Move a Decorative Element

Users can move decorative elements through drag and drop.

Rules:

- An element can be moved within the same shelf or to another shelf.
- An element can only be placed where all required spaces are available.
- An element cannot overlap with a book.
- An element cannot overlap with another decorative element.
- An element cannot exchange positions with an occupied item.
- Invalid movements should be rejected.

### 4.4. Remove a Decorative Element

Users can remove decorative elements from their shelves.

Removing an element releases all the shelf spaces it occupies.

## 5. Item Positioning and Occupancy Rules

Books and decorative elements share the same shelf space.

The following rules apply to all shelf items:

1. Every item must have a position on a shelf.
2. Every item must occupy a defined amount of shelf space (see 2.3).
3. Multiple items cannot occupy the same space.
4. Items cannot extend beyond the shelf boundaries.
5. Items are moved through drag and drop, or through **Move to…** for keyboard users.
6. The destination must have sufficient capacity for the item.
7. A book can exchange positions with another book if both fit after the exchange (see 3.7).
8. Decorative elements cannot exchange positions with other items.
9. Books cannot be placed over decorative elements.
10. Decorative elements cannot be placed over books or other decorative elements.
11. Every move, exchange, or span change is atomic and is validated both in the UI (for drag feedback) and in the backend (authoritative).

## 6. Application Navigation

The application will provide a sidebar for accessing its main features.

| Navigation | Description |
|---|---|
| Home | View and interact with the main bookshelf |
| Manage Shelves | Add, edit, delete, and manage shelves |
| Add Book | Import a new PDF book |
| Manage Elements | Browse the built-in decorative element library and place an element on a shelf. Elements are optional. |
| Settings | Manage application preferences |

Settings include:

- Theme.
- Default book size, orientation, and storage option.
- Location of the managed PDF folder (read-only in v1).
- Backup and restore (export the database and copied PDFs to an archive, then import it back).

## 7. User Interaction and Experience

Foliora should provide an interactive and visually engaging experience.

The following interaction guidelines apply:

- Books should look like physical books rather than ordinary document cards.
- Decorative elements should look like real-world objects.
- Dragging an item should provide clear visual feedback.
- Valid destinations should be visually highlighted.
- Invalid destinations should communicate that the placement is not allowed.
- Successful movements should have smooth animations.
- Opening and closing books should use realistic 3D animations.
- Newly added books should receive temporary visual highlighting.
- Context menus should provide convenient access to book actions.
- Shelf arrangements should remain consistent when users navigate between application sections.
- All shelf actions are reachable from the keyboard.
- The shelf stays responsive with at least 200 books. 3D effects are applied only to the book being opened, not to every book on the shelf.

## 8. Product Scope Summary

Foliora consists of three primary product areas:

### Bookshelf
- Multiple shelves.
- Configurable shelf capacity.
- Visual shelf arrangement.
- Shelf creation, editing, and deletion.
- Shelf content overview.

### Books
- PDF import.
- Book information management.
- Customizable book appearance.
- PDF storage and linking.
- Drag-and-drop positioning.
- Book position exchange.
- Animated opening and closing.
- PDF reading.
- Book editing and removal.

### Decorative Elements
- Decorative element library.
- Multiple decorative object types.
- Custom space requirements.
- Drag-and-drop positioning.
- Occupancy validation.
- Element removal.

The overall experience should make managing a digital bookshelf feel as natural and enjoyable as organizing a physical bookshelf.

## 9. Out of Scope for v1

- Stacking items on top of other items.
- Replacing a book's PDF (other than relinking a missing file).
- Unplaced books (every book lives on a shelf).
- Formats other than PDF.
- Annotations, highlights, and bookmarks.
- Cloud sync.