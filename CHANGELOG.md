# Changelog

All notable changes to Wordmark are documented here. Earlier versions didn't follow proper semver — this changelog reflects what actually shipped, not what the version numbers said at the time.

## [3.14.0] - 2026-07-12

Desktop conversations that survive restarts, smarter local RAG injection, and a hardened clipboard. Backward-compatible.

### Fixed
- **Desktop conversations disappearing between launches** — the Electron shell previously served the app from a random localhost port on every launch, so Chromium scoped IndexedDB/localStorage to a new origin each time and prior conversations became unreachable. The renderer is now served from the stable privileged `wordmark://app` origin, so conversations and settings persist across restarts.
- **Copy buttons failing in the desktop app** — Electron denies the renderer's Clipboard API, and the helper gave up on that rejection. Desktop copies now go through a native clipboard bridge, and every tier (bridge → Clipboard API → `execCommand`) falls through to the next on failure instead of returning false.
- **Local RAG context accumulating across turns** — retrieved document chunks were persisted into the conversation, so every past turn's context was re-sent (and stale chunks answered new questions). Context is now injected only for the current turn, immediately before the question.

### Changed
- **Contextualized retrieval queries** — short follow-ups ("what about the second one?") now embed recent user turns into the retrieval query so the right chunks are found, instead of matching the bare follow-up text.
- Removed the unused shelved tooltip prototype (`tooltips.ts`/`tooltipPosition.ts` and dead CSS); the app uses native `title` tooltips.
- `CLAUDE.md` is now tracked in the repository.
- The desktop title bar no longer draws a bottom separator line.

## [3.13.0] - 2026-07-12

A conversation-history redesign, sharper local folder retrieval, a desktop geolocation fallback, and a reworked reasoning/tool-output panel. Backward-compatible.

### Added
- **Redesigned conversation history panel** — the table layout is replaced with date-grouped cards, a real-time search field that filters by title/prompt, and a dedicated bulk-actions bar that appears only in multi-select mode. Per-row rename/delete actions surface on hover, and the layout scales better on mobile.
- **IP geolocation fallback on desktop** — Chromium in the Electron shell can't resolve native geolocation without a Google API key (it fails with `POSITION_UNAVAILABLE`), so the shell now falls back to a city-level IP lookup (ipapi.co). The fallback triggers when native geolocation is unsupported or fails for any reason other than an explicit permission denial.

### Fixed
- **Hosted web search not showing its query** — OpenAI's provider-managed web search reports its query in the item's `action.queries` array; the panel only checked the deprecated `action.query` singular, so the query never rendered. Every hosted tool call (web/x/file search) now surfaces its actual invocation.
- **Folder RAG only surfacing a few files** — local retrieval now combines embeddings with exact-term/path matching and adaptive diversity-aware reranking under a bounded context budget, instead of allowing the globally top eight chunks to come from one or two large files. A single document can still use the full result budget.
- **Folder paths lost during indexing** — relative paths now survive indexing, retrieval labels, diagnostics, and persistence, including duplicate basenames and identical files stored at different paths.
- **Document cache persistence races** — cache writes complete before conversation references are saved; failed cache writes fall back to inline chunk storage rather than leaving unrestorable references.
- **Immediate questions after history load missing documents** — retrieval now waits for the active conversation's IndexedDB restore to finish.

### Changed
- **Reasoning/tool-output panel** — tool calls now render their arguments, shell commands, and code-interpreter output inside fenced code blocks (with language hints) instead of inline text, with consistent spacing between tool blocks. Adds MCP tool-call rendering and de-duplicates reasoning that is streamed as deltas and then finalized.
- Local chunks overlap slightly at boundaries, malformed embedding responses fail clearly, inventory questions receive a compact source list, and common dependency/cache/generated paths are reported and skipped during folder upload.

## [3.12.0] - 2026-07-11

An Android first-run server picker, a custom desktop title bar, and an app icon fix. Backward-compatible.

### Added
- **Android first-run server picker** — the Android WebView wrapper now asks on first launch whether to load the hosted version (`wordmark-chatbot.vercel.app`) or a custom server URL for a self-hosted instance, and persists the choice (clear the app's data to pick again). Bumps the Android app to versionName 1.1.0 / versionCode 2.
- **Custom desktop title bar** — the Electron window is now frameless and draws its own slim title bar that follows the active theme (background, border, and accent-colored mini logo all come from the theme's CSS variables). The bar is the window drag region, and on Windows/Linux the native minimize/maximize/close overlay is recolored to match whenever the theme changes; macOS keeps its traffic lights. Browsers are unaffected — the bar only appears inside the desktop shell.

### Fixed
- **`npm run electron` launching a stale app** — the script served whatever `dist/` happened to contain, silently launching an outdated build (or failing outright on a clean checkout). It now rebuilds the web app first, matching the packaging scripts; `npm run electron:run` keeps the old skip-the-build behavior for quick relaunches.
- **Desktop app showing the default Electron logo** — packaged builds had no icon configured in electron-builder, so installers and the packaged app shipped with Electron's stock logo, and the runtime window icon pointed at the 64px web favicon. A 512×512 rendering of the Wordmark circled-W logo with a transparent background now lives at `electron/icon.png` and is used for the window icon and the mac/win/linux packaging targets.

## [3.11.1] - 2026-07-11

Fix the desktop app failing to build and launch. Backward-compatible.

### Fixed
- **Packaged app showing "Build not found"** — `main.cjs` looked for the built web app at `resources/dist` when packaged, but `dist` is bundled inside `app.asar`, so the path never existed and the window closed on launch. It now resolves relative to `__dirname`, which lands inside the asar in both dev and packaged builds.
- **Packaging skipping the build step** — `electron:pack` and `electron:dist` ran `electron-builder` directly without building the web app first, so packaging a clean checkout produced an app with no `dist`. Both scripts now run `npm run build` first.
- **electron-builder refusing to run** — a leftover root-level `directories` field (unrelated to electron-builder, an old `npm init` artifact) collided with `build.directories.output` and made every packaging run fail with `"directories" in the root is deprecated`. Removed.

## [3.11.0] - 2026-07-11

Electron desktop wrapper, a theme cleanup, a long-standing panel bug fix, a provider-aware embedding-model dropdown, and a conversation-model stamping fix. Backward-compatible.

### Added
- **Electron desktop wrapper** — the built web app can now run as a desktop app, served from a local HTTP server and loaded in a BrowserWindow. External links open in the system browser and downloads save straight to disk. Wired into the existing `electron`/`electron:pack`/`electron:dist` npm scripts.
- **Provider-aware embedding-model dropdown** — the embedding model field moved from the API Keys tab to the Model tab as a dropdown, populated with the active provider's embedding models (plus an auto-detect default) when LM Studio or Ollama is active, and grayed out otherwise. Fixes the startup race where a local server auto-selected before its model probe finished left the dropdown empty until a manual refresh.

### Changed
- **Optional theme packs removed** — the Metal, Neon, and Country theme packs and the whole install/uninstall mechanism are gone. The USA theme survives, now bundled directly under Special Themes. Users with a removed pack's theme saved fall back to Aurora on next load.

### Fixed
- **Closed panels appearing on screen next to the open one** — clicking or focusing a control during a panel's 250ms slide-in transition could scroll `#chat-container` sideways to reveal the focused element, and the scroll stuck, dragging "hidden" panels into view. Switching the container to `overflow: clip` makes it unscrollable so the reveal can't happen.
- **API-keys auto-open clobbering an already-open panel** — the delayed prompt to open the API Keys tab now skips itself if any panel is already open.
- **Wrong model persisted after switching without sending** — conversations recorded the model dropdown's current value at save time instead of the model actually used in the last request, so changing the model or service mid-conversation without sending rewrote the stored record on the next save. Saves now persist the model and service actually dispatched.

## [3.10.1] - 2026-07-10

Bug fixes for model fetching, history loads, notification theming, and local RAG. Backward-compatible.

### Changed
- **Updated default models** — OpenAI defaults to `gpt-5.5`, xAI to `grok-4.5`, and Ollama to `gemma4`.
- **Notifications follow the active theme** — success/info/warning toasts derive their tone from the theme's accent color instead of fixed green/blue/orange hues that clashed with most themes. Error toasts keep the per-theme error colors.
- **Typecheck runs on TypeScript 7** — the native compiler is used for `typecheck` and `typecheck:tests`, with TypeScript 6 kept installed alongside it for tooling that still needs it.

### Fixed
- **Stale "Failed to fetch models" errors** — background model fetches for non-active services (the LM Studio/Ollama probes at startup, base-URL saves) unconditionally refreshed the dropdown, so a failed probe surfaced an error labeled with the *currently selected* service even though its models loaded fine. Providers now only refresh the dropdown when the fetched service is still the active one.
- **Wrong model sent after loading a conversation** — restoring a conversation saved under another provider could send the old provider's model while the new provider's model list was still fetching. The dropdown now enters its loading state immediately and sends fall back to the restored service's default model during the fetch window.
- **Slow model fetches overwriting a newer conversation load** — restores are now epoch-guarded and skip themselves when superseded by a newer load or a manual service switch.
- **History loads leaving stale controls** — reasoning availability, parameter controls, and tool settings now refresh on load the same way they do on a manual service switch.
- **Placeholder values treated as model ids** — dropdown placeholders (`loading`, `no-models`, "Error: …", "Set API key…") are no longer sent as model ids or persisted as a conversation's model.
- **Back button trapped by the chat** — browser history used `pushState` and copied the entire message history into history state, growing the stack on every selection change. It now uses `replaceState` and stores only the selection.
- **Documents silently excluded from local RAG retrieval** — chunks embedded before a provider/model switch were skipped unless *every* chunk was stale, so a partially re-indexed conversation lost documents. Retrieval now re-embeds whenever any chunk is stale.
- **Document chunks leaking between conversations** — rapidly loading one conversation then another could leave the first one's chunks in the second's index, and the next save persisted them under the wrong id. Restores now bail out when superseded.

## [3.10.0] - 2026-07-07

Shared documents in Party mode and xAI's flagship TTS voices. Backward-compatible.

### Added
- **Shared documents in Party mode** — attach files while a party is active and their text is extracted in the browser and added to every character's context, so the whole cast can draw on the same material. Shared documents are saved with the conversation and restored on load. ([Party Mode](docs/party-mode.md))
- **xAI flagship TTS voices** — the 21 flagship voices xAI shipped on 2026-07-06 (Altair, Atlas, Carina, … Zenith) join the original five, sorted into the selector's male/female/neutral groups. xAI's `/v1/tts/voices` endpoint doesn't report voice gender, so these groupings are inferred from the voice names and may not match how each voice sounds.

### Changed
- **Party turns pause between responses** — a short (~1.5s) interruptible delay separates turns so the conversation reads at a human pace; pausing, stopping, or interjecting still takes effect promptly.
- **Directly addressed characters speak next in Party mode** — naming a character in an interjection hands them the next turn, and the speaker-decision prompt now favors a participant addressed by name.

### Fixed
- **Party didn't wait for a shared document to load** — the running loop kept emitting turns while a document was still being read, so the turn shown on upload ignored both the file and the observer's message. The loop is now held while the document is read, so the first turn after upload is the document-aware one.

## [3.9.0] - 2026-07-07

OpenAI image generation on every service. Backward-compatible.

### Added
- **Image generation and editing on all services** — the builtin `image_generation` tool now works everywhere, not just on OpenAI. On OpenAI it uses the provider-managed tool; on other services (e.g. xAI) it emits client-side `openai_generate_image` and `openai_edit_image` function tools that call OpenAI's `/images/generations` and `/images/edits` endpoints directly. Requires an OpenAI API key in Settings → API Keys; the client-side tools are only offered when that key is present and the service supports client-side tools.

### Fixed
- **Media placeholders rendering as literal text or code blocks** — `[[MEDIA: ...]]` placeholders stored in history showed as raw text on variant switch/regenerate, and history load pre-wrapped placeholders so markdown parsed them as an indented code block of raw HTML. Both forms are now hidden by the renderer.
- **Generated images orphaned from saved conversations** — the placeholder gate was all-or-nothing, so any placeholder-looking text in a reply suppressed the real placeholders and images vanished on reload. Placeholders are now inserted per missing filename, and placeholders referencing nonexistent media are dropped.
- **Placeholder syntax leaking to models** — assistant placeholders were sent verbatim in requests, teaching models (especially small local ones) to imitate the syntax; they are now stripped before sending.
- **Retrieved document context corrupting saved history** — local RAG appended retrieved chunks directly onto the stored user message, persisting them into saved conversations and rendering them in the user's bubble on reload. The context now lives on a transient field spliced into the request at serialization time, and loading a conversation strips legacy blocks baked into older saves.

## [3.8.0] - 2026-07-06

Client-side document processing for local providers. Backward-compatible.

### Added
- **Document attachments for local providers** — LM Studio and Ollama can now use attached files and folders. Documents are extracted to text and searched in the browser with embeddings, so nothing is uploaded to a cloud service. A whole folder no longer overflows local context: only the passages relevant to each question are sent. ([Documents & Attachments](docs/documents.md))
- **Broad format support** — dependency-free parsers for PDF, `.doc`/`.docx`, `.xls`/`.xlsx`, `.ppt`/`.pptx`, OpenDocument (`.odt`/`.ods`/`.odp`/`.odg`), `.rtf`, ebooks (`.epub`/`.mobi`/`.azw`), and `.zip`; every other non-binary file is read as text, so any code/config/data format works.
- **Embedding model auto-detection** — embedding models are detected from the local server's model list (kept out of the chat dropdown) and default to a nomic model, with an optional override in Settings → Local Server Configuration.
- **Document index persistence** — the retrieval index is stored in IndexedDB per conversation and restored on load, so attached documents survive reloads without re-uploading. Embeddings are cached by file content hash: re-attaching the same file in any conversation skips extraction and embedding, and each file's chunks are stored once (conversations hold references, not copies).
- **Storage settings tab** — shows everything stored locally (conversations, images, TTS audio, document index, memories, settings, API keys) with per-category clear buttons, a clear-all, and a JSON export of your data (credentials, binaries, and vectors excluded).

### Fixed
- **PDF extraction on compressed PDFs** — FlateDecode streams followed by an end-of-line before `endstream` (i.e. most real-world PDFs) failed to decompress and yielded no text.
- **Stored ZIP entries** — uncompressed entries inside ZIP archives returned the entire archive's bytes instead of the entry, producing garbage text.
- **MOBI trailing data entries** — trailing-entry sizes were decoded with an inverted varint, truncating or corrupting text from PalmDOC-compressed ebooks.

### Changed
- **Default history token budget raised to 16384** (was 8000).
- **Embedding requests are batched** (64 inputs per request) so large documents don't produce one oversized request; switching embedding models re-embeds the index from stored text instead of returning stale matches.

## [3.7.2] - 2026-07-03

Security hardening for shared-conversation links. Backward-compatible.

### Fixed
- **`?chat=` import hardening** — importing a conversation from a `?chat=` link now requires an explicit confirmation, accepts only `user`/`assistant` messages with string content, never honors an imported `systemPrompt`, and always mints a fresh conversation id so a crafted link can't silently render forged messages, apply attacker instructions, or clobber an existing stored conversation.

### Changed
- **Tightened CSP** — dropped `'unsafe-inline'` from the `script-src` directive so any DOM-XSS that slips past sanitization can't execute inline, giving the sanitizer defenses real defense-in-depth.

## [3.7.1] - 2026-06-28

Post-3.7.0 polish: mobile code rendering, theme code-block fixes, and a safer data-features default. Backward-compatible.

### Changed
- **Data features off by default** — the Data settings tab no longer defaults to enabled when no preference is stored; data features stay off until you opt in.

### Fixed
- **Mobile code sizing** — retuned code-block and inline-code font sizes on phones so code is readable without overflowing, and kept inline code from rendering larger than surrounding body text on small screens.
- **Reasoning-panel code blocks** — code inside reasoning output now renders in a proper inner box with correct mobile sizing, sharing one set of styles with chat code blocks instead of a divergent copy.
- **Theme code-block borders** — removed unwanted inner borders on code blocks in several themes, plus a font-size mismatch on colored tokens in the neon theme on mobile.
- **Mobile logo alignment** — the fixed top wordmark now lines up with the wordmark logos on assistant messages (both 12px from the edge).
- **Docker skills build** — the top-level `skills/` directory is copied into the build stage so bundled skills ship in container images.

## [3.7.0] - 2026-06-25

Agent skills. Backward-compatible.

### Added
- **Skills** — named instruction packages the assistant loads on demand to specialize its behavior for a task. Skills are authored as `SKILL.md` files (name/description in frontmatter, instructions in the body) and stored locally in the browser. The model sees only each enabled skill's name and description and loads the full instructions itself via the `activate_skill` tool when a request matches — no keyword matching. On providers/models that can't call client-side tools, enabled skills are inlined into the prompt instead so they still work.
- **Bundled resources** — a skill can carry reference files, read on demand via `read_skill_resource` (inlined directly on no-tool providers).
- **Settings → Skills tab** — enable/disable toggles, upload (`SKILL.md`), export, and delete. Three examples ship pre-loaded (Frontend Development, Email Assistant, Brainstorming Partner), seeded individually so newly shipped examples reach existing users without resurrecting deleted ones.
- **Load indicator** — a `Loaded skill: <name>` notification and a reasoning-panel annotation fire when a skill is loaded.

### Changed
- **Reasoning panel** now auto-follows the stream only when you're already at the bottom, so you can scroll up to read earlier reasoning mid-stream.

### Fixed
- **Context hygiene** — a loaded skill's full instructions ride only the turn that used them; prior skill tool call/output pairs are stripped from carried history so they never accumulate in context.

## [3.6.1] - 2026-06-22

Mobile landscape fixes. Backward-compatible.

### Fixed
- **Landscape layout** — phones in landscape are wide but short, so the width-based mobile breakpoints didn't apply and the desktop floating-card layout was stranded on a ~390px-tall screen (or small phones got the portrait layout with a tall header eating the height). A new `(orientation: landscape) and (max-height: 500px)` stylesheet makes the chat container full-viewport and collapses the header chrome so the conversation gets the room.
- **Scroll position lost on rotation** — rotating the device reflowed `#chat-box` and discarded the reading position. The current anchor (bottom-pinned or scroll ratio) is now recorded and reapplied on `orientationchange`.

## [3.6.0] - 2026-06-22

Message-action polish: on-demand TTS for any message, copy feedback, and a retry control for failed or stopped turns. Backward-compatible.

### Added
- **On-demand TTS for any message** — turning TTS on now adds a voice button to every existing assistant message in the conversation (and removes them when turned off), so messages generated while TTS was off can still be voiced. Per-message TTS buttons are restyled to match the circular copy/branch/regenerate action buttons.
- **Retry failed/stopped turns** — when a turn fails or is stopped before any content arrives, the empty assistant bubble is removed and a retry button (matching the regenerate button) appears on the user message that triggered it; clicking it re-runs the turn.

### Changed
- **Copy feedback** — the message copy button now has a tooltip and briefly swaps to a check (or ✗ on failure) icon to confirm the copy, mirroring the code-block copy button.

## [3.5.0] - 2026-06-22

Assistant-message controls: regenerate, response-version cycling, and conversation branching, plus a change to how stopping mid-response is handled. Backward-compatible; existing conversations load unchanged.

### Added
- **Regenerate response** — a regenerate button on the most recent assistant message re-runs the turn from the prior context. It is intentionally limited to the latest message, since regenerating an earlier one would leave the following messages dangling.
- **Response versions** — each regeneration is kept as an additional version of the message; a `‹ 1 / N ›` navigator under the bubble cycles between them, and the active version persists with the conversation.
- **Conversation branching** — a branch button on a message forks the conversation into a new one containing every message up to that point, leaving the original untouched.

### Changed
- **Stopping keeps partial output** — stopping generation mid-response now keeps the partial assistant message (marked incomplete) instead of discarding the bubble; an empty stop still clears the placeholder.

### Fixed
- **Mobile message padding** — reduced the oversized side padding flanking the message icons. The bubble width is now pinned explicitly (`calc(100vw - 72px)`) so it no longer silently widens and pushes the action buttons off-screen, and the reasoning panel is no longer capped to half the bubble width on phones.

## [3.4.1] - 2026-06-21

Everything done since the 3.4.0 release (tag `v3.4.0`): a broad error-surfacing and observability pass, accessibility and UI-polish fixes, and a large test-coverage expansion. All backward-compatible.

### Added
- **Expanded test coverage** — the suite grew to 501 deterministic specs, adding jsdom-backed coverage of code-interpreter output rendering, generated-media element construction, and on-demand TTS controls, plus image/media helpers, vector-store metadata + LRU eviction, the MCP server store, export formats with the CSV-injection guard, data-URI decoding, the Grok image tools, finalize-extract, and `isLocalNetworkUrl`.

### Changed
- **Scoped logging** — introduced `createScopedLogger`; routed init, history, TTS, services, location, API-keys, interaction, party, streaming, about-tab, and storage diagnostics through verbose-gated `[area]` loggers, replacing scattered hand-rolled `console.info` guards. Stopped logging user location (PII).
- **Provider capability registry** — centralized xAI quirks (direct file upload, no TTS instructions, instruction-message role) as predicates in `services/providers.ts`.
- **IndexedDB durability** — image, audio, and conversation writes now resolve on transaction commit and reject on abort instead of on the request callback.
- **CI** — checkout/setup-node actions bumped to v5 (Node 24).

### Fixed
- **Error surfacing** — silent failures now report instead of being swallowed: vector-store metadata/active-id reads, data-settings init and toggle persistence, tool-handler execution, tool-result serialization, dropped file/directory reads, theme-pack installs (no more half-applied state), MCP call failures (surfaced with the error code), malformed data URIs, and file reads (descriptive error including the filename).
- **Layout & zoom** — logo overlapping the header on zoom, long model names overlapping the top-right buttons, slide-in panels clipped on narrow viewports, message text sliding under the upload button, an emptied upload-preview row leaving a gap above the composer, upload previews wrapping instead of overflowing, the gallery header/tabs pinned while only the grid scrolls, slideshow clipping with long captions, wide tables overflowing in chat and exports, and scrolling in about/legal/help popups.
- **History panel** — shift-click range selection anchored to the last clicked row (not document order), stale keydown listener removed before re-render, Ctrl+A intercepted only in multi-select, the panel marked `inert` on close, and focus no longer stolen to the toggle on outside-click dismissal.
- **Gallery & slideshow** — counts re-sync after a single-item delete, partial bulk-delete failures reported via `Promise.allSettled`, the media-viewer flag no longer sticks when there's nothing to show, an orphaned slideshow keydown listener removed on reopen, the active tab badge updated on slideshow delete, and a file extension added to the download fallback name.
- **Themes** — low-contrast button text on the light-gray and Greece themes, undefined background variables (`--bg-tertiary` and others), the attachment remove button losing its hover background, and the Data-tab file picker restyled to a minimal color fix (reverting an over-engineered redesign).
- **Copy buttons** — code blocks copy from the exact source instead of rendered `innerText`, the message copy button uses the shared clipboard helper, and the code copy button no longer sticks on the feedback icon after rapid re-clicks.
- **TTS & misc** — `audio.play()` rejections handled on the resume path, skip logs made accurate, the composer resets to its 56px baseline after sending, toast notifications announce to screen readers via ARIA roles, inline image/video buttons show on touch devices, and the assistant logo shows for messages imported from a shared chat URL.

## [3.3.1] - 2026-06-16

A Party mode and chat-export polish release. Patch bump: bug fixes and output improvements, all backward-compatible.

### Added
- **Themed HTML chat export** — the HTML export now renders message markdown through the same `marked` + DOMPurify pipeline as the live chat and reproduces the on-screen layout (avatars, user/assistant bubbles, code blocks, tables, and a reasoning disclosure) using the active theme's colors, captured at export time. The export stylesheet and page shell live in `src/css`/`src/html` and are inlined via `?raw`.

### Fixed
- **Party interjections** — typing into a paused or stopped party now queues your message and resumes/restarts the loop instead of falling through to a regular-chat turn.
- **Party history titles** — party conversations are titled by their scenario topic (falling back to the opening line, then the cast) instead of "(No user message)".
- **Party export labels** — exports now label each turn by character name across every format, rather than a flat "Assistant".
- **Party header** — the header info line now includes the scenario's conversation type.
- **Speaker-decision cost** — the next-speaker routing request is pinned to low reasoning effort/verbosity with a bounded output, and its outcome is logged via `logVerbose`, so it no longer inherits the user's global setting and runs away on tokens.
- **CSV export** — cells beginning with `= + - @` are escaped to prevent spreadsheet formula injection.

## [3.3.0] - 2026-06-16

Adds Party mode, an autonomous multi-character group chat. Minor bump: a new user-facing feature, backward-compatible with everything else.

### Added
- **Party mode** — several AI personas converse autonomously on top of the existing provider-agnostic `runTurn` pipeline, and you can interject at any time without pausing. Includes a settings tab to build the cast (name, persona, optional temperature, per-character tool selection) and scenario (topic, setting, mood, conversation type), AI-driven speaker selection for three or more characters, a pause/resume/stop control bar, and persistence of the active party. Each turn streams into its own bubble with the speaker's name label shown from the moment generation begins.
- When a character is given a name but no persona description, the name is used as the persona.
- **Tests** — coverage for the Party prompt builders (persona/first/subsequent-turn/decision prompts, user-name-keyed interjection detection), scenario/config defaults, and engine control flow (restart-after-stop, pause mid-turn, aborted-but-already-generated turns).

## [3.2.0] - 2026-06-16

A theme-heavy release plus a large internal refactor/dedupe pass. Minor bump: many new user-facing themes and a new default, with everything else backward-compatible.

### Added
- **13 new special themes** — Aurora, Tidepool, Ember, Noir, Patina, Sunset, Wine, Autumn, Nebula, Amber CRT, Stained Glass, Forest, and Comic. Each ships a matching code-block syntax palette.
- **Aurora is the new default theme** — a northern-lights gradient.
- **Optional theme packs** — the Metal, Neon, and Country collections are no longer bundled by default; install them from the settings panel to add them to the theme list.

### Changed
- **Contact page** — emoji replaced with the SVG icon sprite (new github, bug, message-circle, star, zap, and dollar-sign symbols), fixed the back-link icon path, and simplified the donations copy.
- **Settings panels** — dropped the incidental bordered box around setting groups on Parchment, E-Ink, Synthwave, Solarized, Nord, and Dracula (Blueprint and Comic keep theirs, where bordered panels are the theme concept).
- **Internal refactors** — grouped attachments, gallery, vector-store, DOM, and storage helpers into dedicated modules; extracted shared helpers (clipboard copy, anchor download, reasoning-panel renderer, document-upload flow, and more) and deduped repeated logic across history, tools, and TTS.
- **Logging** — introduced a `logVerbose` helper and collapsed dozens of verbose-log guards across initialization, tool, history, and TTS code paths.

### Fixed
- **Code-block syntax theming** — special themes now drive syntax-highlight colors through shared code-palette variables, so fenced code renders correctly under every theme.

## [3.1.0] - 2026-06-14

A large robustness + test-coverage pass plus user-facing theme additions. Minor bump: new themes are user-facing features; everything else is backward-compatible fixes and internal cleanup.

### Added
- **6 new special themes** — Parchment, E-Ink, Synthwave, Solarized, Nord, and Dracula.
- **Test coverage** — suite grew from 179 to 268 tests, covering previously-untested pure logic (token budgeting, function-call collection, tool/memory tools, the tool catalog, media helpers, and more).
- **ESLint guard rails** — enabled `no-unreachable` plus 17 other correctness rules.

### Fixed
- **`loadFromUrl` malformed `?chat=`** — a non-array `messages` left `conversationHistory` as a non-array and corrupted downstream code; now `Array.isArray`-guarded with a non-object early return (+regression tests).
- **SSE `processEvent`** — `data: null` threw at `payload.type`; now guarded against non-object payloads (+regression test).
- **Conversation load** — a corrupted non-array `images` field no longer fails the whole load.
- **Weather tool** — guarded `forecast`/geocode-element access that could throw on an empty or odd API body.

### Changed
- **Accessibility/security** — `rel="noopener"` on external API-key links; decorative-icon `aria-hidden` sweep across `icon()` and static HTML.
- **DRY/refactors** — consolidated `showInlineStatus`, `truncate`, `normalizeServerBaseUrl`, default server-URL constants, timestamp/guard helpers, and a single source of truth for `[[IMAGE: …]]`/`[[MEDIA: …]]` placeholders.

### Removed
- Unreachable/dead code flagged by the newly enabled lint rules.

## [3.0.4] - 2026-06-12

Packaging/project-metadata maintenance plus a small round of theme cleanup.

### Added
- **USA theme flag background** — the USA theme now renders a dimmed US-flag backdrop behind a translucent, blurred chat panel.
- **Blueprint theme** — a dashed-grid "blueprint" special theme with matching code highlighting.

### Changed
- **`package.json` metadata** — rewrote the stale `description` and `keywords` to reflect the current platform (TypeScript, xAI/Grok, Ollama, tool calling, MCP, TTS); dropped pre-3.0.0 `javascript`/`es6`/`modular` keywords.
- **Dependency bumps** — `dompurify`, `eslint`, `@types/node`, `globals` (in-range) plus `html-validate` 10→11 and `npm-check-updates` 19→22.

### Removed
- **Teletext theme** — removed entirely, including its CSS, the bundled `MODE7GX3.ttf` font asset, and mobile overrides.
- **Bogus `os`/`cpu` fields** — removed from `package.json`; a browser app has no native binaries, and they needlessly blocked `npm install` on other platforms.
- **Dead `funding` field** — pointed at a `#-support` README anchor removed in the earlier project cleanup.
- **Stale `files` entries** — `robots.txt`/`sitemap.xml` no longer exist in the repo.

### Fixed
- **USA flag sizing** — the flag background now uses `cover` sizing (was distorting at `100% 100%`) with a solid fallback color, so it scales proportionally and shows no white gaps across screen sizes.
- **`.gitignore` inconsistencies** — stopped ignoring the tracked `package-lock.json` (required by `npm ci` in Docker/CI); replaced a brittle single-file Claude rule with a blanket `.claude/` ignore.
- **Changelog backfill** — added the previously missing `[3.0.2]` and `[3.0.3]` entries.

## [3.0.3] - 2026-06-11

Security hardening for the history/render paths. No user-facing feature changes.

### Fixed
- **Stored XSS in history** — conversation fields in the history list are now escaped before being inserted into `innerHTML` templates.
- **Unescaped media attributes** — media attributes in the history render path are escaped via the shared `escapeHtml` helper.
- **Remaining `innerHTML` templates** — escaped untrusted values across the remaining `innerHTML` templates and consolidated on a single shared `escapeHtml`.

### Changed
- **ID collisions** — removed the `document.querySelector` monkey-patch and fixed duplicate element IDs; swallowed errors are now logged.

### Added
- Tests for `escapeHtml` and export-escaping behavior.
- CI now runs `typecheck` and `build` steps.

## [3.0.2] - 2026-06-11

CSS modularization and panel accuracy. No runtime behavior changes.

### Changed
- **CSS split into per-section modules** — oversized files (`history.css`, `controls.css`, `tool-settings.css`) were broken into focused per-section modules.
- **About/help panels refreshed** — accurate tool list, current year, and corrected repo links.

### Removed
- Dead CSS — 58 unused classes and 2 unused IDs removed; stray comments stripped; mobile media queries consolidated.

## [3.0.1] - 2026-06-10

Documentation and code-comment maintenance. No runtime behavior changes.

### Changed
- **Node 24 baseline** — minimum supported Node bumped to 24 (`engines`, Docker build image `node:24-alpine`, CI runs on Node 24).
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
