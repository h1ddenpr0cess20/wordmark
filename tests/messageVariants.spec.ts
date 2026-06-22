import test from "node:test";
import assert from "node:assert/strict";

const {
  snapshotVariant,
  applyVariant,
  ensureVariants,
  recordRegeneratedVariant,
} = await import("../src/ts/components/messageVariants.js");

type Msg = Parameters<typeof snapshotVariant>[0];

test("snapshotVariant copies the entry's renderable fields", () => {
  const entry = {
    role: "assistant",
    content: "hello",
    reasoning: "because",
    responseId: "resp_1",
    hasImages: true,
    incomplete: true,
  } as Msg;
  assert.deepEqual(snapshotVariant(entry), {
    content: "hello",
    reasoning: "because",
    responseId: "resp_1",
    codeInterpreterOutputs: undefined,
    hasImages: true,
    incomplete: true,
  });
});

test("snapshotVariant coerces non-string content to empty string", () => {
  const variant = snapshotVariant({ role: "assistant", content: [{ type: "text", text: "x" }] } as Msg);
  assert.equal(variant.content, "");
});

test("applyVariant writes the variant fields back onto the entry", () => {
  const entry = { role: "assistant", content: "old", reasoning: "old-r", incomplete: true } as Msg;
  applyVariant(entry, { content: "new", reasoning: "new-r", responseId: "r2", incomplete: false });
  assert.equal(entry.content, "new");
  assert.equal(entry.reasoning, "new-r");
  assert.equal(entry.responseId, "r2");
  assert.equal(entry.incomplete, false);
});

test("ensureVariants seeds variant 0 once and reports whether it did", () => {
  const entry = { role: "assistant", content: "first" } as Msg;
  assert.equal(ensureVariants(entry), true);
  assert.equal(entry.variants?.length, 1);
  assert.equal(entry.variants?.[0].content, "first");
  assert.equal(entry.activeVariant, 0);
  // second call is a no-op
  assert.equal(ensureVariants(entry), false);
  assert.equal(entry.variants?.length, 1);
});

test("recordRegeneratedVariant seeds variant 0 from current content, then appends", () => {
  const entry = { role: "assistant", id: "m1", content: "first", reasoning: "r0" } as Msg;
  const seeded = recordRegeneratedVariant(entry, { content: "second", reasoning: "r1" });

  assert.equal(seeded, true);
  assert.equal(entry.variants?.length, 2);
  assert.equal(entry.variants?.[0].content, "first");
  assert.equal(entry.variants?.[1].content, "second");
  assert.equal(entry.activeVariant, 1);
});

test("recordRegeneratedVariant keeps variant 0 across multiple regenerations", () => {
  const entry = { role: "assistant", id: "m1", content: "v0" } as Msg;
  recordRegeneratedVariant(entry, { content: "v1" });
  const seededSecond = recordRegeneratedVariant(entry, { content: "v2" });

  assert.equal(seededSecond, false);
  assert.equal(entry.variants?.length, 3);
  assert.deepEqual(entry.variants?.map((v) => v.content), ["v0", "v1", "v2"]);
  assert.equal(entry.activeVariant, 2);
});
