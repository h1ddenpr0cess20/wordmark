# Storage

All app data is stored locally in the browser using IndexedDB. No server-side storage is used.

Conversations

- File: `src/js/utils/conversationStorage.js`
- DB: `wordmark-conversations` v1, Store: `conversations`, keyPath: `id`
- Content: messages array (role, content, optional reasoning, IDs/timestamps), images refs, model/service, system prompt meta
- Helpers: `initConversationDb`, `saveConversationToDb`, `loadConversationFromDb`, `getAllConversationsFromDb`, `deleteConversationFromDb`, `renameConversationInDb`

Images

- File: `src/js/utils/imageStorage.js`
- DB: `wordmark-images` v1, Store: `images`, keyPath: `filename`
- Content: base64 data or Blob, metadata (tool, prompt, timestamp, associatedMessageId)
- Helpers: `saveImageToDb`, `loadImageFromDb`, `deleteImageFromDb`, diagnostics utilities, and upload helpers:
  - `getImageBlobForUpload(imageId)` (for multipart APIs like OpenAI edits)
  - `getImageDataForUpload(imageId)` (data URL for APIs like Gemini)

TTS Audio

- File: `src/js/utils/audioStorage.js`
- DB: `wordmark-audio` v1, Store: `tts-audio`, indexes on `messageId` and `timestamp`
- Content: raw audio data (ArrayBuffer), original text, selected voice, timestamps
- Helpers: `saveAudioToDb`, `loadAudioForMessage`, `deleteAudioFromDb`, `cleanupOldAudio` (keeps last 15 by timestamp)

Runtime Storage

- Globals (in-memory): conversation arrays, generatedImages, per-message IDs
- localStorage: API keys, tool keys, location toggle & last location, model selection memo, and service URLs for local providers

