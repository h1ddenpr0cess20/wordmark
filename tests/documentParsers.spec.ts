import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
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

test("extractDocumentText reads FlateDecode PDF streams with an EOL before endstream", async () => {
  const content = `BT /F1 12 Tf 72 720 Td (${NEEDLE}) Tj ET`;
  const compressed = deflateSync(Buffer.from(content, "latin1"));
  const pdf = Buffer.concat([
    Buffer.from(`%PDF-1.4\n4 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`, "latin1"),
    compressed,
    Buffer.from("\r\nendstream\nendobj\n%%EOF", "latin1"),
  ]);
  const text = await extractDocumentText(new File([new Uint8Array(pdf)], "compressed.pdf"));
  assert.match(text, new RegExp(NEEDLE));
});

/** Builds a single-entry ZIP whose entry is Stored (method 0), not Deflated. */
function storedZip(name: string, data: Buffer): Buffer {
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);

  const localRec = Buffer.concat([local, nameBuf, data]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(46 + nameBuf.length, 12);
  eocd.writeUInt32LE(localRec.length, 16);

  return Buffer.concat([localRec, central, nameBuf, eocd]);
}

test("extractDocumentText reads Stored (uncompressed) zip entries", async () => {
  const zip = storedZip("notes.txt", Buffer.from(NEEDLE));
  const text = await extractDocumentText(new File([new Uint8Array(zip)], "archive.zip"));
  assert.match(text, /\[notes\.txt\]/);
  assert.match(text, new RegExp(NEEDLE));
});

/** Builds a minimal PalmDOC-compressed MOBI whose text record has one trailing data entry. */
function mobiWithTrailingEntry(text: string): Buffer {
  const record0 = Buffer.alloc(216);
  record0.writeUInt16BE(2, 0);
  record0.writeUInt16BE(1, 8);
  record0.write("MOBI", 16);
  record0.writeUInt32BE(200, 20);
  record0.writeUInt32BE(65001, 28);
  record0.writeUInt16BE(0x0002, 16 + 0xc0);

  const record1 = Buffer.concat([
    Buffer.from(text, "latin1"),
    Buffer.from([0xaa, 0xbb, 0xcc, 0x84]),
  ]);

  const header = Buffer.alloc(78 + 2 * 8);
  header.write("BOOK", 60);
  header.write("MOBI", 64);
  header.writeUInt16BE(2, 76);
  header.writeUInt32BE(header.length, 78);
  header.writeUInt32BE(header.length + record0.length, 86);

  return Buffer.concat([header, record0, record1]);
}

test("extractDocumentText strips MOBI trailing data entries from text records", async () => {
  const mobi = mobiWithTrailingEntry(NEEDLE);
  const text = await extractDocumentText(new File([new Uint8Array(mobi)], "book.mobi"));
  assert.equal(text, NEEDLE);
});
