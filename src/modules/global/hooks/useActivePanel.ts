import { useCallback, useState } from "react";

// Tracks which single side panel is open, so any module can register its own panel id.
export function useActivePanel<T extends string>() {
  const [activePanel, setActivePanel] = useState<T | null>(null);

  const openPanel = useCallback((panel: T) => setActivePanel(panel), []);
  const closePanel = useCallback(() => setActivePanel(null), []);

  return { activePanel, openPanel, closePanel };
}
