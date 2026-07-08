import test from "node:test";
import assert from "node:assert/strict";

const {
  DEFAULT_USER_NAME,
  buildCharacterSystemPrompt,
  appendPartyDocumentContext,
  buildFirstTurnPrompt,
  buildTurnPrompt,
  buildDecisionPrompt,
  findAddressedParticipant,
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

test("buildCharacterSystemPrompt uses the name as the persona when only a name is given", () => {
  const prompt = buildCharacterSystemPrompt(character({ name: "Bob", persona: "" }));
  assert.match(prompt, /Assume the personality of Bob\./);
});

test("buildCharacterSystemPrompt omits the tool block when the character has no tools", () => {
  const prompt = buildCharacterSystemPrompt(character());
  assert.doesNotMatch(prompt, /You have access to these tools/);
  assert.doesNotMatch(prompt, /search the web/);
});

test("buildCharacterSystemPrompt lists the character's tools and nudges web search", () => {
  const prompt = buildCharacterSystemPrompt(character(), [
    { key: "builtin:web_search", displayName: "Web Search", description: "find fresh info" },
    { key: "builtin:open_meteo_forecast", displayName: "Weather Forecast" },
  ]);
  assert.match(prompt, /You have access to these tools and should use them/);
  assert.match(prompt, /Web Search — find fresh info/);
  assert.match(prompt, /Weather Forecast/);
  assert.match(prompt, /search the web before answering/);
});

test("buildCharacterSystemPrompt only nudges web search when web search is present", () => {
  const prompt = buildCharacterSystemPrompt(character(), [
    { key: "builtin:open_meteo_forecast", displayName: "Weather Forecast" },
  ]);
  assert.match(prompt, /You have access to these tools/);
  assert.doesNotMatch(prompt, /search the web before answering/);
});

test("appendPartyDocumentContext returns the prompt unchanged when there are no documents", () => {
  const base = buildCharacterSystemPrompt(character());
  assert.equal(appendPartyDocumentContext(base, []), base);
});

test("appendPartyDocumentContext appends every document's name and text", () => {
  const base = buildCharacterSystemPrompt(character());
  const prompt = appendPartyDocumentContext(base, [
    { name: "notes.txt", text: "meet at noon" },
    { name: "budget.csv", text: "rent,1200" },
  ]);
  assert.ok(prompt.startsWith(base));
  assert.match(prompt, /The observer has shared the following document\(s\)/);
  assert.match(prompt, /--- notes\.txt ---\nmeet at noon/);
  assert.match(prompt, /--- budget\.csv ---\nrent,1200/);
});

test("buildDecisionPrompt tells the model to favor a directly addressed participant", () => {
  const prompt = buildDecisionPrompt(scenario(), [character({ name: "Ada" }), character({ id: "b", name: "Babbage" })], []);
  assert.match(prompt, /directly addresses a participant by name/);
});

test("findAddressedParticipant returns the sole named participant", () => {
  assert.equal(findAddressedParticipant("Ada, what do you think?", ["Ada", "Babbage", "Lovelace"]), "Ada");
});

test("findAddressedParticipant matches on whole words and ignores case", () => {
  assert.equal(findAddressedParticipant("what say you, BABBAGE?", ["Ada", "Babbage"]), "Babbage");
  assert.equal(findAddressedParticipant("adamant about this", ["Ada", "Babbage"]), null);
});

test("findAddressedParticipant returns null when no one, or more than one, is named", () => {
  assert.equal(findAddressedParticipant("what do you all think?", ["Ada", "Babbage"]), null);
  assert.equal(findAddressedParticipant("Ada and Babbage, weigh in", ["Ada", "Babbage"]), null);
});

test("findAddressedParticipant can exclude the current speaker", () => {
  assert.equal(findAddressedParticipant("Ada makes a good point", ["Ada", "Babbage"], "Ada"), null);
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

test("buildFirstTurnPrompt falls back only for an empty topic and setting", () => {
  const cast = [character({ id: "a", name: "Ada" }), character({ id: "b", name: "Babbage" })];
  const prompt = buildFirstTurnPrompt(cast[0], cast, scenario({ topic: "", setting: "" }));
  assert.match(prompt, /Start a debate about anything with Babbage\./);
  assert.match(prompt, /The setting is anywhere\./);
  assert.match(prompt, /The mood is playful\./);
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
  const history = ["Ada: hello", "Guest: what about quantum?"];
  const prompt = buildTurnPrompt(scenario(), history, "Guest");
  assert.match(prompt, /The latest message is from Guest—address them directly using the name "Guest" and answer their message before continuing the broader discussion\./);
});

test("buildTurnPrompt omits the address-the-user instruction for a normal AI turn", () => {
  const history = ["Guest: what about quantum?", "Ada: great question"];
  const prompt = buildTurnPrompt(scenario(), history, "Guest");
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
    buildTurnPrompt(scenario(), history, "Guest"),
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
