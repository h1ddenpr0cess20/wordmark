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

test('hosted web search surfaces the query from the item action (no function_call events)', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);

  processor.processEvent('response.output_item.added', [
    JSON.stringify({
      item: {
        id: 'ws-1',
        type: 'web_search_call',
        status: 'in_progress',
        action: { type: 'search', query: 'best coffee in oslo' },
      },
    }),
  ]);
  processor.processEvent('response.web_search_call.in_progress', [
    JSON.stringify({ item_id: 'ws-1' }),
  ]);
  processor.processEvent('response.web_search_call.completed', [
    JSON.stringify({ item_id: 'ws-1' }),
  ]);

  const reasoning = runtime.state.reasoningLines.join('\n');
  assert.ok(reasoning.includes('🌐 web_search "best coffee in oslo"'), 'should surface the hosted-search query');
  assert.ok(reasoning.includes('completed'), 'should mark completion');
});

test('hosted web search renders from output_item.done when the query only arrives at completion', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);

  processor.processEvent('response.output_item.added', [
    JSON.stringify({ item: { id: 'ws-1', type: 'web_search_call', status: 'in_progress' } }),
  ]);
  processor.processEvent('response.web_search_call.in_progress', [JSON.stringify({ item_id: 'ws-1' })]);
  processor.processEvent('response.web_search_call.searching', [JSON.stringify({ item_id: 'ws-1' })]);
  processor.processEvent('response.web_search_call.completed', [JSON.stringify({ item_id: 'ws-1' })]);
  processor.processEvent('response.output_item.done', [
    JSON.stringify({
      item: {
        id: 'ws-1',
        type: 'web_search_call',
        status: 'completed',
        action: {
          type: 'search',
          query: 'mars weather today',
          sources: [{ url: 'https://nasa.gov/mars' }, { url: 'https://weather.com' }],
        },
      },
    }),
  ]);

  const reasoning = runtime.state.reasoningLines.join('\n');
  assert.ok(reasoning.includes('🌐 web_search "mars weather today"'), 'query must appear even when it only arrives at output_item.done');
  assert.ok(reasoning.includes('completed'), 'should mark completion');
  assert.ok(reasoning.includes('nasa.gov/mars'), 'should list sources from the completed item');
});

test('hosted web search reads the current action.queries array (deprecated singular query absent)', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);

  processor.processEvent('response.output_item.added', [
    JSON.stringify({ item: { id: 'ws-1', type: 'web_search_call', status: 'in_progress' } }),
  ]);
  processor.processEvent('response.web_search_call.in_progress', [JSON.stringify({ item_id: 'ws-1' })]);
  processor.processEvent('response.web_search_call.completed', [JSON.stringify({ item_id: 'ws-1' })]);
  processor.processEvent('response.output_item.done', [
    JSON.stringify({
      item: {
        id: 'ws-1',
        type: 'web_search_call',
        status: 'completed',
        action: {
          type: 'search',
          queries: ['saturn moon count', 'titan atmosphere'],
          sources: [{ type: 'url', url: 'https://nasa.gov/saturn' }],
        },
      },
    }),
  ]);

  const reasoning = runtime.state.reasoningLines.join('\n');
  assert.ok(
    reasoning.includes('🌐 web_search "saturn moon count, titan atmosphere"'),
    'query must come from action.queries when the deprecated singular query is absent',
  );
  assert.ok(reasoning.includes('nasa.gov/saturn'), 'should list sources from the completed item');
});

test('concurrent hosted searches keep their queries paired by item id', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);

  processor.processEvent('response.output_item.added', [
    JSON.stringify({ item: { id: 'ws-a', type: 'web_search_call', action: { type: 'search', query: 'alpha query' } } }),
  ]);
  processor.processEvent('response.output_item.added', [
    JSON.stringify({ item: { id: 'ws-b', type: 'web_search_call', action: { type: 'search', query: 'beta query' } } }),
  ]);
  processor.processEvent('response.web_search_call.in_progress', [JSON.stringify({ item_id: 'ws-b' })]);
  processor.processEvent('response.web_search_call.in_progress', [JSON.stringify({ item_id: 'ws-a' })]);

  const reasoning = runtime.state.reasoningLines.join('\n');
  assert.ok(reasoning.includes('🌐 web_search "beta query"'), 'ws-b keeps its own query');
  assert.ok(reasoning.includes('🌐 web_search "alpha query"'), 'ws-a keeps its own query');
});

test('file search surfaces its queries in the reasoning header', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);

  processor.processEvent('response.output_item.added', [
    JSON.stringify({
      item: {
        id: 'fs-1',
        type: 'file_search_call',
        queries: ['refund policy', 'return window'],
      },
    }),
  ]);
  processor.processEvent('response.file_search_call.in_progress', [
    JSON.stringify({ item_id: 'fs-1' }),
  ]);
  processor.processEvent('response.file_search_call.completed', [
    JSON.stringify({ item_id: 'fs-1' }),
  ]);

  const reasoning = runtime.state.reasoningLines.join('\n');
  assert.ok(reasoning.includes('🔎 file_search "refund policy, return window"'), 'should surface file-search queries');
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

test('function call args are rendered inside a fenced json block', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);

  processor.processEvent('response.output_item.added', [
    JSON.stringify({ item: { id: 'call-1', type: 'function_call', name: 'get_weather' } }),
  ]);
  processor.processEvent('response.function_call_arguments.done', [
    JSON.stringify({
      name: 'get_weather',
      item_id: 'call-1',
      arguments: JSON.stringify({ city: 'Oslo' }),
    }),
  ]);

  const reasoning = runtime.state.reasoningLines.join('\n');
  assert.ok(reasoning.includes('**🔧 get_weather**:'), 'should render tool header');
  assert.ok(reasoning.includes('```json'), 'args should open a fenced json block');
  assert.ok(reasoning.includes('"city": "Oslo"'), 'args should be pretty-printed');
  const fenceCount = runtime.state.reasoningLines.filter(line => line.trim().startsWith('```')).length;
  assert.equal(fenceCount, 2, 'fenced block should be closed');
});

test('shell commands are rendered inside a fenced bash block without truncation at 120 chars', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);
  const longCmd = 'echo ' + 'x'.repeat(160);

  processor.processEvent('response.output_item.added', [
    JSON.stringify({ item: { id: 'sh-1', type: 'shell_call', action: { commands: [longCmd] } } }),
  ]);

  const reasoning = runtime.state.reasoningLines.join('\n');
  assert.ok(reasoning.includes('```bash'), 'commands should open a fenced bash block');
  assert.ok(reasoning.includes(`$ ${longCmd}`), 'command should not be truncated');
});

test('mcp_call items get a named header and fenced output preview', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);

  processor.processEvent('response.output_item.added', [
    JSON.stringify({ item: { id: 'mcp-1', type: 'mcp_call', name: 'search_docs', server_label: 'docs' } }),
  ]);
  processor.processEvent('response.output_item.done', [
    JSON.stringify({ item: { id: 'mcp-1', type: 'mcp_call', name: 'search_docs', server_label: 'docs', output: 'first result\nsecond result' } }),
  ]);

  const reasoning = runtime.state.reasoningLines.join('\n');
  assert.ok(reasoning.includes('**🔧 docs.search_docs**:'), 'should render server-qualified tool header');
  assert.ok(reasoning.includes('first result'), 'should include tool output preview');
  assert.ok(reasoning.includes('completed in'), 'should mark completion with duration');
});

test('reasoning done events do not duplicate already-streamed deltas', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);

  processor.processEvent('response.reasoning_summary_text.delta', [
    JSON.stringify({ delta: 'thinking about it' }),
  ]);
  processor.processEvent('response.reasoning_summary_text.done', [
    JSON.stringify({ text: 'thinking about it' }),
  ]);

  assert.equal(runtime.state.reasoningDelta, 'thinking about it');
});

test('reasoning done events still append when nothing was streamed', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);

  processor.processEvent('response.reasoning.done', [
    JSON.stringify({ text: 'full reasoning text' }),
  ]);

  assert.equal(runtime.state.reasoningDelta, 'full reasoning text');
});

test('reasoning summary parts are separated by a blank line', () => {
  const runtime = createRuntimeStub();
  const processor = createStreamingEventProcessor(runtime as unknown as StreamingRuntimeArg);

  processor.processEvent('response.reasoning_summary_part.added', [
    JSON.stringify({ part: { type: 'summary_text', text: '' } }),
  ]);
  processor.processEvent('response.reasoning_summary_text.delta', [
    JSON.stringify({ delta: '**First part** done.' }),
  ]);
  processor.processEvent('response.reasoning_summary_part.added', [
    JSON.stringify({ part: { type: 'summary_text', text: '' } }),
  ]);
  processor.processEvent('response.reasoning_summary_text.delta', [
    JSON.stringify({ delta: '**Second part** begins.' }),
  ]);

  assert.equal(
    runtime.state.reasoningDelta,
    '**First part** done.\n\n**Second part** begins.',
  );
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
