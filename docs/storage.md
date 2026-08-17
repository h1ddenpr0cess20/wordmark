# Storage

Wordmark stores application data locally in the browser. Conversation, image, and TTS data use IndexedDB; settings and selected runtime preferences use localStorage. No Wordmark backend is used for application storage.

## Conversations

- DB: `wordmark-conversations` v1, Store: `conversations`, keyPath: `id`
- Content: messages (role, content, optional reasoning, IDs/timestamps), response versions, image references, model/service, and system-prompt metadata
- Conversation persistence is implemented under `src/ts/services/history/` and the storage helpers under `src/ts/utils/storage/`
- The desktop rail's recent-conversation list and the History panel read the same persisted conversation data

## Images

- DB: `wordmark-images` v1, Store: `images`, keyPath: `filename`
- Content: base64 data or Blob plus tool, prompt, timestamp, and associated-message metadata
- Upload helpers provide Blob or data-URL representations for providers that require them

## TTS audio

- DB: `wordmark-audio` v1, Store: `tts-audio`
- Indexes: `messageId` and `timestamp`
- Content: raw audio data, original text, selected voice, and timestamps
- Cached audio is cleaned up so only the most recent files are retained

## Settings and runtime state

`localStorage` contains locally configured API keys, tool keys, location preferences, model-selection state, and service URLs for local providers. Transient conversation state and generated-media mappings live in memory while the app is running.

## Import and export

The Data controls provide a local backup and restore path for application data. Exported data is intended to be moved or backed up by the user; it is not uploaded to a Wordmark server.

Import restores supported local data into the current browser store. Existing data is merged rather than requiring the browser database to be discarded, so an import can be used to bring another Wordmark dataset into an existing installation. Imported records retain their persisted identifiers and metadata so conversation/image relationships can be reconstructed.

Because exports can contain conversations, generated media metadata, settings, or API credentials depending on what is selected, treat exported files as sensitive local data. Store them accordingly and do not share them publicly.

## Privacy

Wordmark has no server-side application database. Data stored here remains in the browser unless a provider API, an explicitly connected service, or the user-initiated export/import flow sends or moves it. Provider-specific handling of attached documents is described in [Documents & Attachments](documents.md); security considerations are covered in [Security](security.md).
