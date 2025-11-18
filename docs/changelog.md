# Changelog

## 2025-02-??

- Enabled xAI MCP tooling support and refreshed the default model lists (OpenAI gpt-5.1/codex variants plus Grok 4.1).
- Fixed xAI MCP usage by stripping the unsupported `text.format` field when server-managed tools are active.
- Made the xAI Code Interpreter definition omit OpenAI-only container arguments to avoid 400 errors.
- Automatically disable the OpenAI image generation tool when Codex models are selected to prevent unsupported calls.
- Added streaming runtime + event processor modules with dedicated reasoning timelines, tool status updates, and automatic image capture.
- Introduced xAI Grok provider support alongside OpenAI and LM Studio, including provider-managed web/X search tooling.
- Enabled provider built-ins for Code Interpreter, image generation, and file search with refreshed tool catalog defaults.
- Expanded documentation for services, streaming, architecture, and tool calling to reflect the new pipeline.
- Added unit tests for streaming helpers to cover image extraction and event processing utilities.
- Expanded automated coverage for export/MCP flows, location services, weather tool, TTS queue & playback, assistants files, and vector store APIs (see `docs/testing.md` for details).
- Split the settings panel into per-tab HTML partials and load them dynamically for easier maintenance.
- Added a response verbosity dropdown to the Model settings tab with persistence across sessions.
- Limited vector store activation to two stores at a time and updated settings messaging to match the new cap.
- Load assistant files/vector stores on demand via the Refresh controls, throttle vector store API calls with a three-second cooldown, and present friendlier names with a tighter list of 10 items.
- Hardened API Keys initialization so controls wait for their fragments before binding, fixing the first-load save failure without a manual refresh.
