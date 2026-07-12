/**
 * Skills store: persistence for Anthropic-style agent skills.
 *
 * @remarks
 * A "skill" is a named instruction package — `{ id, name, description,
 * instructions }` — that the model can activate on demand, optionally carrying
 * bundled resource files:
 *
 *  - The model is shown only each enabled skill's name + description (cheap
 *    progressive disclosure); it loads the full `instructions` via the
 *    `activate_skill` tool, and any bundled `resources` via `read_skill_resource`
 *    (see {@link ./skills.ts}). On providers that cannot call client-side tools,
 *    enabled skills' instructions are inlined instead. Skills activate naturally
 *    — there is no keyword matching.
 *
 * Built-in skills ship in {@link STATIC_SKILLS}; user-authored skills live in
 * localStorage and round-trip to/from the `SKILL.md` text format via
 * {@link serializeSkillMarkdown} / {@link parseSkillMarkdown}. This module is
 * pure persistence/serialization — no DOM or request-pipeline concerns.
 */

import { STORAGE_KEYS, readJSON, writeJSON } from "../../utils/storage/storage.ts";
import { createScopedLogger } from "../../utils/logger.ts";
import exampleFrontendSkillMarkdown from "../../../../skills/frontend-dev.md?raw";
import exampleEmailSkillMarkdown from "../../../../skills/email-writing.md?raw";
import exampleBrainstormSkillMarkdown from "../../../../skills/brainstorming.md?raw";

/** Bundled example skills seeded on first run (see {@link seedExampleSkills}). */
const EXAMPLE_SKILL_MARKDOWN = [
  exampleFrontendSkillMarkdown,
  exampleEmailSkillMarkdown,
  exampleBrainstormSkillMarkdown,
];

const logSkills = createScopedLogger("skills");

/** Where a skill came from: shipped in code vs. authored/imported by the user. */
export type SkillSource = "builtin" | "user";

/** A named reference file bundled with a skill, loaded on demand. */
export interface SkillResource {
  /** Unique-within-skill name, e.g. `cheatsheet.md`. */
  name: string;
  /** The resource's text content. */
  content: string;
}

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
  /** Bundled reference files, loaded on demand via `read_skill_resource`. */
  resources: SkillResource[];
  /** Origin of the skill; user skills are editable/removable. */
  source: SkillSource;
}

/** The user-supplied fields when creating or editing a skill. */
export interface SkillInput {
  name: string;
  description: string;
  instructions: string;
  resources?: SkillResource[];
}

/**
 * Built-in skills shipped in code. Intentionally empty: skills are authored as
 * `SKILL.md` files. The bundled examples in `skills/*.md` are seeded into
 * localStorage as user skills on first run (see {@link seedExampleSkills}),
 * and users can upload their own.
 */
export const STATIC_SKILLS: SkillDefinition[] = [];

/** Normalizes a partial/legacy stored object into a full {@link SkillDefinition}. */
function normalizeStored(raw: Partial<SkillDefinition> | null | undefined): SkillDefinition | null {
  if (!raw || typeof raw.id !== "string" || typeof raw.name !== "string") {
    return null;
  }
  return {
    id: raw.id,
    name: raw.name,
    description: typeof raw.description === "string" ? raw.description : "",
    instructions: typeof raw.instructions === "string" ? raw.instructions : "",
    resources: Array.isArray(raw.resources)
      ? raw.resources.filter((r): r is SkillResource => Boolean(r && typeof r.name === "string" && typeof r.content === "string"))
      : [],
    source: "user",
  };
}

/** Reads user-authored skills from localStorage, or `[]` on failure. */
function loadUserSkills(): SkillDefinition[] {
  const parsed = readJSON<Partial<SkillDefinition>[]>(STORAGE_KEYS.skills, []);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.map(normalizeStored).filter((s): s is SkillDefinition => s !== null);
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

/** Validates and normalizes a {@link SkillInput}, throwing on missing fields. */
function normalizeInput(input: SkillInput) {
  const name = input.name.trim();
  const instructions = input.instructions.trim();
  if (!name) {
    throw new Error("Skill name is required");
  }
  if (!instructions) {
    throw new Error("Skill instructions are required");
  }
  return {
    name,
    instructions,
    description: input.description.trim(),
    resources: (input.resources || [])
      .map(r => ({ name: r.name.trim(), content: r.content }))
      .filter(r => r.name && r.content.trim()),
  };
}

/**
 * Adds a user skill built from the supplied fields, generating a unique id from
 * the name. Throws when name or instructions are empty.
 *
 * @returns The stored {@link SkillDefinition}.
 */
export function addUserSkill(input: SkillInput): SkillDefinition {
  const fields = normalizeInput(input);
  const existingIds = new Set(getAllSkills().map(skill => skill.id));
  const base = `user:${slugify(fields.name)}`;
  let id = base;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${base}-${suffix++}`;
  }

  const skill: SkillDefinition = { id, source: "user", ...fields };
  saveUserSkills([...loadUserSkills(), skill]);
  return skill;
}

/**
 * Updates an existing user skill in place. Built-in skills cannot be edited.
 *
 * @returns The updated {@link SkillDefinition}.
 * @throws When the id is unknown or refers to a built-in skill.
 */
export function updateUserSkill(id: string, input: SkillInput): SkillDefinition {
  const userSkills = loadUserSkills();
  const index = userSkills.findIndex(skill => skill.id === id);
  if (index === -1) {
    throw new Error("Only user-authored skills can be edited");
  }
  const fields = normalizeInput(input);
  const updated: SkillDefinition = { id, source: "user", ...fields };
  userSkills[index] = updated;
  saveUserSkills(userSkills);
  return updated;
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

/**
 * Seeds the bundled example skills (`skills/*.md`) into storage so users start
 * with skills already listed and enabled.
 *
 * @remarks
 * Each example is tracked individually (by name) in a persisted "already seeded"
 * list, so:
 *  - a user who deletes a seeded example won't see it return, and
 *  - examples added in a later release are seeded for existing users too,
 *    rather than being skipped by a single global "seeded once" flag.
 *
 * Idempotent and safe to call on every startup.
 */
export function seedExampleSkills() {
  const stored = readJSON<string[]>(STORAGE_KEYS.skillsSeededExamples, []);
  const seeded = new Set(Array.isArray(stored) ? stored : []);
  let changed = false;

  EXAMPLE_SKILL_MARKDOWN.forEach(markdown => {
    let input: SkillInput;
    try {
      input = parseSkillMarkdown(markdown);
    } catch (err) {
      logSkills("Failed to parse example skill:", err);
      return;
    }
    if (seeded.has(input.name)) {
      return;
    }
    try {
      if (!getAllSkills().some(skill => skill.name === input.name)) {
        const skill = addUserSkill(input);
        setSkillEnabled(skill.id, true);
      }
      seeded.add(input.name);
      changed = true;
    } catch (err) {
      logSkills("Failed to seed example skill:", err);
    }
  });

  if (changed) {
    writeJSON(STORAGE_KEYS.skillsSeededExamples, [...seeded]);
  }
}


const RESOURCE_OPEN = /<!--\s*skill:resource\s+name="([^"]+)"\s*-->/;
const RESOURCE_BLOCK = /<!--\s*skill:resource\s+name="([^"]+)"\s*-->\n([\s\S]*?)\n<!--\s*\/skill:resource\s*-->/g;

/**
 * Serializes a skill to the `SKILL.md` text format: YAML-style frontmatter
 * (`name`, `description`) followed by the instructions body and any bundled
 * resources as HTML-comment-delimited blocks. Round-trips with
 * {@link parseSkillMarkdown}.
 */
export function serializeSkillMarkdown(skill: SkillDefinition): string {
  const lines = ["---", `name: ${skill.name}`, `description: ${skill.description}`, "---", "", skill.instructions.trim(), ""];
  skill.resources.forEach(resource => {
    lines.push(`<!-- skill:resource name="${resource.name}" -->`, resource.content.trim(), "<!-- /skill:resource -->", "");
  });
  return lines.join("\n").trim() + "\n";
}

/**
 * Parses `SKILL.md` text into a {@link SkillInput}. Accepts an optional
 * frontmatter block (`name`, `description`); falls back to the first Markdown
 * heading or `Imported Skill` for the name when no frontmatter is present.
 *
 * @throws When the resulting instructions body is empty.
 */
export function parseSkillMarkdown(text: string): SkillInput {
  let body = text.replace(/\r\n/g, "\n").trim();
  let name = "";
  let description = "";

  const fmMatch = body.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fmMatch) {
    body = body.slice(fmMatch[0].length);
    fmMatch[1].split("\n").forEach(line => {
      const idx = line.indexOf(":");
      if (idx === -1) {
        return;
      }
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (key === "name") {
        name = value;
      } else if (key === "description") {
        description = value;
      }
    });
  }

  const resources: SkillResource[] = [];
  let match: RegExpExecArray | null;
  RESOURCE_BLOCK.lastIndex = 0;
  while ((match = RESOURCE_BLOCK.exec(body)) !== null) {
    resources.push({ name: match[1].trim(), content: match[2].trim() });
  }
  body = body.replace(RESOURCE_BLOCK, "").trim();
  body = body.replace(RESOURCE_OPEN, "").trim();

  if (!name) {
    const heading = body.match(/^#\s+(.+)$/m);
    name = heading ? heading[1].trim() : "Imported Skill";
  }
  if (!body) {
    throw new Error("SKILL.md has no instructions body");
  }

  return { name, description, instructions: body, resources };
}
