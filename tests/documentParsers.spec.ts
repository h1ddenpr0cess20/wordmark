import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><body></body>", { url: "http://localhost" });
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.File = dom.window.File;

const {
  extractDocumentText,
  isExtractableDocument,
} = await import("../src/ts/services/parsers/index.ts");
const { extractRtfText } = await import("../src/ts/services/parsers/rtf.ts");
const { extractsDocumentsClientSide } = await import("../src/ts/services/providers.ts");

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "parsers");

/** Loads a fixture as a browser File so it exercises the real dispatch path. */
function fixtureFile(name: string): File {
  const bytes = readFileSync(join(FIXTURES, name));
  return new File([bytes], name);
}

const NEEDLE = "the quick brown fox jumps over the lazy dog";

test("extractsDocumentsClientSide is true only for local-server providers", () => {
  assert.equal(extractsDocumentsClientSide("lmstudio"), true);
  assert.equal(extractsDocumentsClientSide("ollama"), true);
  assert.equal(extractsDocumentsClientSide("openai"), false);
  assert.equal(extractsDocumentsClientSide("xai"), false);
  assert.equal(extractsDocumentsClientSide(null), false);
});

test("isExtractableDocument accepts documents and any non-binary file", () => {
  for (const name of ["report.pdf", "a.docx", "b.xlsx", "c.pptx", "d.odt", "e.epub"]) {
    assert.equal(isExtractableDocument(name), true, name);
  }
  for (const name of ["main.rs", "App.kt", "config.yaml", "notes.md", "data.csv", "Makefile", "Dockerfile", "mail.eml"]) {
    assert.equal(isExtractableDocument(name), true, name);
  }
});

test("isExtractableDocument rejects images, media, and executables", () => {
  for (const name of ["photo.png", "clip.mp4", "song.mp3", "app.exe", "lib.so", "font.woff2", "archive.7z"]) {
    assert.equal(isExtractableDocument(name), false, name);
  }
});

test("extractDocumentText reads plain-text and code files verbatim", async () => {
  const rs = new File(["fn main() {\n    // the quick brown fox jumps over the lazy dog\n}\n"], "main.rs");
  const text = await extractDocumentText(rs);
  assert.match(text.toLowerCase(), new RegExp(NEEDLE));
  assert.match(text, /fn main/);
});

test("extractDocumentText rejects binary content it cannot read as text", async () => {
  const junk = new File([new Uint8Array([0x00, 0x01, 0x02, 0xff, 0x00])], "mystery.dat");
  await assert.rejects(() => extractDocumentText(junk), /Cannot extract text/);
});

test("extractRtfText decodes control words and hex escapes", () => {
  const rtf = "{\\rtf1\\ansi Hello\\par The quick brown fox jumps over the lazy dog\\par}";
  const text = extractRtfText(rtf);
  assert.match(text.toLowerCase(), new RegExp(NEEDLE));
  assert.match(text, /Hello\nThe quick/);
});

for (const name of ["sample.pdf", "sample.docx", "sample.odt", "sample.rtf", "sample.epub", "sample.pptx"]) {
  test(`extractDocumentText extracts text from ${name}`, async () => {
    const text = await extractDocumentText(fixtureFile(name));
    assert.match(text.toLowerCase(), new RegExp(NEEDLE), text.slice(0, 120));
  });
}

test("extractDocumentText renders xlsx cells as tab-separated rows", async () => {
  const text = await extractDocumentText(fixtureFile("sample.xlsx"));
  assert.match(text, /quick brown fox\t12345\tjumps over the lazy dog/);
});

test("extractDocumentText renders ods cells as tab-separated rows", async () => {
  const text = await extractDocumentText(fixtureFile("sample.ods"));
  assert.match(text, /quick brown fox\t12345\tjumps over the lazy dog/);
});

test("extractDocumentText extracts every readable entry from a zip archive", async () => {
  const text = await extractDocumentText(fixtureFile("sample.zip"));
  assert.match(text.toLowerCase(), new RegExp(NEEDLE));
  assert.match(text, /\[src\/main\.rs\]/);
  assert.match(text, /\[docs\/report\.docx\]/);
  assert.match(text, /fn main/);
});
