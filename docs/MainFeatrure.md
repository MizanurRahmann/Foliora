# Floiora — Product Specification

## 1. Product Overview

Floiora is a digital bookshelf application that allows users to organize, manage, and read their PDF books through an interactive bookshelf interface.

The primary goal is to recreate the experience of managing a physical bookshelf in a digital environment. Users can arrange books, add decorative objects, customize their shelves, and open books to read them.

Unlike a traditional PDF library, Floiora focuses on visual organization and an enjoyable, realistic bookshelf experience.

## 2. Bookshelf Management

A bookshelf is the primary workspace of Floiora. Users can create multiple shelves and organize their books and decorative objects across them.

### 2.1. Shelf Features

- View all available shelves.
- Add new shelves.
- Edit existing shelves.
- Delete shelves.
- Configure the capacity of each shelf.
- View all books and decorative objects belonging to a shelf.
- Organize items within and across shelves.

### 2.2. Shelf Layout

- Each shelf contains a fixed number of spaces.
- Each space represents a unit of available storage.
- Books and decorative objects occupy one or more spaces.
- Items can be arranged vertically or horizontally, depending on their type and orientation.
- Items must remain within the available shelf area.
- Occupied spaces cannot be shared by multiple items.

The bookshelf should visually resemble a real bookshelf, with books and decorative objects arranged naturally.

## 3. Book Management

Books are the primary elements of Floiora. Each book represents a PDF document and appears as a visually customizable book on the bookshelf.

### 3.1. Book Appearance

Each book will be displayed as a book-shaped element with a customizable appearance.

Users can configure:

- Book title.
- Author name.
- Book size (B5 or A5).
- Book cover style.
- Book orientation:
  - Vertical (standing).
  - Horizontal (lying down).

### 3.2. Add a Book

Users can add books through the Add Book option in the application sidebar.

The process includes:

1. Select a PDF file from the device.
2. Validate the selected file.
3. Display available book information.
4. Enter or update the book details.
5. Select the book size.
6. Choose a book cover style.
7. Select the book orientation.
8. Choose a file storage option.
9. Add the book to an available shelf position.

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
| Orientation | Vertical or horizontal |
| Storage Option | Copy or link the PDF |

Book name, author, and page count should be populated from available PDF metadata whenever possible. Users can update the information before adding the book.

### 3.4. PDF Storage Options

Users can choose between two storage options:

**Copy PDF**

- Copy the selected PDF into a designated Floiora folder.
- Keep the book accessible through Floiora independently of the original file location.

**Link PDF**

- Keep the PDF in its original location.
- Link the book to the existing PDF without creating another copy.
- If the original file becomes unavailable, notify the user.

### 3.5. Book Placement

- After adding a book, Floiora automatically places it in an available position.
- The book must fit within the available shelf capacity.
- The newly added book should be highlighted through a tooltip or small modal for five seconds.
- If no suitable position is available, inform the user.

### 3.6. Open and Read a Book

When a user left-clicks a book:

1. The book opens with a 3D book-opening animation.
2. The associated PDF document appears in a reading interface.
3. The user can read and navigate through the document.
4. The user can close the reading interface.
5. The book performs a closing animation.
6. The book returns to its original shelf position.

The reading experience should feel like opening and closing a physical book.

### 3.7. Move a Book

Users can rearrange books using drag-and-drop interactions.

Rules:

- A book can be moved to another position on the same shelf.
- A book can be moved to another shelf.
- A book can exchange positions with another book when dropped onto an occupied book position, provided the positions are compatible.
- A book cannot be placed where a decorative element occupies the required space.
- A book cannot be placed if the destination does not have sufficient capacity.
- Invalid movements should be rejected.

Book positions can only be changed through drag and drop.

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
- Cover style.
- Orientation.
- Associated PDF, if supported.

The book's shelf position cannot be changed through the edit form.

### 3.9. Remove a Book

Users can remove a book from their bookshelf.

Removing a book should release its occupied shelf spaces.

If the PDF was copied into Floiora's managed folder, the user should be given the option to remove the stored file as well.

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
2. Every item must occupy a defined amount of shelf space.
3. Multiple items cannot occupy the same space.
4. Items cannot extend beyond the shelf boundaries.
5. Items can only be moved through drag and drop.
6. The destination must have sufficient capacity for the item.
7. A book can exchange positions with another compatible book.
8. Decorative elements cannot exchange positions with other items.
9. Books cannot be placed over decorative elements.
10. Decorative elements cannot be placed over books or other decorative elements.

## 6. Application Navigation

The application will provide a sidebar for accessing its main features.

| Navigation | Description |
|---|---|
| Home | View and interact with the main bookshelf |
| Manage Shelves | Add, edit, delete, and manage shelves |
| Add Book | Import a new PDF book |
| Manage Elements | There will be some preadded elements user can just use them and place the on the shelf of not use them |
| Settings | Manage application preferences |

## 7. User Interaction and Experience

Floiora should provide an interactive and visually engaging experience.

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

## 8. Product Scope Summary

Floiora consists of three primary product areas:

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