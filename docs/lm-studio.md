# LM Studio with Wordmark

Use LM Studio’s local OpenAI‑compatible server with Wordmark to run models on your machine.

## Prerequisites
- LM Studio installed: https://lmstudio.ai/download
- A model downloaded in LM Studio and (optionally) loaded
- Local server enabled in LM Studio (OpenAI‑compatible API)
- Default API: `http://localhost:1234` (OpenAI‑compatible at `http://localhost:1234/v1`)

## Quick Start
1. Open LM Studio and enable the Local Server (OpenAI‑compatible API).
2. Download and load a model in LM Studio’s UI.
3. In Wordmark, open Settings → API Keys → LM Studio.
4. Set Server URL to `http://localhost:1234` and click “Save LM Studio URL”.
5. Click “Refresh Models” to populate the model dropdown.
6. Select your model and start chatting.

Notes
- LM Studio’s local server typically does not require an API key.
- Tool calling requires models that support tool/function calling.

## HTTPS (Optional but Recommended)
To access LM Studio over HTTPS, create a local SSL proxy:

```bash
local-ssl-proxy --hostname <your-hostname> --source 1235 --target 1234 --key key.pem --cert cert.pem
```

Then use `https://<your-hostname>:1235` as the Server URL in Wordmark.

## Network Access
- To access from other devices on your LAN, expose LM Studio per their documentation.
- Update the Server URL in Wordmark to your machine’s LAN IP or hostname.

## How Wordmark Integrates
- Base URL default: `http://localhost:1234/v1`
- Model list fetched from: `<baseUrl>/models` (expects `{ data: [ { id: 'model-id', ... }, ... ] }`)
- On success, Wordmark updates the model dropdown automatically.

## Troubleshooting
- Models don’t appear:
  - Verify the Local Server is enabled in LM Studio (port 1234 by default).
  - Ensure the Wordmark URL matches your host and port and includes the correct protocol.
  - Confirm a model is downloaded/available in LM Studio.
- Tool calls don’t work:
  - Use a model with tool/function calling support.
  - Some models may not support tools even if they run locally.
- HTTPS issues:
  - Check the proxy is running and certificate/key paths are correct.
  - Trust the self‑signed certificate in your browser if prompted.

