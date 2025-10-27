# Services & Models

## Service Configuration

Defined in `src/config/config.js` under `window.config.services` with a `defaultService` and configuration helpers accessed via `src/js/services/api/clientConfig.js`:

- `getActiveServiceKey()` - Returns current service (openai, xai, lmstudio)
- `getActiveModel()` - Returns selected model for active service
- `getBaseUrl()` - Returns API base URL for active service
- `ensureApiKey()` - Returns API key and throws if missing
- `supportsReasoningEffort(model)` - Checks if model supports reasoning effort parameter

### Supported Providers

- **OpenAI** (`openai`) - Hosted Responses API with full feature support
- **xAI** (`xai`) - Grok models via Responses-compatible API
  - Uses `system` role instead of `developer` for system prompts
  - Supports specialized tools: `web_search`, `x_search` (Twitter/X search)
  - Requires `text.format` removal when using server-side tools
- **LM Studio** (`lmstudio`) - Local OpenAI-compatible server
  - Models fetched dynamically via `<baseUrl>/models`
  - No API key required
  - Base URL configurable in Settings

## Dynamic Model Fetching

LM Studio queries available models at runtime:
```javascript
services.lmstudio.fetchAndUpdateModels()
```
This hits `<baseUrl>/models` and updates the dropdown via `window.uiHooks.updateLmStudioModelsDropdown`.

## Request Handling

The `src/js/services/api/requestClient.js` module handles all API communication:

### Request Body Construction
- `buildRequestBody()` - Constructs Responses API payload with model, verbosity, reasoning effort, tools
- Handles service-specific quirks (xAI text format, reasoning support)
- Includes previous response ID for image continuation

### Streaming
- `executeStreamingRequest()` - Opens SSE connection for real-time responses
- `runTurn()` - Main entry point; handles multi-turn tool execution loops
- Automatically retries with function call outputs until completion

### Non-Streaming
- `executeNonStreamingRequest()` - Single request/response for simpler flows
- Returns complete response payload as JSON

## API Keys

- Managed in Settings → API Keys
- Stored in localStorage with service prefix: `wordmark_api_key_<service>`
- Retrieved via `clientConfig.ensureApiKey()`
- LM Studio doesn't require keys; only base URL configuration

## Tool Integration

Tools are managed by `src/js/services/api/toolManager.js`:

### Built-in Tools
- **Weather** (`function:open_meteo_forecast`) - Open-Meteo 1-7 day forecasts
- **Web Search** (`builtin:web_search`) - Provider-managed web search; xAI also surfaces `x_search` for Twitter/X
- **Code Interpreter** (`builtin:code_interpreter`) - Python sandbox execution
- **Image Generation** (`builtin:image_generation`) - OpenAI DALL-E integration
- **File Search** (`builtin:file_search`) - Vector store lookup for uploaded documents

### MCP Servers
- User-configured servers registered via `registerMcpServer()`
- Availability checked via HTTP ping with timeout
- Local servers automatically excluded when using cloud services
- Tool preferences stored per-server in localStorage

### Service-Specific Behavior
- xAI excludes MCP tools and automatically adds provider search tools (`web_search`, `x_search`)
- Local services (LM Studio) can access local MCP servers
- Cloud services skip local network MCP servers for security

## Images

- **Generation**: `image_generation` tool creates images via OpenAI
- **Uploads**: Multimodal messages support inline image attachments
- **Processing**: `src/js/services/streaming/imageGeneration.js` extracts outputs
- **Gallery**: Generated images stored in IndexedDB and displayed in gallery panel
- **Continuation**: Previous response IDs passed to maintain context for edits/variations

## Message Serialization

`src/js/services/api/messageUtils.js` handles message preparation:

- Converts conversation history to Responses API format
- Expands `[[IMAGE: filename]]` placeholders to `input_image` parts
- Attaches inline images as base64 data URLs
- Collects function call outputs for multi-turn flows
- Builds system/developer messages with personality and context

## Reasoning Support

Models with reasoning capability (o1, o3, o4, grok-4-fast variants) receive:
- `reasoning.effort` parameter (low, medium, high)
- `reasoning.summary` set to 'auto'
- Reasoning content extracted and displayed separately from main response

See [Streaming](./streaming.md) for details on reasoning display formatting.

## File & Vector Store Services

- `src/js/services/files.js` exposes helpers to list, delete, and bulk-delete assistants files. All requests are authorised via `ensureApiKey()` and point at `getBaseUrl()`.
  - `listAssistantFiles()` filters by `purpose=assistants`
  - `deleteAllAssistantFiles()` aggregates successes/errors so the UI can surface partial failures
- `src/js/services/vectorStore.js` covers upload + attachment workflows, creation/deletion, polling, and local metadata storage.
  - `filterSupportedFiles()` blocks unsupported extensions before upload
  - `uploadAndAttachFiles()` batches uploads, attaches them to a newly created store, and reports skipped items
  - `saveVectorStoreMetadata()` / `getVectorStoreMetadata()` persist IDs + names so the UI can pre-populate selectors
  - `waitForFileProcessing()` polls `vector_stores/{id}/files/{fileId}` until `completed`, raising on `failed`/timeout

These flows are covered by `tests/filesService.spec.js` and `tests/vectorStoreService.spec.js`, which stub `fetch` to ensure we make the correct REST calls and handle error paths gracefully.
