import { useState, type FormEvent } from "react";

import type { AppError } from "../../../../api/error";
import { DEFAULT_SHELF_CAPACITY, MAX_SHELF_CAPACITY, MIN_SHELF_CAPACITY } from "../../constants";
import type { ActionResult } from "../../hooks/useShelves";
import type { ShelfData } from "../../types";
import { moveId } from "../../utils/reorder";
import ErrorNotice from "./ErrorNotice";
import "./ManageShelves.scss";
import ShelfRow from "./ShelfRow";

interface ManageShelvesProps {
  shelves: ShelfData[];
  onCreate: (name: string, capacity: number) => ActionResult;
  onUpdate: (id: number, name: string, capacity: number) => ActionResult;
  onReorder: (ids: number[]) => ActionResult;
  onDelete: (id: number) => ActionResult;
}

function ManageShelves({ shelves, onCreate, onUpdate, onReorder, onDelete }: ManageShelvesProps) {
  const [newName, setNewName] = useState("");
  const [newCapacity, setNewCapacity] = useState(String(DEFAULT_SHELF_CAPACITY));
  const [createError, setCreateError] = useState<AppError | null>(null);
  const [listError, setListError] = useState<AppError | null>(null);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const error = await onCreate(newName, Number(newCapacity));
    setCreateError(error);
    if (!error) setNewName("");
  };

  const handleMove = async (index: number, delta: -1 | 1) => {
    const ids = moveId(shelves.map((shelf) => shelf.id), index, delta);
    setListError(await onReorder(ids));
  };

  return (
    <section className="manage-shelves">
      <h1>Manage shelves</h1>

      <form className="manage-shelves__new" onSubmit={handleCreate}>
        <label>
          <span>New shelf name</span>
          <input value={newName} maxLength={100} onChange={(event) => setNewName(event.target.value)} />
        </label>
        <label>
          <span>Spaces</span>
          <input
            type="number"
            min={MIN_SHELF_CAPACITY}
            max={MAX_SHELF_CAPACITY}
            value={newCapacity}
            onChange={(event) => setNewCapacity(event.target.value)}
          />
        </label>
        <button type="submit" className="btn_primary">
          Add shelf
        </button>
        {createError && <ErrorNotice error={createError} />}
      </form>

      {listError && <ErrorNotice error={listError} />}

      {shelves.length === 0 ? (
        <p className="manage-shelves__empty">There are no shelves yet. Add one above.</p>
      ) : (
        <ol className="manage-shelves__list">
          {shelves.map((shelf, index) => (
            <ShelfRow
              key={shelf.id}
              shelf={shelf}
              isFirst={index === 0}
              isLast={index === shelves.length - 1}
              onSave={(name, capacity) => onUpdate(shelf.id, name, capacity)}
              onMove={(delta) => void handleMove(index, delta)}
              onDelete={() => onDelete(shelf.id)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

export default ManageShelves;
