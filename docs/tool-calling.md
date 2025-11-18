# Tool Calling

Overview

- Toggle: Settings → Tools → “Enable Tool Calling” (mirrors `window.config.enableFunctionCalling`).
- Catalogue: `src/js/services/api/toolManager.js` exposes the tool list, handlers, and MCP helpers consumed by the Responses client.
- UI: Settings → Tools renders toggles from the catalogue, persists preferences, and disables MCP entries when their servers are unreachable.

Execution Flow (Responses API)

1. `requestClient.runTurn()` (see `src/js/services/api/requestClient.js`) collects the conversation, enabled tools from `toolManager.getEnabledToolDefinitions(serviceKey, modelName)`, and the active service/model.
2. The client issues a streaming or non-streaming `POST {baseUrl}/responses` request with `tools` array populated from the enabled subset.
3. As the response arrives, `collectFunctionCalls()` (in `messageUtils.js`) extracts any tool calls from the output.
4. For tools with local handlers (like weather), the handler executes and the result is appended to the conversation as `function_call_output` or `tool_result` (format depends on service).
5. Server-managed tools (web_search, code_interpreter, image_generation) execute on the provider side; their outputs are extracted by specialized streaming handlers.
6. The client automatically retries with the extended conversation (including tool outputs) until no more tool calls are needed.
7. MCP tools are excluded if the server is offline (checked via `refreshMcpAvailability()`) or if using a cloud service with a local MCP server.

Built-in Tools

- `open_meteo_forecast` (type: `function`) — Public weather forecasts via Open-Meteo (no key required). Handler in `src/js/services/weather.js`.
- `web_search` (type: `builtin`) — Provider-managed web search (OpenAI, xAI). For xAI, also includes `x_search` for Twitter/X search.
- `code_interpreter` (type: `builtin`) — Python code execution in provider sandbox (OpenAI, xAI). Outputs handled by `src/js/services/streaming/codeInterpreter.js`.
- `image_generation` (type: `builtin`) — OpenAI image generation. Outputs processed by `src/js/services/streaming/imageGeneration.js`.
- `file_search` (type: `builtin`) — Vector store search across uploaded documents. Rendered in reasoning timeline.
- MCP connectors (type: `mcp`) — User-supplied servers registered in Settings → Tools. Availability depends on the external MCP server responding to ping checks.

Credentials

- Built-in tools above do not require additional keys beyond the provider API key configured under Settings → API Keys.
- MCP servers manage their own authentication (credentials are handled on the MCP side, not in the Wordmark UI).

Adding Tools

- Extend the `STATIC_TOOLS` list in `src/js/services/api/toolManager.js` with metadata (`key`, `type`, `displayName`, `description`, and the Responses definition).
- For local functions, add an entry to `TOOL_HANDLERS` (see `src/js/services/weather.js` for an example) and keep results serialisable.
- For MCP servers, use the Settings → Tools form or call `registerMcpServer` so the UI surfaces a toggle and auto-disables it if the server is unreachable.
