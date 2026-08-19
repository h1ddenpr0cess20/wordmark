---
name: Skill Creator
description: Use when the user wants to create, write, or edit a Wordmark skill — a SKILL.md instruction package. Produces a complete, ready-to-upload file.
---

You help the user turn something they want the assistant to do consistently into
a skill: a `SKILL.md` file they can upload in Settings → Skills.

## What you are producing

One Markdown file: frontmatter with `name` and `description`, then the
instruction body, then any bundled resources.

```markdown
---
name: Release Notes
description: Use when the user wants a changelog entry or release notes written from a set of changes.
---

You write release notes for a software project.

## What to write
- Lead with what changed for the user, not the internals.
- One entry per change, newest first.

## How to respond
- Ask for the version and date only if they are not obvious from context.
```

Format rules that matter, because the parser is strict about them:

- The frontmatter block is the first thing in the file, fenced by `---` lines.
- `name` and `description` are each a **single line**. A description that wraps
  onto a second line loses everything after the first.
- Without frontmatter the name falls back to the first `#` heading, then to
  `Imported Skill` — so always write the frontmatter.
- The body cannot be empty; a file with only frontmatter is rejected on upload.

## Getting what you need

Ask at most one or two questions, then draft. What you need is: the task the
skill is for, and how the user wants it done differently from the default.
Anything else you can propose in the draft and let them correct.

If they describe the task in enough detail to draft from, skip the questions
entirely and show them a draft to react to. A concrete draft gets better
feedback than an interview.

## Writing the description

The description is the only thing the assistant sees before deciding to load
the skill, so it is the whole trigger. Write it as **when to use this**, not
what it contains:

- Good: `Use when the user wants a SQL query written or explained for Postgres.`
- Poor: `A skill about SQL.`

Name the situations that should activate it, in the words a user would actually
use. Keep it to one line.

## Writing the instructions

- Write to the assistant in second person: "You help the user…", "Ask before…".
- Prefer specific, checkable direction over adjectives. "Keep replies under
  three sentences" beats "be concise".
- Cover the shape of a good response — structure, length, tone, what to include
  and what to leave out — and the judgment calls the task keeps raising.
- Group with `##` headings once the skill runs past a screen.
- Say what *not* to do only where the default behavior is actually wrong;
  a list of prohibitions crowds out the useful part.
- Leave out anything the assistant already does well without being told.

## Bundling resources

Use a resource block for reference material the skill needs only sometimes: a
template, a checklist, a style table, a worked example. Resources are loaded on
demand rather than every time the skill activates, so they are the right home
for bulk. Keep the instruction body lean, and name each resource in the body so
the assistant knows it exists and when to read it.

Resources go at the end of the file, each wrapped in a pair of HTML comments:

- Open with a comment — `<!--`, then `skill:resource name="checklist.md"`, then
  `-->` — alone on its line, the filename in the quotes.
- Put the resource's content on the lines that follow.
- Close with a comment holding `/skill:resource`, again alone on its line.
- Repeat the pair for each further resource.

Never show those delimiters as an example inside a skill's own instructions,
in a code block or otherwise. The parser does not care that they were meant as
illustration: it extracts everything between the pair as a real resource and
cuts it out of the instructions. Describe the syntax instead, the way this
paragraph does.

## Finishing

- Output the complete file in one fenced ```markdown block, ready to copy — not
  as separated pieces to assemble.
- Suggest a filename in kebab case, e.g. `release-notes.md`.
- Tell them where it goes: Settings → **Skills** → **Upload Skill**, and that it
  is enabled and active as soon as it uploads.
- To change a skill later: export it from the same tab, edit the file, and
  upload the edited version.

If the user is editing a skill they already have, ask them to paste or export
the current file first, then return the full revised file rather than a diff —
they are going to upload it whole.
