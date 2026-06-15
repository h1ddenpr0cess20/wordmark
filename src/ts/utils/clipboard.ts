/**
 * Clipboard copy helper.
 *
 * @remarks
 * Prefers the async Clipboard API and falls back to a hidden-`<textarea>` +
 * `document.execCommand("copy")` for browsers without it. Extracted from
 * {@link ./highlight.ts}'s copy button so the modern/fallback branching is
 * reusable and testable in isolation.
 */

/**
 * Copies text to the clipboard, resolving to whether the copy succeeded.
 *
 * @remarks
 * Never rejects: Clipboard API failures and `execCommand` errors are caught and
 * reported as `false` so callers can branch on the result.
 *
 * @param text - The text to copy.
 * @returns `true` when the copy succeeded, `false` otherwise.
 */
export function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text)
      .then(() => true)
      .catch(err => {
        console.error("Clipboard API failed:", err);
        return false;
      });
  } else {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      return Promise.resolve(successful);
    } catch (err) {
      console.error("execCommand fallback failed:", err);
      return Promise.resolve(false);
    }
  }
}
