import { useEffect, useMemo, useState } from "react";

import type { AppError } from "../../../../api/error";
import SidePanel from "../../../global/components/sidePanel/SidePanel";
import type { BookSummary, ShelfData } from "../../types";
import { findBook, slotLabel } from "../../utils/library";
import { moveTargets, swapPartners } from "../../utils/moves";
import "../addBookPanel/AddBookPanel.scss";
import "./BookPanels.scss";

interface MoveBookPanelProps {
  isOpen: boolean;
  book: BookSummary | null;
  shelves: readonly ShelfData[];
  onClose: () => void;
  onMove: (itemId: number, shelfId: number, start: number) => Promise<AppError | null>;
  onSwap: (itemA: number, itemB: number) => Promise<AppError | null>;
}

// The keyboard route to what drag and drop does. It offers only targets the placement rules accept.
function MoveBookPanel({ isOpen, book, shelves, onClose, onMove, onSwap }: MoveBookPanelProps) {
  const [shelfId, setShelfId] = useState<number | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const found = book ? findBook(shelves, book.id) : null;
  const itemId = found?.item.id ?? null;

  const targets = useMemo(() => (itemId === null ? [] : moveTargets(shelves, itemId)), [shelves, itemId]);
  const partners = useMemo(() => (itemId === null ? [] : swapPartners(shelves, itemId)), [shelves, itemId]);

  // Start from the first valid target each time the panel opens.
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setShelfId(targets[0]?.shelf.id ?? null);
    setStart(targets[0]?.starts[0] ?? null);
    setPartnerId(partners[0]?.id ?? null);
    // Only when the panel opens; later list changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, itemId]);

  const shelfTargets = targets.find((target) => target.shelf.id === shelfId) ?? null;
  const selectedStart = shelfTargets?.starts.includes(start ?? -1) ? start : (shelfTargets?.starts[0] ?? null);
  const span = found?.item.span ?? 1;

  const run = async (action: () => Promise<AppError | null>) => {
    setIsBusy(true);
    setError(null);
    const failure = await action();
    setIsBusy(false);
    if (failure) setError(failure.message);
    else onClose();
  };

  const footer = (
    <button type="button" className="add-book__button add-book__button--w60" onClick={onClose}>
      Cancel
    </button>
  );

  const nothingToDo = targets.length === 0 && partners.length === 0;

  return (
    <SidePanel isOpen={isOpen} title="Move To" onClose={onClose} footer={footer}>
      {book && found && (
        <div className="book-panel">
          <p>
            Move <strong>{book.title}</strong>, now at {found.shelf.name}, {slotLabel(found.item.start, span)}.
          </p>

          {nothingToDo && (
            <p className="book-panel__note">
              There is nowhere this book can go right now. Free up some space or remove a book first.
            </p>
          )}

          {targets.length > 0 && (
            <form
              className="add-book__form"
              onSubmit={(event) => {
                event.preventDefault();
                if (shelfId !== null && selectedStart !== null) {
                  void run(() => onMove(found.item.id, shelfId, selectedStart));
                }
              }}
            >
              <label className="add-book__field">
                Shelf
                <select
                  value={shelfId ?? ""}
                  onChange={(event) => {
                    setError(null);
                    setShelfId(Number(event.target.value));
                  }}
                >
                  {targets.map(({ shelf }) => (
                    <option key={shelf.id} value={shelf.id}>
                      {shelf.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="add-book__field">
                {span > 1 ? `Starting slot (takes ${span} slots)` : "Slot"}
                <select
                  value={selectedStart ?? ""}
                  onChange={(event) => {
                    setError(null);
                    setStart(Number(event.target.value));
                  }}
                >
                  {shelfTargets?.starts.map((value) => (
                    <option key={value} value={value}>
                      {slotLabel(value, span)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="add-book__button add-book__button--primary"
                disabled={isBusy || selectedStart === null}
              >
                Move here
              </button>
            </form>
          )}

          {partners.length > 0 && (
            <form
              className="add-book__form"
              onSubmit={(event) => {
                event.preventDefault();
                if (partnerId !== null) void run(() => onSwap(found.item.id, partnerId));
              }}
            >
              <label className="add-book__field">
                Or exchange places with
                <select
                  value={partnerId ?? ""}
                  onChange={(event) => {
                    setError(null);
                    setPartnerId(Number(event.target.value));
                  }}
                >
                  {partners.map((partner) => {
                    const where = findBook(shelves, partner.book?.id ?? -1);
                    return (
                      <option key={partner.id} value={partner.id}>
                        {partner.book?.title} ({where?.shelf.name}, {slotLabel(partner.start, partner.span)})
                      </option>
                    );
                  })}
                </select>
              </label>
              <button type="submit" className="add-book__button" disabled={isBusy || partnerId === null}>
                Exchange
              </button>
            </form>
          )}

          {error && (
            <p className="add-book__error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </SidePanel>
  );
}

export default MoveBookPanel;
