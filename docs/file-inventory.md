# File Inventory & Code Map

Purpose: quick orientation to the current project layout, key entry points, and where major features live.

## Top-Level
- `index.html`: Entrypoint; loads styles and `src/ts/main.ts`. Contains app panels, settings modal, history/gallery panels, and fragments container.
- `README.md`: Feature overview and usage.
- `docs/`: Architecture, services, tool calling, memory, and troubleshooting guides.

## Source (`src/`)
- `config/`
  - `config.ts`: Provider list, API base URLs, default service/model, key getters, and role helpers.

- `types/`: Shared TypeScript type declarations (`api.ts`, `tools.ts`, `globals.d.ts`, …).

- `ts/`
  - `main.ts`: Single ES module entry. Orchestrates imports; wires config, state, components, services, and init modules; calls `initialize()` after fragments load.
  - `init/`
    - `state.ts`: Shared runtime store — exports `state` (app state) and `elements` (cached DOM refs). Replaces the removed `globals.js` window bridge.
    - `uiHooks.ts`: Exports `uiHooks`, a registry of UI callbacks (e.g. `updateModelsDropdown`) invoked by lower-level modules.
    - `dom.ts`: Queries interactive elements (chat box, inputs, toggles, panels) and assigns them onto `elements`.
    - `modelSettings.ts`: Binds sliders/inputs to config defaults.
    - `ttsInitialization.ts`: TTS toggle, voice selector, test/stop handlers.
    - `services.ts` / `serviceSelection.ts`: Registers available services/models, default-service selection, and hooks.
    - `eventListeners.ts` (+ `eventListeners/`): Global event wiring (send/stop, settings/history/gallery toggles, drag/drop).
    - `initialization.ts`: Startup coordinator, DOMPurify config, sanitizer helpers.
  - `components/`
    - `messages.ts`: Render and stream assistant/user messages; attachment previews.
    - `settings.ts`: Settings panel logic (API keys, service/model, tools, memory).
    - `theme.ts`: Theme switching and persistence.
    - `attachments.ts`: Image/file uploads and previews.
    - `tools.ts`: Tool configuration UI hooked to the Responses client (`services/api.ts`).
    - `memory.ts`: Memory tab UI (enable, limit, add/remove/clear).
    - `aboutPopups.ts`, `logo.ts`, `ui/`: Ancillary UI + shared UI helpers (settings tabs, image interactions).
  - `services/`
    - `api.ts`: Aggregates Responses helpers so UI modules can run turns and manage tools.
    - `providers.ts`: Provider capability registry — pure predicates centralizing per-provider quirks.
    - `api/`: Modular request handling for the Responses API
      - `requestClient.ts`: Network layer for streaming/non-streaming requests; orchestrates tool execution loops
      - `clientConfig.ts`: Service configuration helpers (active model, API key, base URL, reasoning support)
      - `messageUtils.ts`: Message serialization for Responses API (multimodal content, function calls, system prompts)
      - `responseNormalization.ts`: Folds non-streaming provider response shapes into normalized output/reasoning strings
      - `toolManager.ts`: Facade — request-time tool filtering + UI catalog view; re-exports the `tools/` sub-modules
      - `tools/catalog.ts`: The mutable tool registry (`TOOL_CATALOG`/`TOOL_DEFINITIONS`) + typed mutators
      - `tools/preferences.ts`: Per-tool enable/disable map + localStorage persistence
      - `tools/mcp.ts`: MCP register/unregister + availability ping/cache
      - `staticTools.ts`: The `STATIC_TOOLS` built-in/function tool definitions (pure data)
    - `streaming.ts`: SSE parser for Responses API; coordinates with streaming/* modules
    - `streaming/`: Specialized streaming response handlers
      - `codeInterpreter.ts`: Extracts code interpreter outputs (logs, files, charts) from response payloads
      - `codeInterpreterRender.ts`: Renders extracted code interpreter outputs into the message DOM (metadata hydration, downloads)
      - `imageGeneration.ts`: Processes image_generation_call outputs, manages gallery integration
      - `messageLifecycle.ts`: Message finalization, content extraction, history management
      - `thinkingUtils.ts`: Separates thinking tags from main content for cleaner display
    - `history/`: Save/load conversations to IndexedDB and render conversation list
    - `export.ts`: Export chats/images in multiple formats; gallery population and download
    - `apiKeys.ts` / `apiKeyStorage.ts`: In‑app key UI and storage/retrieval via localStorage
    - `memory.ts`: Memory management functions and tool exposure
    - `weather.ts`: Built-in Open-Meteo forecast tool handler
    - `mcpServers.ts`: MCP server configuration UI and persistence
  - `utils/`
    - `memoryStorage.ts`: Local storage for memory (enable/limit/list) and prompt formatting.
    - `storage.ts`: Typed localStorage facade + central `STORAGE_KEYS` registry.
    - `logger.ts`, `tooltips.ts`, `menuSystem.ts`, `notifications.ts`: Misc helpers.
  - Vendor libraries (`dompurify`, `marked`, `highlight.js`) are npm dependencies imported directly by the modules that use them and bundled by Vite — there is no `src/ts/lib/` directory.

- `css/`
  - `themes/` (base, code, fonts): Global look and code highlighting.
  - `components/` (features, ui, layout): Scoped styles for panels, settings, lists, and controls.

- `html/`
  - Fragment templates for panels and reusable UI sections.

- `assets/`
  - `img/`: Icons and images.

## Features & Flows
- Chat/Streaming: `services/api.ts` + `services/streaming.ts`; messages rendered in `components/messages.ts`.
- Services & Models: `config/config.ts` defines the hosted OpenAI and xAI providers plus local connectors for LM Studio and Ollama; per-provider behavior is centralized in `services/providers.ts` (dynamic model fetching described in `docs/services.md`).
- Images: upload (attachments) plus generation/edit — OpenAI `image_generation` and xAI image tools, with outputs processed in `services/streaming/imageGeneration.ts`.
- Tool Calling: toggled in Settings; the catalogue/handlers live under `services/api/` (`toolManager.ts` facade + `tools/` sub-modules + `staticTools.ts`; see `docs/tool-calling.md`).
- Memory: optional, local‑only storage; UI + prompt injection (see `docs/memory.md`).
- Security: DOMPurify config and sanitizers in `init/initialization.ts`.

## Manual Smoke Test
- Load over HTTPS, set an OpenAI key or LM Studio URL (or start Ollama), send a prompt, confirm streaming.
- Toggle a theme, enable Tool Calling, run the weather tool (and optional web search if OpenAI is active).
- Enable Memory, add/remove an item, confirm it appears in system prompt.
- Upload an image to ensure attachments save and appear in the gallery/history views.
