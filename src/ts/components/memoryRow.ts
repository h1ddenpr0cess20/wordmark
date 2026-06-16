/**
 * Saved-memory list row construction.
 *
 * @remarks
 * Builds a single row (memory text + delete button) for the memory settings
 * list. Extracted from {@link ./memory.ts} so the row's structure and the
 * delete-button wiring are testable in isolation; the deletion side effect is
 * injected via {@link MemoryRowHandlers.onDelete}.
 */

/** Callbacks for a memory row's interactive controls. */
export interface MemoryRowHandlers {
  /** Invoked with the row's index when its delete button is clicked. */
  onDelete: (index: number) => void;
}

/**
 * Creates a memory list row element.
 *
 * @param memory - The memory text to display.
 * @param index - Zero-based position, used for the delete handler and the
 * delete button's `aria-label` (shown as `index + 1`).
 * @param handlers - Row callbacks; `onDelete` runs after the click event's
 * propagation/default are suppressed.
 * @returns The constructed row element.
 */
export function createMemoryRow(memory: string, index: number, handlers: MemoryRowHandlers): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "memory-row";
  const text = document.createElement("span");
  text.className = "memory-text";
  text.textContent = memory;
  const del = document.createElement("button");
  del.type = "button";
  del.className = "tool-action-button";
  del.setAttribute("aria-label", `Delete memory ${index + 1}`);
  del.textContent = "Delete";
  del.addEventListener("click", (e) => {
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    handlers.onDelete(index);
  });
  row.appendChild(text);
  row.appendChild(del);
  return row;
}
