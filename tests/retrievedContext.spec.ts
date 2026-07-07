import test from "node:test";
import assert from "node:assert/strict";

const { stripRetrievedContextText, stripRetrievedContextFromMessages, RETRIEVED_CONTEXT_MARKER } =
  await import("../src/ts/utils/retrievedContext.ts");

test("stripRetrievedContextText removes a legacy appended context block", () => {
  const content = `summarize this\n\n${RETRIEVED_CONTEXT_MARKER}\n\n[From a.pdf]\nchunk text`;
  assert.equal(stripRetrievedContextText(content), "summarize this");
});

test("stripRetrievedContextText leaves clean content untouched", () => {
  assert.equal(stripRetrievedContextText("just a question"), "just a question");
});

test("stripRetrievedContextFromMessages cleans user string content only", () => {
  const messages = [
    { role: "user", content: `q\n\n${RETRIEVED_CONTEXT_MARKER}\n\nblob` },
    { role: "assistant", content: `echoing ${RETRIEVED_CONTEXT_MARKER}` },
    { role: "user", content: "clean" },
  ];
  const result = stripRetrievedContextFromMessages(messages);
  assert.equal(result[0].content, "q");
  assert.equal(result[1].content, `echoing ${RETRIEVED_CONTEXT_MARKER}`, "assistant content untouched");
  assert.equal(result[2].content, "clean");
  assert.equal(messages[0].content, `q\n\n${RETRIEVED_CONTEXT_MARKER}\n\nblob`, "input not mutated");
});

test("stripRetrievedContextFromMessages drops legacy context parts from array content", () => {
  const messages = [
    {
      role: "user",
      content: [
        { type: "input_text", text: "question" },
        { type: "input_text", text: `${RETRIEVED_CONTEXT_MARKER}\n\n[From a.pdf]\nchunk` },
      ],
    },
  ];
  const result = stripRetrievedContextFromMessages(messages);
  assert.deepEqual(result[0].content, [{ type: "input_text", text: "question" }]);
});
