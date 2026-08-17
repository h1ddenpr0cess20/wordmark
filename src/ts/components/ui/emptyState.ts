/**
 * The transcript's empty state.
 *
 * @remarks
 * Shown whenever the chat box holds no messages: the mark, a one-line reminder
 * that everything stays on this machine, and a few starter prompts that drop
 * into the composer. It is removed as soon as the first message is appended and
 * re-rendered whenever the transcript is cleared, so nothing else has to track
 * whether the conversation is empty.
 */

import { elements } from "../../init/state.ts";
import { uiHooks } from "../../init/uiHooks.ts";
import { renderWordmarkLogo } from "../logo.ts";

/**
 * Starter prompts.
 *
 * @remarks
 * Each one has to stand on its own: the chips only prefill the composer, so a
 * prompt that points at context the conversation does not have ("this code",
 * "the document I attach") sends the model a request it cannot answer. These
 * are complete questions that work verbatim, short enough to fit a chip.
 */
const SUGGESTIONS = [
  "Explain how HTTPS keeps a page secure",
  "Write a polite email to reschedule a meeting",
  "Plan a 3-day itinerary for Kyoto",
];

/** Collapsed height of the composer, matching its auto-grow floor. */
const COMPOSER_MIN_HEIGHT = 56;

/**
 * Prefills the composer with a starter prompt and leaves it ready to send.
 *
 * @remarks
 * Deliberately does not send: a chip is a starting point the user is expected
 * to edit, so the caret is placed at the end of the text instead. The composer
 * grows with its content from an `input` listener
 * (`initializeConversationInput`); that listener is dispatched to for anything
 * else that watches the field, but the height is also set here so the box
 * visibly grows even if the listener has not been wired yet.
 *
 * @param text - The suggestion to drop into the composer.
 */
function useSuggestion(text: string) {
  const input = elements.userInput;
  if (!input) {
    return;
  }

  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));

  input.style.height = `${COMPOSER_MIN_HEIGHT}px`;
  input.style.height = `${Math.max(COMPOSER_MIN_HEIGHT, input.scrollHeight)}px`;

  input.focus();
  input.setSelectionRange(text.length, text.length);
  input.scrollTop = input.scrollHeight;
}

/** Whether the chat box currently holds at least one message. */
function hasMessages(chatBox: HTMLElement): boolean {
  return Boolean(chatBox.querySelector(".message"));
}

/** Removes the empty state, if it is showing. */
export function hideEmptyState() {
  elements.chatBox?.querySelector(".chat-empty-state")?.remove();
}

/**
 * Renders the empty state into the chat box when the transcript has no
 * messages, and removes it when it does. Safe to call repeatedly.
 */
export function refreshEmptyState() {
  const chatBox = elements.chatBox;
  if (!chatBox) {
    return;
  }

  const existing = chatBox.querySelector(".chat-empty-state");
  if (hasMessages(chatBox)) {
    existing?.remove();
    return;
  }
  if (existing) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "chat-empty-state";

  const mark = document.createElement("div");
  mark.className = "chat-empty-mark";
  mark.innerHTML = `
    <svg width="56" height="56" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <g stroke="var(--accent-color)" stroke-width="1"></g>
    </svg>
  `;
  renderWordmarkLogo(mark.querySelector("g"));

  const blurb = document.createElement("p");
  blurb.className = "chat-empty-blurb";
  blurb.textContent = "Everything stays on this machine. Ask something, or try one of these.";

  const chips = document.createElement("div");
  chips.className = "chat-empty-suggestions";
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "Starter prompts");
  SUGGESTIONS.forEach((text) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chat-empty-suggestion";
    chip.textContent = text;
    chip.title = `Put "${text}" in the message box`;
    chip.addEventListener("click", () => useSuggestion(text));
    chips.appendChild(chip);
  });

  wrapper.appendChild(mark);
  wrapper.appendChild(blurb);
  wrapper.appendChild(chips);
  chatBox.appendChild(wrapper);
}

uiHooks.refreshEmptyState = refreshEmptyState;
