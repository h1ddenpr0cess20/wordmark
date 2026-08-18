/**
 * System/developer instruction assembly.
 *
 * @remarks
 * Resolves the active system prompt from the prompt-mode settings (no prompt /
 * custom / personality / default) and builds the developer message that augments
 * it with location context, a timestamp, tool descriptions, and stored memories.
 * Separated from message serialization in {@link ./messageUtils.ts} so prompt
 * assembly is independently testable.
 */

import { elements, state } from "../../init/state.ts";
import { getMemoriesForPrompt } from "../../utils/storage/memoryStorage.ts";
import { getLocationForPrompt } from "../location.ts";
import { getMediaToolInstructions } from "../mediaTools.ts";
import { getToolsDescription } from "../../components/tools.ts";
import { getSkillsDescription } from "../skills/skills.ts";
import { getEnabledToolDefinitions, supportsClientSideTools } from "./toolManager.ts";
import { buildCompactedSummaryBlock } from "./compaction.ts";
import { buildRunInstructions } from "../agent/agentPrompts.ts";
import { DEFAULT_PERSONALITY, DEFAULT_SYSTEM_PROMPT, PERSONALITY_PROMPT_TEMPLATE, config } from "../../../config/config.ts";

/**
 * Resolves the active system instructions from the prompt settings: empty for
 * "no prompt", the custom prompt, the personality prompt, or the default.
 */
export function buildInstructions() {
  if (elements.noPromptRadio && elements.noPromptRadio.checked) {
    return "";
  }
  if (elements.customPromptRadio && elements.customPromptRadio.checked && elements.systemPromptCustom) {
    const custom = elements.systemPromptCustom.value.trim();
    if (custom) {
      return custom;
    }
  }
  if (elements.personalityPromptRadio && elements.personalityPromptRadio.checked) {
    return buildPersonalityInstruction();
  }
  const basePrompt = DEFAULT_SYSTEM_PROMPT || "";
  return `${basePrompt}${state.shortResponseGuideline || ""}`.trim();
}

/**
 * Builds the developer/system message: the active instructions augmented with
 * location context and the current timestamp. Returns `""` when there are no
 * instructions.
 *
 * @remarks
 * When the conversation has been compacted, the running summary is appended
 * last. It rides here rather than in the message list because the turns it
 * replaces have been trimmed out of the request (see
 * {@link ../../components/interaction.ts}) — the developer message is the only
 * channel that survives the history window. Last position is deliberate: the
 * block's framing tells the model to follow "the instructions above", so
 * everything it defers to must already have been emitted. It is appended even
 * in "no prompt" mode, where it becomes the whole developer message, since
 * dropping it would lose the conversation's earlier context outright.
 */
export function buildDeveloperMessage() {
  const instructions = buildInstructions();
  let developerBlock = instructions;

  if (instructions) {
    const locationInfo = getLocationForPrompt();
    const timestamp = buildTimestampString();
    if (locationInfo && !developerBlock.includes(locationInfo)) {
      developerBlock += `\nCurrent location context${locationInfo}`;
    }
    if (!developerBlock.includes(timestamp)) {
      developerBlock += `\n(Generated on ${timestamp})`;
    }
    if (config?.enableFunctionCalling) {
      const toolsDescription = getToolsDescription();
      if (toolsDescription) {
        developerBlock += `\n${toolsDescription.trim()}`;
      }
      const mediaToolInstructions = getMediaToolInstructions();
      if (mediaToolInstructions && hasImageEditTool()) {
        developerBlock += `\n${mediaToolInstructions.trim()}`;
      }
    }
  }

  const skillsCanUseTool = config?.enableFunctionCalling !== false && supportsClientSideTools();
  const skillsDescription = getSkillsDescription(skillsCanUseTool);
  if (skillsDescription) {
    developerBlock += `\n${skillsDescription.trim()}`;
  }

  if (instructions) {
    const memories = getMemoriesForPrompt();
    if (memories) {
      developerBlock += `\n${memories.trim()}`;
    }
  }

  // Ahead of the summary because it frames what the turn is for; the summary's
  // closing block defers to "the instructions above" and must stay last.
  const runBlock = buildActiveRunBlock();
  if (runBlock) {
    developerBlock += `\n\n${runBlock}`;
  }

  const summaryBlock = buildCompactedSummaryBlock(state.compactedSummary);
  if (summaryBlock) {
    developerBlock += `\n\n${summaryBlock}`;
  }

  const trimmed = developerBlock.trim();
  return trimmed ? trimmed : "";
}

/**
 * Builds the autonomous-run guidance for the developer message, or `""` when no
 * run is in progress.
 *
 * @remarks
 * Reads the run straight off {@link state} rather than from the run engine:
 * the engine imports the request client, which imports this module, so an
 * import here would close the cycle.
 */
function buildActiveRunBlock(): string {
  const run = state.agentRun;
  if (!run || run.status !== "running") {
    return "";
  }
  return buildRunInstructions(run.goal, run.turnsUsed, run.maxTurns, hasQueueFollowupTool());
}

/** Reports whether `queue_followup` will actually be offered in this request. */
function hasQueueFollowupTool(): boolean {
  if (config?.enableFunctionCalling === false) {
    return false;
  }
  return getEnabledToolDefinitions().some(def => def.type === "function" && def.name === "queue_followup");
}

const IMAGE_EDIT_TOOL_NAMES = new Set(["grok_edit_image", "openai_edit_image"]);

/**
 * Reports whether the current request will include an image-editing tool
 * (the OpenAI built-in image tool or a Grok/OpenAI edit-image function),
 * so the media-tool guidance is only injected when it can apply.
 */
function hasImageEditTool() {
  return getEnabledToolDefinitions().some(def =>
    def.type === "image_generation"
    || (def.type === "function" && typeof def.name === "string" && IMAGE_EDIT_TOOL_NAMES.has(def.name)));
}

function buildPersonalityInstruction() {
  const personality = (elements.personalityInput && elements.personalityInput.value.trim())
    || DEFAULT_PERSONALITY
    || "a helpful assistant";
  const template = PERSONALITY_PROMPT_TEMPLATE
    || "Assume the personality of {personality}. Roleplay and never break character.{guideline}";
  const guideline = state.shortResponseGuideline || "";
  const datetime = buildTimestampString();
  const location = getLocationForPrompt();
  return template
    .replace("{personality}", personality)
    .replace("{guideline}", guideline)
    .replace("{datetime}", datetime)
    .replace("{location}", location || "Unknown location");
}

function buildTimestampString() {
  try {
    const options: Intl.DateTimeFormatOptions = { dateStyle: "full", timeStyle: "short" };
    return new Intl.DateTimeFormat(undefined, options).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}
