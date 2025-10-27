function bufferAppend(map, key, delta) {
  if (!delta) return;
  const prev = map.get(key) || '';
  map.set(key, prev + delta);
}

function bufferGet(map, key) {
  return map.get(key) || '';
}

function safeTruncate(str, max = 800) {
  if (typeof str !== 'string') {
    try {
      str = JSON.stringify(str, null, 2);
    } catch (err) {
      str = String(str);
    }
  }
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

function formatToolArgs(args, inline = false) {
  if (!args) return '';
  let parsed = null;
  if (typeof args === 'string') {
    try {
      parsed = JSON.parse(args);
    } catch (err) {
      return inline ? ` ${safeTruncate(args, 120)}` : `\n    ${safeTruncate(args, 400)}`;
    }
  } else if (typeof args === 'object') {
    parsed = args;
  }
  if (!parsed || typeof parsed !== 'object') return '';

  if (inline) {
    const keys = Object.keys(parsed);
    if (keys.length === 0) return '';
    if (keys.length === 1 && typeof parsed[keys[0]] === 'string') {
      return ` → ${safeTruncate(parsed[keys[0]], 100)}`;
    }
    return ` → ${keys.length} param${keys.length > 1 ? 's' : ''}`;
  }

  try {
    const formatted = JSON.stringify(parsed, null, 2);
    const indented = formatted.split('\n').map(line => `    ${line}`).join('\n');
    return formatted.length > 400 ? `\n${indented.slice(0, 400)}…` : `\n${indented}`;
  } catch (err) {
    return '';
  }
}

function extractQueriesFromArgs(argsStr) {
  const queries = [];
  if (!argsStr) return queries;
  let parsed = null;
  if (typeof argsStr === 'string') {
    try {
      parsed = JSON.parse(argsStr);
    } catch (err) {
      parsed = null;
    }
  } else if (typeof argsStr === 'object') {
    parsed = argsStr;
  }
  if (!parsed || typeof parsed !== 'object') return queries;

  const candidates = [];
  if (typeof parsed.query === 'string') candidates.push(parsed.query);
  if (Array.isArray(parsed.queries)) {
    parsed.queries.forEach(q => { if (typeof q === 'string') candidates.push(q); });
  }
  if (Array.isArray(parsed.searches)) {
    parsed.searches.forEach(q => { if (typeof q === 'string') candidates.push(q); });
  }
  if (typeof parsed.q === 'string') candidates.push(parsed.q);

  const seen = new Set();
  candidates.forEach(q => {
    const trimmed = q.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      queries.push(trimmed);
    }
  });
  return queries;
}

function extractDeltaText(payload) {
  if (!payload) return '';
  if (typeof payload.delta === 'string') {
    return payload.delta;
  }
  if (payload.delta && typeof payload.delta === 'object') {
    if (typeof payload.delta.text === 'string') {
      return payload.delta.text;
    }
    if (Array.isArray(payload.delta) && payload.delta.length > 0) {
      return payload.delta.map(item => (typeof item === 'string' ? item : '')).join('');
    }
  }
  if (typeof payload.text === 'string') {
    return payload.text;
  }
  return '';
}

function flattenContentArray(items) {
  return items.map(item => pluckReasoningValue(item)).join('');
}

function pluckReasoningValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return flattenContentArray(value);
  if (typeof value === 'object') {
    if (typeof value.content === 'string') return value.content;
    if (Array.isArray(value.content)) return flattenContentArray(value.content);
    if (typeof value.text === 'string') return value.text;
    if (Array.isArray(value.text)) return flattenContentArray(value.text);
    if (typeof value.output === 'string') return value.output;
    if (Array.isArray(value.output)) return flattenContentArray(value.output);
    if (typeof value.reasoning === 'string') return value.reasoning;
    if (Array.isArray(value.reasoning)) return flattenContentArray(value.reasoning);
  }
  return '';
}

function getNestedValue(source, path) {
  return path.reduce((value, key) => (value == null ? undefined : value[key]), source);
}

function extractReasoningText(payload) {
  if (!payload) return '';

  const candidatePaths = [
    ['reasoning'],
    ['reasoning', 'output'],
    ['reasoning', 'content'],
    ['reasoning_content'],
    ['reasoning_content', 'output'],
    ['text'],
    ['delta', 'reasoning_content'],
    ['delta', 'reasoning_content', 'output'],
    ['delta', 'reasoning'],
    ['delta', 'reasoning', 'output'],
    ['delta', 'reasoning', 'content'],
    ['delta', 'content'],
    ['delta', 'text'],
    ['delta'],
  ];

  for (const path of candidatePaths) {
    const candidate = getNestedValue(payload, path);
    const text = pluckReasoningValue(candidate);
    if (text && text.trim()) {
      return text;
    }
  }

  return '';
}

export function createStreamingEventProcessor(runtime) {
  const argBuffers = new Map();
  const mcpArgBuffers = new Map();
  const codeBuffers = new Map();
  const webSearchQueue = [];
  const webSearchById = new Map();
  const xSearchQueue = [];
  const xSearchById = new Map();
  const activeFnArgs = new Set();
  const activeMcpArgs = new Set();
  const activeCodeStreams = new Set();
  const activeCustomInput = new Set();
  const toolExecutions = new Map();

  let finalResponsePayload = null;
  let responseStartOffset = 0;
  let expectNewResponse = false;

  function ensureResponseSegment() {
    if (!expectNewResponse) return;
    const current = runtime.getOutputText();
    if (current.trim().length > 0 && !current.endsWith('\n\n')) {
      runtime.appendOutputText(current.endsWith('\n') ? '\n' : '\n\n');
    }
    responseStartOffset = runtime.getOutputLength();
    expectNewResponse = false;
  }

  function processEvent(eventType, dataLines) {
    if (!dataLines.length) {
      return;
    }
    const dataStr = dataLines.join('\n').trim();
    if (!dataStr) {
      return;
    }

    let payload;
    try {
      payload = JSON.parse(dataStr);
    } catch (err) {
      console.error('Failed to parse SSE payload:', err, dataStr);
      return;
    }

    const effectiveType = eventType || payload.type || '';
    const isImageGenerationEvent = effectiveType && (
      effectiveType.includes('image_generation') ||
      effectiveType.includes('image_edit') ||
      effectiveType.includes('image_variation') ||
      effectiveType === 'image_generation_call'
    );

    if (isImageGenerationEvent) {
      runtime.collectImagesFromSource(payload, effectiveType);
      if (payload.delta && typeof payload.delta === 'object') {
        runtime.collectImagesFromSource(payload.delta, `${effectiveType}:delta`);
      }
    }

    switch (effectiveType) {
    case 'response.output_text.delta': {
      const delta = extractDeltaText(payload);
      if (delta) {
        ensureResponseSegment();
        runtime.appendOutputText(delta);
      }
      break;
    }
    case 'response.reasoning.delta':
    case 'response.reasoning_text.delta':
    case 'response.reasoning_summary_text.delta': {
      const delta = extractDeltaText(payload);
      if (delta) {
        runtime.appendReasoningDelta(delta);
      }
      break;
    }
    case 'response.reasoning.done': {
      const full = extractReasoningText(payload);
      if (typeof full === 'string' && full.length > 0) {
        const current = runtime.getReasoningText();
        if (current && current.trim().length > 0) {
          if (!current.endsWith('\n')) {
            runtime.appendReasoningDelta('\n');
          }
          runtime.appendReasoningDelta(full);
        } else {
          runtime.appendReasoningDelta(full);
        }
      }
      break;
    }
    case 'response.delta': {
      const innerType = (payload && (payload.type || (payload.delta && payload.delta.type))) || '';
      const deltaText = extractDeltaText(payload);
      if (innerType.includes('reasoning')) {
        if (deltaText) {
          runtime.appendReasoningDelta(deltaText);
        }
        break;
      }
      if (deltaText) {
        ensureResponseSegment();
        runtime.appendOutputText(deltaText);
      }
      break;
    }
    case 'response.output_item.added': {
      const item = payload?.item || null;
      const itype = item?.type ? String(item.type).toLowerCase() : '';
      const itemId = item?.id || '';

      if (itype.includes('tool') || itype.includes('function')) {
        const name = item?.name || item?.tool_name || item?.function?.name || 'tool';
        toolExecutions.set(itemId, {
          name,
          status: 'started',
          startTime: Date.now(),
        });
        runtime.appendReasoningLine(`**🔧 ${name}**:`);
      }
      break;
    }
    case 'response.output_item.done': {
      const item = payload?.item || null;
      const itype = item?.type ? String(item.type).toLowerCase() : '';
      const itemId = item?.id || '';

      if (itype.includes('tool') || itype.includes('function')) {
        const exec = toolExecutions.get(itemId);
        if (exec) {
          const duration = Date.now() - exec.startTime;
          runtime.appendReasoningLine(`✔️ _completed in ${duration}ms_`);
          runtime.appendReasoningLine('');
          toolExecutions.delete(itemId);
        }
      }
      break;
    }
    case 'response.tool_call.delta': {
      break;
    }
    case 'response.tool_call.completed': {
      const name = payload?.name || payload?.tool_name || payload?.function?.name || '';
      if (name) {
        runtime.appendReasoningLine('  ✔️ _completed_');
        runtime.appendReasoningLine('');
      }
      break;
    }
    case 'response.tool_call.failed': {
      const error = payload?.error?.message || payload?.message || 'failed';
      runtime.appendReasoningLine(`  ❌ _failed: ${error}_`);
      runtime.appendReasoningLine('');
      break;
    }
    case 'response.function_call_arguments.delta': {
      const name = payload.name || payload?.function?.name || '';
      const itemId = payload.item_id || payload.item?.id || '';
      const key = `${itemId}|${name}`;
      const delta = typeof payload.delta === 'string' ? payload.delta : extractDeltaText(payload);
      bufferAppend(argBuffers, key, delta || '');
      break;
    }
    case 'response.function_call_arguments.done': {
      const name = payload.name || payload?.function?.name || '';
      const itemId = payload.item_id || payload.item?.id || '';
      const key = `${itemId}|${name}`;
      const args = typeof payload.arguments === 'string'
        ? payload.arguments
        : (payload.arguments ? JSON.stringify(payload.arguments) : '');
      if (args) argBuffers.set(key, args);

      const formattedArgs = formatToolArgs(args, false);
      if (formattedArgs) {
        runtime.appendReasoningLine(`  args:${formattedArgs}`);
      }

      const normalizedName = (name || '').toLowerCase();
      if (normalizedName === 'web_search') {
        const qs = extractQueriesFromArgs(args || '');
        qs.forEach(q => webSearchQueue.push(q));
      } else if (normalizedName === 'x_search') {
        const qs = extractQueriesFromArgs(args || '');
        qs.forEach(q => xSearchQueue.push(q));
      }
      activeFnArgs.delete(key);
      break;
    }
    case 'response.function_call_arguments.failed': {
      runtime.appendReasoningLine('  ❌ _args failed_');
      break;
    }
    case 'response.mcp_call_arguments.delta': {
      const itemId = payload.item_id || payload.item?.id || '';
      const delta = typeof payload.delta === 'string' ? payload.delta : extractDeltaText(payload);
      bufferAppend(mcpArgBuffers, itemId, delta || '');
      break;
    }
    case 'response.mcp_call_arguments.done': {
      const itemId = payload.item_id || payload.item?.id || '';
      const args = typeof payload.arguments === 'string'
        ? payload.arguments
        : (payload.arguments ? JSON.stringify(payload.arguments) : '');
      if (args) mcpArgBuffers.set(itemId, args);

      const formattedArgs = formatToolArgs(args, false);
      if (formattedArgs) {
        runtime.appendReasoningLine(`  args:${formattedArgs}`);
      }

      const qs = extractQueriesFromArgs(args || '');
      qs.forEach(q => webSearchQueue.push(q));
      activeMcpArgs.delete(itemId);
      break;
    }
    case 'response.mcp_call.in_progress': {
      runtime.appendReasoningLine('  ⏳ _executing…_');
      break;
    }
    case 'response.mcp_call.completed': {
      break;
    }
    case 'response.mcp_call.failed': {
      const error = payload?.error?.message || 'failed';
      runtime.appendReasoningLine(`❌ _failed: ${error}_`);
      runtime.appendReasoningLine('');
      break;
    }
    case 'response.file_search_call.in_progress': {
      runtime.appendReasoningLine('**🔎 file_search**:');
      runtime.appendReasoningLine('  ⏳ _searching…_');
      break;
    }
    case 'response.file_search_call.searching': {
      runtime.updateLastReasoningLine('  🔍 _searching files…_');
      break;
    }
    case 'response.file_search_call.completed': {
      runtime.appendReasoningLine('  ✔️ _completed_');
      runtime.appendReasoningLine('');
      break;
    }
    case 'response.file_search_call.failed': {
      const error = payload?.error?.message || 'failed';
      runtime.appendReasoningLine(`  ❌ _failed: ${error}_`);
      runtime.appendReasoningLine('');
      break;
    }
    case 'response.web_search_call.in_progress': {
      const id = payload.item_id || '';
      let q = '';
      if (webSearchById.has(id)) {
        q = webSearchById.get(id) || '';
      } else if (webSearchQueue.length > 0) {
        q = webSearchQueue.shift();
        if (id) webSearchById.set(id, q);
      }
      runtime.appendReasoningLine(`**🌐 web_search${q ? ` "${safeTruncate(q, 60)}"` : ''}**:`);
      runtime.appendReasoningLine('  ⏳ _searching web…_');
      break;
    }
    case 'response.web_search_call.searching': {
      const id = payload.item_id || '';
      const q = webSearchById.get(id) || '';
      runtime.updateLastReasoningLine(`  🔍 _searching${q ? ` "${safeTruncate(q, 60)}"` : ''}…_`);
      break;
    }
    case 'response.web_search_call.completed': {
      const id = payload.item_id || '';
      const q = webSearchById.get(id) || '';
      runtime.appendReasoningLine('  ✔️ _completed_');
      runtime.appendReasoningLine('');
      if (id) webSearchById.delete(id);
      break;
    }
    case 'response.web_search_call.failed': {
      const id = payload.item_id || '';
      const q = webSearchById.get(id) || '';
      const error = payload?.error?.message || 'failed';
      runtime.appendReasoningLine(`  ❌ _failed: ${error}_`);
      runtime.appendReasoningLine('');
      if (id) webSearchById.delete(id);
      break;
    }
    case 'response.x_search_call.in_progress': {
      const id = payload.item_id || '';
      let q = '';
      if (xSearchById.has(id)) {
        q = xSearchById.get(id) || '';
      } else if (xSearchQueue.length > 0) {
        q = xSearchQueue.shift();
        if (id) xSearchById.set(id, q);
      }
      runtime.appendReasoningLine(`**🐦 x_search${q ? ` "${safeTruncate(q, 60)}"` : ''}**:`);
      runtime.appendReasoningLine('  ⏳ _searching X…_');
      break;
    }
    case 'response.x_search_call.searching': {
      const id = payload.item_id || '';
      const q = xSearchById.get(id) || '';
      runtime.updateLastReasoningLine(`  🔍 _searching${q ? ` "${safeTruncate(q, 60)}"` : ''}…_`);
      break;
    }
    case 'response.x_search_call.completed': {
      const id = payload.item_id || '';
      runtime.appendReasoningLine('  ✔️ _completed_');
      runtime.appendReasoningLine('');
      if (id) xSearchById.delete(id);
      break;
    }
    case 'response.x_search_call.failed': {
      const id = payload.item_id || '';
      const error = payload?.error?.message || 'failed';
      runtime.appendReasoningLine(`  ❌ _failed: ${error}_`);
      runtime.appendReasoningLine('');
      if (id) xSearchById.delete(id);
      break;
    }
    case 'response.code_interpreter_call.in_progress': {
      runtime.appendReasoningLine('**💻 code_interpreter**:');
      runtime.appendReasoningLine('  ⏳ _preparing…_');
      break;
    }
    case 'response.code_interpreter_call.interpreting': {
      runtime.updateLastReasoningLine('  ▶️ _executing…_');
      break;
    }
    case 'response.code_interpreter_call.completed': {
      runtime.appendReasoningLine('  ✔️ _completed_');
      runtime.appendReasoningLine('');
      break;
    }
    case 'response.code_interpreter_call.failed': {
      const error = payload?.error?.message || 'failed';
      runtime.appendReasoningLine(`  ❌ _failed: ${error}_`);
      runtime.appendReasoningLine('');
      break;
    }
    case 'response.code_interpreter_call_code.delta': {
      const itemId = payload.item_id || '';
      const delta = typeof payload.delta === 'string' ? payload.delta : extractDeltaText(payload);
      bufferAppend(codeBuffers, itemId, delta || '');
      if (!activeCodeStreams.has(itemId)) {
        runtime.appendReasoningLine('  📝 _code streaming…_');
        activeCodeStreams.add(itemId);
      }
      break;
    }
    case 'response.code_interpreter_call_code.done': {
      const itemId = payload.item_id || '';
      const code = typeof payload.code === 'string'
        ? payload.code
        : (payload.code ? JSON.stringify(payload.code) : bufferGet(codeBuffers, itemId));
      if (code && code.length > 0) {
        const preview = code.length > 200 ? `${code.slice(0, 200)}…` : code;
        const lines = preview.split('\n');
        if (lines.length > 5) {
          runtime.appendReasoningLine(`  code: (${lines.length} lines)`);
          lines.slice(0, 5).forEach(line => {
            runtime.appendReasoningLine(`    ${line}`);
          });
          if (lines.length > 5) {
            runtime.appendReasoningLine(`    ... (${lines.length - 5} more lines)`);
          }
        } else {
          runtime.appendReasoningLine(`  code: ${preview}`);
        }
      }
      activeCodeStreams.delete(itemId);
      break;
    }
    case 'response.image_generation_call.in_progress': {
      runtime.appendReasoningLine('**🎨 image_generation**:');
      runtime.appendReasoningLine('  ⏳ _preparing…_');
      break;
    }
    case 'response.image_generation_call.generating': {
      runtime.updateLastReasoningLine('  🖌️ _generating image…_');
      break;
    }
    case 'response.image_generation_call.completed': {
      runtime.appendReasoningLine('  ✔️ _completed_');
      runtime.appendReasoningLine('');
      break;
    }
    case 'response.image_generation_call.failed': {
      const error = payload?.error?.message || 'failed';
      runtime.appendReasoningLine(`  ❌ _failed: ${error}_`);
      runtime.appendReasoningLine('');
      break;
    }
    case 'response.image_generation_call.partial_image': {
      const idx = typeof payload.partial_image_index === 'number' ? payload.partial_image_index : 0;
      runtime.appendReasoningLine(`  🖼️ _image ${idx+1} generated_`);
      break;
    }
    case 'response.custom_tool_call_input.delta': {
      if (!activeCustomInput.has('custom')) {
        runtime.appendReasoningLine('  📥 _receiving input…_');
        activeCustomInput.add('custom');
      }
      break;
    }
    case 'response.custom_tool_call_input.done': {
      const input = typeof payload.input === 'string' ? payload.input : (payload.input ? JSON.stringify(payload.input) : '');
      const formattedInput = formatToolArgs(input, false);
      if (formattedInput) {
        runtime.appendReasoningLine(`  input:${formattedInput}`);
      }
      activeCustomInput.delete('custom');
      break;
    }
    case 'response.refusal.delta': {
      const delta = extractDeltaText(payload);
      if (delta && !activeCustomInput.has('refusal')) {
        runtime.appendReasoningLine('⛔ Content Policy Refusal:');
        activeCustomInput.add('refusal');
      }
      break;
    }
    case 'response.refusal.done': {
      const refusal = typeof payload.refusal === 'string' ? payload.refusal : (payload.refusal ? JSON.stringify(payload.refusal) : '');
      if (refusal) {
        runtime.appendReasoningLine(`  ${safeTruncate(refusal || '')}`);
      }
      activeCustomInput.delete('refusal');
      break;
    }
    case 'response.queued':
    case 'response.created':
    case 'response.in_progress': {
      break;
    }
    case 'error': {
      const code = payload.code || '';
      const message = payload.message || 'Unknown error';
      runtime.appendReasoningLine(`⚠️ error ${code} ${message}`);
      break;
    }
    case 'response.output_text.done': {
      const fullText = extractDeltaText(payload);
      if (fullText) {
        if (expectNewResponse) {
          ensureResponseSegment();
        }
        runtime.replaceOutputSegment(responseStartOffset, fullText);
        expectNewResponse = true;
      }
      break;
    }
    case 'response.error': {
      const message = payload.error?.message || payload.message || 'Unknown streaming error';
      runtime.appendReasoningLine(`⚠️ response.error ${safeTruncate(message)}`);
      if (payload.response) {
        finalResponsePayload = payload.response;
      }
      break;
    }
    case 'response.completed': {
      if (payload.response) {
        finalResponsePayload = payload.response;
      }
      runtime.ensureReasoningTrailingNewline();
      break;
    }
    default: {
      if (!finalResponsePayload && payload.response) {
        finalResponsePayload = payload.response;
      }
      break;
    }
    }
  }

  return {
    processEvent,
    finalize: () => {
      runtime.ensureReasoningTrailingNewline();
    },
    getFinalResponsePayload: () => (finalResponsePayload ? { ...finalResponsePayload } : null),
    attachImages: payload => runtime.attachImagesToPayload(payload),
  };
}
