/**
 * Transient inline status notes for the settings UI.
 *
 * @remarks
 * A small toast-like helper: removes any prior note sharing the same status
 * class, inserts a fresh `<div>` immediately after a resolved anchor, and
 * auto-removes it after a timeout. Several settings panels (API keys, local
 * server URLs, model refresh) showed the same pattern inline; this centralizes
 * it so the markup, lifetime, and anchor-fallback logic live in one place.
 */

/**
 * Shows a transient status note anchored beneath a settings control.
 *
 * @param statusClass - CSS class identifying this note family; any existing
 * element with this class is removed first so notes don't stack.
 * @param anchorSelector - Selector (or ordered list of selectors) for the
 * element the note is inserted after; the first match wins. When nothing
 * matches, no note is shown (but the existing one is still cleared).
 * @param message - Text content of the note.
 * @param type - Status tone appended as a second class, e.g. `"success"` or
 * `"error"`.
 * @param timeoutMs - How long the note stays before auto-removal.
 */
export function showInlineStatus(
  statusClass: string,
  anchorSelector: string | string[],
  message: string,
  type: string = "success",
  timeoutMs: number = 5000,
): void {
  const existing = document.querySelector(`.${statusClass}`) as HTMLElement | null;
  if (existing) {
    existing.remove();
  }

  const statusElement = document.createElement("div");
  statusElement.className = `${statusClass} ${type}`;
  statusElement.textContent = message;

  const selectors = Array.isArray(anchorSelector) ? anchorSelector : [anchorSelector];
  let anchor: HTMLElement | null = null;
  for (const selector of selectors) {
    anchor = document.querySelector(selector) as HTMLElement | null;
    if (anchor) {
      break;
    }
  }

  if (anchor) {
    anchor.insertAdjacentElement("afterend", statusElement);
    setTimeout(() => {
      statusElement.remove();
    }, timeoutMs);
  }
}
