/**
 * Confirmation, alert, and choice dialogs.
 *
 * @remarks
 * In the desktop app these are real native message boxes, driven over the
 * `wordmarkDesktop` preload bridge (`electron/preload.cjs` →
 * `dialog:message-box` in `electron/main.cjs`). A native box is window-modal
 * rather than page-modal, so it is themed by the OS, cannot be suppressed by
 * the "prevent this page from creating additional dialogs" checkbox, and does
 * not freeze the renderer the way `window.confirm` does.
 *
 * In a plain browser the bridge is absent and each helper falls back to the
 * matching `window.*` primitive, so behavior is unchanged on the web build.
 *
 * Every helper is async — callers must `await` (or `.then`) the result even
 * though the web fallback resolves synchronously, because the desktop path
 * genuinely round-trips through IPC.
 */

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

/** The desktop bridge's message-box request shape. */
interface NativeMessageBoxRequest {
  type: "none" | "info" | "error" | "question" | "warning";
  message: string;
  detail?: string;
  buttons: string[];
  defaultId: number;
  cancelId: number;
}

/**
 * The desktop bridge, when running inside Electron.
 *
 * @remarks
 * Read lazily on each call rather than cached at module load, because this
 * module is imported before the preload script has necessarily run in some
 * bundling orders.
 */
type MessageBoxFn = (options: NativeMessageBoxRequest) => Promise<{ response: number }>;

function desktopBridge(): MessageBoxFn | null {
  if (typeof window === "undefined") {
    return null;
  }
  // Read through a local cast rather than the ambient Window augmentation in
  // components/desktopTitlebar.ts: the tests tsconfig does not pull that module
  // in, so relying on it breaks `npm run typecheck:tests`.
  const bridge = (window as { wordmarkDesktop?: { showMessageBox?: MessageBoxFn } }).wordmarkDesktop;
  const showMessageBox = bridge?.showMessageBox;
  return typeof showMessageBox === "function" ? showMessageBox : null;
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

  const showMessageBox = desktopBridge();
  if (showMessageBox) {
    try {
      // Cancel is listed first so it takes index 0; a native box dismissed with
      // Esc or the window close button reports cancelId, which must not be the
      // destructive action.
      const response = await showMessageBox({
        type: opts.destructive ? "warning" : "question",
        message: opts.message,
        detail: opts.detail,
        buttons: [cancelLabel, confirmLabel],
        defaultId: opts.destructive ? 0 : 1,
        cancelId: 0,
      });
      return response?.response === 1;
    } catch (error) {
      console.error("Native confirm failed, falling back to window.confirm:", error);
    }
  }

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
 * @param type - Visual tone of the native box; ignored on the web.
 */
export async function alertMessage(
  message: string,
  detail?: string,
  type: "info" | "error" | "warning" = "info",
): Promise<void> {
  const showMessageBox = desktopBridge();
  if (showMessageBox) {
    try {
      await showMessageBox({
        type,
        message,
        detail,
        buttons: ["OK"],
        defaultId: 0,
        cancelId: 0,
      });
      return;
    } catch (error) {
      console.error("Native alert failed, falling back to window.alert:", error);
    }
  }

  if (typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(flatten(message, detail));
  }
}

/**
 * A confirmation for an irreversible, wide-reaching action.
 *
 * @remarks
 * The web build historically gated these behind a "type YES to confirm"
 * `window.prompt`. A native message box has no text field, so the equivalent
 * friction comes from an explicit, named destructive button (e.g. "Delete all
 * files") rather than a generic "OK" — the user has to read what they are
 * agreeing to. On the web this still falls back to the typed confirmation.
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
  if (desktopBridge()) {
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
