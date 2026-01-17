# Troubleshooting

No Models in Dropdown

- Ensure the selected service in Settings has models configured or fetched.
- For LM Studio or Ollama, wait for the model fetch to complete; the UI will update automatically via `uiHooks`.
- If a fetch fails, a status message appears below the relevant section. Verify the base URL and that the service is running.

Streaming Stalls or Stops

- The app reads streaming responses via `fetch` + `ReadableStream`. If the stream ends early, the UI will finalize what was received.
- Clicking the Send button while streaming toggles the stop sequence; wait a moment for cleanup.

Tool Calls Do Nothing

- Ensure Settings → Tools → “Enable Tool Calling” is on.
- Some tools require additional keys (e.g., RapidAPI, Google, OpenAI). Add them in the appropriate Settings tab.
- Max tool loop is 10; complex tasks may hit the loop cap (the app then asks the model to summarize).

Images Don’t Show

- Generated images are saved in IndexedDB and referenced by filename in history. If a thumbnail error occurs, the UI will insert a placeholder.
- Clearing storage resets image caches; re-generating will repopulate.

Location Not Available

- Location is optional and off by default. Enable in Settings and allow browser permission.
- The app uses BigDataCloud reverse-geocode; network issues will degrade to coordinates + timezone only.

Missing API Keys

- The app does not ship with keys. Add your own in Settings → API Keys (and Tools where applicable).
