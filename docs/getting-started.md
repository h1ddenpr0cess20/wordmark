# Getting Started

This app runs entirely in the browser. There is no server backend; configuration and keys live in browser storage.

Quick Start

- Open `index.html` directly in your browser, or serve via HTTPS (recommended for some APIs and TTS).
- Set API keys in Settings → API Keys.
- Optionally enable Tool Calling in Settings → Tools; built-in helpers do not require extra keys.

Serve Over HTTPS

- Node: `http-server -S -C cert.pem -K key.pem -p 8000`
- Python (3.10+ with SSL args): `python -m http.server 8000 --bind 127.0.0.1 --directory . --ssl-certfile cert.pem --ssl-keyfile key.pem`
- Access at `https://localhost:8000` (accept the self-signed cert warning).

Android APK

- `src/assets/apk/wordmark.apk` is a WebView wrapper that runs the web application. It is provided for convenience if you want a native-like install.

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
