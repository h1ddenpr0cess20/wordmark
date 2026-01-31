# Repository Guidelines (Updated)

## Project Structure
- `index.html`: Entrypoint; loads styles and `src/js/main.js`.
- `src/config/`: App and provider config (`config.js`, helpers for base URL, keys, models).
- `src/js/`: Front-end logic
  - `init/`: bootstrap (DOM refs, marked, services, events, model settings, TTS, sanitization).
  - `services/`: API integrations (`services/api/*`), streaming, history/export, memory helpers, MCP management, weather tool.
  - `components/`: UI behavior (messages, settings, UI chrome, theme, attachments, memory, tools, popups).
  - `utils/` + `lib/`: helpers and third‑party libs.
- `src/css/`: Themes and component styles (base, code, fonts; components under `components/**`).
- `src/html/`: Fragment templates and panels.
- `src/assets/`: Images, icons, and static assets.

## Services & Models
- Providers implemented in UI and code: OpenAI Responses (hosted) and LM Studio (local OpenAI-compatible server).
- Dynamic model fetching supported for LM Studio; OpenAI defaults are pre‑listed in `config.js`.
- Requests target the OpenAI `/responses` endpoint (streaming when available).
- Image generation/edit helpers were removed in this build; reintroduce them deliberately if needed.

## Tool Calling
- Toggle: Settings → Tools → “Enable Tool Calling”. Mirrors `window.config.enableFunctionCalling`.
- Catalogue and preferences: `src/js/services/api/toolManager.js` (static entries, MCP registration, storage).
- Built-in handler: `src/js/services/weather.js` exposes the Open-Meteo forecast helper; OpenAI web search is provided as a built-in tool definition.
- Tool toggles live under Settings → Tools. MCP servers are auto-disabled when unreachable, and the built-in weather/search helpers do not require additional keys.

## Memory (Optional, Local‑Only)
- Enable in Settings → Memory; limit older entries via FIFO.
- Stored in `localStorage`; appended to system prompt when enabled.
- Public helpers: `getMemories()`, `addMemory()`, `clearAllMemories()`, `getMemoriesForPrompt()` in `src/js/utils/memoryStorage.js` and `src/js/services/memory.js`.

## Build & Run
- No build step; open `index.html` directly for basic use.
- Recommended HTTPS for APIs, TTS, and geolocation:
  - Node: `http-server -S -C cert.pem -K key.pem -p 8000`
  - Python (for quick static serve): `python -m http.server 8000 --directory .` (prefer an HTTPS‑capable server when possible)

## Coding Style
- JavaScript: ES6+, 2‑space indent, semicolons, single quotes; modules attach public APIs to `window.*`.
- Naming: files `camelCase.js` (e.g., `modelSettings.js`); folders lowercase (e.g., `services/api`).
- HTML/CSS: semantic classes; colocate feature styles under `src/css/components/**`.

## Testing
- No automated tests by default. Perform manual smoke tests:
  - Send/stream a message, try the weather tool (and optional web search), toggle a theme, load history, test Memory add/remove, confirm TTS toggle.
- If adding tests, keep lightweight UI/integration (e.g., Playwright). Place under `tests/*.spec.js`; avoid tight coupling to private globals.

## Security
- Do not commit secrets; API keys are provided in‑app and stored locally.
- All rendered content is sanitized (see `src/js/init/initialization.js` and `window.sanitizeWithMedia/YouTube`).
- Gate new tools/services behind settings and validate inputs/outputs before rendering.

## Contributor Workflow
- Small, focused changes; keep edits consistent with existing patterns.
- Commits: short, imperative subject (e.g., "add lm studio support").
- PRs: include repro steps, screenshots/GIFs for UI changes, note service/config impacts (keys, HTTPS), and any migration steps.

## Versioning Policy
- After landing a large or user‑visible change, proactively ask the human if they want to bump the version. Only proceed with a version bump when explicitly approved.

## Release/Versioning Checklist (only when explicitly requested)
- Important: Never change version numbers unless the human explicitly asks for a version bump. If you notice mismatched versions, report them in your final message instead of changing them.
- When the user requests a bump, update all version surfaces in one pass:
  - `src/config/config.js` → `window.APP_VERSION`
  - `package.json` → `version`
  - `package-lock.json` → top-level `version` fields
  - README version badge (search for `img.shields.io/badge/version-...`)
  - Optional: adjust `src/html/download.html` “Latest Version” if a mobile build is being published
- After bump, run a quick grep to catch stragglers (informational; do not change without request):
  - `rg -n "APP_VERSION|img.shields.io.*version|Latest Version|version-v"`
- Verify About panel shows the new version and README badge renders correctly on GitHub.
