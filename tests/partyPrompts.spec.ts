import test from "node:test";
import assert from "node:assert/strict";

const {
  DEFAULT_USER_NAME,
  buildCharacterSystemPrompt,
  buildFirstTurnPrompt,
  buildTurnPrompt,
  buildDecisionPrompt,
} = await import("../src/ts/services/party/partyPrompts.js");

type Character = Parameters<typeof buildCharacterSystemPrompt>[0];
type Scenario = Parameters<typeof buildFirstTurnPrompt>[2];

const character = (over: Partial<Character> = {}): Character => ({
  id: over.id ?? "c1",
  name: over.name ?? "Ada",
  persona: over.persona ?? "a witty mathematician",
  allowedTools: over.allowedTools ?? [],
  ...over,
});

const scenario = (over: Partial<Scenario> = {}): Scenario => ({
  topic: over.topic ?? "the future of computing",
  setting: over.setting ?? "a Victorian parlor",
  mood: over.mood ?? "playful",
  conversationType: over.conversationType ?? "debate",
});

test("buildCharacterSystemPrompt puts the model fully in character using the persona", () => {
  const prompt = buildCharacterSystemPrompt(character({ persona: "a gruff sea captain" }));
  assert.match(prompt, /Assume the personality of a gruff sea captain\./);
  assert.match(prompt, /never break character/);
  assert.match(prompt, /Do not prefix responses with your name\./);
});

test("buildCharacterSystemPrompt falls back to the name when persona is empty", () => {
  const prompt = buildCharacterSystemPrompt(character({ name: "Bjorn", persona: "" }));
  assert.match(prompt, /Assume the personality of Bjorn\./);
});

test("buildCharacterSystemPrompt treats a whitespace-only persona as empty and uses the name", () => {
  const prompt = buildCharacterSystemPrompt(character({ name: "Bob", persona: "   " }));
  assert.match(prompt, /Assume the personality of Bob\./);
  assert.doesNotMatch(prompt, /personality of {2,}\./, "no blank persona should leak through");
});

test("buildFirstTurnPrompt names the other participants and embeds the scenario", () => {
  const cast = [
    character({ id: "a", name: "Ada" }),
    character({ id: "b", name: "Babbage" }),
    character({ id: "c", name: "Lovelace" }),
  ];
  const prompt = buildFirstTurnPrompt(cast[0], cast, scenario());
  assert.match(prompt, /Start a debate about the future of computing with Babbage, Lovelace\./);
  assert.match(prompt, /The setting is a Victorian parlor\./);
  assert.match(prompt, /The mood is playful\./);
  assert.doesNotMatch(prompt, /Ada/, "the speaker should not be listed among the others");
});

test("buildFirstTurnPrompt substitutes sensible defaults for empty scenario fields", () => {
  const speaker = character({ id: "a", name: "Solo" });
  const prompt = buildFirstTurnPrompt(speaker, [speaker], {
    topic: "",
    setting: "",
    mood: "",
    conversationType: "",
  });
  assert.match(prompt, /Start a conversation about anything with the others\./);
  assert.match(prompt, /The setting is anywhere\./);
  assert.match(prompt, /The mood is casual\./);
});

test("buildTurnPrompt embeds only the last six history lines", () => {
  const history = Array.from({ length: 9 }, (_, i) => `Speaker${i}: line ${i}`);
  const prompt = buildTurnPrompt(scenario(), history, DEFAULT_USER_NAME);
  assert.match(prompt, /Here are the latest messages:/);
  assert.doesNotMatch(prompt, /line 2/, "older lines beyond the window are dropped");
  assert.match(prompt, /line 3/);
  assert.match(prompt, /line 8/);
});

test("buildTurnPrompt tells the speaker to address the user when they interjected last", () => {
  const history = ["Ada: hello", "Dustin: what about quantum?"];
  const prompt = buildTurnPrompt(scenario(), history, "Dustin");
  assert.match(prompt, /The latest message is from Dustin—address them directly/);
});

test("buildTurnPrompt omits the address-the-user instruction for a normal AI turn", () => {
  const history = ["Dustin: what about quantum?", "Ada: great question"];
  const prompt = buildTurnPrompt(scenario(), history, "Dustin");
  assert.doesNotMatch(prompt, /address them directly/);
  assert.match(prompt, /Stay focused on the topic and respond in character\./);
});

test("buildTurnPrompt keys interjection detection off the resolved user name, not a literal", () => {
  const history = ["Observer: ping"];
  assert.match(
    buildTurnPrompt(scenario(), history, "Observer"),
    /The latest message is from Observer/,
  );
  assert.doesNotMatch(
    buildTurnPrompt(scenario(), history, "Dustin"),
    /address them directly/,
    "a different user name must not match the Observer-prefixed line",
  );
});

test("buildTurnPrompt produces no history section when there is no history", () => {
  const prompt = buildTurnPrompt(scenario(), [], DEFAULT_USER_NAME);
  assert.doesNotMatch(prompt, /Here are the latest messages:/);
});

test("buildDecisionPrompt lists participants and requests the name|reason format", () => {
  const cast = [character({ id: "a", name: "Ada" }), character({ id: "b", name: "Babbage" })];
  const prompt = buildDecisionPrompt(scenario(), cast, ["Ada: hi", "Babbage: hey"]);
  assert.match(prompt, /Format: <name>\|<reason>/);
  assert.match(prompt, /Participants: Ada, Babbage/);
  assert.match(prompt, /History:\nAda: hi\nBabbage: hey/);
});
