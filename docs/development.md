# Development Guide

Local Dev

- Built with [Vite](https://vite.dev). Install once with `npm install`, then `npm run dev` (port 3000) or `npm run dev:https` for a secure context.
- `npm run build` produces a static bundle in `dist/`; `npm run preview` serves it on port 8080 (network-accessible), and `npm start` does both in one step.
- Module entry is `src/ts/main.ts`. The app is TypeScript ES modules — code uses explicit `import`/`export`, not `window.*` globals. Shared runtime state lives in `src/ts/init/state.ts` (`state`, `elements`); UI callbacks register on `src/ts/init/uiHooks.ts`.
- Type-check with `npm run typecheck` (source) and `npm run typecheck:tests` (specs).

Debug Mode (Triple‑Click About)

- Toggle on/off by triple‑clicking the About tab header quickly (3 clicks within ~1s).
- Effects: flips `state.debug` and `state.verboseLogging` together, calls `applyConsoleLogging()`, adds timestamped console logs, and shows a brief on‑screen “Debug Mode Enabled/Disabled” toast.
- Scope: in‑memory only (resets on reload). To avoid log suppression even when not in debug, set `localStorage.enableLogging = 'true'`.
- Related: some debug UI (e.g., the image diagnostics button) is gated by `localStorage.developerMode === 'true'`. You can enable it via `localStorage.setItem('developerMode','true')` in the console.

Coding Style

- TypeScript (strict), 2-space indent, semicolons, **double quotes** (enforced by ESLint — run `npm run lint`).
- File names: `camelCase.ts`; directories lowercase.
- Public APIs use ES module exports; keep changes modular under `src/ts/**` and prefer small files.

Panels & Fragments

- UI panels and pages live in `src/html/**`. The menu system lazy-loads these into the DOM; `initialize()` runs once panels are ready.

Adding a Service

- Update `src/config/config.ts`:
  - Add a service entry with `baseUrl`, `apiKey`, `models` (array or fetcher), and `defaultModel`.
  - If the model list is dynamic, add a `fetchAndUpdateModels()` method and a `uiHooks.updateXxxModelsDropdown()` callback.
- Ensure `getBaseUrl()` and `getApiKey()` pick up your service (the default configuration includes OpenAI, xAI, LM Studio, and Ollama out of the box).

Adding a Tool

- Extend `STATIC_TOOLS` in `src/ts/services/api/staticTools.ts` with schema metadata (unique key, definition, defaults).
- Implement the handler (see `src/ts/services/weather.ts`) and register it in `TOOL_HANDLERS` (in `src/ts/services/api/toolManager.ts`).
- For provider-specific behavior, edit the capability predicates in `src/ts/services/providers.ts`.
- Avoid placing large binary payloads in conversation history; save to IndexedDB and insert a placeholder reference.

Streaming & Rendering

- `services/streaming.ts` handles SSE-like token streams with `data:` lines, separating reasoning content and main text, injecting thumbnails first.
- Reasoning markers supported: `<think>...</think>` and `<|begin_of_thought|>…<|end_of_thought|>` with an optional solution region.

Storage

- Conversations, images, audio use their own IndexedDB databases with small helper APIs (`utils/storage/*Storage.ts`).
- When changing schema, bump DB versions and add migration logic in `onupgradeneeded` as needed.

Safety & Sanitization

- All rendered content runs through DOMPurify with a custom allowlist that only permits YouTube iframes.
- Keep any new embedded content within this allowlist or extend it carefully with the same constraints.

Testing

- Automated tests live under `tests/*.spec.ts` and run with `npm test` (Node’s built-in test runner); `npm run typecheck:tests` type-checks them.
- Use `npm run test:watch` during development to rerun affected specs automatically.
- The suite stubs browser APIs (DOM, window, fetch, Audio, storage) so service modules can be exercised without a full browser.
- Manual smoke checklist (matches automated coverage focus):
  - Send a message (streaming), toggle theme, enable/disable TTS, save/load history, run the weather tool (and optional OpenAI web search), test image upload for attachments.
  - Add/remove MCP servers and confirm tool toggles update availability.
  - Upload assistants files, create a vector store, and verify search integration.
