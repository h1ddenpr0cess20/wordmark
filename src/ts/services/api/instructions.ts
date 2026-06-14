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
import { getMemoriesForPrompt } from "../../utils/memoryStorage.ts";
import { getLocationForPrompt } from "../location.ts";
import { getMediaToolInstructions } from "../mediaTools.ts";
import { getToolsDescription } from "../../components/tools.ts";
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
 */
export function buildDeveloperMessage() {
  const instructions = buildInstructions();
  if (!instructions) {
    return "";
  }
  const locationInfo = getLocationForPrompt();
  const timestamp = buildTimestampString();
  let developerBlock = instructions;
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
    if (mediaToolInstructions) {
      developerBlock += `\n${mediaToolInstructions.trim()}`;
    }
  }
  const memories = getMemoriesForPrompt();
  if (memories) {
    developerBlock += `\n${memories.trim()}`;
  }
  const trimmed = developerBlock.trim();
  return trimmed ? trimmed : null;
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
