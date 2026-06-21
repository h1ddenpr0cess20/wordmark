/**
 * Prompt templates for Party mode, adapted from the grokparty-web engine.
 *
 * Produces the per-character system prompt, the first- and subsequent-turn user
 * prompts (embedding a rolling transcript window), and the speaker-decision
 * prompt used when three or more characters are present.
 */

import type { PartyCharacter, PartyScenario } from "./partyTypes.ts";

/** Fallback display name for the user when none is configured. */
export const DEFAULT_USER_NAME = "Observer";

/**
 * Minimal descriptor of a tool a character may call, used to make the character
 * aware of its tools in the system prompt. Resolved by the engine from the tool
 * catalog so this module stays free of the tool-manager dependency graph.
 */
export interface PartyToolInfo {
  /** Catalog key (e.g. `builtin:web_search`); used to detect web search. */
  key: string;
  /** Human-readable tool name shown to the model. */
  displayName: string;
  /** Optional short description of what the tool does. */
  description?: string;
}

/**
 * Builds the system prompt that puts a model fully in character. When no persona
 * description is given, the character's name is used as the persona. When the
 * character has tools, a tool-awareness block is appended so the model knows the
 * tools exist and is nudged to use them when appropriate (party turns otherwise
 * never carry the main chat's tool instructions).
 */
export function buildCharacterSystemPrompt(character: PartyCharacter, tools: PartyToolInfo[] = []): string {
  const lines = [
    `Assume the personality of ${character.persona || character.name}.`,
    "Roleplay as them and never break character.",
    "Do not speak as anyone else.",
    "Keep responses concise (one to three sentences).",
    "Do not prefix responses with your name.",
  ];

  if (tools.length) {
    const list = tools
      .map((tool) => (tool.description ? `${tool.displayName} — ${tool.description}` : tool.displayName))
      .join("; ");
    lines.push(
      `You have access to these tools and should use them when they would help, rather than guessing or claiming you can't: ${list}.`,
    );
    if (tools.some((tool) => tool.key === "builtin:web_search")) {
      lines.push(
        "When the conversation touches on current events, facts, or anything you are unsure about, search the web before answering.",
      );
    }
  }

  return lines.join(" ");
}

/** Builds the opening-turn user prompt for the first speaker. */
export function buildFirstTurnPrompt(
  speaker: PartyCharacter,
  characters: PartyCharacter[],
  scenario: PartyScenario,
): string {
  const others = characters
    .filter((c) => c.id !== speaker.id)
    .map((c) => c.name)
    .join(", ");
  return `Start a ${scenario.conversationType} about ${scenario.topic || "anything"} with ${others}. The setting is ${scenario.setting || "anywhere"}. The mood is ${scenario.mood}. Begin naturally.`;
}

/**
 * Builds a subsequent-turn user prompt embedding the recent transcript. When the
 * most recent entry is a user interjection, instructs the speaker to address the
 * user directly first.
 */
export function buildTurnPrompt(scenario: PartyScenario, history: string[], userName: string): string {
  const recentHistory = history.slice(-6).join("\n");
  const latestEntry = history[history.length - 1] ?? "";
  const userInterjected = latestEntry.startsWith(`${userName}:`);
  const historySection = recentHistory
    ? `Here are the latest messages:\n\n${recentHistory}\n\n`
    : "";
  const followUpInstruction = [
    "Stay focused on the topic and respond in character.",
    userInterjected
      ? `The latest message is from ${userName}—address them directly using the name "${userName}" and answer their message before continuing the broader discussion.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `You're the next speaker in a ${scenario.conversationType} about ${scenario.topic || "anything"}. The setting is ${scenario.setting || "anywhere"}. The mood is ${scenario.mood}. ${historySection}${followUpInstruction}`;
}

/**
 * Builds the decision prompt that asks the model to pick the next speaker,
 * formatted as `<name>|<reason>`.
 */
export function buildDecisionPrompt(
  scenario: PartyScenario,
  characters: PartyCharacter[],
  history: string[],
): string {
  return `Based on this ${scenario.conversationType} history, reply with the name of the most likely next speaker (matching the participant name exactly) followed by a pipe and your reasoning. Format: <name>|<reason>. Avoid round-robin patterns.\n\nParticipants: ${characters
    .map((c) => c.name)
    .join(", ")}\n\nHistory:\n${history.join("\n")}`;
}
