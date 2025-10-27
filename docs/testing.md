# Testing & Coverage

Wordmark ships with a lightweight Node test suite (via the built-in `node --test` runner) that focuses on deterministic validation of the browser modules exposed on `window`. The goal is to keep confidence high without introducing a heavyweight integration harness.

## Running the Suite

- `npm test` – executes every spec under `tests/**/*.spec.js`.
- `npm run test:watch` – reruns affected specs whenever a source file changes.

The suite stubs browser primitives such as `window`, `document`, `Audio`, `localStorage`, and `fetch` so that modules can be exercised in isolation without a DOM.

## Coverage Highlights

Recent test additions capture critical service behaviours:

| Area | Specs | What’s Covered |
| --- | --- | --- |
| Chat export & MCP tooling | `tests/exportService.spec.js`, `tests/mcpServers.ui.spec.js` | Format persistence, export blobs, MCP registration/removal flows |
| Memory & location services | `tests/memory.ui.spec.js`, `tests/locationService.spec.js` | UI toggles, localStorage sync, geolocation fallbacks |
| Streaming runtime | `tests/streamingEventProcessor.spec.js`, `tests/historyPersistence.spec.js` | Event parsing, image persistence, history hydration |
| File & vector store APIs | `tests/filesService.spec.js`, `tests/vectorStoreService.spec.js` | Assistants file CRUD, upload batching, metadata storage |
| TTS services | `tests/ttsQueue.spec.js`, `tests/ttsPlayback.spec.js` | Autoplay queues, audio lifecycle, error recovery |
| Weather, attachments & assets | `tests/weatherService.spec.js`, `tests/imageGeneration.spec.js`, `tests/imageStorage.spec.js` | Tool error handling, attachment dedupe, gallery storage |

## Adding New Specs

1. Place files in `tests/*.spec.js` (use nested folders for helpers only).
2. Load the browser module with `loadWindowScript` and supply any required stubs (DOM, fetch, storage, etc.).
3. Assert against public `window.*` APIs—avoid relying on private module scope.
4. Prefer deterministic timeouts (`setTimeout(() => fn(), 0)`) and mocked timers to keep the suite fast (<5s).

## Smoke Checklist

Automated tests supplement (not replace) the manual smoke flow listed in `docs/development.md`:

- Send a streaming message (with and without tool use).
- Toggle themes, TTS, and location.
- Upload files, manage vector stores, and confirm history persistence.
- Exercise MCP server add/remove to ensure UI bindings stay intact.
