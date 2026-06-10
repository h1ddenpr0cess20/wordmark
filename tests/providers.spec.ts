import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isLocalService,
  isCloudService,
  serviceSupportsReasoning,
  supportsResponseIncludeFields,
  usesServerManagedTools,
} from "../src/ts/services/providers.ts";

test("isLocalService is true only for local-server providers", () => {
  assert.equal(isLocalService("lmstudio"), true);
  assert.equal(isLocalService("ollama"), true);
  assert.equal(isLocalService("openai"), false);
  assert.equal(isLocalService("xai"), false);
  assert.equal(isLocalService("unknown"), false);
  assert.equal(isLocalService(null), false);
  assert.equal(isLocalService(undefined), false);
});

test("isCloudService is true only for hosted providers", () => {
  assert.equal(isCloudService("openai"), true);
  assert.equal(isCloudService("xai"), true);
  assert.equal(isCloudService("lmstudio"), false);
  assert.equal(isCloudService("ollama"), false);
  assert.equal(isCloudService("unknown"), false);
  assert.equal(isCloudService(null), false);
});

test("serviceSupportsReasoning is false only for xai", () => {
  assert.equal(serviceSupportsReasoning("openai"), true);
  assert.equal(serviceSupportsReasoning("lmstudio"), true);
  assert.equal(serviceSupportsReasoning("ollama"), true);
  assert.equal(serviceSupportsReasoning("xai"), false);
});

test("supportsResponseIncludeFields is true only for hosted non-xai (OpenAI)", () => {
  assert.equal(supportsResponseIncludeFields("openai"), true);
  assert.equal(supportsResponseIncludeFields("xai"), false);
  assert.equal(supportsResponseIncludeFields("lmstudio"), false);
  assert.equal(supportsResponseIncludeFields("ollama"), false);
});

test("usesServerManagedTools is true only for xai", () => {
  assert.equal(usesServerManagedTools("xai"), true);
  assert.equal(usesServerManagedTools("openai"), false);
  assert.equal(usesServerManagedTools("lmstudio"), false);
  assert.equal(usesServerManagedTools("ollama"), false);
});
