/**
 * The work queue: prompts waiting for their turn.
 *
 * @remarks
 * Two producers feed it. A send attempted while a response is still streaming
 * is parked here instead of being dropped — ordinary type-ahead. An autonomous
 * run adds entries of its own, either because the model called `queue_followup`
 * or because the continuation decision picked the next step; those carry
 * `origin: "agent"` and only drain while {@link ../services/agent/agentRunner.ts
 * | a run} says they may.
 *
 * Each entry captures the composer's full payload — the typed text plus the
 * pending image/document attachments — so restoring it later is
 * indistinguishable from the user having typed it at that moment. The queue is
 * runtime-only: it is never persisted, and clearing the conversation empties it.
 *
 * There are two ways out. A plain text message the user typed is handed to the
 * turn already running at its next tool-call boundary — see
 * {@link takeInterjections} — so a correction reaches the model while it is
 * still working. Everything else waits for the turn to end and is then sent as
 * a turn of its own.
 */

import { elements, state } from "../init/state.ts";
import { icon } from "../utils/icons.ts";
import { escapeHtml } from "../utils/sanitize.ts";
import { createScopedLogger } from "../utils/logger.ts";
import { showInfo, showError } from "../utils/notifications.ts";
import { showPendingUploadPreviews } from "./attachments/attachmentPreviews.ts";
import type { PendingDocument, PendingUpload } from "../../types/attachments.ts";
import type { QueuedPromptOrigin } from "../../types/agent.ts";

const logQueue = createScopedLogger("promptQueue");

/**
 * Hard ceiling on parked prompts.
 *
 * @remarks
 * Type-ahead never approaches this. It exists because a model that can enqueue
 * its own work can also enqueue it faster than the queue drains — a plan that
 * plans more planning. The cap turns that into a visible refusal rather than an
 * unbounded backlog billed one turn at a time.
 */
export const MAX_QUEUE_DEPTH = 25;

/** A composer payload parked until it can be sent as its own turn. */
export interface QueuedPrompt {
  id: string;
  text: string;
  uploads: PendingUpload[];
  documents: PendingDocument[];
  /** Who produced this entry; governs whether it may drain unattended. */
  origin: QueuedPromptOrigin;
  /** Short human-readable step name, shown on the chip instead of the text. */
  label?: string;
  /** The run that produced the entry, for agent-origin prompts. */
  runId?: string;
}

/** Provenance and presentation options for a queued entry. */
export interface EnqueueOptions {
  origin?: QueuedPromptOrigin;
  label?: string;
  runId?: string;
}

const queue: QueuedPrompt[] = [];
let nextId = 0;

/** The queued prompts, oldest first. */
export function queuedPrompts(): readonly QueuedPrompt[] {
  return queue;
}

/** Number of prompts waiting to be sent, optionally limited to one origin. */
export function queuedPromptCount(origin?: QueuedPromptOrigin): number {
  if (!origin) {
    return queue.length;
  }
  return queue.filter(entry => entry.origin === origin).length;
}

/**
 * Parks a composer payload at the back of the queue.
 *
 * @param options - Provenance; defaults to a user-composed entry.
 * @returns The queued entry, or `null` when there is nothing to queue or the
 * queue is full.
 */
export function enqueuePrompt(
  text: string,
  uploads: PendingUpload[] = [],
  documents: PendingDocument[] = [],
  options: EnqueueOptions = {},
): QueuedPrompt | null {
  if (!text && uploads.length === 0 && documents.length === 0) {
    return null;
  }
  if (queue.length >= MAX_QUEUE_DEPTH) {
    logQueue("Refused to queue: at the", MAX_QUEUE_DEPTH, "prompt ceiling");
    showError?.(`Queue is full (${MAX_QUEUE_DEPTH} messages). Let some send first.`);
    return null;
  }
  const entry: QueuedPrompt = {
    id: `queued-${++nextId}`,
    text,
    uploads: [...uploads],
    documents: [...documents],
    origin: options.origin || "user",
    label: options.label,
    runId: options.runId,
  };
  queue.push(entry);
  logQueue("Queued prompt:", entry.id, `(${entry.origin})`, "queue length:", queue.length);
  renderPromptQueue();
  return entry;
}

/**
 * Removes the next prompt to send and returns it, or `null` when empty.
 *
 * @remarks
 * User entries are taken before agent entries regardless of insertion order:
 * someone who types during a run is redirecting it, and making them wait behind
 * a queue of the model's own follow-ups would bury the correction. Within an
 * origin the order is FIFO.
 *
 * @param allowAgentEntries - When `false`, agent-origin entries are left in
 * place; the drain skips them unless a run has authorized them.
 */
export function dequeuePrompt(allowAgentEntries = true): QueuedPrompt | null {
  let index = queue.findIndex(entry => entry.origin === "user");
  if (index === -1 && allowAgentEntries) {
    index = queue.findIndex(entry => entry.origin === "agent");
  }
  if (index === -1) {
    return null;
  }
  const [entry] = queue.splice(index, 1);
  renderPromptQueue();
  return entry;
}

/**
 * Removes and returns the entries eligible for delivery inside a turn that is
 * already running, oldest first.
 *
 * @remarks
 * Only user-composed, text-only entries qualify. An entry carrying attachments
 * stays queued because uploads, vector stores, and client-side extraction all
 * run while a turn is being assembled, not inside one; it goes out through the
 * ordinary post-turn drain instead. Agent steps stay too — a run's next step is
 * a turn of its own, not an interruption of this one.
 */
export function takeInterjections(): QueuedPrompt[] {
  const eligible = queue.filter(entry =>
    entry.origin === "user"
    && Boolean(entry.text)
    && entry.uploads.length === 0
    && entry.documents.length === 0);
  if (eligible.length === 0) {
    return [];
  }
  const kept = queue.filter(entry => !eligible.includes(entry));
  queue.length = 0;
  queue.push(...kept);
  logQueue("Delivering", eligible.length, "queued message(s) into the running turn");
  renderPromptQueue();
  return eligible;
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

/**
 * Empties the queue, or just the entries of one origin.
 *
 * @param origin - Limits the clear, so ending a run can discard its planned
 * steps without throwing away messages the user typed alongside them.
 * @returns How many entries were removed.
 */
export function clearPromptQueue(origin?: QueuedPromptOrigin): number {
  const before = queue.length;
  const kept = origin ? queue.filter(entry => entry.origin !== origin) : [];
  if (kept.length === before) {
    return 0;
  }
  queue.length = 0;
  queue.push(...kept);
  renderPromptQueue();
  return before - queue.length;
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

/**
 * The queue in the order it will actually drain: user entries, then agent
 * entries, each FIFO within its group.
 *
 * @remarks
 * Mirrors {@link dequeuePrompt}'s priority so the numbers on the chips mean
 * what they look like they mean. Numbering the raw array instead would show a
 * message the user just typed as "3" and then send it first.
 */
function drainOrder(): QueuedPrompt[] {
  return [
    ...queue.filter(entry => entry.origin === "user"),
    ...queue.filter(entry => entry.origin === "agent"),
  ];
}

/** Repaints the queued-prompt chips from the current queue. */
export function renderPromptQueue(): void {
  const container = queueContainer();
  if (!container) {
    return;
  }
  container.innerHTML = "";
  drainOrder().forEach((entry, index) => {
    const chip = document.createElement("div");
    chip.className = entry.origin === "agent" ? "queued-prompt agent" : "queued-prompt";
    chip.dataset.queuedId = entry.id;
    chip.dataset.origin = entry.origin;

    const meta = attachmentSummary(entry);
    const label = entry.label || entry.text || meta || "Attachment";
    chip.innerHTML = [
      `<span class="queued-prompt-index">${index + 1}</span>`,
      `<span class="queued-prompt-text" title="${escapeHtml(entry.text)}">${escapeHtml(label)}</span>`,
      entry.origin === "agent" ? "<span class=\"queued-prompt-badge\">step</span>" : "",
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
 * Restores the next queued prompt into the composer so the caller can send it
 * as an ordinary message.
 *
 * @param allowAgentEntries - Passed through to {@link dequeuePrompt}.
 * @returns The restored entry, or `null` when nothing was eligible.
 */
export function restoreNextPrompt(allowAgentEntries = true): QueuedPrompt | null {
  const entry = dequeuePrompt(allowAgentEntries);
  if (!entry) {
    return null;
  }
  state.pendingUploads = entry.uploads;
  state.pendingDocuments = entry.documents;
  showPendingUploadPreviews();
  const userInput = elements.userInput;
  if (userInput) {
    userInput.value = entry.text;
    userInput.style.height = "56px";
  }
  logQueue("Restored queued prompt:", entry.id, `(${entry.origin})`);
  return entry;
}

/** Clears the queue and tells the user, when stopping discards pending sends. */
export function discardQueueOnStop(): void {
  const count = clearPromptQueue();
  if (count > 0 && showInfo) {
    showInfo(`Discarded ${count} queued message${count === 1 ? "" : "s"}`);
  }
}
