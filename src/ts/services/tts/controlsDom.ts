/**
 * Shared DOM helpers for per-message TTS controls.
 *
 * @remarks
 * Small leaf helpers used by {@link ./controls.ts} to remove any pre-existing
 * controls before re-rendering and to attach a freshly built controls container
 * to a message's content area (falling back to the message element itself).
 */

/** Removes any existing `.tts-controls` from a message element, ignoring errors. */
export function removeExistingTtsControls(messageElement: Element) {
  const existingControls = messageElement.querySelector(".tts-controls");
  if (existingControls) {
    try {
      existingControls.remove();
    } catch (error) {
      console.error("Error removing existing TTS controls:", error);
    }
  }
}

/** Appends a controls container to a message's `.message-content`, or the element itself. */
export function attachTtsControls(messageElement: Element, controlsContainer: HTMLElement) {
  const contentElement = messageElement.querySelector(".message-content");
  if (contentElement) {
    contentElement.appendChild(controlsContainer);
  } else {
    messageElement.appendChild(controlsContainer);
  }
}
