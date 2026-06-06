# Wordmark: Vite Migration + Module Architecture Refactor

## Progress (resume here)

Branch `vite-esm-refactor` (off `revert-remove-openai-default-grok`). All commits keep `npm run build`, `npm run lint`, and 127 tests green.

**Done & committed:**
- Phase 0.5 — xAI restored as first-class (chat, TTS, Grok image gen); video tooling stays removed.
- Phases 0–3 — Vite 8; vendor libs modernized to current majors (DOMPurify 3, marked 18, highlight.js 11) and bundled; `?raw` panel imports; assets in `public/`; `src/js/lib/` removed.
- Phase 4 — `src/js/init/state.js` is authoritative; `globals.js` is a window-compat bridge (accessors) so consumer migration is safe/incremental.
- Phase 5 (partial) — converted: `utils.js`, `memoryStorage.js`, `notifications.js` (module + all consumers + test rewrites).
- Feature — smart default provider: no cloud key → probe LM Studio → Ollama → else show "Set API key" (`selectDefaultService()` in init/services.js).

**Per-module pattern:** export functions → migrate every `window.x` consumer to imports (bridge covers any miss) → keep `window` shims only for inline-HTML/console handlers → rewrite that module's `loadWindowScript` test to dynamic `import()`. Guard top-level DOM with `typeof document !== "undefined"`. Test infra: `tests/helpers/rawLoader.mjs` (Vite `?raw` in Node), wired via `npm test`'s `--import`.

**Remaining:** rest of Phase 5 utilities (conversationStorage, imageStorage, audioStorage, icons, mobileHandling, tooltips, highlight, lazyLoader, toolLoader), Phases 6–8 (services/components/init), Phase 9 (finish test refactor), Phase 10 (remove the window bridge + all shims; only DEBUG/VERBOSE_LOGGING/APP_VERSION/applyConsoleLogging stay). **Version bump** (1.5.2 → new) in config.js + package.json + README before the PR.

---

## Context

The codebase was originally built with a workaround: every file attaches its API to `window.*` as a side effect instead of using proper ES module exports. This made initial development easier (no import/export to manage) but now causes:
- 114+ window globals in `interaction.js` alone — impossible to test in isolation
- Load order encoded manually in `main.js` instead of the import graph
- All tests require a VM sandbox (`loadWindowScript`) simulating window globals rather than testing module APIs directly
- Security: no compile-time validation of what's exported vs. internal

The fix: introduce Vite as a build tool and convert every module from side-effect+window to proper export+import. This is done on a dedicated branch as a big-bang refactor.

---

## What Changes

### Permanent additions
- `vite` as a devDependency (dev server + build)
- `dompurify`, `marked`, `highlight.js` as proper npm dependencies (replacing `src/js/lib/` copies)
- `vite.config.js`
- `vercel.json` (points Vercel at `dist/`)

### What stays on `window` (genuinely global)
- `window.DEBUG` and `window.VERBOSE_LOGGING` — toggled from browser console
- `window.APP_VERSION` — useful for runtime inspection
- `window.applyConsoleLogging()` — called from debug event handler in `init/eventListeners/debug.js`
- Nothing else should remain on window after the refactor

---

## Phase Plan

### Phase 0.5 — Restore xAI Service (goal: xAI works again as a first-class provider)

Two commits disabled xAI (`4010906`, `f0717e9`). The video generation tooling (OpenAI Sora, Grok video) was legitimately stale and stays removed. Everything else should come back.

**Files to change:**

1. **`src/config/config.js`** — Remove `enabled: false` and `disabledReason` from the `xai` service block.

2. **`src/html/panels/settings/apiKeys.html`** — Restore the xAI API key input field (removed in `f0717e9`).

3. **`src/html/panels/settings/tts.html`** — Restore xAI as a TTS provider option in the provider selector (removed in `f0717e9`).

4. **`src/js/components/settings.js`** — Remove the guard that hides xAI from the service selector dropdown.

5. **`src/js/init/eventListeners/selectors.js`** — Remove the guard that blocks switching to xAI.

6. **`src/js/init/services.js`** — Remove the guard that skips xAI model loading.

7. **`src/js/init/ttsInitialization.js`** — Restore xAI voice population logic.

8. **`src/js/init/eventListeners/tts.js`** — Restore xAI provider-specific TTS handling.

9. **`src/js/services/api/clientConfig.js`** — Remove the normalization that redirects away from xAI (`normalizeServiceKey` guard).

10. **`src/js/services/tts/api.js`** — Restore `generateSpeechXai()` function and the provider branch that calls it.

11. **`src/js/services/tts/config.js`** — Restore xAI voices list.

12. **`src/js/services/mediaTools.js`** — Restore xAI Grok Imagine image generation. The constants (`XAI_IMAGE_MODEL`, `XAI_IMAGE_ASPECT_RATIOS`) are still present but unused; wire them back up. Do NOT restore Sora or Grok video.

13. **`src/js/services/apiKeys.js`** — Restore xAI API key save/load handling if removed.

14. **Docs + HTML** — Update `help-guide.html`, docs/services.md, docs/overview.md to reflect xAI is available again.

**Tests**: `tests/clientConfig.spec.js` and `tests/toolManager.spec.js` added assertions for the xAI-disabled state — update these to reflect xAI being enabled.

---

### Phase 0 — Vite Wiring (goal: app boots under `vite dev`)

1. `npm install --save-dev vite`
2. Create `vite.config.js`:
   ```js
   import { defineConfig } from 'vite';
   export default defineConfig({
     root: '.',
     publicDir: 'public',
     build: { outDir: 'dist' }
   });
   ```
3. Create `public/` directory. Move into it:
   - `src/assets/img/favicon.ico` → `public/favicon.ico`
   - `src/assets/icons.svg` → `public/icons.svg`
4. Update `index.html`:
   - Remove all classic `<script>` tags (vendor libs + config.js)
   - Change favicon href to `/favicon.ico`
   - All `<use href="src/assets/icons.svg#...">` in HTML → `<use href="/icons.svg#...">`
   - The `<script type="module" src="src/js/main.js">` stays (Vite handles it)
5. Update `package.json` scripts:
   ```json
   "dev": "vite",
   "dev:https": "vite --https",
   "build": "vite build",
   "preview": "vite preview",
   "start": "vite preview --port 8080"
   ```
6. Add `vercel.json`:
   ```json
   { "buildCommand": "npm run build", "outputDirectory": "dist" }
   ```

**Verify**: `npm run dev` starts Vite dev server; app loads (may be broken until Phase 1).

---

### Phase 1 — Vendor Libraries

1. `npm install dompurify marked highlight.js`
2. Remove `src/js/lib/` directory
3. In `src/js/main.js`, add at the top before all other imports:
   ```js
   import DOMPurify from 'dompurify';
   import { marked } from 'marked';
   window.DOMPurify = DOMPurify; // needed until initialization.js is converted
   window.marked = marked;        // needed until marked.js init module is converted
   ```
4. Update `src/js/utils/icons.js` — change all `src/assets/icons.svg#` references to `/icons.svg#` (used in `window.icon()`)
5. `src/js/utils/highlight.js` — instead of dynamically injecting a `<script>` tag pointing at `lib/highlight.min.js`, import highlight.js directly:
   ```js
   import hljs from 'highlight.js';
   window.hljs = hljs;
   window.hljsLoaded = true;
   ```
   Remove the `loadHighlightJS()` lazy-load mechanism — with Vite the bundle is already optimized.

**Verify**: App loads, DOMPurify sanitization works, markdown renders, code blocks highlight.

---

### Phase 2 — config.js → ES Module

`src/config/config.js` is the most-depended-on file. Convert it from a classic script to an ES module.

1. Convert to `export` syntax:
   ```js
   export const DEBUG = false;
   export const VERBOSE_LOGGING = false;
   export const APP_VERSION = '1.5.2';
   export const config = { services: {...}, ... };
   // etc.
   ```
2. Keep `window.DEBUG`, `window.APP_VERSION`, `window.applyConsoleLogging` assignments at the bottom of the file — these three genuinely need to be on window.
3. Remove all other `window.*` assignments from config.js.
4. In `src/js/main.js`, add as the very first import:
   ```js
   import './../../config/config.js';
   ```
5. In each file that currently reads `window.config`, `window.APP_VERSION`, `window.DEBUG`, etc. — add an import. Pattern to apply across ~15 consumer files:
   ```js
   import { config, DEBUG, APP_VERSION } from '../../config/config.js';
   ```
   Key consumers: `clientConfig.js`, `requestClient.js`, `apiKeys.js`, `services.js`, `initialization.js`, `tts/api.js`, `mediaTools.js`.

---

### Phase 3 — HTML Panel Loading

Currently `menuSystem.js` `fetch()`es HTML files from `src/html/`. Vite's build doesn't copy `src/html/` to `dist/` automatically, so this breaks in production.

Convert to Vite's `?raw` import — eliminates the fetch calls entirely:

1. In `menuSystem.js`, replace each `fetch('src/html/...')` call with a static import:
   ```js
   import panelsHtml from '../../html/panels.html?raw';
   import personalityHtml from '../../html/panels/settings/personality.html?raw';
   // ... one import per panel file (10 settings tabs + 1 main panels.html)
   ```
2. `loadHTML()` function body: instead of `fetch(url)`, just return the imported string directly.
3. `loadMultiple()`: same — no fetch, just return the map of imported strings.
4. Remove the `fetch`-based network calls entirely.
5. Move `src/html/` out of `public/` considerations — it's now bundled into JS, not served as static files.

**Note**: The HTML panel files still exist as source files; they're just imported at build time instead of fetched at runtime. The authoring experience is identical.

---

### Phase 4 — globals.js → State Module

`src/js/init/globals.js` currently sets ~30 values on `window`. Convert to a proper module:

1. Create `src/js/init/state.js` (or rename globals.js):
   ```js
   export const state = {
     conversationHistory: [],
     activeAbortController: null,
     hljsLoaded: false,
     // ... all current window.* state vars
   };
   // DOM element refs — start as null, filled by dom.js
   export const elements = {
     chatBox: null,
     userInput: null,
     sendButton: null,
     // ...
   };
   ```
2. In each consumer, replace `window.conversationHistory` with `import { state } from '../init/state.js'` and access `state.conversationHistory`.
3. `dom.js` imports `elements` and fills it in: `elements.chatBox = document.getElementById('chat-box')`.

---

### Phase 5 — Utility Modules (low risk, few interdependencies)

Convert in order. Pattern for each file:

**Before:**
```js
window.debounce = function(fn, delay) { ... };
window.sanitizeInput = function(str) { ... };
```

**After:**
```js
export function debounce(fn, delay) { ... }
export function sanitizeInput(str) { ... }
```

Files to convert (no cross-dependencies):
- `utils/utils.js` — export debounce, sanitizeInput, toggleThinking, stripBase64FromHistory
- `utils/icons.js` — export `icon(name, opts)`
- `utils/notifications.js` — export initNotificationSystem, showNotification
- `utils/tooltips.js` — export initTooltipSystem
- `utils/mobileHandling.js` — export isMobileDevice, setupMobileKeyboardHandling
- `utils/conversationStorage.js` — export initConversationDb, save/load functions
- `utils/imageStorage.js` — export initImageDb, saveImageToDb, getImageFromDb
- `utils/audioStorage.js` — export initAudioDb
- `utils/memoryStorage.js` — export getMemoryConfig, setMemoryEnabled, etc.
- `utils/menuSystem.js` — export HTMLLoader (after Phase 3 conversion)

For each: remove `window.x =` assignments, add `export`, update all consumers with `import`.

---

### Phase 6 — Service Modules

Several services are already ES modules with proper exports (`api.js`, `streaming.js`, their subdirectories). The remaining ones use window globals.

Convert in dependency order:
1. `services/export.js` — export exportChat
2. `services/weather.js` — export weatherToolHandler
3. `services/location.js` — export requestLocation, locationState
4. `services/memory.js` — export memoryToolDefinition, toolImplementations
5. `services/mcpServers.js` — export getMCPServers, saveMCPServers, etc.
6. `services/apiKeys.js` — export initApiKeyManagement, ensureApiKeysLoaded
7. `services/mediaTools.js` — export media tool functions
8. `services/tts/` modules — convert each tts submodule
9. `services/api/clientConfig.js`, `messageUtils.js`, `requestClient.js`, `toolManager.js` — already ES modules; audit for remaining window.* reads and replace with imports

---

### Phase 7 — Component Modules

These have the most interdependencies. Convert after state (Phase 4) and services (Phase 6) are done.

- `components/messages.js` — export highlightAndAddCopyButtons, addCopyButton
- `components/settings.js` — export updateHeaderInfo, updateModelSelector; `window.uiHooks` becomes a named export object
- `components/theme.js` — export applyTheme, initThemeSelector
- `components/attachments.js` — export initImageUploads; `pendingUploads`, `pendingDocuments` become module-level exports
- `components/tools.js` — export tool management functions
- `components/memory.js` — export initMemorySettings
- `components/interaction.js` — this is the hardest; export sendMessage, stopGeneration; split into smaller functions first (validation, file-processing, API-call, error-handling)
- `components/logo.js`, `components/aboutPopups.js`, `components/gallery.js` — export their init functions

---

### Phase 8 — Init Modules

Convert last, since they orchestrate everything:

- `init/dom.js` — fills `elements` from state module; exports `initializeDOMReferences`
- `init/modelSettings.js` — exports modelSupportsReasoning, etc.
- `init/marked.js` — exports initializeMarked
- `init/services.js` — exports initializeServicesAndModels
- `init/eventListeners/` — each file exports its setup function; `eventListeners.js` aggregator imports and calls all
- `init/initialization.js` — exports `initialize()`; **no longer attached to window** — `menuSystem.js` imports it directly instead of calling `window.initialize()`

---

### Phase 9 — Test Refactor

Current tests use `loadWindowScript` VM sandbox. After conversion, tests use direct imports.

**Before:**
```js
const windowObj = loadWindowScript('src/js/utils/utils.js', { document: {...} });
assert.equal(windowObj.sanitizeInput('<script>'), '&lt;script&gt;');
```

**After:**
```js
import { sanitizeInput } from '../src/js/utils/utils.js';
assert.equal(sanitizeInput('<script>'), '&lt;script&gt;');
```

- Delete or gut `tests/helpers/loadWindowScript.js` once no tests use it
- For modules with browser-only globals (fetch, document, etc.): use Node's built-in `--experimental-vm-modules` or stub via `globalThis.fetch = mockFetch` before importing
- Tests for `interaction.js` can now be written without window simulation — they test exported functions directly

---

### Phase 10 — Cleanup

- Delete `src/js/lib/` (vendor lib copies)
- Remove all remaining `window.x =` assignments that are no longer needed
- Run `npm run lint` — fix any resulting warnings
- Run `npm test` — fix broken tests
- Run `npm run build` — confirm build succeeds
- `npm run preview` — smoke test the production build

---

## Key Risks

| Risk | Mitigation |
|------|-----------|
| Circular imports (A imports B imports A) | Pull shared state into `state.js`; use late-binding (import the module, not a destructured value) for mutual deps |
| menuSystem.js calls `window.initialize()` before it's defined | Phase 3 fixes this: menuSystem imports initialize() directly |
| `window.DOMPurify` used in initialization.js | Keep temporary window assignment in Phase 1 until initialization.js converts in Phase 8 |
| SVG sprite `<use href>` paths change | Phase 0: move icons.svg to `public/`, use `/icons.svg#` absolute path everywhere |
| Vercel currently deploys raw files | `vercel.json` in Phase 0 tells Vercel to run `npm run build` and serve `dist/` |
| Tests break en masse | Test refactor is last; keep the branch green by converting tests alongside each phase |

---

## Verification

After each phase, run:
```bash
npm run dev          # Vite dev server — smoke test the UI
npm test             # Node test runner
npm run lint         # ESLint
npm run build        # Confirm no build errors
npm run preview      # Test production build locally
```

Final acceptance:
1. All 25+ test files pass
2. `npm run build` produces a `dist/` directory
3. `vite preview` shows a working app — settings panels load, chat works, themes apply, history saves/loads
4. No `window.*` assignments remain except DEBUG, VERBOSE_LOGGING, APP_VERSION, and applyConsoleLogging
