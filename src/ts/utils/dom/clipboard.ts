/**
 * Clipboard copy helper.
 *
 * @remarks
 * Prefers the Electron clipboard bridge when present, then the async Clipboard
 * API, then a hidden-`<textarea>` + `document.execCommand("copy")`; each tier
 * falls through to the next on failure. Extracted from
 * {@link ../highlight.ts}'s copy button so the modern/fallback branching is
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
  const copyWithExecCommand = () => {
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
      return successful;
    } catch (err) {
      console.error("execCommand fallback failed:", err);
      return false;
    }
  };

  const copyWithBrowserApis = (): Promise<boolean> => {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text)
        .then(() => true)
        .catch(() => copyWithExecCommand());
    }
    return Promise.resolve(copyWithExecCommand());
  };

  const desktopWindow = typeof window !== "undefined"
    ? window as Window & { wordmarkDesktop?: { writeText?: (value: string) => Promise<void> } }
    : undefined;
  const desktopWriteText = desktopWindow?.wordmarkDesktop?.writeText;
  if (desktopWriteText) {
    return desktopWriteText(text)
      .then(() => true)
      .catch(err => {
        console.error("Desktop clipboard failed:", err);
        return copyWithBrowserApis();
      });
  }

  return copyWithBrowserApis();
}
