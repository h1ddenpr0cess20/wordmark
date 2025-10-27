import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};

const { createStreamingEventProcessor } = await import('../src/js/services/streaming/eventProcessor.js');

function createRuntimeStub() {
  const state = {
    output: '',
    reasoningLines: [],
    reasoningDelta: '',
    trailingEnsured: false,
    imageCalls: [],
    attachCalls: [],
  };

  return {
    appendOutputText(delta) {
      state.output += delta || '';
    },
    replaceOutputSegment(start, fullText) {
      state.output = state.output.slice(0, start) + (fullText || '');
    },
    appendReasoningDelta(delta) {
      state.reasoningDelta += delta || '';
    },
    appendReasoningLine(line) {
      state.reasoningLines.push(line);
    },
    updateLastReasoningLine(line) {
      if (state.reasoningLines.length === 0) {
        state.reasoningLines.push(line);
      } else {
        state.reasoningLines[state.reasoningLines.length - 1] = line;
      }
    },
    ensureReasoningTrailingNewline() {
      state.trailingEnsured = true;
    },
    collectImagesFromSource(payload, label) {
      state.imageCalls.push({ payload, label });
    },
    attachImagesToPayload(payload) {
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
    outputEndsWith(suffix) {
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
  const processor = createStreamingEventProcessor(runtime);

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
  const processor = createStreamingEventProcessor(runtime);

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
  const processor = createStreamingEventProcessor(runtime);

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
  assert.equal(attached.attached, true);
  assert.equal(runtime.state.attachCalls.length, 1);
});
