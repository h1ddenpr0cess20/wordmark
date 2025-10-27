# Memory Feature

Wordmark includes an optional, privacy‑friendly Memory feature that lets the assistant remember short, user‑provided details and use them to personalize future responses. All memories are stored locally in your browser and never sent to any server other than the AI provider you choose.

## Quick Start
- Open Settings → Memory tab
- Toggle “Enable Memory”
- Adjust the limit (default 25)
- Ask the assistant to “remember …” or add items manually
- Ask to “forget …” to remove an item by keyword

## What Gets Remembered
- Intended for short details (few words to one sentence)
- Manual entries are capped at 600 characters (about three long sentences)
- Older items are automatically dropped when the limit is exceeded (FIFO)

## How It’s Used
- When enabled, the current memory list is appended to the system prompt as a bullet list
- This gives the model direct visibility of relevant details without extra API calls

## Managing Memories
- Add automatically: ask the assistant to “remember …”
- Add manually: use the “Add Memory” box in Settings → Memory
- Forget: ask the assistant to “forget …” (case‑insensitive keyword match). The assistant will remove the first match and also return all matches it found.
- Delete an individual item from the list using the Delete button
- Clear all with the “Clear Memories” button

## UI Reference
- Enable toggle: `#memory-toggle`
- Limit input: `#memory-limit`
- Manual add input: `#memory-add-input` (max 600 chars)
- Manual add button: `#memory-add-button`
- List container: `#memory-list`

## Under the Hood
- Storage: `localStorage` (keys: `memoryEnabled`, `memoryLimit`, `memories`)
- System prompt integration: `src/js/services/api.js` appends the memory list when enabled
- Live updates: UI auto‑rerenders on memory changes
  - Events: `memories:changed` (add/remove/clear/trim), `memories:config` (enabled/limit)

### Public Functions (attached to `window`)
- `getMemoryConfig()`: `{ enabled, limit }`
- `setMemoryEnabled(enabled: boolean)`
- `setMemoryLimit(limit: number)`
- `getMemories(): string[]`
- `addMemory(text: string)`: trims to 600 chars, enforces limit
- `removeMemoryAt(index: number)`
- `clearAllMemories()`
- `getMemoriesForPrompt(): string` (bullet list or empty string)

### Function Calling Tools
- `remember({ memory: string })` → stores a short detail
- `forget({ keyword: string })` → case‑insensitive substring match; removes first match, returns all matches in response
- Memory tools are available even when the master Tool Calling toggle is off

## Privacy
- All data is stored locally in your browser
- Nothing is sent to any server except the AI provider you invoke
- Clear memories at any time from the Memory tab

## Troubleshooting
- “Function calling didn’t run when tools are off”
  - Memory loads the function‑calling handler on demand; ensure Memory is enabled
- “The list didn’t update after a tool call”
  - The UI listens for `memories:*` events; check the console for errors
- “Arrows crowd the digits in the limit box”
  - The numeric input is themed and spaced for major engines; report your browser/version if it still looks off

## File Map
- Storage: `src/js/utils/memoryStorage.js`
- UI: `src/js/components/memory.js`
- API/system prompt glue: `src/js/services/api.js`
- Tools: `src/js/services/memory.js` and injection in `src/js/components/tools.js`
- Styles: `src/css/components/ui/settings.css` (number input tweaks) and `src/css/components/ui/tool-settings.css` (list layout)

