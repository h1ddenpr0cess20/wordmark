# Architecture Review — Post-TypeScript-Conversion

_Date: 2026-06-09. Scope: `src/` (≈20k lines TS across `ts/`, `types/`, `config/`)._

The JS→TS conversion is done and the type surface is clean (`as any` = 0; the
remaining `: any` sites are genuine provider/parser boundaries). With types in
place, the structural seams are now visible. This document catalogs the areas
worth rewriting, ordered roughly by payoff-to-risk. Nothing here is a
correctness bug — these are maintainability/architecture findings.

---

## 1. No provider abstraction — service logic is scattered (highest payoff)

**Symptom.** `serviceKey === "xai" | "ollama" | "lmstudio" | "openai"` branching
appears in ~34 sites across at least:

- `services/api/toolManager.ts` (tool filtering: lines ~474, 526, 536, 542, 553, 690)
- `services/api/clientConfig.ts` (label + local-vs-cloud, ~65–72)
- `services/api/requestClient.ts` (reasoning-union parsing)
- `init/modelSettings.ts` (reasoning support, ~68, 211)
- `services/history/render.ts` (service label, ~286)
- `services/apiKeys.ts` (local-URL handling, ~635)

Each provider's quirks (xAI has no reasoning-effort + server-managed tools;
local providers skip keys and image tools; OpenAI has codex/shell specifics)
are expressed as `if (serviceKey === ...)` checks re-derived at every call site.
Adding a provider (e.g. Anthropic, already half-referenced) means hunting down
every branch.

**This is also the root cause of the streaming `any` boundaries.** The multi-
provider SSE/response parser in `services/streaming/` and `requestClient.ts`
stays untyped because it must accept OpenAI + xAI + Ollama/LM Studio shapes at
once. A per-provider **response-normalization adapter** would let the rest of
the app consume one typed `NormalizedResponse`/`NormalizedStreamEvent`, shrinking
that `any` surface to one small, well-tested seam per provider.

**Recommendation.** Introduce a `Provider` interface (capabilities + request
shaping + response normalization):

```
interface Provider {
  key: string;
  label: string;
  isLocal: boolean;
  supportsReasoningEffort: boolean;
  baseUrl: string;
  fetchModels(): Promise<string[]>;
  filterTools(tools, model): ToolDefinition[];
  normalizeStreamEvent(raw: unknown): NormalizedStreamEvent;
  normalizeResponse(raw: unknown): NormalizedResponse;
}
```

Register one implementation per provider; replace the scattered `===` checks
with capability lookups. Big win, but touches the hottest code paths — stage it
behind the existing test suite.

> **Partly done (2026-06-09) — `services/providers.ts` capability registry.**
> Introduced pure capability predicates (`isLocalService`, `isCloudService`,
> `serviceSupportsReasoning`, `supportsResponseIncludeFields`,
> `usesServerManagedTools`) as the single source of truth for "what does each
> service support". Replaced the scattered `serviceKey === ...` capability checks
> across `requestClient.ts`, `clientConfig.ts`, `toolManager.ts`, `apiKeys.ts`,
> `tools.ts`, `settingsTabs.ts`, `init/serviceSelection.ts`, `init/services.ts`,
> and `init/modelSettings.ts`. Covered by `tests/providers.spec.ts`. Deliberately
> **not** centralized: provider *display labels* (call sites use divergent label
> conventions — changing them would alter user-visible strings) and the
> openai-specific `developer`-role / codex-shell branches. The full `Provider`
> interface with **response/stream normalization** is the remaining, higher-risk
> piece — deferred because it rewrites the hottest SSE-parsing path; the
> capability registry captures the high-payoff/low-risk portion.
>
> **Follow-up (2026-06-09) — response normalization done; stream adapter found
> unnecessary.** Inspection settled the open question: there is **zero**
> `serviceKey`/provider branching anywhere in `services/streaming/`. All providers
> (OpenAI, xAI, Ollama, LM Studio) emit one Responses-API-compatible SSE event
> vocabulary, so the speculative per-provider `NormalizedStreamEvent` adapter has
> nothing to reconcile — the `any` in the streaming modules is untyped-JSON-payload
> parsing, a separate concern from provider abstraction. The one genuine remaining
> provider seam was the **non-streaming** reasoning/output extraction, which was
> inline in `runTurn` behind `responsePayload: any`. Extracted to
> `services/api/responseNormalization.ts` (`extractOutputText` /
> `extractReasoningText`, typed against `ResponseObject`); `requestClient.ts` is now
> `any`-free. Covered by `tests/responseNormalization.spec.ts`.

---

## 2. `config/config.ts` (515 lines) conflates four unrelated concerns

It currently holds, in one file:

1. Static constants + prompt templates (legitimately config).
2. Runtime-state seeding (`state.shortResponseGuideline = ...` at line 48 — a
   side effect on import).
3. A `console.*` monkey-patch with a dedupe cache (lines ~50–160) — this is a
   logging utility, not config.
4. The `services` map where each entry carries **behavior**:
   `fetchAndUpdateModels()` does network + `localStorage` reads + model-name
   filtering heuristics (`_isChatModel`) + DOM updates via `uiHooks`
   (lines 188–460). The fetch flow is duplicated ~4× with per-provider tweaks.

Concerns 3 and 4 don't belong in a config module, and #4 is **the provider
adapter from §1 in disguise** — the per-service `fetchAndUpdateModels` is
exactly `Provider.fetchModels`.

**Recommendation.**
- Move the console dedupe into `utils/logger.ts`.
- Extract per-service model fetching into the provider implementations (§1).
- Leave `config.ts` as pure data + constants. The build-time version injection
  (`__APP_VERSION__`) stays.

---

## 3. IndexedDB boilerplate duplicated across 4 storage modules

`utils/imageStorage.ts`, `utils/audioStorage.ts`, `utils/conversationStorage.ts`,
and `utils/memoryStorage.ts` each re-implement:

- `window.indexedDB.open(NAME, VERSION)` + `onupgradeneeded` store creation
- the `new Promise((resolve, reject) => { req.onsuccess/onerror ... })` wrapper
  around every get/put/delete/getAll (≈15 such blocks total)

**Recommendation.** A tiny shared helper removes the repetition and the
hand-rolled promise wiring:

```
function openDb(name, version, upgrade): Promise<IDBDatabase>
function withStore<T>(db, store, mode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T>
```

Each storage module shrinks to schema + typed get/put calls. Low risk, well
covered by existing `*Storage.spec.ts` tests. Easiest concrete win on this list.

---

## 4. God-objects: `toolManager.ts` (821) and `apiKeys.ts` (712)

**`services/api/toolManager.ts`** mixes: inline static tool definitions, the
tool-preference persistence (`wordmark_tool_preferences`), MCP server loading
+ availability pinging, and per-provider tool filtering. Split into:
`tools/catalog.ts` (definitions), `tools/preferences.ts`, `tools/mcp.ts`
(loading + availability), and fold provider filtering into §1.

**`services/apiKeys.ts`** mixes storage, DOM UI (`initApiKeys`,
`refreshApiDependentUi`, `showApiKeyStatus`), and per-service URL handling, with
33 direct `localStorage` calls. Split persistence (already partly in
`apiKeyStorage.ts`) from the settings-panel UI.

> **Partly done (2026-06-09).** The static tool-definition data block (~190
> lines) was extracted from `toolManager.ts` into `staticTools.ts`
> (`STATIC_TOOLS`), and the per-provider tool filtering now goes through the §1
> capability predicates. Key-loading persistence is isolated in `apiKeyStorage.ts`
> (`loadApiKeysIntoConfig`, covered by `tests/apiKeysLoadIntoConfig.spec.ts`).
>
> **Done (2026-06-09) — `toolManager.ts` fully split.** An earlier note here
> claimed the core was "not cleanly splittable" because the catalog and MCP state
> are mutually referential — that was wrong. Resolved by giving one module sole
> ownership of the shared mutable state: `tools/catalog.ts` owns
> `TOOL_CATALOG`/`TOOL_DEFINITIONS` + the `userMcpToolCount` boundary and exposes
> typed mutators; `tools/preferences.ts` (enable/disable + persistence) and
> `tools/mcp.ts` (register/unregister + availability ping/cache) depend on it
> one-way — no cycles. `toolManager.ts` is now a thin facade holding request-time
> tool filtering + the UI catalog view and re-exporting the sub-modules, so
> importers (`api.ts`, `requestClient.ts`, tests) are unchanged. Behavior
> identical; covered by `tests/toolManager.spec.ts` + `tests/mcpServers.ui.spec.ts`.

---

## 5. `localStorage` access is ungoverned

Direct `localStorage.getItem/setItem` with inline string keys appears in 10+
files (33× in `apiKeys.ts` alone), with key strings like
`"wordmark_api_key_openai"`, `"mcp_servers"`, `"wordmark_tool_preferences"`
duplicated at usage sites. No single place defines what's persisted or its
shape.

**Recommendation.** A typed `storage` facade with a central key registry and
JSON (de)serialization. Removes the repeated try/catch-around-`JSON.parse`
pattern (see `toolManager.loadUserMCPServers`) and makes the persisted schema
discoverable in one file.

> **Done (2026-06-09) — `utils/storage.ts`.** Implemented as a `STORAGE_KEYS`
> registry (single source of truth for every persisted key) + `apiKeyStorageKey`
> / `toolApiKeyStorageKey` builders + `readJSON` / `writeJSON` / `readString` /
> `writeString` / `removeKey` helpers. All key owners now reference the registry,
> so the stored values are unchanged (verified against the existing specs, which
> pin literals like `wordmark_api_key_xai`). Behavior was deliberately preserved
> at the tricky sites rather than forced through the helpers: bespoke per-site
> error logging / `saveMCPServers`'s rethrow are kept by leaving each try/catch
> in place and only swapping the inner write to `writeJSON`; the read-modify-
> write blocks (e.g. `vectorStore.saveVectorStoreMetadata`) keep their manual
> `JSON.parse` so a corrupt read still *aborts* the save instead of overwriting
> with `{}`. `readJSON` is used only at genuinely silent-fallback sites
> (`loadToolPreferences`). Covered by `tests/storage.spec.ts`.

---

## 6. `uiHooks` is an untyped escape hatch

`init/uiHooks.ts` is `Record<string, (...args: any[]) => any>` — a global
registry that lets low-level modules (`config.ts`) trigger UI updates without
importing the component graph, breaking the would-be config→component cycle.

It works, but: it's untyped (one of the surviving `any` sites), call sites guard
with `typeof hook === "function"` because registration order is implicit, and
"who registers/calls what" isn't traceable. Replace with a small **typed**
interface of named hooks (or a typed event emitter) so the compiler tracks the
contract. Resolving §1/§2 reduces the need for it (config no longer reaches into
the DOM).

---

## 7. Side-effect import graph with implicit ordering

`main.ts` pulls in ~30 modules for their side effects in a hand-ordered list,
with comments explaining why order matters (config first for console setup,
state before everything). This is fragile: reordering imports can break startup,
and the dependency graph isn't expressed in the type system.

**Recommendation.** Prefer explicit `init()` exports invoked in a documented
sequence from one bootstrap function over import-for-side-effect. Lower priority
— it's working and the ordering is at least documented.

---

## 8. Single 40-field mutable `state` singleton

`init/state.ts` exposes one `AppState` object mutated from across the codebase
(chat, gallery, TTS, vector store, logging flags all in one bag). Fine for the
app's size, but writes are untraceable and unrelated domains are coupled.

**Recommendation (optional).** If/when it becomes painful, split into
domain slices (`chatState`, `galleryState`, `ttsState`, …). Not urgent.

---

## 9. Test suite is still JavaScript

30+ `tests/**/*.spec.ts` files exercise the TS source through loaders
(`tests/helpers/registerLoaders.mjs`). The conversion stopped at the source
boundary. Migrating tests to `.ts` would type-check the tests themselves and
catch signature drift against the new domain types in `src/types/`. Mechanical,
low-risk, do it incrementally.

> **Done (2026-06-09).** All 33 spec files migrated to `.ts`; the suite still
> runs through the same loaders and all 161 tests pass unchanged (annotations and
> typed test doubles only — no test logic touched). A dedicated
> `tsconfig.tests.json` (extends the strict base, adds `types: ["node"]` and
> `lib: ES2022` since tests run on Node 22) type-checks the specs via
> `npm run typecheck:tests` with **zero errors under strict mode**. Test doubles
> are typed honestly — partial browser globals (`localStorage`, `document`,
> `window`, `navigator`, `URL`, `fetch`, `IDBFactory`, `HTMLAudioElement`, …) use
> `as unknown as <LibType>` at the assignment boundary so the source sees the real
> lib types, while the stub internals keep precise parameter types. Notably,
> keeping the config strict was the *correct* choice: a relaxed (`strict: false`)
> test config perturbed source-side inference (spurious union-narrowing errors in
> `messageLifecycle.ts`), whereas the strict config confines every diagnostic to
> the test files.

---

## Suggested sequencing

| Order | Item | Risk | Payoff | Status |
|------|------|------|--------|--------|
| 1 | §3 IndexedDB helper | low | medium | ✅ done (`openDatabase`) |
| 2 | §5 storage facade | low | medium | ✅ done (`utils/storage.ts` + key registry) |
| 3 | §2 split config (logger + data) | low-med | medium | ✅ done (`utils/logger.ts`) |
| 4 | §1 provider abstraction | **high** | **high** | ✅ capability registry (`providers.ts`) + non-streaming `responseNormalization.ts`; no stream adapter needed (streaming is provider-agnostic) |
| 5 | §4 split god-objects | med | medium | ✅ toolManager → `tools/{catalog,preferences,mcp}.ts` + facade; `staticTools.ts`/`apiKeyStorage.ts` extracted |
| 6 | §6 typed uiHooks | med | medium | ✅ done (`UiHooks` interface) |
| 7 | §9 tests → TS | low | medium | ✅ done (33 specs `.ts`, `typecheck:tests` strict-clean, 161 pass) |
| 8 | §7 / §8 | low | low | todo |

Do §1 after §2/§3/§5 — those shrink it and the storage/logging seams it depends
on will already be clean. Each step is independently shippable behind the
existing test suite.
