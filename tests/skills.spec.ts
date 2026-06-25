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
  removeUserSkill,
  isSkillEnabled,
  setSkillEnabled,
  getEnabledSkills,
} = await import('../src/ts/services/skills/skillsStore.js');

const {
  getSkillsDescription,
  activateSkillToolDefinition,
  ACTIVATE_SKILL_TOOL_NAME,
} = await import('../src/ts/services/skills/skills.js');

const { toolImplementations } = await import('../src/ts/services/toolImplementations.js');

test('getAllSkills includes built-in skills', () => {
  const skills = getAllSkills();
  assert.ok(skills.length >= STATIC_SKILLS.length, 'should include built-ins');
  assert.ok(skills.every(s => s.id && s.name), 'skills have id and name');
});

test('skills default to disabled and getSkillsDescription is empty', () => {
  assert.equal(getEnabledSkills().length, 0, 'nothing enabled by default');
  assert.equal(getSkillsDescription(true), '', 'no description when nothing enabled');
});

test('enabling a skill lists it (tool mode) and inlines it (no-tool mode)', () => {
  const first = STATIC_SKILLS[0];
  setSkillEnabled(first.id, true);

  assert.ok(isSkillEnabled(first.id), 'skill is enabled');

  const toolMode = getSkillsDescription(true);
  assert.ok(toolMode.includes(first.name), 'tool-mode lists the name');
  assert.ok(toolMode.includes(first.id), 'tool-mode includes the id');
  assert.ok(toolMode.includes(ACTIVATE_SKILL_TOOL_NAME), 'tool-mode points at activate_skill');
  assert.ok(!toolMode.includes(first.instructions), 'tool-mode does NOT leak full instructions');

  const inlineMode = getSkillsDescription(false);
  assert.ok(inlineMode.includes(first.instructions), 'no-tool mode inlines instructions');

  setSkillEnabled(first.id, false);
  assert.equal(getEnabledSkills().length, 0, 'disabling removes it');
});

test('activate_skill handler returns instructions for a known skill', async () => {
  const first = STATIC_SKILLS[0];
  const handler = toolImplementations[ACTIVATE_SKILL_TOOL_NAME];
  assert.equal(typeof handler, 'function', 'handler is registered');

  const ok = await handler({ skill_id: first.id });
  assert.equal(ok.ok, true);
  assert.equal(ok.name, first.name);
  assert.equal(ok.instructions, first.instructions);

  const missing = await handler({ skill_id: 'does-not-exist' });
  assert.equal(missing.ok, false);
});

test('activate_skill tool definition is a strict function tool', () => {
  assert.equal(activateSkillToolDefinition.type, 'function');
  assert.equal(activateSkillToolDefinition.name, ACTIVATE_SKILL_TOOL_NAME);
  assert.equal(activateSkillToolDefinition.strict, true);
});

test('user skills can be added, activated, and removed', () => {
  const skill = addUserSkill({
    name: 'My Test Skill',
    description: 'desc',
    instructions: 'do the thing',
  });
  assert.ok(skill.id.startsWith('user:'), 'user skills get a user: id');
  assert.equal(skill.source, 'user');
  assert.ok(getSkillById(skill.id), 'retrievable by id');

  setSkillEnabled(skill.id, true);
  assert.ok(isSkillEnabled(skill.id));

  assert.equal(removeUserSkill(skill.id), true, 'removable');
  assert.equal(getSkillById(skill.id), undefined, 'gone after removal');
  assert.equal(isSkillEnabled(skill.id), false, 'preference dropped on removal');
});

test('addUserSkill rejects empty name or instructions', () => {
  assert.throws(() => addUserSkill({ name: '', description: '', instructions: 'x' }));
  assert.throws(() => addUserSkill({ name: 'x', description: '', instructions: '' }));
});

test('addUserSkill de-duplicates ids from identical names', () => {
  const a = addUserSkill({ name: 'Dup', description: '', instructions: 'a' });
  const b = addUserSkill({ name: 'Dup', description: '', instructions: 'b' });
  assert.notEqual(a.id, b.id, 'ids are unique');
  removeUserSkill(a.id);
  removeUserSkill(b.id);
});
