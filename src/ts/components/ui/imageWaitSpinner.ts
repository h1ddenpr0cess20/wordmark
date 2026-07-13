/**
 * Loading indicator shown inside an assistant message while a generated image
 * is pending.
 *
 * @remarks
 * The initial loading-dots placeholder is removed as soon as any reasoning or
 * text renders, so without this an image generation — the provider-managed
 * `image_generation` tool mid-stream, or a client-side image function tool
 * executing between streams — leaves the message with no activity indicator
 * for the duration of the wait.
 */

const SPINNER_CLASS = "image-wait-spinner";

const SPINNER_HTML =
  `<div class="loading-animation ${SPINNER_CLASS}"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>`;

/** Appends the pending-image spinner to the message's content wrapper (idempotent). */
export function showImageWaitSpinner(messageElement: HTMLElement | null) {
  const wrapper = messageElement?.querySelector<HTMLElement>(".message-content");
  if (!wrapper || wrapper.querySelector(`.${SPINNER_CLASS}`)) {
    return;
  }
  wrapper.insertAdjacentHTML("beforeend", SPINNER_HTML);
}

/** Removes any pending-image spinner from the message. */
export function hideImageWaitSpinner(messageElement: HTMLElement | null) {
  if (!messageElement) {
    return;
  }
  messageElement.querySelectorAll(`.${SPINNER_CLASS}`).forEach(el => el.remove());
}

/** Shows the pending-image spinner on the message with the given DOM id. */
export function showImageWaitSpinnerById(messageId: string) {
  if (!messageId) {
    return;
  }
  showImageWaitSpinner(document.getElementById(messageId));
}

/** Hides the pending-image spinner on the message with the given DOM id. */
export function hideImageWaitSpinnerById(messageId: string) {
  if (!messageId) {
    return;
  }
  hideImageWaitSpinner(document.getElementById(messageId));
}
