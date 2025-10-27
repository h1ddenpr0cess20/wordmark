# UI & UX

Panels & Controls

- Header: shows current model and prompt info (from `components/settings.js:updateHeaderInfo`).
  - Header shortcuts:
    - Click the logo to open Settings → About.
    - Click the model name to open Settings → Model.
    - Click the personality/prompt line to open Settings → Personality.
  - Provider tooltip:
    - Hover the model name to see whether you're using OpenAI or LM Studio.
  - Feature badges (under the prompt line):
    - Shows status for Location, Memory, and Tools.
    - Click the dot to quickly toggle a feature on/off.
    - Click the badge label to open the relevant Settings tab.
    - On mobile, badges are compact and wrap to fit; they remain tappable.
- Settings panel: model/service selectors, parameters, system/personality prompt, API keys, Tools, TTS, Location, etc.
- History panel: lists saved conversations, supports load/rename/delete; powered by IndexedDB (`services/history.js`).
- Gallery panel: shows generated images and associated metadata; lazy-loaded on first open.

Hidden Shortcuts

- Triple‑click the About tab header to toggle Debug Mode. This enables verbose, timestamped console logging and briefly shows a toast indicator. It’s session‑only; reload to reset, or use `localStorage.enableLogging = 'true'` to keep logs visible when not in debug.

Messages

- Rendering: `components/messages.js` (and streaming updates in `services/streaming.js`).
- Markdown: parsed via `marked.min.js` when available, otherwise basic formatting is applied.
- Sanitization: DOMPurify; YouTube iframes allowed via a constrained allowlist.
- Syntax highlight: `highlight.min.js` with copy buttons per-code block.
- Reasoning: Model “thinking” is separated from main text. It supports both `<think>...</think>` and `<|begin_of_thought|>/.../solution` marker styles. A collapsible “Reasoning” block is rendered above the main content.
- Images: When tools generate images, they are displayed as thumbnails above the answer and saved to IndexedDB. History keeps `[[IMAGE: filename]]` placeholders.

Uploads

- Image attachments: The input bar includes an image upload button; images are passed as `image_url` parts to providers that support multimodal content.

TTS

- Toggle + settings in the Settings panel. Voices are categorized (neutral/male/female per current `tts.js`).
- When enabled, the app can autoplay newly generated assistant messages. Audio is cached in IndexedDB.

Mobile

- Mobile keyboard handling and layout helpers are provided in `utils/mobileHandling.js` and wired by `ttsInitialization.js`.
