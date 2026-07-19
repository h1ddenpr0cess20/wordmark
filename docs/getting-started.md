# Getting Started

This app runs entirely in the browser. There is no server backend; configuration and keys live in browser storage. It is built with [Vite](https://vite.dev), so it must be served by the dev server or built first — opening `index.html` from the filesystem no longer works.

Quick Start

```bash
npm install
npm run dev          # dev server on http://localhost:3000 (opens automatically)
```

- Set API keys in Settings → API Keys.
- Optionally enable Tool Calling in Settings → Tools; built-in helpers do not require extra keys.

Serve Over HTTPS

- `npm run dev:https` — runs the Vite dev server over HTTPS on your local network, generating self-signed certs on first use (recommended for APIs, TTS, and geolocation, which require a secure context).
- Accept the self-signed cert warning on first load.

Production Build

- `npm run build` — outputs a static, hashed bundle to `dist/`.
- `npm run preview` — serves the built `dist/` on port 8080, reachable from other devices on your network (`npm start` builds and serves in one step).
- Deploy the contents of `dist/` to any static host (the project deploys to Vercel).

Install as an App

- There is no native Android app. On Android, open the hosted app (`https://wordmark-chatbot.vercel.app/`, or your own deployment) in Chrome, then use the menu's **Install app** (or **Add to Home screen**) option — it launches full-screen from the home screen like a native app, with nothing extra to build or sideload.
- Desktop Chrome/Edge offer the same **Install** option from the address bar. For a packaged desktop build instead, see [Electron App](electron.md).

API Keys (where to put them)

- Open Settings (gear button), then the API Keys tab.
- Main AI providers wired into Wordmark:
  - OpenAI and xAI (hosted) plus LM Studio and Ollama (local OpenAI-compatible servers).
- Tool toggles live under Settings → Tools. The built-in weather helper relies on Open-Meteo (no key); OpenAI web search uses your primary provider key. MCP servers manage credentials on their side.

Local Models

- LM Studio: configure the base URL in Settings → API Keys (LM Studio). Models are fetched dynamically; the UI updates the model dropdown when the fetch completes.
- Ollama: ensure the server is running (default `http://localhost:11434`). Models are fetched dynamically from the Ollama API; the UI updates after the fetch completes.

Notes

- The app streams responses using the provider’s streaming API and renders tokens incrementally.
- All data (conversations, images, audio) is stored in IndexedDB; no data is sent anywhere except directly to providers you configure.
