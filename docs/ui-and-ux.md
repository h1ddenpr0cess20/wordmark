# UI & UX

Panels & Controls

- Header: shows current model and prompt info (from `components/settings.ts:updateHeaderInfo`).
  - Header shortcuts:
    - Click the logo to open Settings → About.
    - Click the model name to open Settings → Model.
    - Click the personality/prompt line to open Settings → Personality.
  - Provider tooltip:
    - Hover the model name to see whether you're using OpenAI, xAI, LM Studio, or Ollama.
  - Feature badges (under the prompt line):
    - Shows status for Location, Memory, and Tools.
    - Click the dot to quickly toggle a feature on/off.
    - Click the badge label to open the relevant Settings tab.
    - On mobile, badges are compact and wrap to fit; they remain tappable.
- Settings panel: model/service selectors, parameters, system/personality prompt, API keys, Tools, TTS, Location, etc.
- History panel: lists saved conversations, supports load/rename/delete; powered by IndexedDB (`services/history.ts`).
- Gallery panel: shows generated images and associated metadata; lazy-loaded on first open.

Hidden Shortcuts

- Triple‑click the About tab header to toggle Debug Mode. This enables verbose, timestamped console logging and briefly shows a toast indicator. It’s session‑only; reload to reset, or use `localStorage.enableLogging = 'true'` to keep logs visible when not in debug.

Messages

- Rendering: `components/messages.ts` (and streaming updates in `services/streaming.ts`).
- Markdown: parsed via the bundled `marked` library.
- Sanitization: DOMPurify; YouTube iframes allowed via a constrained allowlist.
- Syntax highlight: the bundled `highlight.js` library with copy buttons per-code block.
- Reasoning: Model “thinking” is separated from main text. It supports both `<think>...</think>` and `<|begin_of_thought|>/.../solution` marker styles. A collapsible “Reasoning” block is rendered above the main content.
- Images: When tools generate images, they are displayed as thumbnails above the answer and saved to IndexedDB. History keeps `[[IMAGE: filename]]` placeholders.
- Message actions (`components/messageActions.ts`): every message has a copy button. Assistant messages also get a **branch** button — forking the conversation into a new one up to that point — and the most recent assistant message gets a **regenerate** button. Regeneration is limited to the latest message; each regeneration is stored as an additional version and a `‹ 1 / N ›` navigator under the bubble cycles between them. The active version persists with the conversation.
- Stopping: pressing Stop mid-response keeps the partial assistant message (marked incomplete) rather than discarding the bubble; stopping before any text streams clears the placeholder.

Uploads

- Image attachments: The input bar includes an image upload button; images are passed as `image_url` parts to providers that support multimodal content.

TTS

- Toggle via the header TTS badge or in Settings → TTS. A provider selector lets you choose between OpenAI and xAI (Grok) for speech generation.
- **OpenAI**: 13 voices organized by gender (neutral: fable; male: ash, ballad, cedar, echo, onyx, verse; female: alloy, coral, marin, nova, sage, shimmer). Uses the `gpt-4o-mini-tts` model. Optional voice instructions let you customize speech style (e.g. "Speak cheerfully"); falls back to the active personality prompt if set.
- **xAI**: 26 voices — the original 5 (male: leo, rex, sal; female: ara, eve) plus the 21 flagship voices xAI shipped on 2026-07-06, sorted into the selector's gender groups: male (Altair, Atlas, Castor, Cosmo, Helios, Kepler, Naksh, Orion, Perseus, Rigel, Sirius, Zagan), female (Carina, Celeste, Iris, Luna, Ursa), and neutral (Helix, Lumen, Lux, Zenith). xAI's `/v1/tts/voices` endpoint does not report a gender for built-in voices, so these groupings are **inferred from the voice names and may not match how each voice actually sounds** — pick by ear. Uses the xAI TTS API at `api.x.ai/v1/tts` with automatic language detection. Voice instructions are not supported.
- Autoplay mode queues and plays new assistant messages sequentially. Per-message controls provide play/pause, stop, and download (WAV).
- Audio is cached in IndexedDB (last 15 files kept). The voice selector updates dynamically when switching providers.

Party Mode

- A third prompt mode under Settings → Personality: build a cast of AI personas and a scenario, then **Start Party** to launch an autonomous multi-character group chat. Each turn streams into its own bubble labeled with the speaker's name.
- Type into the normal input bar at any time to interject — no pause required; the cast addresses you by the configured name.
- A control bar above the input offers Pause / Resume / Stop while a party runs; a stopped party can be resumed with the same cast and scenario.
- See [docs/party-mode.md](./party-mode.md) for the full feature reference.

Mobile

- Mobile keyboard handling and layout helpers are provided in `utils/mobileHandling.ts` and wired by `init/ttsInitialization.ts`.
