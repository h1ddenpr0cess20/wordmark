import test from "node:test";
import assert from "node:assert/strict";

// pickCloudFallback is the pure decision behind the default-service auto-pick.
// It must move off a keyless cloud default to another cloud provider that has a
// key, before any local-service fallback happens.
const { pickCloudFallback } = await import("../src/js/init/serviceSelection.js");

const withKeys = ({ openai = "", xai = "" } = {}) => ({
  openai: { apiKey: openai },
  xai: { apiKey: xai },
  lmstudio: {},
  ollama: {},
});

test("switches openai -> xai when only xai has a key", () => {
  assert.equal(pickCloudFallback(withKeys({ xai: "xai-123" }), "openai"), "xai");
});

test("switches xai -> openai when only openai has a key", () => {
  assert.equal(pickCloudFallback(withKeys({ openai: "sk-123" }), "xai"), "openai");
});

test("returns null when the current cloud default already has a key", () => {
  assert.equal(pickCloudFallback(withKeys({ openai: "sk-123", xai: "xai-123" }), "openai"), null);
});

test("returns null when no cloud provider has a key (defer to local probe)", () => {
  assert.equal(pickCloudFallback(withKeys(), "openai"), null);
});

test("returns null when the default is a local service", () => {
  assert.equal(pickCloudFallback(withKeys({ xai: "xai-123" }), "lmstudio"), null);
});

test("treats whitespace-only keys as missing", () => {
  assert.equal(pickCloudFallback(withKeys({ openai: "   " }), "openai"), null);
});
