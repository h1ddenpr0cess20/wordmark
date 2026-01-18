# Ollama with Wordmark

Use Ollama’s local OpenAI‑compatible server with Wordmark to run models on your machine.

## Prerequisites
- Ollama installed: https://ollama.com
- At least one model pulled (for example, `ollama pull qwen3`)
- Ollama server running (default: `http://localhost:11434`, OpenAI‑compatible at `http://localhost:11434/v1`)

## Quick Start
1. Install Ollama and start the server if it is not already running.
2. Pull a model you want to use (for example, `ollama pull qwen3`).
3. In Wordmark, open Settings → API Keys → Ollama.
4. Set the base URL to `http://localhost:11434` and click “Save Ollama URL”.
5. Open Settings → Model and click “Refresh Local Models”.
6. Select your Ollama model and start chatting.

Notes
- Ollama’s local server does not require an API key.
- Tool calling depends on the model; not all Ollama models support tools.

## HTTPS (Optional but Recommended)
If you need HTTPS, place Ollama behind a local TLS proxy and use the proxy URL as the base URL in Wordmark.

## Network Access
- To access from other devices on your LAN, expose the Ollama server per their documentation.
- Update the base URL in Wordmark to your machine’s LAN IP or hostname.

## How Wordmark Integrates
- Base URL default: `http://localhost:11434/v1`
- Model list fetched from: `<baseUrl>/models` (falls back to `/api/tags`)
- On success, Wordmark updates the model dropdown automatically.

## Troubleshooting
- Models don’t appear:
  - Verify the Ollama server is running and reachable on port 11434.
  - Ensure the Wordmark URL matches your host and port and includes the correct protocol.
  - Confirm a model is pulled locally (`ollama list`).
- Tool calls don’t work:
  - Use a model with tool/function calling support.
  - Some models may not support tools even if they run locally.
