import test from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/ts/init/state.ts";

const { stripBase64FromHistory } = await import("../src/ts/utils/historyImages.ts");

const B64 = "data:image/png;base64,AAAABBBBCCCC";
type Msg = (typeof state.conversationHistory)[number];
const history = (msgs: unknown[]) => { state.conversationHistory = msgs as Msg[]; };

function reset() {
  state.imageDataCache = new Map();
  state.conversationHistory = [];
}

test("does nothing for an unknown id or a non-user message", () => {
  reset();
  history([{ id: "m1", role: "assistant", content: `hi ${B64}` }]);
  stripBase64FromHistory("m1");
  assert.equal(state.conversationHistory[0].content, `hi ${B64}`, "assistant message left intact");
  stripBase64FromHistory("does-not-exist");
  assert.equal(state.conversationHistory[0].content, `hi ${B64}`);
});

test("strips base64 and prepends placeholders when they are not yet present", () => {
  reset();
  history([{ id: "u1", role: "user", content: `look ${B64}` }]);
  stripBase64FromHistory("u1", ["[[IMAGE: a.png]]"]);
  assert.equal(state.conversationHistory[0].content, "[[IMAGE: a.png]]\n\nlook");
});

test("joins multiple placeholders with newlines ahead of the remaining text", () => {
  reset();
  history([{ id: "u1", role: "user", content: `${B64} caption` }]);
  stripBase64FromHistory("u1", ["[[IMAGE: a.png]]", "[[IMAGE: b.png]]"]);
  assert.equal(state.conversationHistory[0].content, "[[IMAGE: a.png]]\n[[IMAGE: b.png]]\n\ncaption");
});

test("only removes base64 (no re-prepend) when every placeholder is already present", () => {
  reset();
  history([{ id: "u1", role: "user", content: `[[IMAGE: a.png]] hello ${B64}` }]);
  stripBase64FromHistory("u1", ["[[IMAGE: a.png]]"]);
  assert.equal(state.conversationHistory[0].content, "[[IMAGE: a.png]] hello");
});

test("with no placeholders it just strips the inline base64", () => {
  reset();
  history([{ id: "u1", role: "user", content: `only ${B64} text` }]);
  stripBase64FromHistory("u1");
  assert.equal(state.conversationHistory[0].content, "only  text");
});

test("caches attachment data urls, nulls them, marks them removed, and drops invalid entries", () => {
  reset();
  history([{
    id: "u1",
    role: "user",
    content: "x",
    attachments: [
      { filename: "a.png", dataUrl: B64 },
      null,
      { filename: "b.png", dataUrl: B64 },
    ],
  }]);
  stripBase64FromHistory("u1");
  const atts = state.conversationHistory[0].attachments as Array<{ dataUrl: unknown; inlineDataRemoved?: boolean }>;
  assert.equal(atts.length, 2, "the null attachment is filtered out");
  assert.equal(atts[0].dataUrl, null);
  assert.equal(atts[0].inlineDataRemoved, true);
  assert.equal(state.imageDataCache.get("a.png"), B64);
  assert.equal(state.imageDataCache.get("b.png"), B64);
});
