# Testing & Coverage

Wordmark ships with a lightweight Node test suite (via the built-in `node --test` runner) that focuses on deterministic validation of the app's TypeScript modules. The goal is to keep confidence high without introducing a heavyweight integration harness.

The specs themselves are TypeScript and type-checked under strict mode. Browser-global test doubles are cast `as unknown as <LibType>` at the assignment boundary so the source under test still sees the real lib types.

## Running the Suite

- `npm test` – executes every spec under `tests/**/*.spec.ts`.
- `npm run test:watch` – reruns affected specs whenever a source file changes.
- `npm run typecheck:tests` – type-checks the specs against `tsconfig.tests.json` (strict, zero errors required).

Both run scripts go through `node --experimental-test-module-mocks --import ./tests/helpers/registerLoaders.mjs`, which registers the loaders that let Node import the app's TypeScript modules (transpiling `.ts`, resolving `.js`→`.ts` specifiers, handling Vite-style `?raw` imports) and provides a DOMPurify stub plus `globalThis.__APP_VERSION__`. The `--experimental-test-module-mocks` flag enables `mock.module`, which the Party engine specs use to fake their DOM/network dependencies. The suite stubs browser primitives such as `window`, `document`, `Audio`, `localStorage`, and `fetch` so that modules can be exercised in isolation without a DOM.

## Coverage Highlights

Recent test additions capture critical service behaviours:

| Area | Specs | What’s Covered |
| --- | --- | --- |
| Provider & request layer | `tests/providers.spec.ts`, `tests/requestClient.spec.ts`, `tests/responseNormalization.spec.ts`, `tests/clientConfig.spec.ts` | Capability predicates, request body construction, non-streaming reasoning/output normalization precedence |
| Tools & MCP | `tests/toolManager.spec.ts`, `tests/mcpServers.ui.spec.ts` | Catalog/preferences, enabled-tool filtering, MCP registration/removal flows |
| Chat export | `tests/exportService.spec.ts` | Format persistence, export blobs |
| Memory & location services | `tests/memory.ui.spec.ts`, `tests/locationService.spec.ts` | UI toggles, localStorage sync, geolocation fallbacks |
| Streaming runtime | `tests/streamingEventProcessor.spec.ts`, `tests/historyPersistence.spec.ts` | Event parsing, image persistence, history hydration |
| File & vector store APIs | `tests/filesService.spec.ts`, `tests/vectorStoreService.spec.ts` | Assistants file CRUD, upload batching, metadata storage |
| TTS services | `tests/ttsQueue.spec.ts`, `tests/ttsPlayback.spec.ts` | Autoplay queues, audio lifecycle, error recovery |
| Weather, attachments & assets | `tests/weatherService.spec.ts`, `tests/imageGeneration.spec.ts`, `tests/imageStorage.spec.ts` | Tool error handling, attachment dedupe, gallery storage |
| Party mode | `tests/partyPrompts.spec.ts`, `tests/partyState.spec.ts`, `tests/partyEngine.spec.ts` | Persona/first/subsequent-turn/decision prompt builders, user-name-keyed interjection detection, scenario/config defaults, and engine control flow (restart-after-stop, pause mid-turn, aborted-but-already-generated turns) |

## Adding New Specs

1. Place files in `tests/*.spec.ts` (use nested folders for helpers only).
2. Set up any required globals (`globalThis.window`, `document`, `fetch`, `localStorage`, …) **before** importing the module under test, then load it with a dynamic `await import("../src/ts/.../module.ts")`. Type partial global stubs by casting `as unknown as <LibType>` (e.g. `as unknown as Storage`) at the assignment so the source keeps real lib types.
3. Assert against the module's exported API and observable side effects—avoid relying on private module scope.
4. Prefer deterministic timeouts (`setTimeout(() => fn(), 0)`) and mocked timers to keep the suite fast (<5s).
5. Run `npm run typecheck:tests` to confirm the new spec type-checks under strict mode.

## Smoke Checklist

Automated tests supplement (not replace) the manual smoke flow listed in `docs/development.md`:

- Send a streaming message (with and without tool use).
- Toggle themes, TTS, and location.
- Upload files, manage vector stores, and confirm history persistence.
- Exercise MCP server add/remove to ensure UI bindings stay intact.
