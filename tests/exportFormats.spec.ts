import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPORT_FORMATS,
  normaliseExportFormat,
} from '../src/ts/services/exportFormats.js';

type ExportMessage = Parameters<(typeof EXPORT_FORMATS)['txt']['build']>[0][number];

const msg = (over: Partial<ExportMessage> = {}): ExportMessage => ({
  role: 'user',
  senderLabel: 'You',
  content: 'hello',
  rawContent: 'hello',
  reasoning: [],
  timestamp: '',
  ...over,
});

const meta = { iso: '2026-06-20T00:00:00Z' };

test('normaliseExportFormat resolves aliases and extensions case-insensitively', () => {
  assert.equal(normaliseExportFormat('text'), 'txt');
  assert.equal(normaliseExportFormat('plaintext'), 'txt');
  assert.equal(normaliseExportFormat('Markdown'), 'md');
  assert.equal(normaliseExportFormat('  HTM '), 'html');
  assert.equal(normaliseExportFormat('json'), 'json');
  assert.equal(normaliseExportFormat('CSV'), 'csv');
});

test('normaliseExportFormat returns null for empty or unknown input', () => {
  assert.equal(normaliseExportFormat(null), null);
  assert.equal(normaliseExportFormat(''), null);
  assert.equal(normaliseExportFormat('docx'), null);
});

test('txt build includes the header, sender, content, and gated reasoning', () => {
  const messages = [msg({ content: 'hi there', reasoning: ['step one', 'step two'] })];

  const without = EXPORT_FORMATS.txt.build(messages, false, meta);
  assert.match(without, /Chat Export \(2026-06-20T00:00:00Z\)/);
  assert.match(without, /You:/);
  assert.match(without, /hi there/);
  assert.ok(!without.includes('Reasoning:'));

  const withThinking = EXPORT_FORMATS.txt.build(messages, true, meta);
  assert.match(withThinking, /Reasoning:/);
  assert.match(withThinking, /step one\n\nstep two/);
});

test('md build emits headings, timestamp, and gated reasoning', () => {
  const messages = [msg({ senderLabel: 'Assistant', role: 'assistant', timestamp: 'noon', reasoning: ['why'] })];

  const out = EXPORT_FORMATS.md.build(messages, true, meta);
  assert.match(out, /^# Chat Export/m);
  assert.match(out, /### Assistant/);
  assert.match(out, /\*noon\*/);
  assert.match(out, /#### Reasoning/);

  const noThinking = EXPORT_FORMATS.md.build(messages, false, meta);
  assert.ok(!noThinking.includes('#### Reasoning'));
});

test('json build uses rawContent only when thinking is included', () => {
  const messages = [msg({ content: 'clean', rawContent: 'raw<think>', reasoning: ['r1'], timestamp: '' })];

  const plain = JSON.parse(EXPORT_FORMATS.json.build(messages, false, meta));
  assert.equal(plain[0].content, 'clean');
  assert.equal(plain[0].reasoning, undefined);
  assert.equal(plain[0].timestamp, undefined);

  const full = JSON.parse(EXPORT_FORMATS.json.build(messages, true, meta));
  assert.equal(full[0].content, 'raw<think>');
  assert.deepEqual(full[0].reasoning, ['r1']);
});

test('csv build writes a header row and joins reasoning with a pipe', () => {
  const messages = [msg({ content: 'a,b', rawContent: 'a,b', reasoning: ['x', 'y'] })];
  const out = EXPORT_FORMATS.csv.build(messages, true, meta);
  const lines = out.split('\n');
  assert.equal(lines[0], '"role","sender","content","reasoning","timestamp"');
  assert.match(lines[1], /"a,b"/);
  assert.match(lines[1], /"x \| y"/);
});

test('csv build neutralizes spreadsheet formula injection', () => {
  const messages = [msg({ content: '=SUM(A1:A2)' })];
  const out = EXPORT_FORMATS.csv.build(messages, false, meta);
  assert.match(out, /"'=SUM\(A1:A2\)"/);
});

test('csv build escapes embedded quotes and leaves negative numbers intact', () => {
  const withQuote = EXPORT_FORMATS.csv.build([msg({ content: 'he said "hi"' })], false, meta);
  assert.match(withQuote, /"he said ""hi"""/);

  const negative = EXPORT_FORMATS.csv.build([msg({ content: '-42' })], false, meta);
  assert.match(negative, /"-42"/);
  assert.ok(!negative.includes("'-42"));
});
