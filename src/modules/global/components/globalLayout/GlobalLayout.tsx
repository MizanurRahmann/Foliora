import { useState } from "react";
import "./GlobalLayout.scss";

import ManageShelves from "../../../shelf/components/manageShelves/ManageShelves";
import Shelf from "../../../shelf/components/shelf/Shelf";
import { useShelves } from "../../../shelf/hooks/useShelves";
import SideMenu, { type View } from "../menu/SideMenu";

function GlobalLayout() {
  const [view, setView] = useState<View>("home");
  const { shelves, status, loadError, reload, create, update, reorder, remove } = useShelves();

  const renderContent = () => {
    if (status === "loading") return <p className="global-layout__message">Loading your shelves…</p>;

    if (status === "error") {
      return (
        <div className="global-layout__message" role="alert">
          <p>Could not load your shelves: {loadError?.message}</p>
          <button type="button" className="btn_primary" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      );
    }

    if (view === "shelves") {
      return (
        <ManageShelves
          shelves={shelves}
          onCreate={create}
          onUpdate={update}
          onReorder={reorder}
          onDelete={remove}
        />
      );
    }

    if (shelves.length === 0) {
      return (
        <div className="global-layout__message">
          <p>You have no shelves yet.</p>
          <button type="button" className="btn_primary" onClick={() => setView("shelves")}>
            Manage shelves
          </button>
        </div>
      );
    }

    return shelves.map((shelf) => <Shelf key={shelf.id} shelf={shelf} />);
  };

  return (
    <section className="global-layout">
      <nav className="global-layout__side-menu">
        <SideMenu view={view} onNavigate={setView} />
      </nav>

      <div className="global-layout__inner">
        <div className="global-layout__bookshelf">
          {renderContent()}
        </div>
      </div>
    </section>
  );
}

export default GlobalLayout;
