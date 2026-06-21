import test from "node:test";
import assert from "node:assert/strict";

import { buildOutgoingAttachments } from "../src/ts/components/attachments/outgoingAttachments.js";

test("document name is HTML-escaped in the outgoing markup", () => {
  const { documentsHtml } = buildOutgoingAttachments([], [
    { name: "<img src=x onerror=alert(1)>.txt", size: 2048, type: "text/plain" },
  ]);

  assert.match(documentsHtml, /&lt;img src=x onerror=alert\(1\)&gt;\.txt/);
  assert.doesNotMatch(documentsHtml, /<img src=x/);
});

test("directory name is HTML-escaped and file count/size are rendered", () => {
  const { documentsHtml } = buildOutgoingAttachments([], [
    {
      isDirectory: true,
      directoryName: "a&b<dir>",
      files: [
        { file: new File([], "one"), name: "one", size: 512, type: "text/plain" },
        { file: new File([], "two"), name: "two", size: 512, type: "text/plain" },
      ],
    },
  ]);

  assert.match(documentsHtml, /a&amp;b&lt;dir&gt;/);
  assert.doesNotMatch(documentsHtml, /<dir>/);
  assert.match(documentsHtml, /2 files \(1\.0 KB\)/);
});

test("single document records a history attachment with its raw name and size", () => {
  const { attachmentsForHistory } = buildOutgoingAttachments([], [
    { name: "report.pdf", size: 4096, type: "application/pdf" },
  ]);

  assert.equal(attachmentsForHistory.length, 1);
  assert.equal(attachmentsForHistory[0].type, "document");
  assert.equal(attachmentsForHistory[0].filename, "report.pdf");
  assert.equal(attachmentsForHistory[0].size, 4096);
});

test("a singular file count is rendered without the plural 's'", () => {
  const { documentsHtml } = buildOutgoingAttachments([], [
    {
      isDirectory: true,
      directoryName: "solo",
      files: [{ file: new File([], "only"), name: "only", size: 100, type: "text/plain" }],
    },
  ]);

  assert.match(documentsHtml, /1 file \(/);
  assert.doesNotMatch(documentsHtml, /1 files/);
});
