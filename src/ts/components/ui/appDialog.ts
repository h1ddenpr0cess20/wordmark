/**
 * The in-app confirmation / alert modal.
 *
 * @remarks
 * `window.confirm` and `window.alert` render an unthemed browser popup pinned
 * to the top of the viewport and block the renderer while open. This builds an
 * ordinary DOM overlay instead, so confirmations look like the rest of the app
 * and inherit the active theme.
 *
 * Styling lives in `src/css/components/ui/controls/confirm-dialog.css`; this
 * module only manages the DOM and the promise that resolves when the user
 * picks a button.
 *
 * Only one dialog is shown at a time — opening a second one while the first is
 * still up dismisses the first as cancelled, so a stray caller cannot strand an
 * overlay on screen with no way to dismiss it.
 */

/** One button in the dialog's action row. */
export interface AppDialogButton {
  label: string;
  /** The value {@link showAppDialog} resolves to when this button is chosen. */
  value: boolean;
  /** Renders as the filled primary button and takes initial focus. */
  primary?: boolean;
  /** Renders in the error color, for the affirmative half of a destructive confirm. */
  destructive?: boolean;
}

/** Everything needed to render one dialog. */
export interface AppDialogOptions {
  message: string;
  detail?: string;
  buttons: AppDialogButton[];
  /** Value resolved when the user presses Escape, or clicks outside the dialog. */
  cancelValue: boolean;
}

/** Dismisses whatever dialog is currently open, if any. */
let closeActiveDialog: (() => void) | null = null;

/** Whether a DOM capable of hosting the overlay is available. */
export function canShowAppDialog(): boolean {
  return typeof document !== "undefined" && Boolean(document.body);
}

/**
 * Shows a modal dialog and resolves with the chosen button's value.
 *
 * @remarks
 * Traps Tab within the dialog while it is open, restores focus to whatever was
 * focused before, and locks body scrolling — the same contract the media viewer
 * uses. Escape and a click on the backdrop both resolve to `cancelValue`.
 *
 * @param options - The message, buttons, and cancel value.
 * @returns The chosen button's `value`.
 */
export function showAppDialog(options: AppDialogOptions): Promise<boolean> {
  if (!canShowAppDialog()) {
    return Promise.resolve(options.cancelValue);
  }

  closeActiveDialog?.();

  return new Promise<boolean>((resolve) => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousBodyOverflow = document.body.style.overflow;

    const backdrop = document.createElement("div");
    backdrop.className = "app-dialog-backdrop";

    const dialog = document.createElement("div");
    dialog.className = "app-dialog";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");

    const messageEl = document.createElement("p");
    messageEl.className = "app-dialog-message";
    messageEl.textContent = options.message;
    dialog.appendChild(messageEl);

    // textContent throughout: messages carry user-controlled text such as
    // conversation titles and filenames, which must never be parsed as markup.
    const messageId = `app-dialog-message-${Date.now()}`;
    messageEl.id = messageId;
    dialog.setAttribute("aria-labelledby", messageId);

    if (options.detail) {
      const detailEl = document.createElement("p");
      detailEl.className = "app-dialog-detail";
      detailEl.textContent = options.detail;
      detailEl.id = `${messageId}-detail`;
      dialog.appendChild(detailEl);
      dialog.setAttribute("aria-describedby", detailEl.id);
    }

    const actions = document.createElement("div");
    actions.className = "app-dialog-actions";

    let settled = false;
    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      document.removeEventListener("keydown", handleKeydown, true);
      if (closeActiveDialog === cancel) {
        closeActiveDialog = null;
      }
      backdrop.remove();
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
      resolve(value);
    };

    const cancel = () => finish(options.cancelValue);

    let focusTarget: HTMLButtonElement | null = null;
    const buttonEls: HTMLButtonElement[] = [];

    options.buttons.forEach((spec) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "app-dialog-button";
      if (spec.destructive) {
        button.classList.add("is-destructive");
      } else if (spec.primary) {
        button.classList.add("is-primary");
      }
      button.textContent = spec.label;
      button.addEventListener("click", () => finish(spec.value));
      actions.appendChild(button);
      buttonEls.push(button);
      if (spec.primary || spec.destructive) {
        focusTarget = button;
      }
    });

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        return;
      }
      if (event.key !== "Tab" || buttonEls.length === 0) {
        return;
      }
      // Keep Tab inside the dialog; without this, focus walks into the page
      // behind an overlay that claims aria-modal.
      const first = buttonEls[0];
      const last = buttonEls[buttonEls.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.appendChild(actions);
    backdrop.appendChild(dialog);

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        cancel();
      }
    });

    document.addEventListener("keydown", handleKeydown, true);
    document.body.appendChild(backdrop);
    document.body.style.overflow = "hidden";
    closeActiveDialog = cancel;

    (focusTarget || buttonEls[0])?.focus({ preventScroll: true });
  });
}
