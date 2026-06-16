# Architecture

High-level

- Build: [Vite](https://vite.dev) (rolldown). `npm run dev` serves the app; `npm run build` bundles to `dist/`. The browser no longer loads raw source files.
- Language: TypeScript (strict). `npm run typecheck` type-checks the source; `npm run typecheck:tests` type-checks the test suite.
- Entrypoint: `index.html` → `src/ts/main.ts` (single ES module entry that imports everything else)
- Config: `src/config/config.ts` (service endpoints, defaults; exports `config`, `APP_VERSION`, prompt templates, `applyConsoleLogging`)
- App code: `src/ts/**` — pure ES modules using explicit `import`/`export`. There are no `window.*` app globals; only genuine browser APIs (`window.addEventListener`, `indexedDB`, etc.) touch `window`.
- Styles: `src/css/**` (global, components, themes)
- Templates: `src/html/**` (panels and fragments loaded by the menu system)
- Assets: `src/assets/**`

Modules

- `init/`: startup sequence and wiring
  - `state.ts`: the shared runtime store — exports `state` (app state) and `elements` (cached DOM refs); replaces the old `globals.js` window bridge
  - `uiHooks.ts`: exports `uiHooks`, a small registry of UI callbacks (e.g. `updateModelsDropdown`) that lower-level modules invoke without importing UI code
  - `dom.ts`: queries interactive elements and assigns them onto `elements`
  - `initialization.ts`: exports `initialize()`, which coordinates startup (DOMPurify config, services/models, events, TTS, location, header info)
  - `services.ts`: populates service/model selectors; triggers local model fetches (LM Studio/Ollama); sets initial conversation name; tool-calling toggle init
  - `eventListeners.ts`: keyboard, buttons, settings/history/gallery panels, textarea auto-size, etc.
  - `modelSettings.ts`: model control helpers (loaded; kept minimal here)
  - `ttsInitialization.ts`: populates voice list and toggles; shares refs to TTS service

- `components/`: UI behavior
  - `messages.ts`: render messages, code highlighting + copy buttons, reasoning toggle, image thumbnails in messages
  - `settings.ts`: header update, service/model dropdowns, settings panel layout helpers, and UI hooks that model-fetchers call
  - `theme.ts`, `attachments/`, `logo.ts`, `aboutPopups.ts`, plus `ui/` helpers: general UI composition, themes, uploads, logo render, small popups

- `services/`: API and feature services
  - `api.ts`: aggregates the Responses client helpers so UI modules can run turns and manage tools
  - `providers.ts`: provider capability registry — pure predicates (`isLocalService`, `serviceSupportsReasoning`, `usesServerManagedTools`, …) that replace scattered `serviceKey === …` checks
  - `api/`: split helpers for configuration (`clientConfig.ts`), message prep (`messageUtils.ts`), system/developer prompt assembly (`instructions.ts`), token estimation/history windowing (`tokenBudget.ts`), request execution (`requestClient.ts`), non-streaming response normalization (`responseNormalization.ts`), and the tool system (`toolManager.ts` facade + `tools/catalog.ts`, `tools/preferences.ts`, `tools/mcp.ts`, `staticTools.ts`)
  - `streaming.ts`: orchestrates SSE consumption; wires the runtime/event processor and finalises messages
  - `streaming/runtime.ts`: maintains incremental output, reasoning buffers, DOM updates, and image attachment staging
  - `streaming/eventProcessor.ts`: parses SSE event types for reasoning, tool status, image generation, and error handling (provider-agnostic — one unified event vocabulary); pure payload parsing/formatting lives in `streaming/eventParsing.ts`
  - `streaming/messageLifecycle.ts`: reconciles loading UI with stored history once streaming completes
  - `streaming/codeInterpreter.ts` (+ `codeInterpreterRender.ts`), `streaming/imageGeneration.ts`, `streaming/thinkingUtils.ts`: specialised helpers for tool-output extraction/rendering, gallery linking, and markdown sanitisation
  - `history/`: chat history + URL state; loads/saves to IndexedDB; history panel helpers
  - `export.ts`: export chat to text with optional reasoning
  - `tts/`: voice list, autoplay, per-message audio resources, and IndexedDB for audio
  - `location.ts`: optional geolocation + reverse geocode for prompt context
  - `weather.ts`: Open-Meteo tool handler used by the built-in function call
  - `party/`: Party mode (autonomous multi-character group chat) — `partyEngine.ts` (the turn-loop singleton: speaker selection, interjections, pause/resume/stop, control bar), `partyPrompts.ts` (system/turn/decision prompt builders), `partyTypes.ts`, and `partyState.ts` (setup-form defaults). Runs on top of `runTurn`; the tab UI is `components/party/partyTab.ts` (see [docs/party-mode.md](./party-mode.md))

- `utils/`: common helpers
  - `conversationStorage.ts`, `imageStorage.ts`, `audioStorage.ts`: IndexedDB databases
  - `icons.ts`, `tooltips.ts`, `menuSystem.ts`, `notifications.ts`, `storage.ts`, `logger.ts`, `utils.ts`

Render & Security

- Vendor libraries (`marked`, `dompurify`, `highlight.js`) are npm dependencies imported directly by the modules that use them and bundled by Vite — there is no `src/ts/lib/` and no classic `<script>` tags.
- Markdown: `marked` + DOMPurify sanitization
- Sanitization: `initialization.ts` configures DOMPurify to allow only safe iframes (YouTube) and secures external images
- Syntax highlighting: `highlight.js` loaded via helpers; copy buttons added per-code block

App Start

- `index.html` loads the single module entry `src/ts/main.ts`
- `main.ts` imports config → state → utilities → components → services → init modules (config first so its console-logging setup runs before the rest evaluates)
- Panels (`src/html/**`) are loaded by the menu system; once ready, `main.ts` calls the imported `initialize()` to kick off the sequence
