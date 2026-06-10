import test from "node:test";
import assert from "node:assert/strict";

// utils.js is an ES module that reads shared state from init/state.js and
// attaches a couple of inline-handler shims onto window at import time, so we
// provide window/document stubs on globalThis before importing it.
globalThis.window = globalThis.window || ({} as Window & typeof globalThis);
globalThis.document = globalThis.document || ({
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
} as unknown as Document);

const { debounce, sanitizeInput, stripBase64FromHistory, toggleThinking } =
  await import("../src/ts/utils/utils.ts");
const { state } = await import("../src/ts/init/state.ts");

test("sanitizeInput escapes angle brackets", () => {
  const raw = "<script>alert(1)</script>"; // eslint-disable-line no-script-url
  assert.equal(sanitizeInput(raw), "&lt;script&gt;alert(1)&lt;/script&gt;");
});

test("stripBase64FromHistory removes base64 and inserts placeholders", () => {
  state.conversationHistory = [
    {
      id: "m1",
      role: "user",
      content: "here is an image data:image/png;base64,QUJDREVGR0g= end",
    },
  ];

  const placeholders = ["[[IMAGE: file1.png]]", "[[IMAGE: file2.png]]"];
  stripBase64FromHistory("m1", placeholders);

  const updated = state.conversationHistory[0].content as string;
  assert.ok(updated.includes("[[IMAGE: file1.png]]"));
  assert.ok(updated.includes("[[IMAGE: file2.png]]"));
  assert.ok(!/data:image\/[^;]+;base64,\S+/.test(updated));
});

test("stripBase64FromHistory caches attachment data and clears inline copies", () => {
  state.imageDataCache = new Map();
  state.conversationHistory = [
    {
      id: "m2",
      role: "user",
      content: "[[IMAGE: sample.png]] description text",
      attachments: [
        {
          filename: "sample.png",
          dataUrl: "data:image/png;base64,QUJDREVGRw==",
          mimeType: "image/png",
        },
      ],
    },
  ];

  stripBase64FromHistory("m2", ["[[IMAGE: sample.png]]"]);

  const entry = state.conversationHistory[0];
  assert.equal(entry.attachments![0].dataUrl, null);
  assert.equal(entry.attachments![0].inlineDataRemoved, true);
  assert.equal(state.imageDataCache.get("sample.png"), "data:image/png;base64,QUJDREVGRw==");
});

test("debounce limits rapid invocations to a single call", async () => {
  let count = 0;
  const debounced = debounce(() => { count++; }, 50);
  for (let i = 0; i < 5; i++) debounced();
  await new Promise(r => setTimeout(r, 80));
  assert.equal(count, 1);
});

test("toggleThinking toggles collapsed state and scrolls on expand", async () => {
  function fakeClassList(initial: string[] = []) {
    const set = new Set<string>(initial);
    return {
      contains: (c: string) => set.has(c),
      add: (c: string) => void set.add(c),
      remove: (c: string) => void set.delete(c),
      toggle: (c: string) => (set.has(c) ? set.delete(c) : set.add(c)),
      toString: () => Array.from(set).join(" "),
    };
  }

  const nodes = new Map<string, unknown>();
  globalThis.document = {
    readyState: "complete",
    body: { style: {} },
    getElementById: (id: string) => nodes.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
  } as unknown as Document;

  const contentDiv = { scrollTop: 5 };
  const node = {
    id: "thinking-1",
    classList: fakeClassList(["thinking-container", "collapsed"]),
    querySelector: (sel: string) => (sel === ".thinking-content" ? contentDiv : null),
  };
  nodes.set("thinking-1", node);

  // Expand (was collapsed)
  toggleThinking("thinking-1", { stopPropagation() {}, preventDefault() {} } as unknown as Event);
  assert.equal(node.classList.contains("collapsed"), false);
  await new Promise(r => setTimeout(r, 120));
  assert.equal(contentDiv.scrollTop, 0);

  // Collapse
  toggleThinking("thinking-1");
  assert.equal(node.classList.contains("collapsed"), true);
});

