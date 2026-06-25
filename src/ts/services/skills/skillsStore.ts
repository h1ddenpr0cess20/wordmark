/**
 * Skills store: persistence for Anthropic-style agent skills.
 *
 * @remarks
 * A "skill" is a named instruction package — `{ id, name, description,
 * instructions }` — that the model can activate on demand. The model is shown
 * only each skill's name and description (cheap progressive disclosure); the
 * full `instructions` are loaded when the skill is activated via the
 * `activate_skill` tool (see {@link ./skills.ts}).
 *
 * Built-in skills ship in {@link STATIC_SKILLS}; user-authored skills live in
 * localStorage. Per-skill enable/disable preferences are persisted separately,
 * mirroring the tool-preference pattern in
 * {@link ../api/tools/preferences.ts}. This module is pure persistence — no DOM
 * or request-pipeline concerns.
 */

import { STORAGE_KEYS, readJSON, writeJSON } from "../../utils/storage/storage.ts";
import { createScopedLogger } from "../../utils/logger.ts";

const logSkills = createScopedLogger("skills");

/** Where a skill came from: shipped in code vs. authored by the user. */
export type SkillSource = "builtin" | "user";

/** A named instruction package the model can activate on demand. */
export interface SkillDefinition {
  /** Stable, unique identifier (also the value passed to `activate_skill`). */
  id: string;
  /** Short human/model-facing name. */
  name: string;
  /** One-line summary shown to the model for discovery. */
  description: string;
  /** Full guidance injected into context when the skill is activated. */
  instructions: string;
  /** Origin of the skill; user skills are editable/removable. */
  source: SkillSource;
}

/** Built-in skills seeded for every user. Edit here to ship more. */
export const STATIC_SKILLS: SkillDefinition[] = [
  {
    id: "builtin:concise-writing",
    name: "Concise Writing",
    description: "Tighten prose: cut filler, prefer plain words, keep structure.",
    source: "builtin",
    instructions: [
      "Apply these editing principles to the response:",
      "- Lead with the point; put the conclusion first.",
      "- Delete filler (\"in order to\" -> \"to\", \"due to the fact that\" -> \"because\").",
      "- Prefer short, common words over long or abstract ones.",
      "- Use active voice and concrete subjects.",
      "- Keep sentences to one idea; break up runs of clauses.",
      "- Preserve the user's meaning and any required detail — concise, not lossy.",
    ].join("\n"),
  },
  {
    id: "builtin:commit-message",
    name: "Commit Message",
    description: "Write a clean Conventional-Commits-style git commit message from a change description.",
    source: "builtin",
    instructions: [
      "Produce a git commit message:",
      "- Subject line: `<type>(<scope>): <summary>` in the imperative mood, <= 50 chars where practical.",
      "  Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore.",
      "- Blank line, then a body wrapped at ~72 chars explaining what and why (not how).",
      "- Reference issues/breaking changes in a footer when relevant.",
      "- Output only the commit message, no surrounding prose or code fences.",
    ].join("\n"),
  },
];

/** Reads user-authored skills from localStorage, or `[]` on failure. */
function loadUserSkills(): SkillDefinition[] {
  const parsed = readJSON<SkillDefinition[]>(STORAGE_KEYS.skills, []);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .filter((s): s is SkillDefinition => Boolean(s && typeof s.id === "string" && typeof s.name === "string"))
    .map(s => ({ ...s, source: "user" as const }));
}

/** Persists the full list of user-authored skills. Errors are logged, not thrown. */
function saveUserSkills(skills: SkillDefinition[]) {
  try {
    writeJSON(STORAGE_KEYS.skills, skills);
  } catch (err) {
    logSkills("Failed to persist skills:", err);
  }
}

/** Returns all skills, built-ins first, followed by user-authored skills. */
export function getAllSkills(): SkillDefinition[] {
  return [...STATIC_SKILLS, ...loadUserSkills()];
}

/** Returns a single skill by id, or `undefined` when absent. */
export function getSkillById(id: string): SkillDefinition | undefined {
  return getAllSkills().find(skill => skill.id === id);
}

/** Slugifies a name into an `id`-safe token. */
function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "skill";
}

/**
 * Adds a user skill built from the supplied fields, generating a unique id from
 * the name. Throws when name or instructions are empty.
 *
 * @returns The stored {@link SkillDefinition}.
 */
export function addUserSkill(input: { name: string; description: string; instructions: string }): SkillDefinition {
  const name = input.name.trim();
  const instructions = input.instructions.trim();
  if (!name) {
    throw new Error("Skill name is required");
  }
  if (!instructions) {
    throw new Error("Skill instructions are required");
  }

  const existingIds = new Set(getAllSkills().map(skill => skill.id));
  const base = `user:${slugify(name)}`;
  let id = base;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${base}-${suffix++}`;
  }

  const skill: SkillDefinition = {
    id,
    name,
    description: input.description.trim(),
    instructions,
    source: "user",
  };
  saveUserSkills([...loadUserSkills(), skill]);
  return skill;
}

/**
 * Removes a user skill by id. Built-in skills cannot be removed.
 *
 * @returns `true` when a skill was removed.
 */
export function removeUserSkill(id: string): boolean {
  const userSkills = loadUserSkills();
  const filtered = userSkills.filter(skill => skill.id !== id);
  if (filtered.length === userSkills.length) {
    return false;
  }
  saveUserSkills(filtered);
  removeSkillPreference(id);
  return true;
}

// --- Enable/disable preferences -------------------------------------------

let skillPreferences = loadSkillPreferences();

/** Reads the persisted enable/disable map, or `{}`. */
function loadSkillPreferences(): Record<string, boolean> {
  const parsed = readJSON<Record<string, boolean>>(STORAGE_KEYS.skillPreferences, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function saveSkillPreferences(prefs: Record<string, boolean>) {
  try {
    writeJSON(STORAGE_KEYS.skillPreferences, prefs);
  } catch (err) {
    logSkills("Failed to persist skill preferences:", err);
  }
}

/** Reports whether a skill is enabled. Skills default to disabled. */
export function isSkillEnabled(id: string): boolean {
  return Boolean(skillPreferences[id]);
}

/** Enables or disables a skill and persists the change. */
export function setSkillEnabled(id: string, enabled: boolean) {
  skillPreferences = { ...skillPreferences, [id]: Boolean(enabled) };
  saveSkillPreferences(skillPreferences);
}

/** Drops a skill's stored preference (used when a user skill is removed). */
export function removeSkillPreference(id: string) {
  if (Object.prototype.hasOwnProperty.call(skillPreferences, id)) {
    delete skillPreferences[id];
    saveSkillPreferences(skillPreferences);
  }
}

/** Returns the enabled skills in catalog order (built-ins first). */
export function getEnabledSkills(): SkillDefinition[] {
  return getAllSkills().filter(skill => isSkillEnabled(skill.id));
}
