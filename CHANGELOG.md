# Changelog

All notable changes to Wordmark are documented here. Earlier versions didn't follow proper semver — this changelog reflects what actually shipped, not what the version numbers said at the time.

## [3.0.1] - 2026-06-10

Documentation and code-comment maintenance. No runtime behavior changes.

### Changed
- **Comment cleanup + TSDoc** — stripped stray inline/banner comments across the `src/ts` tree and added or modernized TSDoc on the exported surface (no remaining legacy brace-type `@param {T}` JSDoc; previously undocumented public constants now documented).
- **Docs refreshed for the TypeScript layout** — corrected stale `.js` source paths to `.ts`, fixed the DOMPurify config location, and dropped outdated "marked/highlight loaded lazily when available" notes now that both are bundled npm dependencies.

### Removed
- Superseded internal planning/review docs (`architecture-review.md` and the locally-ignored refactor/TS-conversion plans).

## [3.0.0] - 2026-06-10

Full TypeScript conversion, one day after the 2.0.0 module rework. No user-facing feature changes — the app looks and behaves the same — but the entire codebase is now statically typed, and the structural cleanups that the types made obvious were folded in.

### Changed
- **TypeScript (strict)** — the whole source tree moved from `src/js/**/*.js` to `src/ts/**/*.ts`, type-checked under `strict` via `npm run typecheck`. Shared interfaces live in `src/types/` (`state`, `config`, `api`, `tools`, `attachments`, …).
- **Test suite in TypeScript** — specs are now `tests/**/*.spec.ts`, type-checked under strict mode via `npm run typecheck:tests`.
- **`toolManager` split** — the tool god-object was broken into `services/api/tools/{catalog,preferences,mcp}.ts` plus `staticTools.ts`, with `toolManager.ts` kept as a thin facade.
- **Provider capability registry** — scattered `serviceKey === "xai"`-style checks were replaced with pure predicates in `services/providers.ts` (`isLocalService`, `serviceSupportsReasoning`, `usesServerManagedTools`, …).

### Added
- Typed shared infrastructure: `utils/storage.ts` (localStorage), `utils/logger.ts` (console wrapping), a shared IndexedDB open helper, DOM-free API-key accessors, and a typed `responseNormalization.ts` for the non-streaming response path.
- TSDoc on the exported API surface across the tree.
- Docker Hub description auto-sync — the publish workflow now pushes `README.md` to the Docker Hub repository description.

### Removed
- `src/js/` (superseded by `src/ts/`) and 12+ dead exported functions surfaced during typing.

### Fixed
- `audioStorage`/`ttsPlayback` specs no longer clobber the global `URL` constructor, which broke them under Node 24.

## [2.0.0] - 2026-06-08

Major internal rework. No user-facing feature changes — the app looks and behaves the same — but the codebase moved off the `window.*`-globals hybrid onto a real module system and build.

### Changed
- **Build system** — adopted [Vite](https://vite.dev) (rolldown). The browser no longer loads raw source files directly; `npm run dev` serves the app and `npm run build` produces the deployable bundle. Opening `index.html` from the filesystem no longer works.
- **Pure ES modules** — eliminated the `window.*` global API surface. Modules now use explicit `import`/`export`; only genuine browser APIs remain on `window`.
- **Vendor libraries** — DOMPurify, Marked, and highlight.js are now npm dependencies imported by the modules that use them, replacing the bundled copies in `src/js/lib/` and the classic `<script>` tags.
- **Shared state** — runtime state and DOM element references consolidated into `src/js/init/state.js` (`state`, `elements`); UI callbacks moved to `src/js/init/uiHooks.js`. The `init/globals.js` bridge was removed.
- **Single-source version** — the app version now lives only in `package.json`. `config.js` exports it via a build-time `__APP_VERSION__` injection (Vite `define`, mirrored in the test harness) and the README badge reads `package.json` dynamically, replacing the previous three-place manual bump.

### Fixed
- Lint glob now covers all of `src/js/` (it previously matched only one directory level, silently skipping ~40% of files).
- Settings panel outside-click handler: a shadowed `state` variable caused the gallery to close while an image slideshow was open.
- Default-service selection no longer gets stuck on a keyless provider. Saved API keys are loaded into `config` independent of the DOM at startup, and when the default cloud provider has no key the app switches to another cloud provider that has one before falling back to local services.

### Removed
- `src/js/lib/` bundled vendor libraries (now npm dependencies).
- `src/js/init/globals.js` and the `window.*` global bridge.

## [1.5.2] - 2026-03-17

### Fixed
- Model refresh button now correctly shows error status when fetch fails (previously always showed "success" because `fetchAndUpdateModels()` catches errors internally)
- Renamed LM Studio-specific element IDs, CSS classes, and function names to generic service-agnostic names (they were shared across all providers)

## [1.5.1] - 2026-03-16

### Changed
- Updated all dependencies
- Minimum Node.js version bumped to >=22.0.0

### Added
- CI workflow (GitHub Actions) running tests, ESLint, and HTML validation on Node 22 + 24

### Fixed
- 4 stale tests updated to match current source behavior
- Lint errors and additional stale tests
- HTML validation errors
- History list rendering bugs with array-format message content

## [1.5.0] - 2026-03-16

### Added
- xAI direct file attachment support (files sent inline with messages)
- README improvements

## [1.4.0] - 2026-03-16

### Added
- xAI as a TTS provider (alongside OpenAI)
- Provider selector in TTS settings
- Provider-specific voice lists and API handling

## [1.3.0] - 2026-03-15–16

### Added
- OpenAI shell tool with real-time reasoning panel output
- Missing TTS voices (cedar, marin)
- TTS toggle badge in header

### Fixed
- Version bump to align with actual feature state (was still showing 1.2.0 after many changes)

## [1.2.0] - 2026-03-10–14

This version introduced several major features across multiple commits but only got one version bump.

### Added
- **Dynamic model fetching** — removed hardcoded model lists, models now fetched from provider APIs at runtime
- **OpenAI Sora video generation** — full integration with polling, progress spinner, aspect ratio/resolution/duration options
- Web search enabled by default

### Fixed
- Multi-agent model patch (Grok)
- Sora disabled by default (initially shipped enabled)

### Changed
- Reverted "default to local models if no API keys" (shipped and immediately reverted)

### Security
- Input sanitization fixes in chat messages, history rendering, and MCP server management
- Request validation hardening in API client
- Disabled OpenAI API request storage (`store: false`)

### Removed
- Leftover Android app references and crypto donation section from a previous project version
- Support section from README

## [1.1.0] - 2026-01-17–30

### Added
- **Ollama support** — new local AI provider with OpenAI-compatible API, server URL configuration, and `/api/tags` fallback for model fetching
- Docker publish workflow (GitHub Actions)

### Fixed
- Missing server URL setting for Ollama
- LM Studio connection bug

## [1.0.0] - 2025-10-26 – 2025-12-31

Initial release and early stabilization.

### Added
- Core chat interface with streaming responses via OpenAI Responses API
- **OpenAI** and **xAI (Grok)** service providers
- **LM Studio** local model support
- Tool calling system (weather via Open-Meteo, web search, code interpreter)
- MCP (Model Context Protocol) server support
- Chat history with IndexedDB persistence
- Chat export (Markdown, TXT, HTML, JSON, CSV)
- Image generation and gallery (xAI Grok Imagine)
- TTS with OpenAI voices and autoplay queue
- Memory system (FIFO, localStorage-backed, appended to system prompt)
- Theme system with multiple color themes (dark, light, metal, neon, country, special)
- Code syntax highlighting (highlight.js)
- Markdown rendering (marked + DOMPurify)
- File and directory upload with drag-drop and paste
- Vector store management for file search
- Mobile device handling
- Geolocation service for context
- Personality presets and custom system prompts
- Docker support (Nginx alpine)
- Full test suite (node:test)

### Fixed
- API keys not saving due to vector store auto-loading
- Mobile UI bugs
- Gallery not closing
- Model list updates (OpenAI, Grok)
- MCP support for xAI
