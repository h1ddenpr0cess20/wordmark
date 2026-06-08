# Wordmark

<div align="center">

![Wordmark Logo](src/assets/img/logo.svg)

**An open source AI assistant platform**

[![Version](https://img.shields.io/github/package-json/v/h1ddenpr0cess20/Wordmark?label=version&color=blue)](https://github.com/h1ddenpr0cess20/Wordmark)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![JavaScript](https://img.shields.io/badge/javascript-ES6+-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

<!-- Project and repository status badges -->
[![Stars](https://img.shields.io/github/stars/h1ddenpr0cess20/Wordmark.svg?logo=github)](https://github.com/h1ddenpr0cess20/Wordmark/stargazers)
[![Issues](https://img.shields.io/github/issues/h1ddenpr0cess20/Wordmark.svg)](https://github.com/h1ddenpr0cess20/Wordmark/issues)
[![PRs](https://img.shields.io/github/issues-pr/h1ddenpr0cess20/Wordmark.svg)](https://github.com/h1ddenpr0cess20/Wordmark/pulls)
[![Last Commit](https://img.shields.io/github/last-commit/h1ddenpr0cess20/Wordmark.svg)](https://github.com/h1ddenpr0cess20/Wordmark/commits)

</div>

## Overview

Wordmark is a client-side AI chat for OpenAI/xAI Responses APIs and local LM Studio or Ollama servers. It supports tool/function calling, TTS, themes, and fully local storage — no backend required.

**Docs:**
- [Getting Started](docs/getting-started.md)
- [Overview](docs/overview.md)
- [Services & Models](docs/services.md)
- [Tool Calling](docs/tool-calling.md)
- [Streaming](docs/streaming.md)
- [Memory](docs/memory.md)
- [Security](docs/security.md)
- [Storage](docs/storage.md)
- [UI & UX](docs/ui-and-ux.md)
- [Docker](docs/docker.md)
- [Troubleshooting](docs/troubleshooting.md)

## Features

- **Providers** — OpenAI Responses (hosted), xAI Grok (Responses-compatible), and local LM Studio or Ollama servers ([Services & Models](docs/services.md))
- **Tool calling** — built-in weather, provider web + X search, Code Interpreter, image generation, file search (OpenAI), direct file attachments (xAI), and custom MCP servers ([Tool Calling](docs/tool-calling.md))
- **Streaming & reasoning** — dedicated reasoning panel, rich tool timelines, inline code previews, automatic image capture ([Streaming](docs/streaming.md))
- **TTS** — OpenAI (13 voices) and xAI (5 voices) providers, optional autoplay, per-message controls, audio cached locally
- **UX** — themes, responsive layout, syntax highlighting, markdown, image gallery ([UI & UX](docs/ui-and-ux.md))
- **Local-only storage** — conversations, images, and audio via IndexedDB; keys stay in the browser ([Storage](docs/storage.md))
- **Memory** — local, FIFO-limited memories appended to the system prompt ([Memory](docs/memory.md))

## Quick Start

```bash
git clone https://github.com/h1ddenpr0cess20/Wordmark.git
cd Wordmark
npm install
npm run dev          # dev server on http://localhost:3000
# npm run dev:https  # HTTPS — needed for some APIs, TTS, and geolocation
```

Wordmark builds with [Vite](https://vite.dev). Use `npm run dev` for development or `npm run build` to produce a static bundle in `dist/` (serve it with `npm run preview`). Opening `index.html` straight from the filesystem no longer works — the app must be served by the dev server or built first. See [Getting Started](docs/getting-started.md).

1. In **Settings → API Keys**, add your OpenAI/xAI keys. Keys and URLs are stored locally.
2. Choose a provider and model in **Settings → Model**.
3. Type a message and send.

### Local Models

- **LM Studio** — run the server (default `http://localhost:1234`), set the base URL in Settings → API Keys, then select LM Studio in Settings → Model ([LM Studio guide](docs/lm-studio.md))
- **Ollama** — run the server (default `http://localhost:11434`), set the base URL in Settings → API Keys, then select Ollama in Settings → Model

> **Note:** Chrome may prompt you to allow local network access. This is only used to connect to local LM Studio/Ollama servers.

## HTTPS & Docker

HTTPS is recommended for full functionality — quick steps in [Getting Started](docs/getting-started.md). Full Docker/Compose instructions and SSL options in the [Docker guide](docs/docker.md).

```bash
# Pull from Docker Hub and run
docker run --rm -p 8080:80 h1ddenpr0cess20/wordmark:latest
```

Or build from source:

```bash
docker build -t wordmark:latest .
docker run --rm -p 8080:80 wordmark:latest
```

## Architecture & Development

- [Architecture](docs/architecture.md) — high-level structure
- [Security](docs/security.md) & [Storage](docs/storage.md) — data handling
- [UI & UX](docs/ui-and-ux.md) — layout and design
- [Development](docs/development.md) & [CONTRIBUTING](CONTRIBUTING.md) — developer guide

**Common tasks:**

- **Add tools** — extend the catalog in `src/js/services/api/toolManager.js` and implement handlers (see `src/js/services/weather.js`) — [Tool Calling](docs/tool-calling.md)
- **Adjust models/providers** — edit `src/config/config.js` — [Services & Models](docs/services.md)
- **Themes and styling** — `src/css/themes/**`, `src/css/components/**`

## Usage

- Enable **Tools** in Settings to allow function calls for weather, web search, file attachments, and any MCP servers you connect ([Tool Calling](docs/tool-calling.md))
- Manage conversations, images, and audio locally via **History** and **Gallery**
- Use **TTS** for spoken responses — configure provider and voice in Settings → TTS

## Policies & Notes

- **Privacy/Security** — client-side only; no tracking ([Security](docs/security.md))
- **Troubleshooting** — common issues and tips ([Troubleshooting](docs/troubleshooting.md))
- **Not a Companion** — philosophy and boundaries ([Not a Companion](docs/not-a-companion.md))

## License

MIT — see LICENSE

---

<div align="center">
<strong>&copy; 2025 Dustin Whyte | Released under the MIT License</strong>
</div>
