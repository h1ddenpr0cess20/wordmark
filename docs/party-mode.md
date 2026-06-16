# Party Mode

Party mode turns Wordmark into an autonomous, multi-character group chat. You define a cast of AI personas and a scenario, hit **Start Party**, and the characters converse with each other on their own. You can interject at any time — typing into the normal input bar drops you into the conversation without pausing it.

All characters share the single provider + model selected in **Settings → Model**. Only the per-character persona, name, optional temperature, and tool selection differ. Party mode runs on top of the same provider-agnostic `runTurn` pipeline as ordinary chat, so streaming, reasoning panels, tool calls, history, and persistence all behave as usual.

## Setting up a party

Party mode lives in **Settings → Personality**, as a third prompt mode alongside the system and personality prompts. Select **Party Mode** to reveal the setup form.

- **What the characters call you** — the name the cast uses when addressing your interjections (defaults to `Observer`).
- **Scenario** — shared framing for the conversation:
  - **Topic** — what they talk about (free text; blank means "anything").
  - **Setting** — where it takes place (free text; blank means "anywhere").
  - **Mood** — Friendly, Serious, Chaotic, Thoughtful, Playful, or Hostile.
  - **Conversation Type** — Conversation, Debate, Argument, Meeting, Brainstorming, Lighthearted, Joking, or Therapy.
- **Characters** — add at least two. Each row has:
  - **Name** — shown as a label on the character's message bubbles and used in the transcript. If a name is given but no persona, the name is used as the persona.
  - **Persona** — personality description injected as that character's system prompt.
  - **Temperature** (optional) — per-character sampling temperature.
  - **Tools** — per-character toggles drawn from the tools available to the selected provider. An empty selection means the character runs tool-free.

**Start Party** begins a fresh conversation and launches the loop. The setup form and the enable toggle are transient — nothing is persisted, and Party mode starts off on every load. The *active* party (its cast and scenario) is recorded in app state so a stopped party can be resumed.

## How the loop runs

The engine ([`services/party/partyEngine.ts`](../src/ts/services/party/partyEngine.ts)) drives the turn loop:

1. An initial speaker is picked at random and produces the opening turn.
2. Each subsequent turn streams into its own chat bubble, labeled with the speaker's name from the moment generation begins.
3. **Speaker selection**: with exactly two characters, turns simply alternate. With three or more, a lightweight non-streaming "decision" request asks the model to name the most likely next speaker (`<name>|<reason>` format, avoiding round-robin), falling back to a random non-repeating choice if the pick can't be parsed.
4. A short delay separates turns; a rolling window of the recent transcript (the last several lines) is embedded into each turn's prompt for context.

### Joining in

Type into the normal input bar while a party runs and your message is queued as an interjection — no pause required. Your bubble renders and is saved immediately, and the loop weaves the interjection into the prompt history at the next safe checkpoint. When your message is the most recent entry, the next speaker is instructed to address you directly by name before continuing.

### Control bar

A control bar appears in the chat area above the input while a party is active:

- **Pause** — requests a pause at the next safe checkpoint (never mid-stream); an already-generated turn is not discarded.
- **Resume** — continues a paused loop.
- **Stop** — ends the loop and aborts any in-flight request; a turn that has already produced tokens is still recorded rather than discarded. A stopped party leaves a **Resume party** control so you can pick the same cast and scenario back up.

Loading a saved party conversation re-selects the **Party Mode** prompt mode automatically, so its system prompt and setup form are restored on load.

## Modules

- [`services/party/partyTypes.ts`](../src/ts/services/party/partyTypes.ts) — `PartyCharacter`, `PartyScenario`, and `PartyConfig` types.
- [`services/party/partyPrompts.ts`](../src/ts/services/party/partyPrompts.ts) — prompt builders: per-character system prompt, first-turn and subsequent-turn user prompts, and the speaker-decision prompt. Adapted from the grokparty-web engine.
- [`services/party/partyState.ts`](../src/ts/services/party/partyState.ts) — default (empty) scenario and config for the setup form.
- [`services/party/partyEngine.ts`](../src/ts/services/party/partyEngine.ts) — the `partyEngine` singleton: turn loop, speaker selection, interjection handling, pause/resume/stop, and the control bar.
- [`components/party/partyTab.ts`](../src/ts/components/party/partyTab.ts) — the Settings → Personality "Party Mode" tab UI.
- `src/css/components/features/party/party.css` — control bar, name labels, and setup-form styling.

Tests live in [`tests/partyPrompts.spec.ts`](../tests/partyPrompts.spec.ts), [`tests/partyState.spec.ts`](../tests/partyState.spec.ts), and [`tests/partyEngine.spec.ts`](../tests/partyEngine.spec.ts) — the last covering engine control flow (restart-after-stop, pause mid-turn, and aborted-but-already-generated turns) with the DOM/network dependencies faked via module mocks.
