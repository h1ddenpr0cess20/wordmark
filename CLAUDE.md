# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server on port 3000 (`npm run dev:https` for a secure context; some APIs/TTS/geolocation require HTTPS). The app cannot be opened from the filesystem — it must go through Vite.
- `npm run build` — production build to `dist/` (untracked; never edit it — the real source is `src/ts/`).
- `npm test` — full suite (`node --test` over `tests/**/*.spec.ts`).
- Single test: `node --experimental-test-module-mocks --import ./tests/helpers/registerLoaders.mjs --test tests/<name>.spec.ts`
- `npm run typecheck` — strict type-check of app source; `npm run typecheck:tests` — type-check specs (`tsconfig.tests.json`). Always use these scripts, not `npx tsc` — two TypeScript versions are installed (`typescript` is a v6 alias; the scripts run `typescript-7`).
- `npm run lint` / `npm run lint:fix` — ESLint; `npm run validate` — html-validate on `index.html` and `src/html/**`.
- Electron: `npm run electron` (build + run), `npm run electron:dist` (host platform only → Linux AppImage).

Before opening a PR run: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

## Releases

Every release ships both desktop artifacts attached to the GitHub release: the Linux AppImage (`npm run electron:dist`) and the Windows nsis installer (`npx electron-builder --win --x64`, needs Wine — installed on this host). Flow: merge PRs → `npm version <ver> --no-git-tag-version` → update CHANGELOG (rename `[Unreleased]` to the version; do not leave an empty `[Unreleased]` behind) → commit `Release <ver>` → build both artifacts → `gh release create v<ver>` with both files attached.

## Architecture

Wordmark is a **fully client-side** AI chat app — no backend. All persistence is browser-local (IndexedDB/localStorage); requests go only to the AI providers the user configures: OpenAI and xAI Grok (Responses API) plus local LM Studio/Ollama servers.

**Bootstrap:** `index.html` loads the single ES-module entry `src/ts/main.ts`, which imports modules *for their side effects in dependency order*. Ordering matters: `src/config/config.ts` first (installs console logging), then `init/state.ts` (shared state), then components/services. The menu system (`utils/dom/menuSystem.ts`) injects the HTML panels from `src/html/` — bundled at build time via Vite `?raw` imports, no runtime fetches — after which `init/initialization.ts` runs `initialize()`.

**Shared state:** there are no `window.*` app globals. All shared mutable runtime state and DOM references live on the `state` and `elements` objects exported from `src/ts/init/state.ts` (types in `src/types/state.ts`).

**Key layers under `src/ts/`:**
- `services/providers.ts` — the provider capability registry: pure predicates over service keys (`openai`, `xai`, `lmstudio`, `ollama`). All provider quirks belong here, not as scattered `serviceKey === "..."` checks at call sites.
- `services/api/` — request construction and execution: `requestClient.ts`/`requestTransport.ts`, instructions/system-prompt building, tool catalog and call execution (`toolManager.ts`, `toolCallExecution.ts`), response normalization.
- `services/streaming/` — SSE event parsing/processing, reasoning panel, code-interpreter and image-generation stream handling, message lifecycle.
- `services/parsers/` — client-side document extraction (PDF/Office/ebooks). This is a **fallback for local providers only**; cloud providers keep their native paths (xAI: direct `input_file` upload; OpenAI: vector store + `file_search`). The dispatcher accepts any file as plain text by default and only rejects a fixed list of known-binary extensions — so every code/config/data format already works without being listed anywhere; don't invent parsers for niche text formats. `isExtractableDocument(name)` is the single source of truth for acceptance.
- Local document RAG: for providers with no native document ingestion — the local providers (LM Studio/Ollama) and OpenRouter, see `usesDirectFileUpload`/`extractsDocumentsClientSide` in `services/providers.ts` — attached docs are chunked and embedded (`services/embeddings.ts`) into an in-memory index (`services/localDocRetrieval.ts`); each turn the query is embedded and only the most relevant chunks are injected (hybrid dense + BM25, MMR-reranked, capped by top-K and a character budget). **Never dump full document text into the prompt** — it overflows local model context. The index is cleared on conversation reset.
- `components/` — UI modules; `init/` — startup wiring; `utils/` — storage (IndexedDB wrappers), DOM helpers, sanitization.
- `src/config/config.ts` — static config; `package.json` version is the single source of truth, injected as `__APP_VERSION__`.

**Default service selection** (`src/ts/init/services.ts`): on startup a reachable local server (LM Studio, then Ollama) is preferred even over a cloud provider with a stored key.

## Working style

For multi-part tasks with separable, well-specified pieces, use the `delegate` skill (`/delegate`) to run each piece on the cheapest capable model via subagents instead of doing everything inline — decompose, tier (haiku/sonnet/opus), brief tightly, verify by tier.

## Tests

Specs are strict TypeScript run via `node --test` with tsx loaders (`tests/helpers/registerLoaders.mjs` handles `.ts` transpilation, `.js`→`.ts` specifiers, `?raw` imports, a DOMPurify stub, and `__APP_VERSION__`). Pattern: set up global stubs (`window`, `document`, `fetch`, `localStorage`, …) **before** importing the module under test with a dynamic `await import(...)`; cast partial stubs `as unknown as <LibType>`. DOM-heavy modules use `jsdom` instead of hand-rolled stubs (see `tests/codeInterpreterRender.spec.ts`). Keep the suite deterministic and fast (<5s).

## Conventions

- TypeScript strict, ES modules only, 2-space indent, semicolons, **double quotes** (ESLint-enforced). Files `camelCase.ts`, folders lowercase.
- **Never add inline comments inside function bodies** — no rationale comments, no comments in catch blocks (bare `catch {}` is correct). When asked to remove a comment, delete it entirely — don't shorten or reformat it. TSDoc on declarations is fine and matches existing style; this rule is only about inline comments in bodies.
- Gate new tools/features behind a user-facing toggle in the settings UI (persisted browser-locally like all other preferences — this app has no server or environment variables) and sanitize rendered content. New runtime dependencies need prior discussion.
- Colocate component styles under `src/css/components/**`.

## Intentional quirks — do not "fix"

- `index.html` viewport `user-scalable=no` is deliberate; don't change it for accessibility.