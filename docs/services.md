# Services & Models

## Service Configuration

Defined in `src/config/config.ts` under `config.services` with a `defaultService` and configuration helpers accessed via `src/ts/services/api/clientConfig.ts`:

- `getActiveServiceKey()` - Returns current service (openai, xai, lmstudio, ollama)
- `getActiveModel()` - Returns selected model for active service
- `getBaseUrl()` - Returns API base URL for active service
- `ensureApiKey()` - Returns API key and throws if missing
- `supportsReasoningEffort(model)` - Checks if model supports reasoning effort parameter

### Provider Capability Registry

Per-provider quirks (which service is local vs. cloud, supports `reasoning.effort`,
accepts `include` fields, runs tools server-side, the leading instruction-message
role, whether TTS accepts a voice-instructions prompt, and whether documents are
uploaded directly vs. via a vector store) are centralized as pure predicates in
`src/ts/services/providers.ts` — `isLocalService`, `isCloudService`,
`serviceSupportsReasoning`, `supportsResponseIncludeFields`,
`usesServerManagedTools`, `instructionMessageRole`, `ttsSupportsInstructions`,
`usesDirectFileUpload`. This is the single place to edit when adding or changing
a provider; the request builder, tool filter, and key handling all read from it
instead of re-deriving `serviceKey === …` checks at each call site.

### Supported Providers

- **OpenAI** (`openai`) - Hosted Responses API with full feature support
- **xAI** (`xai`) - Grok models via Responses-compatible API
  - Uses `system` role instead of `developer` for system prompts
  - Supports specialized tools: `web_search`, `x_search` (Twitter/X search)
  - Supports MCP connectors; local-network servers remain blocked for security when using xAI
  - Requires `text.format` removal when using server-side tools (web/X search, Code Interpreter, MCP connectors)
  - Provider-managed Code Interpreter ignores OpenAI-specific container options
  - File attachments use direct `input_file` references (uploaded via `/v1/files`, referenced by `file_id` in message content) instead of vector stores
- **LM Studio** (`lmstudio`) - Local OpenAI-compatible server
  - Models fetched dynamically via `<baseUrl>/models`
  - No API key required
  - Base URL configurable in Settings
- **Ollama** (`ollama`) - Local OpenAI-compatible Responses server
  - Models fetched dynamically via `<baseUrl>/models` (falls back to `/api/tags`)
  - No API key required
  - Base URL configurable in Settings → API Keys (default `http://localhost:11434/v1`)

## Dynamic Model Fetching

Local providers query available models at runtime:
```javascript
services.lmstudio.fetchAndUpdateModels()
services.ollama.fetchAndUpdateModels()
```
LM Studio hits `<baseUrl>/models`. Ollama prefers `<baseUrl>/models` and falls back to `/api/tags` if needed. Both update the dropdown via `uiHooks.updateModelsDropdown`.

## Request Handling

The `src/ts/services/api/requestClient.ts` module handles all API communication:

### Request Body Construction
- `buildRequestBody()` - Constructs Responses API payload with model, verbosity, reasoning effort, tools
- Handles service-specific quirks (xAI text format, reasoning support) via the `providers.ts` capability predicates
- Includes previous response ID for image continuation

### Streaming
- `executeStreamingRequest()` - Opens SSE connection for real-time responses
- `runTurn()` - Main entry point; handles multi-turn tool execution loops
- Automatically retries with function call outputs until completion

### Non-Streaming
- `executeNonStreamingRequest()` - Single request/response for simpler flows
- Returns complete response payload as JSON

### Response Normalization
- `src/ts/services/api/responseNormalization.ts` folds the divergent **non-streaming** provider response shapes into plain strings: `extractOutputText()` and `extractReasoningText()` read the assorted reasoning keys (`reasoning` as string/array, `reasoning.output`, `reasoning_content`, `reasoning.content`) in a fixed precedence order.
- The streaming path needs no equivalent: all providers emit a single Responses-API-compatible SSE event vocabulary, so `src/ts/services/streaming/` has no provider branching.

## API Keys

- Managed in Settings → API Keys
- Stored in localStorage with service prefix: `wordmark_api_key_<service>`
- Retrieved via `clientConfig.ensureApiKey()`
- LM Studio and Ollama don't require keys; only local base URLs

## Tool Integration

Tools are managed under `src/ts/services/api/` — `toolManager.ts` (filtering + facade) plus `tools/catalog.ts`, `tools/preferences.ts`, `tools/mcp.ts`, and `staticTools.ts` (see [Tool Calling](./tool-calling.md)):

### Built-in Tools
- **Weather** (`function:open_meteo_forecast`) - Open-Meteo 1-7 day forecasts
- **Web Search** (`builtin:web_search`) - Provider-managed web search; xAI also surfaces `x_search` for Twitter/X
- **Code Interpreter** (`builtin:code_interpreter`) - Python sandbox execution
- **Image Generation** (`builtin:image_generation`) - OpenAI DALL-E integration (automatically disabled when Codex models are selected)
- **File Search** (`builtin:file_search`) - Vector store lookup for uploaded documents (OpenAI only)

### MCP Servers
- User-configured servers registered via `registerMcpServer()`
- Availability checked via HTTP ping with timeout
- Local servers automatically excluded when using cloud services
- Tool preferences stored per-server in localStorage

### Service-Specific Behavior
- OpenAI disables the image generation tool whenever a Codex model is active.
- xAI supports MCP tools (non-local endpoints) and automatically adds provider search tools (`web_search`, `x_search`)
- Local services (LM Studio, Ollama) can access local MCP servers
- Cloud services skip local network MCP servers for security

## Images

- **Generation**: `image_generation` tool creates images via OpenAI
- **Uploads**: Multimodal messages support inline image attachments
- **Processing**: `src/ts/services/streaming/imageGeneration.ts` extracts outputs
- **Gallery**: Generated images stored in IndexedDB and displayed in gallery panel
- **Continuation**: Previous response IDs passed to maintain context for edits/variations

## Message Serialization

`src/ts/services/api/messageUtils.ts` handles message preparation:

- Converts conversation history to Responses API format
- Expands `[[IMAGE: filename]]` placeholders to `input_image` parts
- Attaches inline images as base64 data URLs
- Collects function call outputs for multi-turn flows

`src/ts/services/api/instructions.ts` builds system/developer messages with personality, location, timestamp, tool descriptions, and stored memories.

## Reasoning Support

Models with reasoning capability (o1, o3, o4, grok-4-fast variants) receive:
- `reasoning.effort` parameter (low, medium, high)
- `reasoning.summary` set to 'auto'
- Reasoning content extracted and displayed separately from main response

See [Streaming](./streaming.md) for details on reasoning display formatting.

## File & Vector Store Services

Document attachments are handled differently per provider:

- **OpenAI**: Files are uploaded to `/v1/files`, attached to a vector store, and searched via the `file_search` tool. Requires the File Search tool to be enabled in Settings.
- **xAI**: Files are uploaded to `/v1/files` and referenced directly in message content as `input_file` parts with the returned `file_id`. No vector stores or file_search tool needed.

Shared infrastructure in `src/ts/services/vectorStore.ts`:
  - `uploadFile()` uploads a file to the active provider's `/files` endpoint (used by both OpenAI and xAI)
  - `filterSupportedFiles()` blocks unsupported extensions before upload
  - `uploadAndAttachFiles()` batches uploads and attaches them to a newly created vector store (OpenAI path)
  - `saveVectorStoreMetadata()` / `getVectorStoreMetadata()` persist IDs + names so the UI can pre-populate selectors
  - `waitForFileProcessing()` polls `vector_stores/{id}/files/{fileId}` until `completed`, raising on `failed`/timeout

`src/ts/services/files.ts` exposes helpers to list, delete, and bulk-delete assistants files. All requests are authorised via `ensureApiKey()` and point at `getBaseUrl()`.
  - `listAssistantFiles()` filters by `purpose=assistants`
  - `deleteAllAssistantFiles()` aggregates successes/errors so the UI can surface partial failures

These flows are covered by `tests/filesService.spec.ts`, `tests/vectorStoreService.spec.ts`, and `tests/messageUtils.spec.ts`.
