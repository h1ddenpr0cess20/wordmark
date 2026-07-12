import test from 'node:test';
import assert from 'node:assert/strict';

const {
  extractConversationTitle,
  formatConversationDate,
  resolveConversationPrompt,
  buildHistoryRowHtml,
} = await import('../src/ts/services/history/historyRow.js');

type Convo = Parameters<typeof buildHistoryRowHtml>[0];
const asConvo = (c: unknown): Convo => c as Convo;

test('extractConversationTitle uses the first user message (string content)', () => {
  const title = extractConversationTitle(asConvo({
    messages: [
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: 'How do I center a div?' },
    ],
  }));
  assert.equal(title, 'How do I center a div?');
});

test('extractConversationTitle prefers a user-assigned name, ignoring auto-generated ones', () => {
  const messages = [{ role: 'user', content: 'How do I center a div?' }];
  assert.equal(
    extractConversationTitle(asConvo({ name: 'My debugging session', messages })),
    'My debugging session',
  );
  assert.equal(
    extractConversationTitle(asConvo({ name: 'Conversation 7/12/2026, 1:00:00 PM', messages })),
    'How do I center a div?',
  );
  assert.equal(
    extractConversationTitle(asConvo({ name: 'Personality: a pirate captain', messages })),
    'How do I center a div?',
  );
});

test('extractConversationTitle reads array content parts', () => {
  const title = extractConversationTitle(asConvo({
    messages: [{ role: 'user', content: [{ type: 'input_text', text: 'array prompt' }] }],
  }));
  assert.equal(title, 'array prompt');
});

test('extractConversationTitle falls back when there is no user message', () => {
  assert.equal(extractConversationTitle(asConvo({ messages: [{ role: 'assistant', content: 'x' }] })), '(No user message)');
  assert.equal(extractConversationTitle(asConvo({})), '(No user message)');
});

test('extractConversationTitle titles a party by its scenario topic', () => {
  const title = extractConversationTitle(asConvo({
    mode: 'party',
    scenario: { topic: 'modal logic' },
    characters: [{ name: 'Ada' }, { name: 'Boole' }],
    messages: [{ role: 'assistant', content: 'Shall we begin?' }],
  }));
  assert.equal(title, 'modal logic');
});

test('extractConversationTitle falls back to the opening line, then the cast, for a topicless party', () => {
  assert.equal(
    extractConversationTitle(asConvo({
      mode: 'party',
      scenario: { topic: '' },
      characters: [{ name: 'Ada' }, { name: 'Boole' }],
      messages: [{ role: 'assistant', content: 'Ada: hello there' }],
    })),
    'Ada: hello there',
  );
  assert.equal(
    extractConversationTitle(asConvo({
      mode: 'party',
      characters: [{ name: 'Ada' }, { name: 'Boole' }],
      messages: [],
    })),
    'Ada, Boole',
  );
});

test('resolveConversationPrompt maps each prompt type', () => {
  assert.deepEqual(
    resolveConversationPrompt(asConvo({ systemPrompt: { type: 'custom', content: 'be terse' } })),
    { info: 'be terse', cssClass: 'custom' },
  );
  assert.deepEqual(
    resolveConversationPrompt(asConvo({ systemPrompt: { type: 'none' } })),
    { info: 'None', cssClass: 'none' },
  );
  assert.deepEqual(
    resolveConversationPrompt(asConvo({})),
    { info: '', cssClass: 'none' },
  );
});

test('formatConversationDate returns a time today and "Yesterday" for the prior day', () => {
  const now = new Date();
  const todayResult = formatConversationDate(now.toISOString());
  assert.match(todayResult, /\d{1,2}:\d{2}/);

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  assert.equal(formatConversationDate(yesterday.toISOString()), 'Yesterday');
});

test('buildHistoryRowHtml escapes content and omits media count when zero', () => {
  const html = buildHistoryRowHtml(asConvo({
    messages: [{ role: 'user', content: '<script>x</script>' }],
    model: 'gpt-5',
    service: 'openai',
    images: [],
  }));
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /1 msg/);
  assert.doesNotMatch(html, /media/);
});
