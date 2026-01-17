# Development Guide

Local Dev

- No build step is required. Open `index.html` or serve via HTTPS.
- Module entry is `src/js/main.js`; most modules attach to `window.*` for global access.

Debug Mode (Triple‑Click About)

- Toggle on/off by triple‑clicking the About tab header quickly (3 clicks within ~1s).
- Effects: sets `window.DEBUG` and `window.VERBOSE_LOGGING` true/false together, adds timestamped console logs, and shows a brief on‑screen “Debug Mode Enabled/Disabled” toast.
- Scope: in‑memory only (resets on reload). To avoid log suppression even when not in debug, set `localStorage.enableLogging = 'true'`.
- Related: some debug UI (e.g., the image diagnostics button) is gated by `localStorage.developerMode === 'true'`. You can enable it via `localStorage.setItem('developerMode','true')` in the console.

Coding Style

- JavaScript ES6+, 2-space indent, semicolons, single quotes.
- File names: `camelCase.js`; directories lowercase.
- Keep changes modular under `src/js/**`; prefer small files.

Panels & Fragments

- UI panels and pages live in `src/html/**`. The menu system lazy-loads these into the DOM; `window.initialize()` runs once panels are ready.

Adding a Service

- Update `src/config/config.js`:
  - Add a service entry with `baseUrl`, `apiKey`, `models` (array or fetcher), and `defaultModel`.
  - If the model list is dynamic, add a `fetchAndUpdateModels()` method and a `uiHooks.updateXxxModelsDropdown()` callback.
- Ensure `getBaseUrl()` and `getApiKey()` pick up your service (the default configuration includes OpenAI, LM Studio, and Ollama out of the box).

Adding a Tool

- Extend `STATIC_TOOLS` in `src/js/services/api/toolManager.js` with schema metadata (unique key, definition, defaults).
- Implement the handler (see `src/js/services/weather.js`) and register it in `TOOL_HANDLERS`.
- Avoid placing large binary payloads in conversation history; save to IndexedDB and insert a placeholder reference.

Streaming & Rendering

- `services/streaming.js` handles SSE-like token streams with `data:` lines, separating reasoning content and main text, injecting thumbnails first.
- Reasoning markers supported: `<think>...</think>` and `<|begin_of_thought|>…<|end_of_thought|>` with an optional solution region.

Storage

- Conversations, images, audio use their own IndexedDB databases with small helper APIs (`utils/*Storage.js`).
- When changing schema, bump DB versions and add migration logic in `onupgradeneeded` as needed.

Safety & Sanitization

- All rendered content runs through DOMPurify with a custom allowlist that only permits YouTube iframes.
- Keep any new embedded content within this allowlist or extend it carefully with the same constraints.

Testing

- Automated tests live under `tests/*.spec.js` and run with `npm test` (Node’s built-in test runner).
- Use `npm run test:watch` during development to rerun affected specs automatically.
- The suite stubs browser APIs (DOM, window, fetch, Audio, storage) so service modules can be exercised without a full browser.
- Manual smoke checklist (matches automated coverage focus):
  - Send a message (streaming), toggle theme, enable/disable TTS, save/load history, run the weather tool (and optional OpenAI web search), test image upload for attachments.
  - Add/remove MCP servers and confirm tool toggles update availability.
  - Upload assistants files, create a vector store, and verify search integration.
