/**
 * Skill activation logic: the skill tools and prompt-injection text.
 *
 * @remarks
 * Implements Anthropic-style progressive disclosure for the skills defined in
 * {@link ./skillsStore.ts}:
 *
 *  - **Discovery.** On providers/models that support client-side tool calls, the
 *    model sees only each enabled skill's name + description (built by
 *    {@link getSkillsDescription}) and calls {@link ACTIVATE_SKILL_TOOL_NAME} to
 *    pull a skill's full instructions, then {@link READ_SKILL_RESOURCE_TOOL_NAME}
 *    for any bundled reference files — both on demand. The model decides when a
 *    skill is relevant; there is no keyword matching.
 *  - **Fallback.** On providers that cannot call client-side tools, every
 *    enabled skill's instructions are inlined.
 *
 * Tool handlers register into the shared {@link toolImplementations} registry at
 * load; the tool definitions are appended to outgoing requests by
 * `toolManager.ts`; the description is appended to the developer message by
 * `instructions.ts`.
 */

import { toolImplementations } from "../toolImplementations.ts";
import { getEnabledSkills, getSkillById, type SkillDefinition } from "./skillsStore.ts";
import type { ToolDefinition } from "../../../types/tools.ts";

/** The function-tool name the model calls to load a skill's full instructions. */
export const ACTIVATE_SKILL_TOOL_NAME = "activate_skill";

/** The function-tool name the model calls to read a skill's bundled resource. */
export const READ_SKILL_RESOURCE_TOOL_NAME = "read_skill_resource";

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

/** Provider-facing definition for the `read_skill_resource` function tool. */
export const readSkillResourceToolDefinition: ToolDefinition = {
  type: "function",
  name: READ_SKILL_RESOURCE_TOOL_NAME,
  description:
    "Read a named reference file bundled with an activated skill. "
    + "Call this only after activate_skill lists one or more resources for the skill.",
  parameters: {
    type: "object",
    properties: {
      skill_id: {
        type: "string",
        description: "The id of the skill that owns the resource.",
      },
      resource_name: {
        type: "string",
        description: "The exact name of the resource to read, as listed by activate_skill.",
      },
    },
    required: ["skill_id", "resource_name"],
    additionalProperties: false,
  },
  strict: true,
};

/**
 * Handler for `activate_skill`: returns the requested skill's full instructions
 * and the names of any bundled resources.
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
    resources: skill.resources.map(resource => resource.name),
  };
};

/** Handler for `read_skill_resource`: returns a bundled resource's content. */
toolImplementations[READ_SKILL_RESOURCE_TOOL_NAME] = function(args: { skill_id?: string; resource_name?: string } = {}) {
  const skillId = typeof args?.skill_id === "string" ? args.skill_id.trim() : "";
  const resourceName = typeof args?.resource_name === "string" ? args.resource_name.trim() : "";
  if (!skillId || !resourceName) {
    return { ok: false, message: "Both skill_id and resource_name are required" };
  }
  const skill = getSkillById(skillId);
  if (!skill) {
    return { ok: false, message: `No skill found with id "${skillId}"` };
  }
  const resource = skill.resources.find(item => item.name === resourceName);
  if (!resource) {
    return { ok: false, message: `Skill "${skillId}" has no resource named "${resourceName}"` };
  }
  return { ok: true, id: skill.id, resource_name: resource.name, content: resource.content };
};

/** Reports whether any enabled skill bundles at least one resource. */
export function hasEnabledSkillResources(): boolean {
  return getEnabledSkills().some(skill => skill.resources.length > 0);
}

/**
 * Formats one skill's full instructions for inlining into the developer message.
 * Used only on providers that cannot call tools, so any bundled resources are
 * inlined directly (the model has no `read_skill_resource` to call).
 */
function inlineSkillBlock(skill: SkillDefinition): string {
  const header = skill.description ? `## ${skill.name} — ${skill.description}` : `## ${skill.name}`;
  const lines = [header, skill.instructions.trim()];
  skill.resources.forEach(resource => {
    lines.push(`\n### Resource: ${resource.name}\n${resource.content.trim()}`);
  });
  return lines.join("\n");
}

/**
 * Builds the skills section of the developer message.
 *
 * @param clientSideToolsSupported - When `true`, skills are listed by
 *   name/description for the model to load via `activate_skill` when relevant;
 *   when `false`, all enabled skills are inlined (no tool call possible).
 * @returns The section text (with a leading newline), or `""` when no skills are
 *   enabled.
 */
export function getSkillsDescription(clientSideToolsSupported: boolean): string {
  const enabled = getEnabledSkills();
  if (!enabled.length) {
    return "";
  }

  if (clientSideToolsSupported) {
    const list = enabled.map(skill => {
      const desc = skill.description ? `: ${skill.description}` : "";
      const resourceNote = skill.resources.length ? " (has resources)" : "";
      return `- [${skill.id}] ${skill.name}${desc}${resourceNote}`;
    });
    return `\nAvailable skills. When a request matches one, call ${ACTIVATE_SKILL_TOOL_NAME} with its id `
      + `to load its full instructions, then follow them:\n${list.join("\n")}\n`;
  }

  return "\nActive skills — apply the relevant instructions below when they fit the request:\n\n"
    + `${enabled.map(inlineSkillBlock).join("\n\n")}\n`;
}
