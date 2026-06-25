# Skills

Wordmark supports **agent skills**: named instruction packages the assistant can load on demand to specialize its behavior for a task. Skills are authored as `SKILL.md` files and uploaded — the assistant is shown only each enabled skill's name and one‑line description, and pulls the full instructions itself when a request matches. Everything is stored locally in your browser; nothing is sent anywhere except the AI provider you choose.

## Quick Start
- Open Settings → **Skills** tab
- A few example skills ship pre‑loaded and enabled (Frontend Development, Email Assistant, Brainstorming Partner)
- Toggle a skill on/off — changes take effect immediately
- Upload your own with **Upload Skill** (a `SKILL.md` file)
- Export any skill to get a `SKILL.md` you can edit and re‑upload
- Remove an uploaded skill with its delete button (built‑in examples can be deleted too)

## How Skills Activate
Skills activate **naturally** — there is no keyword matching.

- **On providers/models that support tool calling** (OpenAI, xAI, most local models), the assistant sees the list of enabled skills (name + description) and calls the `activate_skill` tool when a request matches, loading that skill's full instructions for the turn. If the skill bundles resource files, it can read them on demand with `read_skill_resource`.
- **On providers/models that cannot call client‑side tools**, every enabled skill's instructions (and any resources) are inlined into the system prompt instead, so skills still work.

When a skill is loaded you'll see a `Loaded skill: <name>` notification, and the reasoning panel notes the load.

A loaded skill's full instructions are only present for the turn that used them — they are stripped from the conversation history before the next request, so they never accumulate in context.

> Tip (local models): on‑demand activation depends on the model actually calling `activate_skill`. Smaller local models may not call tools reliably; if a skill isn't loading, try a more capable model.

## The `SKILL.md` Format
A skill is a Markdown file with optional YAML‑style frontmatter followed by the instruction body. Bundled resources are HTML‑comment‑delimited blocks.

```markdown
---
name: Email Assistant
description: Use when drafting, replying to, or polishing an email or message.
---

You help the user write effective emails and messages.

- Lead with the point; make the ask explicit.
- Match the requested tone and keep it concise.

<!-- skill:resource name="checklist.md" -->
- [ ] Clear subject line
- [ ] One obvious call to action
<!-- /skill:resource -->
```

- `name` — display name (falls back to the first Markdown heading, then `Imported Skill`)
- `description` — the one line shown to the assistant for discovery
- Body — the full instructions loaded on activation
- `skill:resource` blocks — optional reference files, loaded on demand via `read_skill_resource`

Example skill files live in the repo under `skills/`.

## UI Reference
- Tab button: `#tab-skills` (panel `#content-skills`)
- Skill list container: `#skills-list`
- Upload button: `#import-skill` (hidden file input `#import-skill-input`)
- Per‑skill controls: enable toggle, export (download), and delete (uploaded skills)

## Under the Hood
- Storage: `localStorage`
  - Skills: `wordmark_skills`
  - Enable preferences: `wordmark_skill_preferences` (skills default to disabled; uploaded/seeded skills are enabled on add)
  - Seeded‑example tracking: `wordmark_skills_seeded_examples` (per‑example, by name, so newly shipped examples seed for existing users while deleted ones are not resurrected)
- Bundled examples: `skills/*.md`, imported via Vite `?raw` and seeded on first run by `seedExampleSkills()`
- Discovery / prompt text: `getSkillsDescription()` appends the skills section in `buildDeveloperMessage()` (`src/ts/services/api/instructions.ts`)
- Request‑time tools: `getEnabledToolDefinitions()` appends `activate_skill` (and `read_skill_resource` when an enabled skill has resources) in `src/ts/services/api/toolManager.ts`
- Context hygiene: `stripSkillToolMessages()` removes prior skill tool calls/outputs from the carried history in `runTurn` (`src/ts/services/api/requestClient.ts`)

### Function Calling Tools
- `activate_skill({ skill_id })` → returns the skill's full instructions and the names of any bundled resources
- `read_skill_resource({ skill_id, resource_name })` → returns a bundled resource's content

### Public Functions
Store (`src/ts/services/skills/skillsStore.ts`):
- `getAllSkills()`, `getSkillById(id)`, `getEnabledSkills()`
- `addUserSkill(input)`, `updateUserSkill(id, input)`, `removeUserSkill(id)`
- `isSkillEnabled(id)`, `setSkillEnabled(id, enabled)`
- `serializeSkillMarkdown(skill)`, `parseSkillMarkdown(text)`
- `seedExampleSkills()`

Activation logic (`src/ts/services/skills/skills.ts`):
- `getSkillsDescription(clientSideToolsSupported)`
- `hasEnabledSkillResources()`
- `stripSkillToolMessages(messages)`
- `activateSkillToolDefinition`, `readSkillResourceToolDefinition`

## Privacy
- All skills and preferences are stored locally in your browser
- Skill instructions are sent only to the AI provider you invoke, as part of the prompt/tool exchange
- Delete uploaded skills at any time from the Skills tab

## File Map
- Storage / `SKILL.md` parsing: `src/ts/services/skills/skillsStore.ts`
- Activation, tools, prompt text: `src/ts/services/skills/skills.ts`
- Settings UI: `src/ts/components/skills.ts` and `src/html/panels/settings/skills.html`
- Request integration: `src/ts/services/api/instructions.ts`, `src/ts/services/api/toolManager.ts`, `src/ts/services/api/requestClient.ts`
- Reasoning‑panel indicator: `src/ts/services/streaming/eventProcessor.ts`
- Example skills: `skills/*.md`
- Tests: `tests/skills.spec.ts`
