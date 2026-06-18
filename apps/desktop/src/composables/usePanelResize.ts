import { ref, type Ref } from "vue";
import { safeLocalStorageGetWithLegacy, safeLocalStorageSet } from "@/lib/safeStorage";

export function usePanelResize() {
  const sidebarWidth = ref(Number(safeLocalStorageGetWithLegacy("task-sidebar-width", "dbx-sidebar-width")) || 260);
  const aiPanelWidth = ref(Number(safeLocalStorageGetWithLegacy("task-ai-panel-width", "dbx-ai-panel-width")) || 360);
  const historyWidth = ref(Number(safeLocalStorageGetWithLegacy("task-history-width", "dbx-history-width")) || 288);
  const sqlLibraryWidth = ref(Number(safeLocalStorageGetWithLegacy("task-sql-library-width", "dbx-sql-library-width")) || 288);

  function startPanelResize(widthRef: Ref<number>, storageKey: string, direction: "left" | "right") {
    return (e: MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.value;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        widthRef.value = Math.max(180, Math.min(800, startWidth + (direction === "right" ? delta : -delta)));
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        safeLocalStorageSet(storageKey, String(widthRef.value));
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };
  }

  const startSidebarResize = startPanelResize(sidebarWidth, "task-sidebar-width", "right");
  const startAiPanelResize = startPanelResize(aiPanelWidth, "task-ai-panel-width", "left");
  const startHistoryResize = startPanelResize(historyWidth, "task-history-width", "left");
  const startSqlLibraryResize = startPanelResize(sqlLibraryWidth, "task-sql-library-width", "left");

  return {
    sidebarWidth,
    aiPanelWidth,
    historyWidth,
    sqlLibraryWidth,
    startSidebarResize,
    startAiPanelResize,
    startHistoryResize,
    startSqlLibraryResize,
  };
}
