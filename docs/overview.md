# Overview

What It Is

- Wordmark is a client-side AI assistant with OpenAI, xAI Grok, and LM Studio support, optional tool calling, TTS, themes, and local-first persistence.
- Everything runs in the browser. All data persists locally (IndexedDB/localStorage). Requests are sent only to the providers you configure.

Key Features

- Provider flexibility: hosted OpenAI or xAI Responses APIs, plus local LM Studio servers
- Tool calling framework with built-in weather, provider web + X search, Code Interpreter, optional image generation/file search, plus your own MCP servers
- Streaming responses with per-turn reasoning timelines and tool progress
- Image upload and gallery management
- Conversation history, image gallery, and TTS with local audio cache
- Themes and responsive UI
 - Header shortcuts and indicators:
   - Click the logo (About), model name (Model), or personality line (Personality) to open those Settings tabs.
   - Feature badges beneath the prompt show Location/Memory/Tools status; tap the dot to toggle, click the label to open settings.
   - Hover the model name to see a provider tooltip.

How It Starts

- `index.html` loads `src/config/config.js` then `src/js/main.js` (ES modules). The menu system loads panels, then calls `window.initialize()` to bootstrap.

Testing & Quality

- Automated specs live in `tests/*.spec.js` and can be run with `npm test` (see [docs/testing.md](./testing.md)).
- Focus areas include streaming, export/MCP tooling, TTS playback, location services, and vector store/file APIs.
