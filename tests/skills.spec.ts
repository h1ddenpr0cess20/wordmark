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
  hasEnabledSkillResources,
  stripSkillToolMessages,
  activateSkillToolDefinition,
  readSkillResourceToolDefinition,
  ACTIVATE_SKILL_TOOL_NAME,
  READ_SKILL_RESOURCE_TOOL_NAME,
} = await import('../src/ts/services/skills/skills.js');

const { toolImplementations } = await import('../src/ts/services/toolImplementations.js');

/** Adds a fresh enabled user skill and returns it. */
function makeSkill(over: Partial<{ name: string; description: string; instructions: string; resources: { name: string; content: string }[] }> = {}) {
  const skill = addUserSkill({
    name: over.name ?? 'Test Skill',
    description: over.description ?? 'a test skill',
    instructions: over.instructions ?? 'do the thing carefully',
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

test('stripSkillToolMessages drops skill tool calls/outputs, keeps real turns', () => {
  const history = [
    { role: 'user', content: 'help me write an email' },
    { type: 'function_call', name: ACTIVATE_SKILL_TOOL_NAME, call_id: 'c1', arguments: '{"skill_id":"user:x"}' },
    { type: 'function_call_output', call_id: 'c1', output: 'FULL SKILL INSTRUCTIONS...' },
    { role: 'assistant', content: 'Here is your email.' },
    // a non-skill tool call must be preserved
    { type: 'function_call', name: 'open_meteo_forecast', call_id: 'c2', arguments: '{}' },
    { type: 'function_call_output', call_id: 'c2', output: 'sunny' },
  ];
  const cleaned = stripSkillToolMessages(history as never);

  assert.ok(!cleaned.some((m: { name?: string }) => m.name === ACTIVATE_SKILL_TOOL_NAME), 'skill call dropped');
  assert.ok(!cleaned.some((m: { call_id?: string; type?: string }) => m.type === 'function_call_output' && m.call_id === 'c1'), 'skill output dropped');
  assert.ok(cleaned.some((m: { name?: string }) => m.name === 'open_meteo_forecast'), 'non-skill tool call kept');
  assert.ok(cleaned.some((m: { call_id?: string }) => m.call_id === 'c2'), 'non-skill output kept');
  assert.equal(cleaned.length, 4, 'only the two skill artifacts removed');

  // No skill artifacts -> returns the same array reference (cheap no-op).
  const plain = [{ role: 'user', content: 'hi' }];
  assert.equal(stripSkillToolMessages(plain as never), plain);
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

  const updated = updateUserSkill(skill.id, { name: 'Editable', description: 'd2', instructions: 'two' });
  assert.equal(updated.instructions, 'two');
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
    resources: [{ name: 'notes.md', content: 'note content' }],
  });

  const md = serializeSkillMarkdown(skill);
  assert.ok(md.startsWith('---'), 'has frontmatter');
  assert.ok(md.includes('skill:resource name="notes.md"'));

  const parsed = parseSkillMarkdown(md);
  assert.equal(parsed.name, 'Roundtrip');
  assert.equal(parsed.description, 'rt desc');
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
test('seedExampleSkills loads every bundled example, enabled', () => {
  seedExampleSkills();
  for (const name of ['Frontend Development', 'Email Assistant', 'Brainstorming Partner']) {
    const example = getAllSkills().find(skill => skill.name === name);
    assert.ok(example, `bundled example "${name}" is seeded`);
    assert.ok(isSkillEnabled(example!.id), `"${name}" is enabled`);
  }

  const countAfter = getAllSkills().length;
  seedExampleSkills();
  assert.equal(getAllSkills().length, countAfter, 'seeding twice does not duplicate');
});

test('seedExampleSkills tracks examples individually (no resurrection, seeds new ones)', () => {
  // Existing install that already saw Frontend Development + Brainstorming Partner
  // and deleted them; Email Assistant did not exist yet at that time.
  localStorage.removeItem('wordmark_skills');
  localStorage.removeItem('wordmark_skill_preferences');
  localStorage.setItem('wordmark_skills_seeded_examples', JSON.stringify(['Frontend Development', 'Brainstorming Partner']));

  seedExampleSkills();
  const names = getAllSkills().map(skill => skill.name);

  assert.ok(!names.includes('Frontend Development'), 'a deleted seeded example is not resurrected');
  assert.ok(!names.includes('Brainstorming Partner'), 'a deleted seeded example is not resurrected');
  assert.ok(names.includes('Email Assistant'), 'a newly-added example is seeded for existing users');
});
