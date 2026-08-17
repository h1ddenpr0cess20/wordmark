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

const SUGGESTIONS = [
  "Explain what this code does",
  "Summarize a document I attach",
  "Draft a reply to this email",
];

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
  SUGGESTIONS.forEach((text) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chat-empty-suggestion";
    chip.textContent = text;
    chip.addEventListener("click", () => {
      const input = elements.userInput;
      if (!input) {
        return;
      }
      input.value = text;
      input.focus();
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    chips.appendChild(chip);
  });

  wrapper.appendChild(mark);
  wrapper.appendChild(blurb);
  wrapper.appendChild(chips);
  chatBox.appendChild(wrapper);
}

uiHooks.refreshEmptyState = refreshEmptyState;
