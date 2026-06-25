/**
 * Skill activation logic: the `activate_skill` tool and prompt-injection text.
 *
 * @remarks
 * Implements Anthropic-style progressive disclosure for the skills defined in
 * {@link ./skillsStore.ts}:
 *
 *  - On providers/models that support client-side tool calls, the model sees
 *    only each enabled skill's name + description (built by
 *    {@link getSkillsDescription}) and calls {@link ACTIVATE_SKILL_TOOL_NAME}
 *    to pull a skill's full instructions on demand. The tool handler is
 *    registered into the shared {@link toolImplementations} registry at load.
 *  - On providers that cannot call client-side tools (e.g. some local models
 *    or xAI multi-agent models), {@link getSkillsDescription} falls back to
 *    inlining the full instructions of every enabled skill directly, so skills
 *    still work everywhere.
 *
 * The tool definition is appended to outgoing requests by `toolManager.ts`; the
 * description is appended to the developer message by `instructions.ts`.
 */

import { toolImplementations } from "../toolImplementations.ts";
import { getEnabledSkills, getSkillById } from "./skillsStore.ts";
import type { ToolDefinition } from "../../../types/tools.ts";

/** The function-tool name the model calls to load a skill's full instructions. */
export const ACTIVATE_SKILL_TOOL_NAME = "activate_skill";

/** Provider-facing definition for the `activate_skill` function tool. */
export const activateSkillToolDefinition: ToolDefinition = {
  type: "function",
  name: ACTIVATE_SKILL_TOOL_NAME,
  description:
    "Load the full instructions for one of the available skills before using it. "
    + "Call this when a user's request matches a skill listed in the developer message, "
    + "then follow the returned instructions for the rest of your reply.",
  parameters: {
    type: "object",
    properties: {
      skill_id: {
        type: "string",
        description: "The id of the skill to activate, exactly as listed in the available skills.",
      },
    },
    required: ["skill_id"],
    additionalProperties: false,
  },
  strict: true,
};

/**
 * Handler for `activate_skill`: returns the requested skill's full instructions.
 *
 * @param args - Tool arguments; `args.skill_id` is the skill to activate.
 * @returns `{ ok, id, name, instructions }` on success, or `{ ok: false, message }`.
 */
toolImplementations[ACTIVATE_SKILL_TOOL_NAME] = function(args: { skill_id?: string } = {}) {
  const skillId = typeof args?.skill_id === "string" ? args.skill_id.trim() : "";
  if (!skillId) {
    return { ok: false, message: "Missing skill_id" };
  }
  const skill = getSkillById(skillId);
  if (!skill) {
    return { ok: false, message: `No skill found with id "${skillId}"` };
  }
  return {
    ok: true,
    id: skill.id,
    name: skill.name,
    instructions: skill.instructions,
  };
};

/**
 * Builds the skills section of the developer message.
 *
 * @param clientSideToolsSupported - When `true`, lists only names/descriptions
 *   and points the model at `activate_skill`; when `false`, inlines the full
 *   instructions of every enabled skill (no tool call possible).
 * @returns The section text (with a leading newline), or `""` when no skills
 *   are enabled.
 */
export function getSkillsDescription(clientSideToolsSupported: boolean): string {
  const skills = getEnabledSkills();
  if (!skills.length) {
    return "";
  }

  if (clientSideToolsSupported) {
    const lines = skills.map(skill => {
      const desc = skill.description ? `: ${skill.description}` : "";
      return `- [${skill.id}] ${skill.name}${desc}`;
    });
    return `\nAvailable skills. When a request matches one, call ${ACTIVATE_SKILL_TOOL_NAME} `
      + `with its id to load its full instructions, then follow them:\n${lines.join("\n")}\n`;
  }

  const blocks = skills.map(skill => {
    const header = skill.description ? `## ${skill.name} — ${skill.description}` : `## ${skill.name}`;
    return `${header}\n${skill.instructions.trim()}`;
  });
  return `\nActive skills — apply the relevant instructions below when they fit the request:\n\n${blocks.join("\n\n")}\n`;
}
