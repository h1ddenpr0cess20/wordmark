  # Wordmark

  <div align="center">

  ![Wordmark Logo](src/assets/img/logo.svg)

  **An open source AI assistant platform**

  [![Version](https://img.shields.io/badge/version-v1.1.0-blue.svg)](https://github.com/h1ddenpr0cess20/Wordmark)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
  [![JavaScript](https://img.shields.io/badge/javascript-ES6+-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

  <!-- Project and repository status badges -->
  [![Stars](https://img.shields.io/github/stars/h1ddenpr0cess20/Wordmark.svg?logo=github)](https://github.com/h1ddenpr0cess20/Wordmark/stargazers)
  [![Issues](https://img.shields.io/github/issues/h1ddenpr0cess20/Wordmark.svg)](https://github.com/h1ddenpr0cess20/Wordmark/issues)
  [![PRs](https://img.shields.io/github/issues-pr/h1ddenpr0cess20/Wordmark.svg)](https://github.com/h1ddenpr0cess20/Wordmark/pulls)
  [![Last Commit](https://img.shields.io/github/last-commit/h1ddenpr0cess20/Wordmark.svg)](https://github.com/h1ddenpr0cess20/Wordmark/commits)

  </div>

  ## Overview

  Wordmark is a client‑side AI chat for OpenAI/xAI Responses APIs and local LM Studio or Ollama servers. It supports tool/function calling, TTS, themes, and fully local storage — no backend required.

  Start with the guides: [Getting Started](docs/getting-started.md) · [Overview](docs/overview.md) · [Services & Models](docs/services.md) · [Tool Calling](docs/tool-calling.md) · [Memory](docs/memory.md) · [Security](docs/security.md) · [Storage](docs/storage.md) · [UI & UX](docs/ui-and-ux.md) · [Docker](docs/docker.md) · [Troubleshooting](docs/troubleshooting.md) · [Changelog](docs/changelog.md)

  ## Features

  - Providers: OpenAI Responses (hosted), xAI Grok (Responses-compatible), and local LM Studio or Ollama servers — setup details in [Services & Models](docs/services.md)
  - Tool calling: built-in Open-Meteo weather helper, provider web + X search, Code Interpreter, optional image generation and file search, plus your own MCP servers — see [Tool Calling](docs/tool-calling.md)
  - Streaming & reasoning: dedicated reasoning panel, rich tool timelines, inline code previews, and automatic image capture — more in [Streaming](docs/streaming.md)
  - UX: themes, responsive layout, syntax highlighting, markdown, image gallery — design notes in [UI & UX](docs/ui-and-ux.md)
  - TTS: multiple voices, optional autoplay, simple controls
  - Local‑only storage: conversations, images, audio via IndexedDB; keys kept in the browser — details in [Storage](docs/storage.md)
  - Optional memory: local, FIFO‑limited memories appended to the system prompt — behavior and API in [Memory](docs/memory.md)

  ## Quick Start

  - Clone and open:
    ```bash
    git clone https://github.com/h1ddenpr0cess20/Wordmark.git
    cd Wordmark
    ```
    - Open `index.html` directly, or serve over HTTPS for APIs, TTS, and geolocation (see the [Getting Started guide](docs/getting-started.md)).
  - In Settings → API Keys, add your OpenAI/xAI keys and/or LM Studio URL (Ollama uses the local server default). Keys and URLs are stored locally.
  - Optional Android build: `src/assets/apk/wordmark.apk`

  Local models:
  - LM Studio: run the OpenAI‑compatible server and set the base URL in Settings — see the [LM Studio guide](docs/lm-studio.md)
  - Ollama: run the local server (default `http://localhost:11434`) and select Ollama in Settings → Model

  ## HTTPS and Docker

  - HTTPS: recommended for full functionality — quick steps in [Getting Started](docs/getting-started.md)
  - Docker/Compose: full instructions and SSL options in the [Docker guide](docs/docker.md)

  Common Docker commands:
  - Build image:
    ```bash
    docker build -t wordmark:latest .
    ```
  - Run (HTTP on port 8080 → 80 in container):
    ```bash
    docker run --rm -p 8080:80 wordmark:latest
    ```

  ## Architecture & Development

  - High‑level architecture: [Architecture](docs/architecture.md)
  - Storage, security, and data handling: [Security](docs/security.md) and [Storage](docs/storage.md)
  - UI/UX notes and layout: [UI & UX](docs/ui-and-ux.md)
  - Developer guide and contribution notes: [Development](docs/development.md) and [CONTRIBUTING](CONTRIBUTING.md)

  Common tasks:
  - Add tools: extend the catalog in `src/js/services/api/toolManager.js` and implement handlers (see `src/js/services/weather.js`) — details in [Tool Calling](docs/tool-calling.md)
  - Adjust models/providers: edit `src/config/config.js` (OpenAI defaults, LM Studio/Ollama connectors) — see [Services & Models](docs/services.md)
  - Themes and styling: `src/css/themes/**`, `src/css/components/**`

  ## Usage

  - Choose provider/model in Settings, type a message, send, and stream results.
  - Enable Tools in Settings to allow function calls for weather, OpenAI-managed web search, and any MCP servers you connect — details in [Tool Calling](docs/tool-calling.md)
  - Manage conversations, images, and audio locally via History and Gallery.

  ## Policies & Notes

  - Privacy/Security: client‑side only; no tracking — see [Security](docs/security.md)
  - Troubleshooting: common issues and tips — see [Troubleshooting](docs/troubleshooting.md)
  - Changelog: user‑facing changes — see [Changelog](docs/changelog.md)
  - Not a Companion: philosophy and boundaries — read [Not a Companion](docs/not-a-companion.md)

  ## License

  MIT — see LICENSE

  ## Support

  If you find this project helpful, consider supporting its development.

  - Bitcoin (BTC): `34rgxUdtg3aM5Fm6Q3aMwT1qEuFYQmSzLd`
  - Bitcoin Cash (BCH): `13JUmyzZ3vnddCqiqwAvzHJaCmMcjVpJD1`
  - Ethereum (ETH): `0xE8ac85A7331F66e7795A64Ab51C8c5A5A85Ed761`

  ---

  <div align="center">
  <strong>© 2025 Dustin Whyte | Released under the MIT License</strong>
  </div>
