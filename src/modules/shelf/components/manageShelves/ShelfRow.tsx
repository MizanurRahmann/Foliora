import { useEffect, useState, type FormEvent } from "react";
import { IoArrowDown, IoArrowUp, IoTrashOutline } from "react-icons/io5";

import type { AppError } from "../../../../api/error";
import { MAX_SHELF_CAPACITY, MIN_SHELF_CAPACITY } from "../../constants";
import type { ActionResult } from "../../hooks/useShelves";
import type { ShelfData } from "../../types";
import ErrorNotice from "./ErrorNotice";

interface ShelfRowProps {
  shelf: ShelfData;
  isFirst: boolean;
  isLast: boolean;
  onSave: (name: string, capacity: number) => ActionResult;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => ActionResult;
}

function ShelfRow({ shelf, isFirst, isLast, onSave, onMove, onDelete }: ShelfRowProps) {
  const [name, setName] = useState(shelf.name);
  const [capacity, setCapacity] = useState(String(shelf.capacity));
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(shelf.name);
    setCapacity(String(shelf.capacity));
  }, [shelf.name, shelf.capacity]);

  const isDirty = name.trim() !== shelf.name || Number(capacity) !== shelf.capacity;
  const itemCount = shelf.items.length;

  const run = async (action: () => ActionResult) => {
    setBusy(true);
    setError(await action());
    setBusy(false);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void run(() => onSave(name, Number(capacity)));
  };

  return (
    <li className="manage-shelves__row">
      <form className="manage-shelves__fields" onSubmit={handleSubmit}>
        <label>
          <span>Name</span>
          <input
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            aria-label={`Name of ${shelf.name}`}
          />
        </label>
        <label>
          <span>Spaces</span>
          <input
            type="number"
            min={MIN_SHELF_CAPACITY}
            max={MAX_SHELF_CAPACITY}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            aria-label={`Capacity of ${shelf.name}`}
          />
        </label>
        <button type="submit" className="btn_primary" disabled={!isDirty || busy}>
          Save
        </button>
      </form>

      <div className="manage-shelves__actions">
        <span className="manage-shelves__count">
          {itemCount === 0 ? "Empty" : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
        </span>
        <button type="button" aria-label={`Move ${shelf.name} up`} disabled={isFirst || busy} onClick={() => onMove(-1)}>
          <IoArrowUp />
        </button>
        <button type="button" aria-label={`Move ${shelf.name} down`} disabled={isLast || busy} onClick={() => onMove(1)}>
          <IoArrowDown />
        </button>
        <button
          type="button"
          aria-label={`Delete ${shelf.name}`}
          title={itemCount > 0 ? "Move or remove its items first" : "Delete shelf"}
          disabled={itemCount > 0 || busy}
          onClick={() => void run(onDelete)}
        >
          <IoTrashOutline />
        </button>
      </div>

      {error && <ErrorNotice error={error} />}
    </li>
  );
}

export default ShelfRow;
