import test from "node:test";
import assert from "node:assert/strict";

const { pickCloudFallback } = await import("../src/ts/init/serviceSelection.ts");

type ServiceConfigMap = Parameters<typeof pickCloudFallback>[0];

const withKeys = ({ openai = "", xai = "" } = {}): ServiceConfigMap => ({
  openai: { apiKey: openai },
  xai: { apiKey: xai },
  lmstudio: {},
  ollama: {},
}) as unknown as ServiceConfigMap;

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
