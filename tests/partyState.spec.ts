import test from "node:test";
import assert from "node:assert/strict";

const { defaultScenario, defaultPartyConfig } = await import("../src/ts/services/party/partyState.js");

test("defaultScenario starts empty with friendly/conversation framing", () => {
  assert.deepEqual(defaultScenario(), {
    topic: "",
    setting: "",
    mood: "friendly",
    conversationType: "conversation",
  });
});

test("defaultPartyConfig has no cast and a fresh default scenario", () => {
  const config = defaultPartyConfig();
  assert.deepEqual(config.characters, []);
  assert.deepEqual(config.scenario, defaultScenario());
});

test("defaultScenario returns a fresh object each call (no shared mutation)", () => {
  const a = defaultScenario();
  const b = defaultScenario();
  assert.notEqual(a, b);
  a.topic = "mutated";
  assert.equal(b.topic, "", "mutating one default must not affect another");
});

test("defaultPartyConfig does not share its scenario across instances", () => {
  const a = defaultPartyConfig();
  const b = defaultPartyConfig();
  assert.notEqual(a.scenario, b.scenario);
  a.characters.push({ id: "x", name: "X", persona: "", allowedTools: [] });
  assert.deepEqual(b.characters, [], "cast arrays must be independent");
});
