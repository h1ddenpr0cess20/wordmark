# Architecture

High-level

- Entrypoint: `index.html`
- Config: `src/config/config.js` (globals, service endpoints, defaults)
- App code: `src/js/**` using small modules that attach to `window.*`
- Styles: `src/css/**` (global, components, themes)
- Templates: `src/html/**` (panels and fragments loaded by the menu system)
- Assets: `src/assets/**`

JS Modules

- `init/`: startup sequence and wiring
  - `globals.js`: declares global state/refs
  - `dom.js`: assigns DOM refs (selectors) to globals
  - `initialization.js`: coordinates startup (DOMPurify config, services/models, events, TTS, location, header info)
  - `services.js`: populates service/model selectors; triggers local model fetches (LM Studio/Ollama); sets initial conversation name; tool-calling toggle init
  - `eventListeners.js`: keyboard, buttons, settings/history/gallery panels, textarea auto-size, etc.
  - `modelSettings.js`: model control helpers (loaded; kept minimal here)
  - `marked.js`: markdown loader (helpers around `marked.min.js` when needed)
  - `ttsInitialization.js`: populates voice list and toggles; shares refs to TTS service

- `components/`: UI behavior
  - `messages.js`: render messages, code highlighting + copy buttons, reasoning toggle, image thumbnails in messages
  - `settings.js`: header update, service/model dropdowns, settings panel layout helpers, and UI hooks that model-fetchers call
  - `ui.js`, `theme.js`, `interaction.js`, `attachments.js`, `logo.js`, `aboutPopups.js`: general UI composition, themes, uploads, logo render, small popups

- `services/`: API and feature services
  - `api.js`: aggregates the Responses client helpers so UI modules can run turns and manage tools
  - `api/`: split helpers for configuration (`clientConfig.js`), message prep (`messageUtils.js`), request execution (`requestClient.js`), and tool catalog/state (`toolManager.js`)
  - `streaming.js`: orchestrates SSE consumption; wires the runtime/event processor and finalises messages
  - `streaming/runtime.js`: maintains incremental output, reasoning buffers, DOM updates, and image attachment staging
  - `streaming/eventProcessor.js`: parses SSE event types for reasoning, tool status, image generation, and error handling
  - `streaming/messageLifecycle.js`: reconciles loading UI with stored history once streaming completes
  - `streaming/codeInterpreter.js`, `streaming/imageGeneration.js`, `streaming/thinkingUtils.js`: specialised helpers for tool output, gallery linking, and markdown sanitisation
  - `history.js`: chat history + URL state; loads/saves to IndexedDB; history panel helpers
  - `export.js`: export chat to text with optional reasoning
  - `tts.js`: voice list, autoplay, per-message audio resources, and IndexedDB for audio
  - `location.js`: optional geolocation + reverse geocode for prompt context
  - `weather.js`: Open-Meteo tool handler used by the built-in function call

- `utils/`: common helpers
  - `conversationStorage.js`, `imageStorage.js`, `audioStorage.js`: IndexedDB databases
  - `icons.js`, `highlight.js`, `tooltips.js`, `menuSystem.js`, `mobileHandling.js`, `lazyLoader.js`, `toolLoader.js`, `notifications.js`, `utils.js`

Render & Security

- Markdown: `marked.min.js` (when available) + DOMPurify sanitization
- Sanitization: `initialization.js` configures DOMPurify to allow only safe iframes (YouTube) and secures external images
- Syntax highlighting: `highlight.min.js` loaded via helpers; copy buttons added per-code block

App Start

- `index.html` loads `src/config/config.js`, then module entry `src/js/main.js`
- `main.js` imports utilities → components → services → init modules
- Panels (`src/html/**`) are loaded by the menu system; once ready, it calls `window.initialize()` to kick off the sequence
