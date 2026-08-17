/**
 * Confirmation, alert, and choice dialogs.
 *
 * @remarks
 * These render through the in-app modal in `components/ui/appDialog.ts` rather
 * than `window.confirm`/`window.alert`, which show an unthemed browser popup
 * captioned with the page's origin ("example.com says"), pin it to the top of
 * the viewport, and block the renderer while it is open.
 *
 * The same modal is used in the browser and in the desktop shell, so a
 * confirmation looks identical in both. The `window.*` primitives remain only
 * as a fallback for environments with no DOM, such as the unit tests.
 *
 * Every helper is async — callers must `await` (or `.then`) the result, since
 * the modal resolves only once the user picks a button.
 */

import { canShowAppDialog, showAppDialog } from "../components/ui/appDialog.ts";

/** Buttons and framing for a confirmation dialog. */
export interface ConfirmOptions {
  /** Short question shown as the dialog's primary line. */
  message: string;
  /** Optional secondary line with the consequences. */
  detail?: string;
  /** Label for the affirmative button. Defaults to `"OK"`. */
  confirmLabel?: string;
  /** Label for the dismissive button. Defaults to `"Cancel"`. */
  cancelLabel?: string;
  /** Renders the affirmative button as destructive and defaults focus to Cancel. */
  destructive?: boolean;
}

/**
 * Joins a message and its detail into the single string the web primitives
 * accept, since `window.confirm`/`window.alert` have no detail line.
 */
function flatten(message: string, detail?: string): string {
  return detail ? `${message}\n\n${detail}` : message;
}

/**
 * Asks the user to confirm an action.
 *
 * @param options - The question, or a full {@link ConfirmOptions} describing
 *   the buttons and framing.
 * @returns `true` when the user confirmed, `false` when they cancelled or the
 *   dialog could not be shown.
 */
export async function confirmAction(options: ConfirmOptions | string): Promise<boolean> {
  const opts: ConfirmOptions = typeof options === "string" ? { message: options } : options;
  const confirmLabel = opts.confirmLabel || "OK";
  const cancelLabel = opts.cancelLabel || "Cancel";

  if (canShowAppDialog()) {
    return showAppDialog({
      message: opts.message,
      detail: opts.detail,
      buttons: [
        { label: cancelLabel, value: false },
        { label: confirmLabel, value: true, primary: !opts.destructive, destructive: opts.destructive },
      ],
      cancelValue: false,
    });
  }

  // No DOM (unit tests, SSR): fall back to the platform primitive.
  if (typeof window === "undefined" || typeof window.confirm !== "function") {
    return false;
  }
  return window.confirm(flatten(opts.message, opts.detail));
}

/**
 * Shows a message the user only has to acknowledge.
 *
 * @param message - The primary line.
 * @param detail - Optional secondary line.
 * @param type - Retained for call-site intent; the modal renders one style.
 */
export async function alertMessage(
  message: string,
  detail?: string,
  _type: "info" | "error" | "warning" = "info",
): Promise<void> {
  if (canShowAppDialog()) {
    await showAppDialog({
      message,
      detail,
      buttons: [{ label: "OK", value: true, primary: true }],
      cancelValue: true,
    });
    return;
  }

  if (typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(flatten(message, detail));
  }
}

/**
 * A confirmation for an irreversible, wide-reaching action.
 *
 * @remarks
 * These were historically gated behind a "type YES to confirm"
 * `window.prompt`. The modal has no text field, so the equivalent friction
 * comes from an explicit, named destructive button (e.g. "Delete all files")
 * rather than a generic "OK" — the user has to read what they are agreeing to.
 * The typed confirmation survives only in the no-DOM fallback.
 *
 * @param options - `message`/`detail` as usual, plus the destructive button's
 *   label and the word the web fallback asks the user to type.
 * @returns `true` when the user confirmed.
 */
export async function confirmDestructive(options: {
  message: string;
  detail?: string;
  confirmLabel: string;
  /** Word the browser fallback requires the user to type. Defaults to `"YES"`. */
  typedWord?: string;
}): Promise<boolean> {
  if (canShowAppDialog()) {
    return confirmAction({
      message: options.message,
      detail: options.detail,
      confirmLabel: options.confirmLabel,
      destructive: true,
    });
  }

  const word = options.typedWord || "YES";
  if (typeof window === "undefined" || typeof window.prompt !== "function") {
    return false;
  }
  const typed = window.prompt(`${flatten(options.message, options.detail)}\n\nType '${word}' to confirm:`);
  return typed === word;
}
