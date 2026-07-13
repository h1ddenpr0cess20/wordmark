import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};

const { buildRetrievalQuery, extractMessageText } = await import('../src/ts/utils/retrievalQuery.js');

type Msg = { role: string; content: unknown };

function convo(...turns: Msg[]): Msg[] {
  return turns;
}

test('buildRetrievalQuery returns the message unchanged when there is no prior user turn', () => {
  const history = convo({ role: 'user', content: 'how does token rotation work?' });
  assert.equal(
    buildRetrievalQuery(history as never, 'how does token rotation work?'),
    'how does token rotation work?',
  );
});

test('buildRetrievalQuery resolves a follow-up by prepending the prior user turn, question last', () => {
  const history = convo(
    { role: 'user', content: 'tell me about the pricing doc' },
    { role: 'assistant', content: 'Wordmark Pro is $12/month.' },
    { role: 'user', content: 'what about its free tier?' },
  );

  const query = buildRetrievalQuery(history as never, 'what about its free tier?');

  assert.ok(query.includes('tell me about the pricing doc'), 'prior intent is carried into the query');
  assert.ok(query.endsWith('what about its free tier?'), 'the current message stays last so it dominates');
  assert.ok(!query.includes('Wordmark Pro is $12/month.'), 'assistant answers are not used as retrieval context');
});

test('buildRetrievalQuery caps context at the two most recent prior user turns', () => {
  const history = convo(
    { role: 'user', content: 'oldest turn about alpha' },
    { role: 'user', content: 'middle turn about beta' },
    { role: 'user', content: 'recent turn about gamma' },
    { role: 'user', content: 'and what about that?' },
  );

  const query = buildRetrievalQuery(history as never, 'and what about that?');

  assert.ok(!query.includes('oldest turn about alpha'), 'turns older than the cap are dropped');
  assert.ok(query.includes('middle turn about beta'));
  assert.ok(query.includes('recent turn about gamma'));
  assert.equal(query.split('\n').length, 3, 'two prior turns plus the current message');
});

test('buildRetrievalQuery truncates an overlong prior turn instead of letting it dominate', () => {
  const long = 'x'.repeat(1000);
  const history = convo(
    { role: 'user', content: long },
    { role: 'user', content: 'and the summary?' },
  );

  const query = buildRetrievalQuery(history as never, 'and the summary?');
  const priorLine = query.split('\n')[0];

  assert.ok(priorLine.length < 400, `prior turn should be truncated, got ${priorLine.length} chars`);
  assert.ok(priorLine.endsWith('…'), 'truncation is marked');
  assert.ok(query.endsWith('and the summary?'));
});

test('buildRetrievalQuery leaves an inventory question self-contained', () => {
  const history = convo(
    { role: 'user', content: 'tell me about the pricing doc' },
    { role: 'user', content: 'what files are attached?' },
  );

  const query = buildRetrievalQuery(history as never, 'what files are attached?');

  assert.equal(query, 'what files are attached?', 'inventory queries need no conversational context');
});

test('buildRetrievalQuery does not use an inventory turn as context for a later question', () => {
  const history = convo(
    { role: 'user', content: 'list all the documents' },
    { role: 'user', content: 'summarize the security one' },
  );

  const query = buildRetrievalQuery(history as never, 'summarize the security one');

  assert.equal(query, 'summarize the security one', 'an inventory prior adds no useful retrieval signal');
});

test('buildRetrievalQuery reads text out of multimodal user content and skips the current message duplicate', () => {
  const history = convo(
    { role: 'user', content: [{ type: 'input_text', text: 'look at this chart' }, { type: 'input_image', image_url: 'data:image/png;base64,AA' }] },
    { role: 'user', content: 'what trend does it show?' },
  );

  const query = buildRetrievalQuery(history as never, 'what trend does it show?');

  assert.equal(query, 'look at this chart\nwhat trend does it show?');
  assert.equal(query.match(/what trend does it show\?/g)?.length, 1, 'the current message appears exactly once');
});

test('extractMessageText handles strings, content-part arrays, and unusable content', () => {
  assert.equal(extractMessageText('  hello  '), 'hello');
  assert.equal(
    extractMessageText([{ type: 'input_text', text: 'a' }, { type: 'input_image', image_url: 'x' }, { type: 'input_text', text: 'b' }] as never),
    'a b',
    'non-text parts are skipped without leaving stray whitespace',
  );
  assert.equal(extractMessageText(undefined as never), '');
  assert.equal(extractMessageText([] as never), '');
});
