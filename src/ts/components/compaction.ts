/**
 * History-compaction controls and orchestration.
 *
 * @remarks
 * Wraps the pure logic in {@link ../services/api/compaction.ts} with the parts
 * that need the app: the summarization request, persistence of the resulting
 * summary onto the conversation record, the manual trigger, and the composer's
 * history-usage meter.
 *
 * The summarization request deliberately bypasses `runTurn`. A compaction is
 * not a conversation turn — it must not stream into a chat bubble, must not
 * advertise tools (a summarizer that decides to call `web_search` is a bug),
 * and must not chain off the previous response id. `buildRequestBody` plus a
 * single non-streaming call gives exactly that, the same way Party mode issues
 * its out-of-band speaker-choice request.
 */

import { state } from "../init/state.ts";
import { uiHooks } from "../init/uiHooks.ts";
import { icon } from "../utils/icons.ts";
import { createScopedLogger } from "../utils/logger.ts";
import { showError, showInfo } from "../utils/notifications.ts";
import { STORAGE_KEYS } from "../utils/storage/storage.ts";
import { getHistoryTokenBudget } from "../init/modelSettings.ts";
import { buildRequestBody } from "../services/api/requestClient.ts";
import { executeNonStreamingRequest } from "../services/api/requestTransport.ts";
import { extractOutputText } from "../services/api/responseNormalization.ts";
import { getActiveModel } from "../services/api/clientConfig.ts";
import { saveCurrentConversation } from "../services/history/persistence.ts";
import {
  COMPACTION_SYSTEM_INSTRUCTIONS,
  buildCompactionRequestContent,
  estimateActiveHistoryTokens,
  isCompactableMessage,
  uncompactedMessages,
} from "../services/api/compaction.ts";

const logCompaction = createScopedLogger("compaction");

/**
 * Output-token cap for the summary.
 *
 * @remarks
 * Compaction only pays for itself if the recap is much smaller than what it
 * replaces; an uncapped summarizer will happily produce a near-verbatim
 * retelling of a long thread.
 */
const SUMMARY_MAX_OUTPUT_TOKENS = 2048;

/** Ratio at which the meter switches to its warning styling. */
const METER_WARN_RATIO = 0.85;

/** Guards against overlapping compactions (manual click during an auto-compact). */
let compacting = false;

/** The result of a successful compaction. */
export interface CompactionResult {
  /** The regenerated summary covering the whole conversation to date. */
  summary: string;
  /** Id of the last message the summary now covers. */
  throughId: string;
}

/** Reports whether automatic compaction is enabled (defaults to off). */
export function isAutoCompactEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.autoCompactHistory) === "true";
  } catch {
    return false;
  }
}

/** Persists the auto-compaction preference (best-effort). */
function persistAutoCompact(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.autoCompactHistory, String(enabled));
  } catch (error) {
    logCompaction("Unable to save auto-compact preference:", error);
  }
}

/**
 * Picks the message the compaction marker should point at.
 *
 * @remarks
 * Scans backwards for the last entry carrying an id rather than taking the
 * final element outright: a tail can end in an entry without one (an
 * in-progress bubble, an imported transcript), and a marker that matches
 * nothing would make {@link uncompactedMessages} fall back to the full history
 * — quietly undoing the compaction on the very next turn.
 */
function resolveMarkerId(tail: { id?: string }[]): string | null {
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    const id = tail[i]?.id;
    if (typeof id === "string" && id) {
      return id;
    }
  }
  return null;
}

/**
 * Folds the conversation's uncompacted turns into a running summary.
 *
 * @remarks
 * The summary is regenerated from the existing summary plus everything since
 * the last compaction, so nothing an earlier pass condensed is lost. On
 * success the summary and marker are written to {@link state} and persisted
 * with the conversation; from then on only the tail after the marker is
 * resent verbatim.
 *
 * Refuses to run while a response is in flight: the turn already in progress
 * built its request from the pre-compaction history, and moving the marker
 * underneath it would drop messages the model is mid-way through answering.
 *
 * @returns The new summary and marker, or `null` when nothing was compacted.
 */
export async function compactConversationHistory(): Promise<CompactionResult | null> {
  if (compacting) {
    return null;
  }
  if (state.isResponsePending) {
    showInfo("Wait for the current response to finish before compacting.");
    return null;
  }

  const messages = Array.isArray(state.conversationHistory) ? state.conversationHistory : [];
  const tail = uncompactedMessages(messages, state.compactedThroughId);
  const foldable = tail.filter(isCompactableMessage);
  if (foldable.length === 0) {
    showInfo("There is no new conversation history to compact.");
    return null;
  }
  const throughId = resolveMarkerId(tail);
  if (!throughId) {
    showError("Cannot compact: the conversation history has no message ids.");
    return null;
  }

  compacting = true;
  refreshHistoryMeter();
  showInfo("Compacting conversation history...");
  try {
    const body = buildRequestBody({
      inputMessages: [{ role: "user", content: buildCompactionRequestContent(state.compactedSummary, tail) }],
      instructions: COMPACTION_SYSTEM_INSTRUCTIONS,
      model: getActiveModel(),
      reasoningEffort: "low",
      verbosity: "low",
      maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
      stream: false,
    });
    const response = await executeNonStreamingRequest(body);
    const summary = (extractOutputText(response) || "").trim();
    if (!summary) {
      showError("Compaction produced no summary.");
      return null;
    }

    state.compactedSummary = summary;
    state.compactedThroughId = throughId;
    saveCurrentConversation();
    logCompaction("Compacted", foldable.length, "messages through", throughId);
    showInfo(`Compacted ${foldable.length} message${foldable.length === 1 ? "" : "s"} into a summary.`);
    return { summary, throughId };
  } catch (error) {
    console.error("Failed to compact conversation history:", error);
    showError(`Compaction failed: ${error instanceof Error ? error.message : ""}`);
    return null;
  } finally {
    compacting = false;
    refreshHistoryMeter();
  }
}

/**
 * Compacts automatically when the conversation's active history has outgrown
 * the token budget.
 *
 * @remarks
 * Called from the send path before the new user message is recorded, so the
 * summary describes the conversation as it stood when the question was asked
 * rather than folding in a question that has not been answered yet. A budget
 * of `0` means "send everything", so there is nothing to stay under and
 * auto-compaction stays out of the way.
 */
export async function maybeAutoCompactHistory(): Promise<void> {
  if (!isAutoCompactEnabled() || state.partyMode) {
    return;
  }
  const budget = getHistoryTokenBudget();
  if (budget <= 0) {
    return;
  }
  const active = estimateActiveHistoryTokens(
    state.conversationHistory,
    state.compactedSummary,
    state.compactedThroughId,
  );
  if (active <= budget) {
    return;
  }
  logCompaction("Auto-compacting:", active, "tokens exceeds budget", budget);
  await compactConversationHistory();
}

/**
 * Redraws the composer's history-usage meter and compact button.
 *
 * @remarks
 * The meter reports the same figure the auto-compaction trigger watches — the
 * summary plus the uncompacted tail — so what the user sees filling up is
 * exactly what will fire the threshold. It hides itself when there is no
 * history or the budget is unlimited, since a bar with no ceiling says
 * nothing; the summary indicator stays available through the button's tooltip.
 */
export function refreshHistoryMeter(): void {
  if (typeof document === "undefined") {
    return;
  }
  const container = document.getElementById("history-meter");
  const fill = document.getElementById("history-meter-fill");
  const button = document.getElementById("compact-history-button");
  if (!container || !fill || !button) {
    return;
  }

  const messages = Array.isArray(state.conversationHistory) ? state.conversationHistory : [];
  const hasHistory = messages.some(isCompactableMessage);
  const budget = getHistoryTokenBudget();
  const tokens = estimateActiveHistoryTokens(messages, state.compactedSummary, state.compactedThroughId);
  const hasSummary = Boolean((state.compactedSummary || "").trim());
  const ratio = budget > 0 ? tokens / budget : 0;

  container.hidden = !hasHistory || budget <= 0;
  container.classList.toggle("is-warn", ratio >= METER_WARN_RATIO);
  container.classList.toggle("has-summary", hasSummary);
  fill.style.width = `${Math.min(100, Math.round(ratio * 100))}%`;

  const summaryNote = hasSummary ? " (includes a compacted summary)" : "";
  container.title = budget > 0
    ? `${tokens.toLocaleString()} / ${budget.toLocaleString()} history tokens${summaryNote}`
    : `${tokens.toLocaleString()} history tokens, no budget limit${summaryNote}`;
  container.setAttribute(
    "aria-label",
    `History usage: ${container.title}`,
  );

  button.hidden = !hasHistory;
  button.classList.toggle("is-compacting", compacting);
  const label = compacting
    ? "Compacting conversation history..."
    : `Compact conversation history${summaryNote}`;
  button.title = label;
  button.setAttribute("aria-label", label);
  (button as HTMLButtonElement).disabled = compacting || state.isResponsePending;
}

/**
 * Wires the compaction controls: the composer's compact button and meter, plus
 * the auto-compact toggle in the Model settings tab.
 *
 * @remarks
 * Registers {@link refreshHistoryMeter} on {@link uiHooks} so conversation
 * load/reset can repoint the meter without importing this module (and the
 * component graph behind it) from the persistence layer.
 */
export function initCompactionControls(): void {
  uiHooks.refreshHistoryMeter = refreshHistoryMeter;

  const button = document.getElementById("compact-history-button");
  if (button && !button.dataset.bound) {
    button.innerHTML = icon("archive", { width: 15, height: 15 });
    button.addEventListener("click", () => {
      void compactConversationHistory();
    });
    button.dataset.bound = "true";
  }

  // The meter is drawn against the budget, so a budget edit has to redraw it —
  // a separate listener rather than a change in `modelSettings`, so the budget
  // control keeps owning its own persistence.
  const budgetInput = document.getElementById("history-token-budget");
  if (budgetInput && !budgetInput.dataset.meterBound) {
    budgetInput.addEventListener("change", () => {
      refreshHistoryMeter();
    });
    budgetInput.dataset.meterBound = "true";
  }

  const toggle = document.getElementById("auto-compact-toggle") as HTMLInputElement | null;
  if (toggle) {
    toggle.checked = isAutoCompactEnabled();
    if (!toggle.dataset.bound) {
      toggle.addEventListener("change", () => {
        persistAutoCompact(toggle.checked);
      });
      toggle.dataset.bound = "true";
    }
  }

  refreshHistoryMeter();
}
