import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};

const { createStreamingEventProcessor } = await import('../src/ts/services/streaming/eventProcessor.js');

type StreamingRuntimeArg = Parameters<typeof createStreamingEventProcessor>[0];

function createRuntimeStub() {
  const state = {
    output: '',
    reasoningLines: [] as string[],
    reasoningDelta: '',
    trailingEnsured: false,
    imageCalls: [] as Array<{ payload: unknown; label: unknown }>,
    attachCalls: [] as unknown[],
  };

  return {
    appendOutputText(delta: string) {
      state.output += delta || '';
    },
    replaceOutputSegment(start: number, fullText: string) {
      state.output = state.output.slice(0, start) + (fullText || '');
    },
    appendReasoningDelta(delta: string) {
      state.reasoningDelta += delta || '';
    },
    appendReasoningLine(line: string) {
      state.reasoningLines.push(line);
    },
    updateLastReasoningLine(line: string) {
      if (state.reasoningLines.length === 0) {
        state.reasoningLines.push(line);
      } else {
        state.reasoningLines[state.reasoningLines.length - 1] = line;
      }
    },
    ensureReasoningTrailingNewline() {
      state.trailingEnsured = true;
    },
    collectImagesFromSource(payload: unknown, label: unknown) {
      state.imageCalls.push({ payload, label });
    },
    attachImagesToPayload(payload: Record<string, unknown>) {
      state.attachCalls.push(payload || null);
      return { ...(payload || {}), attached: true };
    },
    getOutputText() {
      return state.output;
    },
    getOutputLength() {
      return state.output.length;
    },
    getReasoningText() {
      return state.reasoningDelta || state.reasoningLines.join('\n');
    },
    outputEndsWith(suffix: string) {
      return state.output.endsWith(suffix);
    },
    hasOutput() {
      return state.output.trim().length > 0;
    },
    removePlaceholder() {},
    render() {},
    state,
  };
}

test('response.output_text.delta appends streamed text', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);

  processor.processEvent('response.output_text.delta', [
    JSON.stringify({ delta: { text: 'Hello ' } }),
  ]);
  processor.processEvent('response.output_text.delta', [
    JSON.stringify({ delta: { text: 'world!' } }),
  ]);

  assert.equal(runtime.state.output, 'Hello world!');
});

test('web search events annotate reasoning with queued query', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);

  processor.processEvent('response.function_call_arguments.done', [
    JSON.stringify({
      name: 'web_search',
      item_id: 'tool-1',
      arguments: JSON.stringify({ query: 'mars weather' }),
    }),
  ]);

  processor.processEvent('response.web_search_call.in_progress', [
    JSON.stringify({ item_id: 'tool-1' }),
  ]);

  processor.processEvent('response.web_search_call.completed', [
    JSON.stringify({ item_id: 'tool-1' }),
  ]);

  const reasoning = runtime.state.reasoningLines.join('\n');
  assert.ok(reasoning.includes('args'), 'should log tool arguments');
  assert.ok(reasoning.includes('🌐 web_search "mars weather"'), 'should annotate query');
  assert.ok(reasoning.includes('completed'), 'should mark completion');
});

test('processor captures final payload, attaches images, and finalizes reasoning', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);

  const imagePayload = {
    result: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR42mNk+M+ABAwMDAwABXEC+Yo0NmsAAAAASUVORK5CYII=',
  };

  processor.processEvent('response.image_generation_call.partial_image', [
    JSON.stringify(imagePayload),
  ]);

  processor.processEvent('response.completed', [
    JSON.stringify({ response: { id: 'resp-1', output: [] } }),
  ]);

  processor.finalize();
  assert.equal(runtime.state.trailingEnsured, true, 'finalize should enforce trailing newline');
  assert.equal(runtime.state.imageCalls.length, 1, 'should collect image payloads');

  const payload = processor.getFinalResponsePayload();
  assert.deepEqual(payload, { id: 'resp-1', output: [] });

  const attached = processor.attachImages({ id: 'resp-1' });
  assert.equal(attached!.attached, true);
  assert.equal(runtime.state.attachCalls.length, 1);
});

test('mcp_call.failed reports the error code and message in the reasoning trace', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);

  processor.processEvent('response.mcp_call.failed', [
    JSON.stringify({ error: { code: 424, message: 'Failed to connect to MCP server' } }),
  ]);

  const reasoning = runtime.state.reasoningLines.join('\n');
  assert.ok(reasoning.includes('424: Failed to connect to MCP server'), 'should include code and message');
  assert.ok(reasoning.includes('failed'), 'should mark the call as failed');
});

test('mcp_call.failed falls back to "failed" when no error detail is present', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);

  processor.processEvent('response.mcp_call.failed', [JSON.stringify({})]);

  const reasoning = runtime.state.reasoningLines.join('\n');
  assert.ok(reasoning.includes('failed'), 'should still render a failure line without throwing');
});

test('processEvent ignores non-object SSE payloads without throwing', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);

  // null/primitive/garbage payloads must not throw (regression: payload.type on null)
  assert.doesNotThrow(() => processor.processEvent('response.output_text.delta', ['null']));
  assert.doesNotThrow(() => processor.processEvent('response.output_text.delta', ['42']));
  assert.doesNotThrow(() => processor.processEvent('response.output_text.delta', ['not json at all']));

  // a valid event after the bad ones still works
  processor.processEvent('response.output_text.delta', [
    JSON.stringify({ delta: { text: 'ok' } }),
  ]);
  assert.equal(runtime.state.output, 'ok');
});
