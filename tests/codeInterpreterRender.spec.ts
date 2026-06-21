import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><body></body>");
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;

const { renderCodeInterpreterOutputs } = await import("../src/ts/services/streaming/codeInterpreterRender.js");

type Attachment = {
  fileId: string;
  containerId?: string;
  index?: number;
  filename?: string;
  mimeType?: string;
  bytes?: number;
};

function messageWithContent(): HTMLElement {
  const message = document.createElement("div");
  const content = document.createElement("div");
  content.className = "message-content";
  message.appendChild(content);
  return message;
}

// containerId makes hydration resolve synchronously (no network fetch).
function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    fileId: "file-1",
    containerId: "container-1",
    index: 0,
    filename: "result.csv",
    mimeType: "text/csv",
    bytes: 1234,
    ...overrides,
  };
}

test("renderCodeInterpreterOutputs is a no-op when the message element is null", () => {
  assert.doesNotThrow(() => renderCodeInterpreterOutputs(null, { attachments: [attachment()] } as never));
});

test("renderCodeInterpreterOutputs does nothing without a .message-content wrapper", () => {
  const bare = document.createElement("div");
  renderCodeInterpreterOutputs(bare, { attachments: [attachment()] } as never);
  assert.equal(bare.querySelector(".code-interpreter-outputs"), null);
});

test("renderCodeInterpreterOutputs builds a section with a heading and one row per attachment", () => {
  const message = messageWithContent();
  renderCodeInterpreterOutputs(message, {
    attachments: [attachment({ fileId: "a", index: 0 }), attachment({ fileId: "b", index: 1 })],
  } as never);

  const section = message.querySelector(".code-interpreter-outputs");
  assert.ok(section, "section is created");
  assert.equal(section!.querySelector(".code-interpreter-title")?.textContent, "Code Interpreter Files");
  assert.equal(section!.querySelectorAll(".code-interpreter-file").length, 2);

  const firstName = section!.querySelector(".code-interpreter-file-name");
  assert.equal(firstName?.textContent, "result.csv", "row shows the attachment filename");
  assert.ok(section!.querySelector(".code-interpreter-download-btn"), "each row has a download button");
});

test("renderCodeInterpreterOutputs replaces prior rows instead of appending on re-render", () => {
  const message = messageWithContent();
  renderCodeInterpreterOutputs(message, {
    attachments: [attachment({ fileId: "a" }), attachment({ fileId: "b" })],
  } as never);
  assert.equal(message.querySelectorAll(".code-interpreter-file").length, 2);

  renderCodeInterpreterOutputs(message, {
    attachments: [attachment({ fileId: "c" })],
  } as never);

  const rows = message.querySelectorAll(".code-interpreter-file");
  assert.equal(rows.length, 1, "old rows are cleared, not accumulated");
  assert.equal(message.querySelectorAll(".code-interpreter-outputs").length, 1, "section is reused");
});

test("renderCodeInterpreterOutputs removes an existing section when there are no attachments", () => {
  const message = messageWithContent();
  renderCodeInterpreterOutputs(message, { attachments: [attachment()] } as never);
  assert.ok(message.querySelector(".code-interpreter-outputs"), "section present after first render");

  renderCodeInterpreterOutputs(message, { attachments: [] } as never);
  assert.equal(message.querySelector(".code-interpreter-outputs"), null, "section removed when emptied");
});
