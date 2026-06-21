/**
 * Party-mode orchestration engine.
 *
 * Drives an autonomous, multi-character turn loop on top of Wordmark's existing
 * provider-agnostic `runTurn` pipeline. All characters share the globally
 * selected provider + model; each turn streams into its own chat bubble with a
 * per-character name label. The user can interject at any time without pausing;
 * pause/resume/stop are separate, optional controls exposed via a control bar in
 * the chat area.
 *
 * Adapted from the grokparty-web ConversationEngine, expanded to all providers
 * and integrated with Wordmark's streaming, history, and persistence.
 */

import { state } from "../../init/state.ts";
import { appendMessage } from "../../components/ui/chatMessages.ts";
import { finalizeStreamedResponse, removeLoadingIndicator } from "../streaming/messageLifecycle.ts";
import { saveCurrentConversation } from "../history/persistence.ts";
import { generateMessageId } from "../../components/messages.ts";
import { sanitizeInput } from "../../utils/utils.ts";
import { escapeHtml } from "../../utils/sanitize.ts";
import { showError } from "../../utils/notifications.ts";
import { createScopedLogger } from "../../utils/logger.ts";
import { runTurn, buildRequestBody } from "../api/requestClient.ts";
import { executeNonStreamingRequest } from "../api/requestTransport.ts";
import { extractOutputText } from "../api/responseNormalization.ts";
import { getActiveModel } from "../api/clientConfig.ts";
import { getToolCatalog, getAvailableToolKeys } from "../api/toolManager.ts";
import {
  buildCharacterSystemPrompt,
  buildFirstTurnPrompt,
  buildTurnPrompt,
  buildDecisionPrompt,
  DEFAULT_USER_NAME,
  type PartyToolInfo,
} from "./partyPrompts.ts";
import type { PartyCharacter, PartyConfig } from "./partyTypes.ts";
import { uiHooks } from "../../init/uiHooks.ts";

const logParty = createScopedLogger("party");

/** Places the character's name as a label inside the message bubble, keeping the
 * wordmark logo as the sender icon. */
export function applyPartyNameLabel(messageElement: HTMLElement, name: string): void {
  messageElement.classList.add("party");
  const content = messageElement.querySelector<HTMLElement>(".message-content");
  if (!content) {
    return;
  }
  let label = content.querySelector<HTMLElement>(".party-name");
  if (!label) {
    label = document.createElement("div");
    label.className = "party-name";
    content.insertBefore(label, content.firstChild);
  }
  label.textContent = name;
}

const TURN_DELAY_MS = 600;
const PAUSE_POLL_MS = 150;
const HISTORY_BUFFER_LIMIT = 12;

/**
 * Reads whatever text has already been streamed into a turn's bubble, used to
 * recover generated (already paid-for) tokens when a turn is aborted before
 * `runTurn` returns them.
 */
function readStreamedText(element: HTMLElement): string {
  const main = element.querySelector<HTMLElement>(".main-response-content");
  return (main?.textContent || "").trim();
}

const LOADING_HTML =
  "<div class=\"loading-animation\"><div class=\"loading-dot\"></div><div class=\"loading-dot\"></div><div class=\"loading-dot\"></div></div>";

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The Party engine singleton. Use {@link partyEngine}; do not instantiate
 * directly elsewhere.
 */
class PartyEngine {
  private running = false;
  private paused = false;
  private pauseRequested = false;
  private abort = false;
  private skipDelayNextTurn = false;
  private history: string[] = [];
  private pendingInterjections: string[] = [];
  private controller: AbortController | null = null;
  private characters: PartyCharacter[] = [];
  private scenario: PartyConfig["scenario"] = { topic: "", setting: "", mood: "friendly", conversationType: "conversation" };
  private userName = DEFAULT_USER_NAME;

  /** Whether the loop is actively running. */
  isRunning(): boolean {
    return this.running;
  }

  /** Whether the loop is currently paused. */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Starts the conversation loop for the given configuration. Marks the app as
   * being in party mode and records the active config for persistence.
   */
  async start(config: PartyConfig): Promise<void> {
    if (this.running) {
      this.abort = true;
      this.paused = false;
      try {
        this.controller?.abort();
      } catch {
        /* noop */
      }
    }
    while (this.running) {
      await waitFor(PAUSE_POLL_MS);
    }
    if (!Array.isArray(config.characters) || config.characters.length < 2) {
      showError("Add at least two characters before starting a party.");
      return;
    }

    this.characters = config.characters;
    this.scenario = config.scenario;
    this.userName = config.userName?.trim() || DEFAULT_USER_NAME;
    state.partyMode = true;
    state.activePartyConfig = { characters: config.characters, scenario: config.scenario, userName: this.userName };

    this.abort = false;
    this.paused = false;
    this.pauseRequested = false;
    this.skipDelayNextTurn = false;
    this.pendingInterjections = [];
    this.history = this.seedHistoryFromTranscript();
    this.running = true;

    const isFreshStart = this.history.length === 0;
    this.refreshControlBar();

    try {
      let currentSpeaker = this.pickInitialSpeaker();
      await this.emitTurn(currentSpeaker, isFreshStart);

      while (!this.abort) {
        if (this.skipDelayNextTurn) {
          this.skipDelayNextTurn = false;
        } else {
          await waitFor(TURN_DELAY_MS);
        }

        await this.waitIfPaused();
        if (this.abort) {
          break;
        }

        this.consumePendingInterjections();

        let nextSpeaker: PartyCharacter | null = null;
        while (!this.abort && !nextSpeaker) {
          nextSpeaker = await this.chooseNextSpeaker(currentSpeaker);
          await this.waitIfPaused();
          if (this.abort) {
            break;
          }
          if (this.consumePendingInterjections()) {
            nextSpeaker = null;
          }
        }

        if (this.abort || !nextSpeaker) {
          break;
        }

        await this.waitIfPaused();
        if (this.abort) {
          break;
        }
        if (this.consumePendingInterjections()) {
          continue;
        }

        await this.emitTurn(nextSpeaker, false);
        currentSpeaker = nextSpeaker;
      }
    } catch (error) {
      console.error("Party loop error:", error);
      showError(`Party error: ${error instanceof Error ? error.message : ""}`);
    } finally {
      this.running = false;
      this.paused = false;
      this.pauseRequested = false;
      this.skipDelayNextTurn = false;
      this.pendingInterjections = [];
      this.controller = null;
      this.refreshControlBar();
    }
  }

  /** Requests a pause at the next safe checkpoint (never mid-stream). */
  pause(): void {
    if (!this.running || this.paused || this.pauseRequested) {
      return;
    }
    this.pauseRequested = true;
    this.refreshControlBar();
  }

  /** Resumes a paused loop. */
  resume(): void {
    if (!this.running || !this.paused) {
      return;
    }
    this.paused = false;
    this.pauseRequested = false;
    this.refreshControlBar();
  }

  /** Stops the loop and aborts any in-flight request. */
  stop(): void {
    if (!this.running) {
      this.removeControlBar();
      return;
    }
    this.abort = true;
    this.paused = false;
    this.pauseRequested = false;
    this.pendingInterjections = [];
    this.skipDelayNextTurn = false;
    try {
      this.controller?.abort();
    } catch {
      /* noop */
    }
    this.refreshControlBar();
  }

  /**
   * Queues a user interjection from the chat input. The bubble is rendered and
   * recorded immediately, then the loop is made to run so the message gets a
   * response: a live loop weaves it in at the next checkpoint, a paused loop is
   * resumed, and a stopped party is restarted with the message already in the
   * transcript. Never falls through to regular chat.
   */
  queueInterjection(message: string): void {
    const trimmed = message.trim();
    if (!trimmed || !state.activePartyConfig) {
      return;
    }
    this.recordUserBubble(trimmed);
    if (this.running) {
      this.pendingInterjections.push(trimmed);
      this.skipDelayNextTurn = true;
      if (this.paused) {
        this.resume();
      }
      return;
    }
    void this.start(state.activePartyConfig);
  }

  /** Renders the user's interjection bubble and records it in conversation history. */
  private recordUserBubble(message: string): void {
    const userElement = appendMessage("You", sanitizeInput(message), "user", true);
    const userId = userElement ? userElement.id : generateMessageId();
    state.conversationHistory.push({
      role: "user",
      content: message,
      id: userId,
      timestamp: new Date().toISOString(),
    });
    saveCurrentConversation();
  }

  /** Rebuilds the rolling prompt-history buffer from the loaded transcript. */
  private seedHistoryFromTranscript(): string[] {
    const lines: string[] = [];
    for (const msg of state.conversationHistory) {
      const content = typeof msg.content === "string" ? msg.content.trim() : "";
      if (!content) {
        continue;
      }
      if (msg.role === "user") {
        lines.push(`${this.userName}: ${content}`);
      } else if (msg.role === "assistant") {
        const name = msg.character?.name || "Speaker";
        lines.push(`${name}: ${content}`);
      }
    }
    return lines.slice(-HISTORY_BUFFER_LIMIT);
  }

  /** Emits a single character turn, streaming the response into a fresh bubble. */
  private async emitTurn(speaker: PartyCharacter, isFirst: boolean): Promise<void> {
    const loadingId = `party-${generateMessageId()}`;
    const labelHtml = `<div class="party-name">${escapeHtml(speaker.name)}</div>`;
    const messageElement = appendMessage("Assistant", `${labelHtml}${LOADING_HTML}`, "assistant", true);
    if (messageElement) {
      messageElement.id = loadingId;
      messageElement.classList.add("party");
    }

    const prompt = isFirst
      ? buildFirstTurnPrompt(speaker, this.characters, this.scenario)
      : buildTurnPrompt(this.scenario, this.history, this.userName);

    this.controller = new AbortController();

    let result: Awaited<ReturnType<typeof runTurn>> | null = null;
    let fatalError: unknown = null;
    try {
      result = await runTurn({
        inputMessages: [{ role: "user", content: prompt, id: `party-prompt-${loadingId}` }],
        model: getActiveModel(),
        systemOverride: buildCharacterSystemPrompt(speaker, this.resolveCharacterTools(speaker)),
        allowedTools: speaker.allowedTools || [],
        temperature: speaker.temperature,
        stream: true,
        loadingId,
        abortController: this.controller,
      });
    } catch (error) {
      const aborted = this.abort || (error instanceof Error && error.name === "AbortError");
      if (!aborted) {
        fatalError = error;
      }
    }

    const element = document.getElementById(loadingId);
    if (!element) {
      if (fatalError) {
        throw fatalError;
      }
      return;
    }

    const salvaged = result?.outputText?.trim() ? result.outputText : readStreamedText(element);

    if (salvaged.trim()) {
      finalizeStreamedResponse(element, {
        content: salvaged,
        reasoning: result?.reasoningText || "",
        response: result?.response,
        character: { name: speaker.name },
      });
      applyPartyNameLabel(element, speaker.name);
      this.recordHistoryEntry(speaker.name, salvaged);
    } else {
      removeLoadingIndicator(loadingId);
    }

    if (fatalError) {
      throw fatalError;
    }
  }

  /**
   * Resolves the descriptors for a character's selected tools, scoped to those
   * the active provider/model actually supports (the same set that will be sent
   * with the request). Used to make the character aware of its tools in the
   * system prompt without promising tools it can't actually call.
   */
  private resolveCharacterTools(speaker: PartyCharacter): PartyToolInfo[] {
    const allowed = speaker.allowedTools || [];
    if (!allowed.length) {
      return [];
    }
    const availableKeys = new Set(getAvailableToolKeys());
    return getToolCatalog()
      .filter((tool) => allowed.includes(tool.key) && availableKeys.has(tool.key))
      .map((tool) => ({ key: tool.key, displayName: tool.displayName, description: tool.description }));
  }

  /** Chooses the next speaker: alternate for two, AI decision for three or more. */
  private async chooseNextSpeaker(currentSpeaker: PartyCharacter): Promise<PartyCharacter> {
    if (this.characters.length === 2) {
      return this.characters.find((c) => c.id !== currentSpeaker.id) ?? currentSpeaker;
    }

    try {
      const body = buildRequestBody({
        inputMessages: [{ role: "user", content: buildDecisionPrompt(this.scenario, this.characters, this.history) }],
        model: getActiveModel(),
        temperature: 0.3,
        reasoningEffort: "low",
        verbosity: "low",
        maxOutputTokens: 2048,
        stream: false,
      });
      const response = await executeNonStreamingRequest(body, this.controller);
      const raw = extractOutputText(response) || "";
      const candidate = raw.split("|")[0]?.trim().toLowerCase();
      const match = this.characters.find((c) => c.name.toLowerCase() === candidate);
      if (match) {
        logParty("decision picked next speaker:", match.name, "—", raw);
        return match;
      }
      logParty("decision output didn't match a participant; using random fallback. Raw:", raw);
    } catch (error) {
      console.warn("Party: failed to choose next speaker, falling back to random.", error);
    }

    const fallback = this.pickRandomSpeaker(currentSpeaker.id);
    logParty("random next speaker:", fallback.name);
    return fallback;
  }

  private async waitIfPaused(): Promise<void> {
    if (this.pauseRequested && !this.paused) {
      this.paused = true;
      this.pauseRequested = false;
      this.refreshControlBar();
    }
    while (this.paused && !this.abort) {
      await waitFor(PAUSE_POLL_MS);
    }
  }

  private consumePendingInterjections(): boolean {
    if (!this.pendingInterjections.length) {
      return false;
    }
    for (const message of this.pendingInterjections) {
      this.recordHistoryEntry(this.userName, message);
    }
    this.pendingInterjections = [];
    this.skipDelayNextTurn = true;
    return true;
  }

  private recordHistoryEntry(name: string, content: string): void {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }
    this.history.push(`${name.trim() || "Speaker"}: ${trimmed}`);
    if (this.history.length > HISTORY_BUFFER_LIMIT) {
      this.history.splice(0, this.history.length - HISTORY_BUFFER_LIMIT);
    }
  }

  private pickInitialSpeaker(): PartyCharacter {
    return this.characters[Math.floor(Math.random() * this.characters.length)];
  }

  private pickRandomSpeaker(excludeId: string): PartyCharacter {
    const options = this.characters.filter((c) => c.id !== excludeId);
    if (!options.length) {
      return this.characters[0];
    }
    return options[Math.floor(Math.random() * options.length)];
  }

  private ensureControlBar(): HTMLElement | null {
    const existing = document.getElementById("party-control-bar");
    if (existing) {
      return existing;
    }
    const container = document.getElementById("chat-container");
    const inputContainer = container?.querySelector(".input-container");
    if (!container || !inputContainer) {
      return null;
    }
    const bar = document.createElement("div");
    bar.id = "party-control-bar";
    container.insertBefore(bar, inputContainer);
    return bar;
  }

  /** Renders the control bar to match the current state (running/paused/stopped). */
  refreshControlBar(): void {
    if (!state.partyMode || !state.activePartyConfig) {
      this.removeControlBar();
      return;
    }
    const bar = this.ensureControlBar();
    if (!bar) {
      return;
    }
    bar.innerHTML = "";

    const status = document.createElement("span");
    status.className = "party-status";
    bar.appendChild(status);

    if (this.running) {
      status.textContent = this.paused
        ? "Party paused"
        : this.pauseRequested
          ? "Pausing after this turn…"
          : "Party in progress — type any time to join in";

      const pauseResume = document.createElement("button");
      pauseResume.type = "button";
      pauseResume.textContent = this.paused ? "Resume" : "Pause";
      pauseResume.disabled = this.pauseRequested && !this.paused;
      pauseResume.addEventListener("click", () => {
        if (this.paused) {
          this.resume();
        } else {
          this.pause();
        }
      });

      const stop = document.createElement("button");
      stop.type = "button";
      stop.textContent = "Stop";
      stop.addEventListener("click", () => this.stop());

      bar.append(pauseResume, stop);
    } else {
      status.textContent = "Party stopped — resume to continue";
      const resume = document.createElement("button");
      resume.type = "button";
      resume.textContent = "Resume party";
      resume.addEventListener("click", () => {
        if (state.activePartyConfig) {
          void this.start(state.activePartyConfig);
        }
      });
      bar.appendChild(resume);
    }
  }

  private removeControlBar(): void {
    document.getElementById("party-control-bar")?.remove();
  }
}

/** Shared Party engine singleton. */
export const partyEngine = new PartyEngine();

// Let low-level modules (e.g. conversation reset) tear down a running party
// without importing the engine's heavy dependency graph.
uiHooks.stopParty = () => partyEngine.stop();
