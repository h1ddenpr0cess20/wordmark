import test from "node:test";
import assert from "node:assert/strict";

// conversationStorage is now a real ES module backed by IndexedDB, so the
// persistence layer talks to it directly rather than through window stubs.
// We drive it with a fake IndexedDB and read records back to assert.
import {
  initConversationDb,
  saveConversationToDb,
  getAllConversationsFromDb,
} from "../src/ts/utils/storage/conversationStorage.ts";
import { saveImageToDb } from "../src/ts/utils/storage/imageStorage.ts";
import { state, elements } from "../src/ts/init/state.ts";
import { uiHooks } from "../src/ts/init/uiHooks.ts";

type FakeReq = {
  onsuccess: ((ev: { target: { result: unknown } }) => void) | null;
  onerror: ((ev: { target: { error: unknown } }) => void) | null;
  onupgradeneeded?: ((ev: { target: { result: unknown } }) => void) | null;
  result: unknown;
  error: unknown;
};

// Minimal fake IndexedDB (mirrors conversationStorage.spec.js)
function createFakeIndexedDB() {
  const stores = new Map<string, ReturnType<typeof createStore>>();
  const objectStoreNames = { contains: (name: string) => stores.has(name) };

  function makeRequest(): FakeReq {
    return { onsuccess: null, onerror: null, result: undefined, error: null };
  }
  function fireSuccess(req: FakeReq, result: unknown) {
    req.result = result;
    setImmediate(() => req.onsuccess && req.onsuccess({ target: { result } }));
  }

  function createStore(name: string, opts: { keyPath?: string } = {}) {
    const data = new Map<unknown, Record<string, unknown>>();
    const keyPath = opts.keyPath || "id";
    return {
      put(record: Record<string, unknown>) {
        const req = makeRequest();
        const key = record[keyPath] || (record[keyPath] = Date.now().toString());
        data.set(key, JSON.parse(JSON.stringify(record)));
        fireSuccess(req, key);
        return req;
      },
      add(record: Record<string, unknown>) { return this.put(record); },
      get(key: unknown) {
        const req = makeRequest();
        fireSuccess(req, JSON.parse(JSON.stringify(data.get(key))));
        return req;
      },
      delete(key: unknown) {
        const req = makeRequest();
        data.delete(key);
        fireSuccess(req, true);
        return req;
      },
      openCursor() {
        const req = makeRequest();
        const values = Array.from(data.values());
        let idx = 0;
        function makeCursor(): { value: unknown; continue(): void } | null {
          if (idx >= values.length) return null;
          const value = JSON.parse(JSON.stringify(values[idx]));
          return {
            value,
            continue() {
              idx++;
              const next = makeCursor();
              req.result = next;
              setImmediate(() => req.onsuccess && req.onsuccess({ target: { result: next } }));
            },
          };
        }
        fireSuccess(req, makeCursor());
        return req;
      },
    };
  }

  const db = {
    objectStoreNames,
    createObjectStore(name: string, opts?: { keyPath?: string }) { const s = createStore(name, opts); stores.set(name, s); return s; },
    transaction() {
      const txn: {
        objectStore: (n: string) => ReturnType<typeof createStore> | undefined;
        oncomplete: (() => void) | null;
        onabort: (() => void) | null;
        onerror: (() => void) | null;
        error: unknown;
      } = {
        objectStore: (n: string) => stores.get(n),
        oncomplete: null,
        onabort: null,
        onerror: null,
        error: null,
      };
      setImmediate(() => setImmediate(() => txn.oncomplete && txn.oncomplete()));
      return txn;
    },
  };

  return {
    open() {
      const req: FakeReq = { onsuccess: null, onerror: null, onupgradeneeded: null, result: db, error: null };
      setImmediate(() => {
        if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: db } });
        if (req.onsuccess) req.onsuccess({ target: { result: db } });
      });
      return req;
    },
  };
}

// renderConversationMessages now runs for real (appendMessage/render are static
// ESM imports), so provide a minimal DOM + markdown stub good enough for the
// hydration path. These tests only assert observable state, not rendered HTML.
type FakeEl = {
  childNodes: unknown[];
  [key: string]: unknown;
};
function makeEl(): FakeEl {
  const el = {
    className: "", id: "", innerHTML: "", outerHTML: "<div></div>", textContent: "",
    style: {}, dataset: {}, childNodes: [] as unknown[],
    offsetHeight: 0, scrollTop: 0, scrollHeight: 0,
    classList: {
      _s: new Set<string>(),
      add(...c: string[]) { c.forEach(x => this._s.add(x)); },
      remove(...c: string[]) { c.forEach(x => this._s.delete(x)); },
      contains(c: string) { return this._s.has(c); },
    },
    appendChild(child: unknown) { el.childNodes.push(child); return child; },
    removeChild(child: unknown) { const i = el.childNodes.indexOf(child); if (i >= 0) el.childNodes.splice(i, 1); return child; },
    remove() {},
    setAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false; },
    addEventListener() {}, removeEventListener() {},
    insertAdjacentHTML() {}, insertAdjacentElement() {},
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
  };
  return el;
}
globalThis.document = {
  createElement: () => makeEl(),
  createElementNS: () => makeEl(),
  getElementById: () => makeEl(),
  querySelector: () => makeEl(),
  querySelectorAll: () => [],
  addEventListener: () => {},
  body: makeEl(),
} as unknown as Document;

// Set up a window before importing persistence; the module reads shared state
// (conversationHistory, generatedImages, DOM refs) off whatever `window` is in
// scope at call time, so each test swaps in a fresh window object below.
globalThis.window = { addEventListener: () => {}, indexedDB: createFakeIndexedDB(), VERBOSE_LOGGING: false } as unknown as Window & typeof globalThis;

// persistence.js is now an ES module — import its API directly.
const {
  saveCurrentConversation,
  loadConversation,
  startNewConversation,
} = await import("../src/ts/services/history/persistence.ts");

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

// persistence.js reads shared state via the state.js singleton. Distribute the
// per-test fixture keys into state/elements; everything else (config,
// ensureImagesHaveMessageIds, indexedDB, ...) stays on the window stub.
const STATE_KEYS = new Set([
  "conversationHistory", "generatedImages", "currentConversationId",
  "currentConversationName", "loadedSystemPrompt", "activePartyConfig", "partyMode",
]);
const ELEMENT_KEYS = new Set([
  "chatBox", "modelSelector", "personalityPromptRadio", "personalityInput",
  "customPromptRadio", "systemPromptCustom", "noPromptRadio",
]);

async function resetDb(extra: Record<string, unknown> = {}) {
  globalThis.window = {
    addEventListener: () => {},
    indexedDB: createFakeIndexedDB(),
    VERBOSE_LOGGING: false,
  } as unknown as Window & typeof globalThis;
  Object.assign(state, {
    conversationHistory: [],
    generatedImages: [],
    currentConversationId: null,
    currentConversationName: null,
    loadedSystemPrompt: null,
    activePartyConfig: null,
    partyMode: false,
  });
  const stateRecord = state as unknown as Record<string, unknown>;
  const elementsRecord = elements as unknown as Record<string, unknown>;
  const windowRecord = globalThis.window as unknown as Record<string, unknown>;
  for (const key of Object.keys(elements)) {
    elementsRecord[key] = null;
  }
  for (const [key, value] of Object.entries(extra)) {
    if (STATE_KEYS.has(key)) {
      stateRecord[key] = value;
    } else if (ELEMENT_KEYS.has(key)) {
      elementsRecord[key] = value;
    } else {
      windowRecord[key] = value;
    }
  }
  await initConversationDb();
}

test("saveCurrentConversation filters metadata, persists images, and marks messages", async () => {
  await resetDb({
    conversationHistory: [
      { id: "m-user", role: "user", content: "Hello" },
      { id: "m-assistant", role: "assistant", content: "Hi there!" },
      { id: "m-dev", role: "developer", content: "skip me" },
    ],
    generatedImages: [
      { url: "data:image/png;base64,AAA", prompt: "sunset", associatedMessageId: "m-assistant" },
      { url: "https://example.com/already.png", filename: "already.png", associatedMessageId: "other" },
    ],
    currentConversationId: "existing-id",
    currentConversationName: "Existing Name",
    ensureImagesHaveMessageIds() { return 0; },
    modelSelector: { value: "gpt-4o" },
    config: { defaultService: "openai" },
    personalityPromptRadio: { checked: true },
    personalityInput: { value: "Be cheerful" },
    customPromptRadio: { checked: false },
    systemPromptCustom: { value: "" },
  });

  saveCurrentConversation({ name: "Manual Title" });
  await flush();
  await flush();

  const all = await getAllConversationsFromDb();
  assert.equal(all.length, 1);
  const convo = all[0] as {
    id: string; name: string; model: string; service: string;
    systemPrompt: { type: string; content: string };
    messages: Array<{ role: string; hasImages?: boolean }>;
    images: Array<{ isStoredInDb?: boolean; filename: string; prompt?: string; associatedMessageId?: string }>;
  };
  assert.equal(convo.id, "existing-id");
  assert.equal(convo.name, "Manual Title");
  assert.equal(convo.model, "gpt-4o");
  assert.equal(convo.service, "openai");
  assert.equal(convo.systemPrompt.type, "personality");
  assert.equal(convo.systemPrompt.content, "Be cheerful");

  assert.equal(convo.messages.length, 2);
  const assistantMsg = convo.messages.find(msg => msg.role === "assistant");
  assert.equal(assistantMsg!.hasImages, true);

  // The data-URL image is persisted (new filename, marked stored); the remote
  // image is passed through untouched. Metadata rides along on the record.
  assert.equal(convo.images.length, 2);
  const storedImage = convo.images.find(img => img.isStoredInDb);
  assert.ok(storedImage!.filename.endsWith(".png"));
  assert.equal(storedImage!.prompt, "sunset");
  assert.equal(storedImage!.associatedMessageId, "m-assistant");
  assert.equal(state.currentConversationName, "Manual Title");
});

test("loadConversation hydrates UI, preloads images, and filters developer messages", async () => {
  const conversationRecord = {
    id: "1",
    name: "Previous chat",
    systemPrompt: { type: "custom", content: "Keep it short" },
    messages: [
      { id: "a", role: "assistant", content: "Hi human" },
      { id: "d", role: "developer", content: "internal note" },
    ],
    images: [
      { filename: "stored.png", isStoredInDb: true, associatedMessageId: "a" },
      { filename: "remote.jpg", isStoredInDb: false },
    ],
  };

  await resetDb({
    chatBox: { innerHTML: "old", appendChild: () => {} },
  });

  // Seed the conversation and the stored image into the (fake) database.
  await saveConversationToDb(conversationRecord);
  await saveImageToDb("binary:stored.png", "stored.png");

  // renderConversationMessages is now a direct ESM import (no window seam to
  // stub), so assert the observable state hydration loadConversation performs.
  const result = await loadConversation("1");
  assert.equal(result, true);
  assert.equal(elements.chatBox!.innerHTML, "");

  assert.equal(state.conversationHistory.length, 1);
  assert.equal(state.conversationHistory[0].role, "assistant");
  assert.equal(state.generatedImages.length, 2);
  assert.equal(state.currentConversationId, "1");
});

test("startNewConversation saves existing session and resets state", async () => {
  await resetDb({
    chatBox: { innerHTML: "<p>old</p>" },
    conversationHistory: [{ role: "user", content: "hello" }],
    generatedImages: [],
    currentConversationId: "existing",
    currentConversationName: "Existing",
  });

  // saveCurrentConversation is a direct ESM import now; let the real one run and
  // assert the existing session was persisted before the reset.
  startNewConversation("Fresh Chat");
  await flush();

  const saved = await getAllConversationsFromDb();
  assert.ok(saved.some(convo => convo.id === "existing"));

  assert.equal(state.conversationHistory.length, 0);
  assert.equal(state.currentConversationId, null);
  assert.equal(state.currentConversationName, "Fresh Chat");
  assert.equal(elements.chatBox!.innerHTML, "");
});

test("startNewConversation persists an active party's metadata, then tears down party state", async () => {
  const partyConfig = {
    characters: [
      { id: "1", name: "Ada", persona: "mathematician", allowedTools: [] },
      { id: "2", name: "Bob", persona: "poet", allowedTools: [] },
    ],
    scenario: { topic: "Math vs poetry", setting: "cafe", mood: "lively", conversationType: "debate" },
    userName: "Host",
  };
  let stopPartyCalls = 0;
  uiHooks.stopParty = () => { stopPartyCalls++; };
  try {
    await resetDb({
      chatBox: { innerHTML: "" },
      conversationHistory: [{ role: "assistant", content: "Let's begin", character: { name: "Ada" } }],
      currentConversationId: "party-1",
      currentConversationName: "Party chat",
      activePartyConfig: partyConfig,
      partyMode: true,
      ensureImagesHaveMessageIds() { return 0; },
      modelSelector: { value: "gpt-4o" },
      noPromptRadio: { checked: true },
    });

    // The flush runs while the party is still active, so the archived record must
    // keep its party metadata; the teardown happens afterwards in the reset.
    startNewConversation("Fresh chat");
    await flush();
    await flush();

    const all = await getAllConversationsFromDb();
    const archived = all.find(convo => convo.id === "party-1") as {
      mode?: string;
      characters?: Array<{ name: string }>;
      scenario?: { topic: string };
      userName?: string;
    } | undefined;
    assert.ok(archived, "the party conversation should still be persisted");
    assert.equal(archived!.mode, "party");
    assert.equal(archived!.characters!.length, 2);
    assert.equal(archived!.scenario!.topic, "Math vs poetry");
    assert.equal(archived!.userName, "Host");

    // The fresh chat is no longer a party, and the running engine was stopped.
    assert.equal(state.partyMode, false);
    assert.equal(state.activePartyConfig, null);
    assert.equal(stopPartyCalls, 1);
  } finally {
    uiHooks.stopParty = undefined;
  }
});
