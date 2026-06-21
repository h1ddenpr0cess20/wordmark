import test from "node:test";
import assert from "node:assert/strict";

import {
  extractPromptFromImageCall,
  detectImageCallMode,
  determineSourceLabel,
} from "../src/ts/services/streaming/imageCallParsing.ts";

test("extractPromptFromImageCall returns empty for non-records", () => {
  assert.equal(extractPromptFromImageCall(null), "");
  assert.equal(extractPromptFromImageCall("nope"), "");
  assert.equal(extractPromptFromImageCall(undefined), "");
});

test("extractPromptFromImageCall prefers revised_prompt, then prompt", () => {
  assert.equal(
    extractPromptFromImageCall({ revised_prompt: "  a cat  ", prompt: "raw" }),
    "a cat",
  );
  assert.equal(extractPromptFromImageCall({ prompt: " just raw " }), "just raw");
});

test("extractPromptFromImageCall reads JSON-string and object arguments", () => {
  assert.equal(
    extractPromptFromImageCall({ arguments: JSON.stringify({ prompt: "from args" }) }),
    "from args",
  );
  assert.equal(extractPromptFromImageCall({ arguments: { input: "via input" } }), "via input");
  assert.equal(
    extractPromptFromImageCall({ arguments: { description: "via desc" } }),
    "via desc",
  );
});

test("extractPromptFromImageCall falls back to metadata when arguments are unusable", () => {
  assert.equal(
    extractPromptFromImageCall({ arguments: "{not json", metadata: { description: "meta desc" } }),
    "meta desc",
  );
  assert.equal(extractPromptFromImageCall({ metadata: { request: "meta req" } }), "meta req");
});

test("extractPromptFromImageCall returns empty when nothing matches", () => {
  assert.equal(extractPromptFromImageCall({ foo: "bar" }), "");
  assert.equal(extractPromptFromImageCall({ prompt: "   " }), "");
});

test("detectImageCallMode finds and normalises a mode from node, metadata, or arguments", () => {
  assert.equal(detectImageCallMode({ mode: "  EDIT  " }), "edit");
  assert.equal(detectImageCallMode({ metadata: { mode: "Variation" } }), "variation");
  assert.equal(detectImageCallMode({ arguments: { purpose: "EDIT" } }), "edit");
  assert.equal(detectImageCallMode({ arguments: JSON.stringify({ mode: "Generate" }) }), "generate");
});

test("detectImageCallMode returns empty when no mode is present or parseable", () => {
  assert.equal(detectImageCallMode({}), "");
  assert.equal(detectImageCallMode("x"), "");
  assert.equal(detectImageCallMode({ arguments: "{broken" }), "");
});

test("determineSourceLabel prefers mode over node type", () => {
  assert.equal(determineSourceLabel({ type: "image_generation_call" }, "edit"), "image_edit");
  assert.equal(determineSourceLabel({ type: "image_generation_call" }, "variation"), "image_variation");
});

test("determineSourceLabel falls back to node type then to generation", () => {
  assert.equal(determineSourceLabel({ type: "Image_Edit_Call" }, ""), "image_edit");
  assert.equal(determineSourceLabel({ type: "image_variation" }, ""), "image_variation");
  assert.equal(determineSourceLabel({ type: "image_generation" }, ""), "image_generation");
  assert.equal(determineSourceLabel(null, ""), "image_generation");
});
