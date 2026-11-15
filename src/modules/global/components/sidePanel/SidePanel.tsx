import { useEffect, type ReactNode } from "react";
import { IoClose } from "react-icons/io5";
import "./SidePanel.scss";

interface SidePanelProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

function SidePanel({ isOpen, title, onClose, children, footer }: SidePanelProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div className={`side-panel${isOpen ? " side-panel--open" : ""}`} aria-hidden={!isOpen}>
      <div className="side-panel__backdrop" onClick={onClose} />
      <aside className="side-panel__drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="side-panel__header">
          <h2 className="side-panel__title">
            {title}
          </h2>

          <button type="button" className="side-panel__close" aria-label="Close" onClick={onClose}>
            <IoClose />
          </button>
        </header>
        <div className="side-panel__body">{children}</div>
        {footer && <footer className="side-panel__footer">{footer}</footer>}
      </aside>
    </div>
  );
}

export default SidePanel;
