import test from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage
let skillsStore: Record<string, string> = {};
globalThis.localStorage = {
  getItem(key: string) {
    return skillsStore[key] || null;
  },
  setItem(key: string, value: string) {
    skillsStore[key] = value;
  },
  removeItem(key: string) {
    delete skillsStore[key];
  },
  clear() {
    skillsStore = {};
  },
} as unknown as Storage;

const {
  STATIC_SKILLS,
  getAllSkills,
  getSkillById,
  addUserSkill,
  updateUserSkill,
  removeUserSkill,
  isSkillEnabled,
  setSkillEnabled,
  getEnabledSkills,
  serializeSkillMarkdown,
  parseSkillMarkdown,
  seedExampleSkills,
} = await import('../src/ts/services/skills/skillsStore.js');

const {
  getSkillsDescription,
  getAutoActivatedSkills,
  hasEnabledSkillResources,
  activateSkillToolDefinition,
  readSkillResourceToolDefinition,
  ACTIVATE_SKILL_TOOL_NAME,
  READ_SKILL_RESOURCE_TOOL_NAME,
} = await import('../src/ts/services/skills/skills.js');

const { toolImplementations } = await import('../src/ts/services/toolImplementations.js');

/** Adds a fresh enabled user skill and returns it. */
function makeSkill(over: Partial<{ name: string; description: string; instructions: string; triggers: string[]; resources: { name: string; content: string }[] }> = {}) {
  const skill = addUserSkill({
    name: over.name ?? 'Test Skill',
    description: over.description ?? 'a test skill',
    instructions: over.instructions ?? 'do the thing carefully',
    triggers: over.triggers ?? [],
    resources: over.resources ?? [],
  });
  setSkillEnabled(skill.id, true);
  return skill;
}

test('built-in skills list is empty (skills are uploaded)', () => {
  assert.equal(STATIC_SKILLS.length, 0);
});

test('skills default to disabled and getSkillsDescription is empty', () => {
  const skill = addUserSkill({ name: 'Off Skill', description: '', instructions: 'x' });
  assert.equal(isSkillEnabled(skill.id), false, 'new skills start disabled');
  assert.equal(getSkillsDescription(true), '', 'no description when nothing enabled');
  removeUserSkill(skill.id);
});

test('enabled skill is listed (tool mode) and inlined (no-tool mode)', () => {
  const skill = makeSkill({ name: 'Listed', instructions: 'FULL-INSTRUCTIONS-MARKER' });

  const toolMode = getSkillsDescription(true);
  assert.ok(toolMode.includes(skill.name), 'tool-mode lists the name');
  assert.ok(toolMode.includes(skill.id), 'tool-mode includes the id');
  assert.ok(toolMode.includes(ACTIVATE_SKILL_TOOL_NAME), 'tool-mode points at activate_skill');
  assert.ok(!toolMode.includes('FULL-INSTRUCTIONS-MARKER'), 'tool-mode does NOT leak full instructions');

  const inlineMode = getSkillsDescription(false);
  assert.ok(inlineMode.includes('FULL-INSTRUCTIONS-MARKER'), 'no-tool mode inlines instructions');

  removeUserSkill(skill.id);
});

test('trigger keywords auto-activate (instructions inlined even in tool mode)', () => {
  const skill = makeSkill({ name: 'Weatherish', instructions: 'INLINE-MARKER', triggers: ['umbrella', 'forecast'] });

  assert.equal(getAutoActivatedSkills('do I need an UMBRELLA today').length, 1, 'matches case-insensitively');
  assert.equal(getAutoActivatedSkills('hello there').length, 0, 'no match');

  const withTrigger = getSkillsDescription(true, 'what is the forecast');
  assert.ok(withTrigger.includes('INLINE-MARKER'), 'triggered skill is inlined even in tool mode');

  removeUserSkill(skill.id);
});

test('activate_skill handler returns instructions and resource names', async () => {
  const skill = makeSkill({ resources: [{ name: 'ref.md', content: 'reference body' }] });
  const handler = toolImplementations[ACTIVATE_SKILL_TOOL_NAME];
  assert.equal(typeof handler, 'function');

  const ok = await handler({ skill_id: skill.id });
  assert.equal(ok.ok, true);
  assert.equal(ok.name, skill.name);
  assert.deepEqual(ok.resources, ['ref.md']);

  const missing = await handler({ skill_id: 'nope' });
  assert.equal(missing.ok, false);

  removeUserSkill(skill.id);
});

test('read_skill_resource returns bundled resource content', async () => {
  const skill = makeSkill({ resources: [{ name: 'ref.md', content: 'RESOURCE-BODY' }] });
  assert.equal(hasEnabledSkillResources(), true);

  const handler = toolImplementations[READ_SKILL_RESOURCE_TOOL_NAME];
  const ok = await handler({ skill_id: skill.id, resource_name: 'ref.md' });
  assert.equal(ok.ok, true);
  assert.equal(ok.content, 'RESOURCE-BODY');

  const missing = await handler({ skill_id: skill.id, resource_name: 'absent.md' });
  assert.equal(missing.ok, false);

  removeUserSkill(skill.id);
});

test('tool definitions are strict function tools', () => {
  assert.equal(activateSkillToolDefinition.name, ACTIVATE_SKILL_TOOL_NAME);
  assert.equal(activateSkillToolDefinition.strict, true);
  assert.equal(readSkillResourceToolDefinition.name, READ_SKILL_RESOURCE_TOOL_NAME);
  assert.equal(readSkillResourceToolDefinition.strict, true);
});

test('user skills support add, edit, and remove', () => {
  const skill = addUserSkill({ name: 'Editable', description: 'd', instructions: 'one' });
  assert.ok(skill.id.startsWith('user:'));
  assert.ok(getSkillById(skill.id));

  const updated = updateUserSkill(skill.id, { name: 'Editable', description: 'd2', instructions: 'two', triggers: ['go'] });
  assert.equal(updated.instructions, 'two');
  assert.deepEqual(updated.triggers, ['go']);
  assert.throws(() => updateUserSkill('user:missing', { name: 'x', description: '', instructions: 'y' }));

  assert.equal(removeUserSkill(skill.id), true);
  assert.equal(getSkillById(skill.id), undefined);
});

test('addUserSkill validates and de-duplicates ids', () => {
  assert.throws(() => addUserSkill({ name: '', description: '', instructions: 'x' }));
  assert.throws(() => addUserSkill({ name: 'x', description: '', instructions: '' }));

  const a = addUserSkill({ name: 'Dup', description: '', instructions: 'a' });
  const b = addUserSkill({ name: 'Dup', description: '', instructions: 'b' });
  assert.notEqual(a.id, b.id);
  removeUserSkill(a.id);
  removeUserSkill(b.id);
});

test('SKILL.md round-trips through serialize/parse', () => {
  const skill = addUserSkill({
    name: 'Roundtrip',
    description: 'rt desc',
    instructions: 'body line one\nbody line two',
    triggers: ['alpha', 'beta'],
    resources: [{ name: 'notes.md', content: 'note content' }],
  });

  const md = serializeSkillMarkdown(skill);
  assert.ok(md.startsWith('---'), 'has frontmatter');
  assert.ok(md.includes('triggers: alpha, beta'));
  assert.ok(md.includes('skill:resource name="notes.md"'));

  const parsed = parseSkillMarkdown(md);
  assert.equal(parsed.name, 'Roundtrip');
  assert.equal(parsed.description, 'rt desc');
  assert.deepEqual(parsed.triggers, ['alpha', 'beta']);
  assert.equal(parsed.instructions, 'body line one\nbody line two');
  assert.equal(parsed.resources?.length, 1);
  assert.equal(parsed.resources?.[0].content, 'note content');

  removeUserSkill(skill.id);
});

test('parseSkillMarkdown falls back to a heading when no frontmatter', () => {
  const parsed = parseSkillMarkdown('# Heading Name\n\nsome instructions here');
  assert.equal(parsed.name, 'Heading Name');
  assert.ok(parsed.instructions.includes('some instructions here'));
  assert.throws(() => parseSkillMarkdown('---\nname: Empty\n---\n'), /no instructions/);
});

// Runs last: seeding persists into the shared mock localStorage for this file.
test('seedExampleSkills loads the bundled example once, enabled', () => {
  seedExampleSkills();
  const example = getAllSkills().find(skill => skill.name === 'Frontend Development');
  assert.ok(example, 'bundled example skill is seeded');
  assert.ok(isSkillEnabled(example!.id), 'seeded skill is enabled');
  assert.ok(example!.resources.length >= 1, 'example carries its bundled resource');

  const countAfter = getAllSkills().length;
  seedExampleSkills();
  assert.equal(getAllSkills().length, countAfter, 'seeding twice does not duplicate');
});
