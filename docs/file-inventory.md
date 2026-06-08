# File Inventory & Code Map

Purpose: quick orientation to the current project layout, key entry points, and where major features live.

## Top-Level
- `index.html`: Entrypoint; loads styles and `src/js/main.js`. Contains app panels, settings modal, history/gallery panels, and fragments container.
- `README.md`: Feature overview and usage.
- `docs/`: Architecture, services, tool calling, memory, and troubleshooting guides.

## Source (`src/`)
- `config/`
  - `config.js`: Provider list, API base URLs, default service/model, key getters, and role helpers.

- `js/`
  - `main.js`: Single ES module entry. Orchestrates imports; wires config, state, components, services, and init modules; calls `initialize()` after fragments load.
  - `init/`
    - `state.js`: Shared runtime store — exports `state` (app state) and `elements` (cached DOM refs). Replaces the removed `globals.js` window bridge.
    - `uiHooks.js`: Exports `uiHooks`, a registry of UI callbacks (e.g. `updateModelsDropdown`) invoked by lower-level modules.
    - `dom.js`: Queries interactive elements (chat box, inputs, toggles, panels) and assigns them onto `elements`.
    - `marked.js`: Markdown setup.
    - `modelSettings.js`: Binds sliders/inputs to config defaults.
    - `ttsInitialization.js`: TTS toggle, voice selector, test/stop handlers.
    - `aboutTab.js`: About panel content hooks.
    - `services.js`: Registers available services/models and hooks.
    - `eventListeners.js`: Global event wiring (send/stop, settings/history/gallery toggles, drag/drop).
    - `initialization.js`: Startup coordinator, DOMPurify config, sanitizer helpers.
  - `components/`
    - `messages.js`: Render and stream assistant/user messages; attachment previews.
    - `settings.js`: Settings panel logic (API keys, service/model, tools, memory).
    - `ui.js`: Layout, tabs, panels, spinners.
    - `theme.js`: Theme switching and persistence.
    - `attachments.js`: Image/file uploads and previews.
    - `tools.js`: Tool configuration UI hooked to the Responses client (`services/api.js`).
    - `memory.js`: Memory tab UI (enable, limit, add/remove/clear).
    - `aboutPopups.js`, `logo.js`: Ancillary UI.
  - `services/`
    - `api.js`: Aggregates Responses helpers so UI modules can run turns and manage tools.
    - `api/`: Modular request handling for the Responses API
      - `requestClient.js`: Network layer for streaming/non-streaming requests; orchestrates tool execution loops
      - `clientConfig.js`: Service configuration helpers (active model, API key, base URL, reasoning support)
      - `messageUtils.js`: Message serialization for Responses API (multimodal content, function calls, system prompts)
      - `toolManager.js`: Tool catalog management, MCP server registration, availability checking, preference storage
    - `streaming.js`: SSE parser for Responses API; coordinates with streaming/* modules
    - `streaming/`: Specialized streaming response handlers
      - `codeInterpreter.js`: Extracts and renders code interpreter outputs (logs, files, charts)
      - `imageGeneration.js`: Processes image_generation_call outputs, manages gallery integration
      - `messageLifecycle.js`: Message finalization, content extraction, history management
      - `thinkingUtils.js`: Separates thinking tags from main content for cleaner display
    - `history.js`: Save/load conversations to IndexedDB and render conversation list
    - `export.js`: Export chats/images in multiple formats; gallery population and download
    - `apiKeys.js`: In‑app key storage and retrieval via localStorage
    - `memory.js`: Memory management functions and tool exposure
    - `weather.js`: Built-in Open-Meteo forecast tool handler
    - `mcpServers.js`: MCP server configuration UI and persistence
  - `utils/`
    - `memoryStorage.js`: Local storage for memory (enable/limit/list) and prompt formatting.
    - `toolLoader.js`, `tooltips.js`: Misc UI helpers.
  - Vendor libraries (`dompurify`, `marked`, `highlight.js`) are npm dependencies imported directly by the modules that use them and bundled by Vite — there is no `src/js/lib/` directory.

- `css/`
  - `themes/` (base, code, fonts): Global look and code highlighting.
  - `components/` (features, ui, layout): Scoped styles for panels, settings, lists, and controls.

- `html/`
  - Fragment templates for panels and reusable UI sections.

- `assets/`
  - `img/`: Icons and images.

## Features & Flows
- Chat/Streaming: `services/api.js` + `services/streaming.js`; messages rendered in `components/messages.js`.
- Services & Models: `config/config.js` defines the hosted OpenAI and xAI providers plus local connectors for LM Studio and Ollama (dynamic model fetching described in `docs/services.md`).
- Images: upload (attachments) plus generation/edit — OpenAI `image_generation` and xAI `grok_generate_image`/`grok_edit_image` tools, wired through `services/mediaTools.js`.
- Tool Calling: toggled in Settings; catalogue/handlers live in `services/api/toolManager.js` (see `docs/tool-calling.md`).
- Memory: optional, local‑only storage; UI + prompt injection (see `docs/memory.md`).
- Security: DOMPurify config and sanitizers in `init/initialization.js`.

## Manual Smoke Test
- Load over HTTPS, set an OpenAI key or LM Studio URL (or start Ollama), send a prompt, confirm streaming.
- Toggle a theme, enable Tool Calling, run the weather tool (and optional web search if OpenAI is active).
- Enable Memory, add/remove an item, confirm it appears in system prompt.
- Upload an image to ensure attachments save and appear in the gallery/history views.
