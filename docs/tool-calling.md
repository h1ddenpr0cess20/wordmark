# Tool Calling

Overview

- Toggle: Settings → Tools → “Enable Tool Calling” (mirrors `config.enableFunctionCalling`).
- Catalogue: the tool system lives under `src/ts/services/api/` — `toolManager.ts` (facade) plus the `tools/` sub-modules described below. It exposes the tool list, handlers, and MCP helpers consumed by the Responses client.
- UI: Settings → Tools renders toggles from the catalogue, persists preferences, and disables MCP entries when their servers are unreachable.

Module Layout

The former 600-line `toolManager.ts` god-object is split by responsibility; `toolManager.ts` is now a thin facade that re-exports the sub-modules, so importers keep a single entry point:

- `tools/catalog.ts` — the mutable tool registry. Owns `TOOL_CATALOG` (rich entries) and `TOOL_DEFINITIONS` (provider-facing definitions, kept in lockstep order), the `userMcpToolCount` boundary, and the typed splice mutators. It also loads persisted MCP servers and seeds the static tools at module load.
- `tools/preferences.ts` — per-tool enable/disable map, persisted to `localStorage` (`wordmark_tool_preferences`); `isToolEnabled` / `setToolEnabled` / `setAllToolsEnabled`.
- `tools/mcp.ts` — MCP server `registerMcpServer` / `unregisterMcpServer` plus availability ping + status cache (`refreshMcpAvailability`).
- `staticTools.ts` — the pure `STATIC_TOOLS` data (the built-in/function tool definitions).
- `toolManager.ts` — request-time tool filtering (`getEnabledToolDefinitions`), the UI catalog view (`getToolCatalog`), and re-exports of the above.

Provider-specific tool behavior (which provider runs tools server-side, which accepts client-side tools, local-vs-cloud) is resolved through the capability predicates in `src/ts/services/providers.ts` rather than scattered `serviceKey === …` checks.

Execution Flow (Responses API)

1. `requestClient.runTurn()` (see `src/ts/services/api/requestClient.ts`) collects the conversation, enabled tools from `toolManager.getEnabledToolDefinitions(serviceKey, modelName)`, and the active service/model.
2. The client issues a streaming or non-streaming `POST {baseUrl}/responses` request with `tools` array populated from the enabled subset.
3. As the response arrives, `collectFunctionCalls()` (in `messageUtils.ts`) extracts any tool calls from the output.
4. For tools with local handlers (like weather), the handler executes and the result is appended to the conversation as `function_call_output` or `tool_result` (format depends on service).
5. Server-managed tools (web_search, code_interpreter, image_generation) execute on the provider side; their outputs are extracted by specialized streaming handlers.
6. The client automatically retries with the extended conversation (including tool outputs) until no more tool calls are needed.
7. MCP tools are excluded if the server is offline (checked via `refreshMcpAvailability()`) or if using a cloud service with a local MCP server.

Built-in Tools

- `open_meteo_forecast` (type: `function`) — Public weather forecasts via Open-Meteo (no key required). Handler in `src/ts/services/weather.ts`.
- `web_search` (type: `builtin`) — Provider-managed web search (OpenAI, xAI). For xAI, also includes `x_search` for Twitter/X search.
- `code_interpreter` (type: `builtin`) — Python code execution in provider sandbox (OpenAI, xAI). Outputs extracted by `src/ts/services/streaming/codeInterpreter.ts` and rendered by `codeInterpreterRender.ts`.
- `image_generation` (type: `builtin`) — OpenAI image generation. Outputs processed by `src/ts/services/streaming/imageGeneration.ts`.
- `file_search` (type: `builtin`) — Vector store search across uploaded documents (OpenAI only). Rendered in reasoning timeline. xAI uses direct `input_file` references instead.
- MCP connectors (type: `mcp`) — User-supplied servers registered in Settings → Tools. Availability depends on the external MCP server responding to ping checks.

Credentials

- Built-in tools above do not require additional keys beyond the provider API key configured under Settings → API Keys.
- MCP servers manage their own authentication (credentials are handled on the MCP side, not in the Wordmark UI).

Adding Tools

- Extend the `STATIC_TOOLS` list in `src/ts/services/api/staticTools.ts` with metadata (`key`, `type`, `displayName`, `description`, and the Responses definition).
- For local functions, add an entry to `TOOL_HANDLERS` in `toolManager.ts` (see `src/ts/services/weather.ts` for an example) and keep results serialisable.
- For MCP servers, use the Settings → Tools form or call `registerMcpServer` (from `tools/mcp.ts`, re-exported by `toolManager.ts`) so the UI surfaces a toggle and auto-disables it if the server is unreachable.
- To change what a provider supports (e.g. a new provider's reasoning/server-tool quirks), edit the capability predicates in `src/ts/services/providers.ts`.
