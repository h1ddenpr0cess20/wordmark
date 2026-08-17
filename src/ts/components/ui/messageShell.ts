/**
 * Shared DOM shell for chat messages.
 *
 * @remarks
 * Every message in the transcript is built here so the three entry points that
 * create them — live send (`chatMessages.ts`), streaming
 * (`services/streaming/messageLifecycle.ts`) and history replay
 * (`services/history/render.ts`) — cannot drift apart.
 *
 * User turns are a right-aligned bubble with a trailing action row. Assistant
 * turns are unbubbled prose under a meta row carrying the mark, the `WORDMARK`
 * label, the model line and the per-message actions.
 */

import { elements, state } from "../../init/state.ts";
import { isSelectableModelId } from "../../services/api/clientConfig.ts";
import { renderWordmarkLogo } from "../logo.ts";

/** The parts of a message shell callers need to populate or decorate. */
export interface MessageShell {
  /** The `.message` root. */
  messageElement: HTMLElement;
  /** The `.message-content` wrapper that receives rendered markdown. */
  contentElement: HTMLElement;
  /** The `.message-actions` row that per-message buttons are appended to. */
  actionsElement: HTMLElement;
}

/**
 * The model line shown in an assistant meta row.
 *
 * @param model - Explicit model id (history replay passes the stored one);
 *   falls back to the last model actually used, then to the selector.
 * @returns The model's short name, or an empty string when none is resolvable.
 */
export function assistantMetaText(model?: string | null): string {
  const candidate = model
    || state.lastUsedModel
    || (isSelectableModelId(elements.modelSelector?.value) ? elements.modelSelector?.value : "");
  if (!candidate) {
    return "";
  }
  return candidate.split("/").pop() || candidate;
}

/**
 * Sets the model line in an assistant message's meta row, creating the
 * `.message-meta-info` span if the message was built before any model was
 * resolvable (or removing it if there is nothing to show).
 *
 * @remarks
 * Callers that already know which model a turn is about to use (send, retry,
 * regenerate) should call this immediately when the turn starts rather than
 * waiting for {@link assistantMetaText}'s `state.lastUsedModel` fallback to
 * catch up once the response finishes — otherwise the line shows the
 * *previous* turn's model for the entire generation.
 *
 * @param messageElement - The `.message` root.
 * @param model - Explicit model id; omitted falls back to {@link assistantMetaText}'s default chain.
 */
export function setAssistantMetaText(messageElement: HTMLElement, model?: string | null): void {
  const meta = messageElement.querySelector<HTMLElement>(".message-meta");
  if (!meta) {
    return;
  }
  const metaText = assistantMetaText(model);
  let info = meta.querySelector<HTMLElement>(".message-meta-info");
  if (!metaText) {
    info?.remove();
    return;
  }
  if (!info) {
    info = document.createElement("span");
    info.className = "message-meta-info";
    meta.insertBefore(info, meta.querySelector(".message-actions"));
  }
  info.textContent = metaText;
  info.title = metaText;
}

/** Renders the circled-W mark into a fresh SVG element. */
function assistantMark(): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "message-sender";
  wrapper.innerHTML = `
    <svg class="sender-icon assistant-icon" width="22" height="22" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g stroke="var(--accent-color)" stroke-width="1"></g>
    </svg>
  `;
  renderWordmarkLogo(wrapper.querySelector("g"));
  return wrapper;
}

/**
 * Builds a message element in the shell's current form.
 *
 * @param sender - Display label for the author (`"You"`, `"Assistant"`, or a
 *   custom label rendered verbatim in the meta row).
 * @param type - CSS type class (e.g. `"user"`, `"assistant"`, `"error"`).
 * @param options - `meta` overrides the assistant model line.
 * @returns The message root plus its content and action containers.
 */
export function createMessageShell(
  sender: string,
  type: string,
  options: { meta?: string | null } = {},
): MessageShell {
  const messageElement = document.createElement("div");
  messageElement.classList.add("message");
  if (type) {
    messageElement.classList.add(type);
  }

  const contentElement = document.createElement("div");
  contentElement.className = "message-content";

  const actionsElement = document.createElement("div");
  actionsElement.className = "message-actions";

  if (sender === "You") {
    messageElement.appendChild(contentElement);
    messageElement.appendChild(actionsElement);
    return { messageElement, contentElement, actionsElement };
  }

  const meta = document.createElement("div");
  meta.className = "message-meta";

  if (sender === "Assistant") {
    meta.appendChild(assistantMark());
  }

  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = sender === "Assistant" ? "Wordmark" : sender;
  meta.appendChild(label);

  const metaText = options.meta === undefined ? assistantMetaText() : options.meta;
  if (metaText) {
    const info = document.createElement("span");
    info.className = "message-meta-info";
    info.textContent = metaText;
    info.title = metaText;
    meta.appendChild(info);
  }

  meta.appendChild(actionsElement);
  messageElement.appendChild(meta);
  messageElement.appendChild(contentElement);
  return { messageElement, contentElement, actionsElement };
}

/**
 * Where a per-message control (copy, regenerate, branch, retry) should be
 * appended.
 *
 * @param messageElement - The `.message` root.
 * @returns The message's action row, or the root itself for messages built
 *   before the action row existed.
 */
export function messageActionHost(messageElement: HTMLElement): HTMLElement {
  return messageElement.querySelector<HTMLElement>(".message-actions") ?? messageElement;
}
