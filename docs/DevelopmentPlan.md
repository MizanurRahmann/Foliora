# Foliora — High-Level Development Plan

## 1. Development Goal
Build Foliora as a cross-platform desktop application that can be installed and used locally.

The application will use React and TypeScript for its interface, Tauri 2 and Rust for desktop functionality, and SQLite for persistent local data.

The development should be incremental: first establish a working desktop application, then build the bookshelf experience, and finally add PDF reading, animations, and decorative elements.

## 2. Development Phases
### Phase 1
Project Foundation
- Set up the React + TypeScript project.
- Integrate Tauri 2 and Rust.
- Configure SQLite.
- Set up Docker and Dev Containers.
- Configure Git and GitHub.
- Verify that the application runs as a desktop application.


### Phase 2
Application Layout and UI Foundation
- Create the main application layout.
- Implement the sidebar and navigation.
- Create the bookshelf workspace.
- Establish the visual design system.
- Implement basic application settings.


### Phase 3
Bookshelf and Shelf Management
- Display multiple shelves.
- Add, edit, and delete shelves.
- Configure shelf capacity.
- Display shelf spaces.
- Implement basic shelf organization.


### Phase 4
Book Management
- Import PDF files.
- Implement PDF validation.
- Manage book information.
- Support copy and link storage options.
- Display books on shelves.
- Edit and remove books.
- Implement book appearance customization.


### Phase 5
Shelf Organization and Drag-and-Drop
- Implement book dragging.
- Support movement between shelves.
- Implement book position swapping.
- Validate shelf capacity and occupied spaces.
- Provide movement feedback and animations.


### Phase 6
PDF Reading Experience
- Implement the PDF reading interface.
- Open PDFs from bookshelf items.
- Add book-opening animations.
- Implement book-closing animations.
- Restore the original bookshelf view after reading.


### Phase 7
Decorative Elements
- Create the decorative element library.
- Add decorative objects to shelves.
- Implement element positioning.
- Support drag-and-drop movement.
- Enforce item occupancy rules.


### Phase 8
Persistence and Application Refinement
- Ensure shelf and book arrangements persist.
- Handle missing or inaccessible PDF files.
- Improve error handling.
- Refine animations and interactions.
- Test different screen sizes and display settings.


Phase 9
Build and Distribution
- Configure production builds.
- Generate installable desktop packages.
- Test installation on your local machine.
- Verify application data persistence.
- Test application upgrades and uninstall behavior.


## 3. Development Milestones
I suggest using these milestones to measure progress:
Milestone	Expected outcome
M1 — Foundation	Installable desktop application shell
M2 — Bookshelf	Functional bookshelf with multiple shelves
M3 — Book Library	Import, manage, and display PDF books
M4 — Organization	Drag-and-drop and positioning
M5 — Reader	Functional PDF reader with book animations
M6 — Personalization	Decorative elements and customization
M7 — Release	Stable, installable local application

## 4. Development Guidelines
A few principles to follow throughout development:
- Build one complete feature at a time.
- Keep the application usable at every milestone.
- Prioritize functionality before visual polish.
- Keep user data and PDF files locally accessible.
- Test native desktop functionality independently from the UI.
- Commit working milestones to GitHub.
- Maintain a clear distinction between unfinished and completed features.
Suggested next step: Start with Phase 1 and establish a working, installable Tauri application before developing the bookshelf.

I can also help track Foliora's development progress and prepare the next milestone's tasks as you complete each phase.