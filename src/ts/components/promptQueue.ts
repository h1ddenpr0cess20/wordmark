/**
 * Prompt queuing: lets the user line up follow-up messages while a response is
 * still streaming.
 *
 * @remarks
 * A send attempted during an in-flight turn is parked here instead of being
 * dropped. Each queued entry captures the composer's full payload — the typed
 * text plus the pending image/document attachments — so restoring it later is
 * indistinguishable from the user having typed it at that moment. The queue is
 * runtime-only: it is never persisted, and stopping generation clears it.
 */

import { elements, state } from "../init/state.ts";
import { icon } from "../utils/icons.ts";
import { escapeHtml } from "../utils/sanitize.ts";
import { createScopedLogger } from "../utils/logger.ts";
import { showInfo } from "../utils/notifications.ts";
import { showPendingUploadPreviews } from "./attachments/attachmentPreviews.ts";
import type { PendingDocument, PendingUpload } from "../../types/attachments.ts";

const logQueue = createScopedLogger("promptQueue");

/** A composer payload parked while an earlier turn is still running. */
export interface QueuedPrompt {
  id: string;
  text: string;
  uploads: PendingUpload[];
  documents: PendingDocument[];
}

const queue: QueuedPrompt[] = [];
let nextId = 0;

/** The queued prompts, oldest first. */
export function queuedPrompts(): readonly QueuedPrompt[] {
  return queue;
}

/** Number of prompts waiting to be sent. */
export function queuedPromptCount(): number {
  return queue.length;
}

/**
 * Parks a composer payload at the back of the queue.
 *
 * @returns The queued entry, or `null` when there is nothing to queue.
 */
export function enqueuePrompt(
  text: string,
  uploads: PendingUpload[] = [],
  documents: PendingDocument[] = [],
): QueuedPrompt | null {
  if (!text && uploads.length === 0 && documents.length === 0) {
    return null;
  }
  const entry: QueuedPrompt = {
    id: `queued-${++nextId}`,
    text,
    uploads: [...uploads],
    documents: [...documents],
  };
  queue.push(entry);
  logQueue("Queued prompt:", entry.id, "queue length:", queue.length);
  renderPromptQueue();
  return entry;
}

/** Removes the oldest queued prompt and returns it, or `null` when empty. */
export function dequeuePrompt(): QueuedPrompt | null {
  const entry = queue.shift() ?? null;
  renderPromptQueue();
  return entry;
}

/** Drops a queued prompt by id. */
export function removeQueuedPrompt(id: string): void {
  const index = queue.findIndex(entry => entry.id === id);
  if (index === -1) {
    return;
  }
  queue.splice(index, 1);
  renderPromptQueue();
}

/** Empties the queue (used when generation is stopped or a chat is cleared). */
export function clearPromptQueue(): void {
  if (queue.length === 0) {
    return;
  }
  queue.length = 0;
  renderPromptQueue();
}

/** Summarizes an entry's attachments for its chip, e.g. `2 files`. */
function attachmentSummary(entry: QueuedPrompt): string {
  const count = entry.uploads.length + entry.documents.reduce(
    (total, doc) => total + (doc.isDirectory ? (doc.files?.length || 0) : 1),
    0,
  );
  if (count === 0) {
    return "";
  }
  return `${count} file${count === 1 ? "" : "s"}`;
}

/** Finds (or creates) the queue row above the pending-attachment previews. */
function queueContainer(): HTMLElement | null {
  const existing = document.querySelector<HTMLElement>(".prompt-queue");
  if (existing) {
    return existing;
  }
  const wrapper = elements.userInput?.closest(".input-wrapper");
  if (!wrapper) {
    return null;
  }
  const container = document.createElement("div");
  container.className = "prompt-queue";
  container.setAttribute("aria-live", "polite");
  container.setAttribute("aria-label", "Queued messages");
  const previews = wrapper.querySelector(".upload-previews");
  wrapper.insertBefore(container, previews ?? wrapper.firstChild);
  return container;
}

/** Repaints the queued-prompt chips from the current queue. */
export function renderPromptQueue(): void {
  const container = queueContainer();
  if (!container) {
    return;
  }
  container.innerHTML = "";
  queue.forEach((entry, index) => {
    const chip = document.createElement("div");
    chip.className = "queued-prompt";
    chip.dataset.queuedId = entry.id;

    const meta = attachmentSummary(entry);
    const label = entry.text || meta || "Attachment";
    chip.innerHTML = [
      `<span class="queued-prompt-index">${index + 1}</span>`,
      `<span class="queued-prompt-text" title="${escapeHtml(entry.text)}">${escapeHtml(label)}</span>`,
      entry.text && meta ? `<span class="queued-prompt-meta">${escapeHtml(meta)}</span>` : "",
    ].join("");

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "chip-remove";
    remove.title = "Remove queued message";
    remove.setAttribute("aria-label", "Remove queued message");
    remove.innerHTML = icon("x", { width: 12, height: 12 });
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeQueuedPrompt(entry.id);
    });
    chip.appendChild(remove);

    container.appendChild(chip);
  });
}

/**
 * Restores the oldest queued prompt into the composer so the caller can send it
 * as an ordinary message.
 *
 * @returns `true` when a prompt was restored, `false` when the queue is empty.
 */
export function restoreNextPrompt(): boolean {
  const entry = dequeuePrompt();
  if (!entry) {
    return false;
  }
  state.pendingUploads = entry.uploads;
  state.pendingDocuments = entry.documents;
  showPendingUploadPreviews();
  const userInput = elements.userInput;
  if (userInput) {
    userInput.value = entry.text;
    userInput.style.height = "56px";
  }
  logQueue("Restored queued prompt:", entry.id);
  return true;
}

/** Clears the queue and tells the user, when stopping discards pending sends. */
export function discardQueueOnStop(): void {
  if (queue.length === 0) {
    return;
  }
  const count = queue.length;
  clearPromptQueue();
  if (showInfo) {
    showInfo(`Discarded ${count} queued message${count === 1 ? "" : "s"}`);
  }
}
