# Streaming

## Overview

Wordmark breaks streaming responses into focused modules that cooperate to render text, reasoning, tool status, and generated assets in real time. The pipeline consumes Server-Sent Events from the OpenAI/xAI Responses APIs and updates the UI incrementally while preserving local history and image galleries.

## Pipeline

1. `streaming.js` opens the SSE reader, normalises DOM placeholders, and instantiates the runtime + event processor pair.
2. `createStreamingRuntime()` (`streaming/runtime.js`) manages incremental output, reasoning buffers, code highlighting, auto-scroll cues, and placeholder removal.
3. `createStreamingEventProcessor()` (`streaming/eventProcessor.js`) parses SSE event types, updates the runtime, tracks tool execution state, and aggregates the final response payload.
4. `messageLifecycle.js` reconciles loading messages with the finished assistant turn, stores history, and emits UI updates once streaming finalises.

## Reasoning Timeline

- Reasoning deltas (`response.reasoning.*`) render into a dedicated "Reasoning" accordion ahead of the main response text.
- Tool and MCP events emit friendly status lines (in-progress, completed, failed) with timing metadata.
- User preference (`window.userThinkingState`) keeps the accordion collapsed/expanded between turns.

## Tool Output Handling

- `response.function_call_arguments.*` and `response.mcp_call_arguments.*` buffer tool parameters and surface them in the reasoning log.
- Provider-only tools (web search, X search, code interpreter, file search, image generation) each have bespoke event handlers with emoji status indicators for quick scanning.
- Code Interpreter streams code deltas and previews the first few lines after completion to avoid flooding the reasoning panel.

## Image Handling

- `imageGeneration.js` extracts base64/image URLs from streaming payloads and attaches them to the final response.
- `ensureImagesHaveMessageIds()` backfills message associations so gallery entries can link to the originating assistant turn.
- Captured outputs are rendered beneath the loading message and added to the stored image gallery when streaming finishes.

## Error & Completion Flow

- `eventProcessor.finalize()` enforces newline termination on reasoning output and ensures the final payload is preserved for downstream consumers.
- SSE `response.error` and `error` events emit highlighted reasoning lines to aid debugging.
- Non-streaming fallbacks still route through `messageLifecycle.js` to maintain consistent history behaviour.

## Extending

- Add new tool visualisation cases in `eventProcessor` and surface friendly status strings via the runtime helpers.
- Prefer updating `runtime.render()` if additional DOM interactions or post-processing is required.
- When adding new image-producing tools, push candidates through `collectImageCandidates()` so they automatically attach to responses and galleries.
