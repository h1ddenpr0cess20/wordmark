import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canAttachDocument,
  isModelViewableImage,
  isSupportedFileType,
  toUploadableFile,
} from "../src/ts/services/fileSupport.ts";

function fakeFile(name: string, type = ""): File {
  return new File(["contents"], name, { type });
}

test("isSupportedFileType tracks the File Search native set", () => {
  assert.equal(isSupportedFileType("notes.md"), true);
  assert.equal(isSupportedFileType("Program.cs"), true);
  assert.equal(isSupportedFileType("build.sh"), true);
  assert.equal(isSupportedFileType("REPORT.PDF"), true);
  // Formats a vector store rejects during processing.
  assert.equal(isSupportedFileType("data.csv"), false);
  assert.equal(isSupportedFileType("book.xlsx"), false);
  assert.equal(isSupportedFileType("bundle.zip"), false);
  assert.equal(isSupportedFileType("photo.png"), false);
});

test("isSupportedFileType reports no extension for dotfiles and bare names", () => {
  assert.equal(isSupportedFileType("Makefile"), false);
  assert.equal(isSupportedFileType(".gitignore"), false);
});

test("canAttachDocument accepts code files on direct-upload providers", () => {
  for (const service of ["openai", "xai"]) {
    assert.equal(canAttachDocument("terrain.wgsl", service), true, service);
    assert.equal(canAttachDocument("config.toml", service), true, service);
    assert.equal(canAttachDocument("Makefile", service), true, service);
    assert.equal(canAttachDocument(".gitignore", service), true, service);
    assert.equal(canAttachDocument("report.pdf", service), true, service);
    assert.equal(canAttachDocument("clip.mp4", service), false, service);
  }
});

test("canAttachDocument accepts what a local provider can read", () => {
  assert.equal(canAttachDocument("terrain.wgsl", "ollama"), true);
  assert.equal(canAttachDocument("notes.epub", "lmstudio"), true);
  assert.equal(canAttachDocument("app.dll", "ollama"), false);
});

test("canAttachDocument takes textual files a vector store can index as text", () => {
  assert.equal(canAttachDocument("terrain.wgsl", "vectorstore-provider"), true);
  assert.equal(canAttachDocument("notes.md", "vectorstore-provider"), true);
  // No parser on the vector store side, and a rename would not help.
  assert.equal(canAttachDocument("notes.epub", "vectorstore-provider"), false);
  assert.equal(canAttachDocument("bundle.zip", "vectorstore-provider"), false);
});

test("toUploadableFile renames textual files the Files API would refuse", () => {
  const shader = toUploadableFile(fakeFile("terrain.wgsl"), "openai");
  assert.equal(shader.name, "terrain.wgsl.txt");
  assert.equal(shader.type, "text/plain");

  assert.equal(toUploadableFile(fakeFile("Makefile"), "openai").name, "Makefile.txt");
  assert.equal(toUploadableFile(fakeFile(".gitignore"), "xai").name, ".gitignore.txt");
});

test("toUploadableFile leaves natively understood files alone", () => {
  assert.equal(toUploadableFile(fakeFile("notes.md"), "openai").name, "notes.md");
  assert.equal(toUploadableFile(fakeFile("report.pdf"), "openai").name, "report.pdf");
  // Tabular input is native to a direct upload but not to a vector store.
  assert.equal(toUploadableFile(fakeFile("rows.csv"), "openai").name, "rows.csv");
  assert.equal(toUploadableFile(fakeFile("rows.csv"), "vectorstore-provider").name, "rows.csv.txt");
});

test("toUploadableFile leaves binaries untouched", () => {
  assert.equal(toUploadableFile(fakeFile("photo.png"), "openai").name, "photo.png");
  assert.equal(toUploadableFile(fakeFile("bundle.zip"), "openai").name, "bundle.zip");
});

test("isModelViewableImage keeps SVG out of the image path", () => {
  assert.equal(isModelViewableImage(fakeFile("photo.png", "image/png")), true);
  assert.equal(isModelViewableImage(fakeFile("photo.jpg", "image/jpeg")), true);
  assert.equal(isModelViewableImage(fakeFile("icon.svg", "image/svg+xml")), false);
  assert.equal(isModelViewableImage(fakeFile("scan.tiff", "image/tiff")), false);
  assert.equal(isModelViewableImage(fakeFile("notes.md", "text/markdown")), false);
});

test("isModelViewableImage falls back to the extension when the browser gives no type", () => {
  assert.equal(isModelViewableImage(fakeFile("photo.PNG")), true);
  assert.equal(isModelViewableImage(fakeFile("icon.svg")), false);
});
