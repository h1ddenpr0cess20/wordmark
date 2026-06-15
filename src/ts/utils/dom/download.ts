/**
 * Anchor-based file download helper.
 *
 * @remarks
 * Synthesises a hidden `<a download>` click — the standard way to save a blob,
 * object, or data URL to the user's device from the browser. Extracted from the
 * several call sites (chat export, code-interpreter attachments, TTS/audio
 * downloads, generated media) that each open-coded the same
 * create/append/click/remove dance, so the DOM choreography lives in one place.
 *
 * Callers that pass an object URL created with {@link URL.createObjectURL}
 * remain responsible for revoking it, since the appropriate timing varies.
 */

/**
 * Triggers a browser download of `href` with the suggested `filename` by
 * appending an anchor, clicking it, and removing it again.
 *
 * @param href - The blob/object/data URL (or remote URL) to download.
 * @param filename - The suggested filename for the saved file.
 */
export function triggerAnchorDownload(href: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
