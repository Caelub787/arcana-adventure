export const SIDEBAR_NODE_MIME = "application/x-reborn-node";
export const SIDEBAR_SELECTION_MIME = "application/x-reborn-selection";

export type SidebarDragPayload = { nodeId: string };

export function setSidebarNodeDrag(e: React.DragEvent, payload: SidebarDragPayload) {
  e.dataTransfer.setData(SIDEBAR_NODE_MIME, JSON.stringify(payload));
  e.dataTransfer.setData("text/plain", payload.nodeId);
  e.dataTransfer.effectAllowed = "copyMove";
}

export function getSidebarNodeDrag(e: React.DragEvent): SidebarDragPayload | null {
  const raw = e.dataTransfer.getData(SIDEBAR_NODE_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SidebarDragPayload;
  } catch {
    return null;
  }
}

export function hasSidebarNodeDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(SIDEBAR_NODE_MIME);
}

export function setSidebarSelectionDrag(e: React.DragEvent) {
  e.dataTransfer.setData(SIDEBAR_SELECTION_MIME, "1");
  e.dataTransfer.setData("text/plain", "selection");
  e.dataTransfer.effectAllowed = "move";
}

export function hasSidebarSelectionDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(SIDEBAR_SELECTION_MIME);
}
