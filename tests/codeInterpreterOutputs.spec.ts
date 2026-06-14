import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};

const { extractCodeInterpreterOutputs } = await import(
  '../src/ts/services/streaming/codeInterpreter.js'
);

// extractCodeInterpreterOutputs is typed to accept ResponseObject | null; the
// tests feed plain shaped fixtures, so cast through the parameter type.
const asPayload = (p: unknown): Parameters<typeof extractCodeInterpreterOutputs>[0] =>
  p as Parameters<typeof extractCodeInterpreterOutputs>[0];

test('extracts a file attachment from a code_interpreter_call output', () => {
  const { attachments, logs } = extractCodeInterpreterOutputs(
    asPayload({
      output: [
        {
          type: 'code_interpreter_call',
          id: 'call_1',
          outputs: [
            { type: 'file', file_id: 'cfile_abc123', filename: 'plot.png', mime_type: 'image/png' },
          ],
        },
      ],
    }),
  );

  assert.equal(logs.length, 0);
  assert.equal(attachments.length, 1);
  const [attachment] = attachments;
  assert.equal(attachment.fileId, 'cfile_abc123');
  assert.equal(attachment.filename, 'plot.png');
  assert.equal(attachment.mimeType, 'image/png');
  assert.equal(attachment.subtype, 'image');
  assert.equal(attachment.callId, 'call_1');
  assert.equal(attachment.status, 'pending');
  assert.equal(attachment.index, 0);
});

test('deduplicates by fileId and merges complementary metadata', () => {
  const { attachments } = extractCodeInterpreterOutputs(
    asPayload({
      output: [
        {
          type: 'code_interpreter_call',
          id: 'call_dup',
          outputs: [
            { type: 'file', file_id: 'cfile_dup', filename: 'data.csv' },
            { file_id: 'cfile_dup', mime_type: 'image/png' },
          ],
        },
      ],
    }),
  );

  assert.equal(attachments.length, 1);
  const [attachment] = attachments;
  assert.equal(attachment.fileId, 'cfile_dup');
  assert.equal(attachment.filename, 'data.csv');
  assert.equal(attachment.mimeType, 'image/png');
  // an image mime promotes the merged attachment's subtype
  assert.equal(attachment.subtype, 'image');
});

test('captures and de-duplicates log output', () => {
  const { logs } = extractCodeInterpreterOutputs(
    asPayload({
      output: [
        {
          type: 'code_interpreter_call',
          id: 'call_log',
          outputs: [
            { type: 'logs', logs: 'hello\nworld  ' },
            { type: 'logs', logs: 'hello\nworld' },
          ],
        },
      ],
    }),
  );

  assert.equal(logs.length, 1);
  assert.equal(logs[0].text, 'hello\nworld');
  assert.equal(logs[0].callId, 'call_log');
});

test('extracts attachments from container_file_citation annotations', () => {
  const { attachments } = extractCodeInterpreterOutputs(
    asPayload({
      output: [
        {
          id: 'msg_1',
          content: [
            {
              type: 'output_text',
              annotations: [
                {
                  type: 'container_file_citation',
                  file_id: 'cfile_cite',
                  filename: 'report.pdf',
                  container_id: 'cntr_1',
                },
              ],
            },
          ],
        },
      ],
    }),
  );

  assert.equal(attachments.length, 1);
  const [attachment] = attachments;
  assert.equal(attachment.fileId, 'cfile_cite');
  assert.equal(attachment.filename, 'report.pdf');
  assert.equal(attachment.containerId, 'cntr_1');
  assert.equal(attachment.callId, 'msg_1');
});

test('ignores outputs that are not code-interpreter related', () => {
  const { attachments, logs } = extractCodeInterpreterOutputs(
    asPayload({
      output: [{ type: 'message', file_id: 'cfile_should_not_extract' }],
    }),
  );

  assert.equal(attachments.length, 0);
  assert.equal(logs.length, 0);
});

test('only treats well-formed file ids as attachments', () => {
  const { attachments } = extractCodeInterpreterOutputs(
    asPayload({
      output: [
        {
          type: 'code_interpreter_call',
          id: 'call_bad_id',
          outputs: [{ type: 'file', file_id: 'random123' }],
        },
      ],
    }),
  );

  assert.equal(attachments.length, 0);
});

test('returns empty result for null payloads', () => {
  const { attachments, logs } = extractCodeInterpreterOutputs(null);
  assert.equal(attachments.length, 0);
  assert.equal(logs.length, 0);
});
