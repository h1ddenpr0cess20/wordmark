/**
 * Assistant message controls: regenerate button and response-version cycling.
 */

import { elements, state } from "../init/state.ts";
import { icon } from "../utils/icons.ts";
import { createScopedLogger } from "../utils/logger.ts";
import { showError, showInfo } from "../utils/notifications.ts";
import { responsesClient } from "../services/api.ts";
import { updateBrowserHistory } from "../services/history/state.ts";
import { saveCurrentConversation } from "../services/history/persistence.ts";
import { getVerbosity, getReasoningEffort, getHistoryTokenBudget } from "../init/modelSettings.ts";
import { sendMessage, stopGeneration, resetSendButton } from "./interaction.ts";
import { finalizeStreamedResponse, updateMessageContent } from "../services/streaming/messageLifecycle.ts";
import { renderChatHistoryList } from "../services/history/list.ts";
import { updateHeaderInfo } from "./settings.ts";
import { applyVariant, ensureVariants } from "./messageVariants.ts";
import type { Message } from "../../types/api.ts";

const logRegen = createScopedLogger("regenerate");

const LOADING_HTML =
  "<div class=\"loading-animation\"><div class=\"loading-dot\"></div><div class=\"loading-dot\"></div><div class=\"loading-dot\"></div></div>";

const variantImages = new Map<string, (string[] | undefined)[]>();

/**
 * Stores the rendered image-HTML snapshot for a given message/variant index in
 * the runtime-only image map (kept off the persisted history to avoid bloat).
 */
function setVariantImages(messageId: string, index: number, images: string[] | undefined): void {
  let list = variantImages.get(messageId);
  if (!list) {
    list = [];
    variantImages.set(messageId, list);
  }
  list[index] = images && images.length > 0 ? [...images] : undefined;
}

/** Returns the stored image-HTML snapshot for a message/variant index, if any. */
function getVariantImages(messageId: string, index: number): string[] | undefined {
  return variantImages.get(messageId)?.[index];
}

/** Returns a copy of the currently rendered image HTML for a message, if any. */
function currentMessageImages(messageId: string): string[] | undefined {
  return state.messageImages && state.messageImages[messageId]
    ? [...state.messageImages[messageId]]
    : undefined;
}

/** Finds the assistant history entry with the given id, or `null`. */
function findAssistantEntry(messageId: string): Message | null {
  if (!Array.isArray(state.conversationHistory)) {
    return null;
  }
  return state.conversationHistory.find(
    (msg) => msg.id === messageId && msg.role === "assistant",
  ) || null;
}

/**
 * Seeds an entry's variant list if needed, also snapshotting the images that
 * belong to the original (variant 0) so version-switching can restore them.
 */
function ensureVariantsWithImages(entry: Message): void {
  if (ensureVariants(entry) && entry.id) {
    setVariantImages(entry.id, 0, currentMessageImages(entry.id));
  }
}

/** Stores the rendered image HTML for the entry's active variant. */
export function captureVariantImages(entry: Message): void {
  if (!entry.id || !Array.isArray(entry.variants)) {
    return;
  }
  const index = entry.activeVariant ?? entry.variants.length - 1;
  setVariantImages(entry.id, index, currentMessageImages(entry.id));
}

/** True when the message belongs to a party-mode conversation/turn. */
function isPartyMessage(messageElement: HTMLElement): boolean {
  return Boolean(state.partyMode) || Boolean(messageElement.querySelector(".party-name"));
}

/** True when `messageId` is the last entry in the conversation history. */
function isLastMessage(messageId: string): boolean {
  const history = state.conversationHistory;
  return Array.isArray(history)
    && history.length > 0
    && history[history.length - 1]?.id === messageId;
}

/**
 * Removes the regenerate control from every message except the most recent one.
 * Only the last message in the conversation may be regenerated, since
 * regenerating an earlier message would leave the later messages dangling.
 */
export function updateRegenerateAvailability(): void {
  const history = state.conversationHistory;
  const lastId = Array.isArray(history) && history.length > 0
    ? history[history.length - 1]?.id ?? null
    : null;
  document.querySelectorAll<HTMLElement>(".message-regen-btn").forEach((btn) => {
    const messageEl = btn.closest<HTMLElement>(".message");
    if (!messageEl || messageEl.id !== lastId) {
      btn.remove();
    }
  });
}

/**
 * Puts the app into the "generating" state for a regeneration: flags the
 * pending response and switches the send button into stop mode.
 */
function enterGeneratingState(loadingId: string): void {
  state.shouldStopGeneration = false;
  state.isResponsePending = true;
  state.activeLoadingMessageId = loadingId;

  const sendButton = elements.sendButton;
  if (sendButton) {
    sendButton.classList.add("stop-mode");
    sendButton.title = "Stop generation";
    sendButton.removeEventListener("click", sendMessage);
    sendButton.addEventListener("click", stopGeneration);
  }
}

/**
 * Regenerates an assistant message in place, adding the new response as an
 * additional cycleable version.
 */
export async function regenerateMessage(messageId: string): Promise<void> {
  if (state.isResponsePending) {
    return;
  }
  if (!responsesClient || typeof responsesClient.runTurn !== "function") {
    if (showError) {
      showError("Responses client is not available.");
    }
    return;
  }

  const history = state.conversationHistory;
  const idx = Array.isArray(history)
    ? history.findIndex((msg) => msg.id === messageId && msg.role === "assistant")
    : -1;
  if (idx < 0) {
    return;
  }
  if (idx !== history.length - 1) {
    if (showInfo) {
      showInfo("Only the most recent message can be regenerated");
    }
    return;
  }
  const entry = history[idx];

  const messageElement = document.getElementById(messageId);
  const contentWrapper = messageElement
    ? messageElement.querySelector<HTMLElement>(".message-content")
    : null;
  if (!messageElement || !contentWrapper) {
    return;
  }
  if (isPartyMessage(messageElement)) {
    return;
  }

  ensureVariantsWithImages(entry);

  const partyNameLabel = contentWrapper.querySelector<HTMLElement>(":scope > .party-name");
  contentWrapper.innerHTML = "";
  if (partyNameLabel) {
    contentWrapper.appendChild(partyNameLabel);
  }
  contentWrapper.insertAdjacentHTML("beforeend", LOADING_HTML);
  removeMessageControls(messageElement);
  if (state.messageImages) {
    delete state.messageImages[messageId];
  }

  const requestMessages = history.slice(0, idx);
  enterGeneratingState(messageId);
  const abortController = new AbortController();
  state.activeAbortController = abortController;

  logRegen("Regenerating message", messageId);

  try {
    const result = await responsesClient.runTurn({
      inputMessages: requestMessages,
      model: elements.modelSelector ? elements.modelSelector.value : undefined,
      verbosity: getVerbosity(),
      reasoningEffort: getReasoningEffort() ?? undefined,
      stream: true,
      loadingId: messageId,
      abortController,
      vectorStoreId: state.activeVectorStore || null,
      historyTokenBudget: getHistoryTokenBudget(),
    });

    const wasStopped = Boolean(result?.stopped) || state.shouldStopGeneration;
    const content = result.outputText || "";
    const reasoning = result.reasoningText || "";
    const hasPendingMedia = Array.isArray(state.currentGeneratedImageHtml)
      && state.currentGeneratedImageHtml.length > 0;

    if (!content.trim() && !reasoning.trim() && !hasPendingMedia) {
      renderActiveVariant(messageId);
      if (wasStopped && showInfo) {
        showInfo("Generation stopped");
      }
      return;
    }

    finalizeStreamedResponse(messageElement, {
      content,
      reasoning,
      response: result.response,
      incomplete: wasStopped,
    });

    if (wasStopped && showInfo) {
      showInfo("Generation stopped");
    }
  } catch (error) {
    console.error("Error during regeneration:", error);
    const isAbort = error instanceof Error && error.name === "AbortError";
    if (!isAbort && showError) {
      showError(`Error: ${error instanceof Error ? error.message : ""}`);
    }
    renderActiveVariant(messageId);
  } finally {
    state.activeAbortController = null;
    resetSendButton();
  }
}

/** Re-renders the message DOM for the entry's current active variant. */
function renderActiveVariant(messageId: string): void {
  const entry = findAssistantEntry(messageId);
  const messageElement = document.getElementById(messageId);
  if (!entry || !messageElement) {
    return;
  }
  const variants = entry.variants;
  if (!Array.isArray(variants) || variants.length === 0) {
    return;
  }
  const index = Math.min(Math.max(entry.activeVariant ?? 0, 0), variants.length - 1);
  const variant = variants[index];
  applyVariant(entry, variant);

  if (state.messageImages) {
    const images = getVariantImages(messageId, index);
    if (images && images.length > 0) {
      state.messageImages[messageId] = [...images];
    } else {
      delete state.messageImages[messageId];
    }
  }

  updateMessageContent(messageElement, {
    content: variant.content,
    reasoning: variant.reasoning || "",
    codeInterpreterOutputs: variant.codeInterpreterOutputs,
  });
}

/**
 * Switches the displayed version of an assistant message to `index`, re-renders
 * the bubble, and persists the change. Ignored while a response is pending.
 */
function setActiveVariant(messageId: string, index: number): void {
  if (state.isResponsePending) {
    return;
  }
  const entry = findAssistantEntry(messageId);
  if (!entry || !Array.isArray(entry.variants)) {
    return;
  }
  const clamped = Math.min(Math.max(index, 0), entry.variants.length - 1);
  if (clamped === entry.activeVariant) {
    return;
  }
  entry.activeVariant = clamped;
  renderActiveVariant(messageId);
  updateBrowserHistory();
  saveCurrentConversation();
}

/**
 * Forks the conversation at `messageId` into a new conversation containing every
 * message up to and including it, leaving the original conversation untouched.
 */
export function branchConversation(messageId: string): void {
  if (state.isResponsePending) {
    return;
  }
  const history = state.conversationHistory;
  const idx = Array.isArray(history) ? history.findIndex((msg) => msg.id === messageId) : -1;
  if (idx < 0) {
    return;
  }
  const messageElement = document.getElementById(messageId);
  if (!messageElement) {
    return;
  }

  saveCurrentConversation();

  const baseName = state.currentConversationName || "Conversation";

  let sibling = messageElement.nextElementSibling;
  while (sibling) {
    const next = sibling.nextElementSibling;
    sibling.remove();
    sibling = next;
  }

  state.conversationHistory = history.slice(0, idx + 1);
  state.currentConversationId = null;
  state.currentConversationName = `${baseName} (branch)`;

  if (history[idx]?.role === "assistant") {
    decorateAssistantMessage(messageElement, messageId);
  }
  updateRegenerateAvailability();

  saveCurrentConversation();
  updateBrowserHistory();
  renderChatHistoryList();
  updateHeaderInfo();

  if (showInfo) {
    showInfo("Branched into a new conversation");
  }
}

/** Adds the "branch from here" button to a non-party message. Idempotent. */
function addBranchButton(messageElement: HTMLElement, messageId: string): void {
  if (isPartyMessage(messageElement)) {
    return;
  }
  if (messageElement.querySelector(".message-branch-btn")) {
    return;
  }
  const btn = document.createElement("button");
  btn.className = "message-branch-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "Branch conversation from here");
  btn.title = "Branch conversation from here";
  btn.innerHTML = icon("git-branch", { width: 16, height: 16 });
  btn.addEventListener("click", () => {
    branchConversation(messageId);
  });
  messageElement.appendChild(btn);
}

/** Removes the regenerate, branch, and version-navigator controls from a message. */
export function removeMessageControls(messageElement: HTMLElement): void {
  messageElement.querySelector(".message-regen-btn")?.remove();
  messageElement.querySelector(".message-branch-btn")?.remove();
  messageElement.querySelector(".message-versions")?.remove();
}

/**
 * Adds the regenerate button to the message, but only when it is the most
 * recent (non-party) message; otherwise ensures any stale button is removed.
 */
function addRegenerateButton(messageElement: HTMLElement, messageId: string): void {
  if (isPartyMessage(messageElement) || !isLastMessage(messageId)) {
    messageElement.querySelector(".message-regen-btn")?.remove();
    return;
  }
  if (messageElement.querySelector(".message-regen-btn")) {
    return;
  }
  const btn = document.createElement("button");
  btn.className = "message-regen-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "Regenerate response");
  btn.title = "Regenerate response";
  btn.innerHTML = icon("refresh-cw", { width: 16, height: 16 });
  btn.addEventListener("click", () => {
    void regenerateMessage(messageId);
  });
  messageElement.appendChild(btn);
}

/**
 * Renders (or removes) the previous/next version navigator for a message,
 * showing it only when the message has more than one generated version.
 */
function renderVersionNavigator(messageElement: HTMLElement, messageId: string): void {
  const existing = messageElement.querySelector<HTMLElement>(".message-versions");
  const entry = findAssistantEntry(messageId);
  const variants = entry?.variants;
  if (!entry || !Array.isArray(variants) || variants.length < 2) {
    existing?.remove();
    return;
  }

  const total = variants.length;
  const active = Math.min(Math.max(entry.activeVariant ?? 0, 0), total - 1);

  const nav = existing ?? document.createElement("div");
  nav.className = "message-versions";
  nav.innerHTML = "";

  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "message-version-prev";
  prev.setAttribute("aria-label", "Previous version");
  prev.title = "Previous version";
  prev.innerHTML = icon("arrow-left", { width: 14, height: 14 });
  prev.disabled = active <= 0;
  prev.addEventListener("click", () => {
    setActiveVariant(messageId, active - 1);
  });

  const label = document.createElement("span");
  label.className = "message-version-label";
  label.textContent = `${active + 1} / ${total}`;

  const next = document.createElement("button");
  next.type = "button";
  next.className = "message-version-next";
  next.setAttribute("aria-label", "Next version");
  next.title = "Next version";
  next.innerHTML = icon("arrow-left", { width: 14, height: 14, className: "flip-x" });
  next.disabled = active >= total - 1;
  next.addEventListener("click", () => {
    setActiveVariant(messageId, active + 1);
  });

  nav.append(prev, label, next);

  const contentWrapper = messageElement.querySelector<HTMLElement>(".message-content");
  if (contentWrapper && !existing) {
    contentWrapper.appendChild(nav);
  }
}

/**
 * Adds the regenerate button and (when there are multiple versions) the version
 * navigator to an assistant message. Safe to call repeatedly.
 */
export function decorateAssistantMessage(messageElement: HTMLElement | null, messageId: string): void {
  if (!messageElement) {
    return;
  }
  addRegenerateButton(messageElement, messageId);
  addBranchButton(messageElement, messageId);
  renderVersionNavigator(messageElement, messageId);
}
