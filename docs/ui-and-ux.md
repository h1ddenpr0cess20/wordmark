# UI & UX

## App shell

Wordmark uses a two-column rail layout on desktop and a drawer layout on smaller screens.

- **Desktop rail** — a 264px left rail carries the Wordmark mark, **New chat**, the 20 most recently updated conversations, History, Gallery, Settings, and provider status. The active conversation is highlighted. Conversations are loaded or deleted directly from the rail; it reads the same IndexedDB conversation store as the History panel.
- **Chat column** — the main column contains a header, a centered reading column, messages, and the composer.
- **Responsive drawer** — below 860px the rail collapses into an overlay drawer opened with the header hamburger. Panels layer over the shell with a scrim.
- **Header** — shows the active model and personality/system-prompt summary. Clicking the model or prompt opens the corresponding Settings section. Feature badges expose Location, Memory, and Tools status and provide shortcuts into Settings.

## Panels & controls

- **Settings** — model/service selectors, parameters, system/personality prompt, API keys, Tools, TTS, Location, Storage, and other configuration. Settings uses a vertical navigation pane rather than a horizontal tab strip; on narrow phones the pane becomes compact while retaining all section labels.
- **History** — lists saved conversations and supports load, rename, delete, and bulk actions. The rail's recent-conversation list is a compact view of the same conversation data.
- **Gallery** — shows generated images and associated metadata and is lazy-loaded when opened.
- **Data** — import/export controls allow local application data to be backed up and restored. Imported data is merged into the existing local store rather than sent to a server.

## Composer

The composer is a card at the bottom of the chat column. The textarea is followed by an action row containing attachment controls, a keyboard hint, and Send.

### Prompt queuing

Pressing Enter while a response is still streaming queues the message instead of discarding it. Queued messages appear as numbered chips above the composer, each with a remove button, and are sent one at a time as each response finishes. A queued message carries its attachments with it. Stopping generation or starting a new conversation clears the queue.

With [Autonomous Work](autonomous-work.md) enabled, the assistant queues steps of its own alongside yours. Its chips carry a solid accent edge and a `step` badge; yours keep the dashed border. A message you type is always sent before any step the assistant scheduled, so a correction never waits behind the model's plan. The queue holds at most 25 entries and says so when it refuses more.

## Empty state

A new conversation with no messages shows the Wordmark mark, a reminder that conversation data remains on the local machine, and starter prompts that can be inserted into the composer.

## Messages

- Assistant replies are rendered as unbubbled prose beneath a metadata row containing the Wordmark mark, model information, and per-message actions.
- User turns remain right-aligned bubbles with an asymmetric radius.
- Markdown is parsed with the bundled `marked` library and sanitized with DOMPurify. YouTube iframes use a constrained allowlist.
- Syntax highlighting uses the bundled `highlight.js` library with copy buttons for code blocks.
- Reasoning is separated from the main response. Supported provider markers include `<think>...</think>` and `<|begin_of_thought|>/.../solution`; reasoning is rendered in a collapsible block.
- Generated images appear with the assistant response and are persisted to IndexedDB. Conversation history uses media placeholders rather than embedding image data directly in message text.
- Assistant messages have copy, branch, and (for the latest response) regenerate actions. Regenerations are stored as versions and can be selected with the version navigator; the active version persists with the conversation.
- Stopping a response keeps partial streamed content as an incomplete assistant turn. If stopped before any response content is produced, the placeholder is removed.

## Lightbox

The image viewer behaves as a dialog and supports zoom and pan. Zoom is available through the controls, mouse wheel, `+`, `-`, and `0`; double-click toggles zoom. When zoomed, the image can be dragged. `Home` and `End` jump to the first and last gallery item. Focus is moved into the dialog when it opens and returned when it closes, and background scrolling is locked while it is open.

## Uploads

- Image attachments are sent as `image_url` content parts to providers that support multimodal input.
- Documents and folders can be attached from the composer. See [Documents & Attachments](documents.md) for provider-specific handling and supported formats.

## TTS

- Toggle TTS from the header badge or Settings → TTS.
- OpenAI and xAI provide speech generation and provider-specific voice lists.
- Autoplay queues new assistant messages sequentially. Per-message controls provide play/pause, stop, and download.
- Audio is cached locally in IndexedDB, with old cached files periodically removed.

## Party Mode

- Settings → Personality provides a Party mode that builds a cast of AI personas and a scenario, then runs an autonomous multi-character conversation.
- Each turn has its own speaker-labeled message. The normal input remains available for interjections.
- Pause, Resume, and Stop controls appear above the composer while a party runs.
- See [Party Mode](party-mode.md) for the full reference.

## Autonomous Work

- Settings → Agent provides an Autonomous Work switch that turns each message into a goal the assistant keeps working toward across several turns.
- A control bar above the composer shows the run's status and turn budget, with Pause, Resume/Continue, and Stop.
- Queued steps appear as accent-edged chips in the composer's queue; typing takes priority over them.
- See [Autonomous Work](autonomous-work.md) for the full reference.

## Hidden shortcuts

Triple-click the About tab header to toggle Debug Mode. This enables verbose timestamped console logging and briefly shows a toast. Debug Mode is session-only; reload to reset it. `localStorage.enableLogging = 'true'` can keep logging enabled outside Debug Mode.

## Mobile

Mobile keyboard and viewport handling is wired through `src/ts/utils/mobileHandling.ts`. The mobile layout uses dynamic viewport sizing and adapts the rail into the navigation drawer below the desktop breakpoint. Touch and orientation handling are enabled during startup.

## Implementation pointers

- `src/ts/components/rail.ts` — rail and recent-conversation navigation
- `src/ts/components/messages.ts` — message rendering
- `src/ts/components/messageActions.ts` — message actions and versions
- `src/ts/components/gallery/gallery.ts` and `src/ts/components/gallery/galleryItem.ts` — gallery/lightbox behavior
- `src/ts/services/streaming/` — streaming message lifecycle
- `src/ts/services/history/` — conversation history state, persistence, and rendering
- `src/ts/components/settings.ts` — settings UI and header information
- `src/ts/services/dataImport.ts` and `src/ts/components/dataImportControls.ts` — local data import/export
- `src/ts/utils/storage/` — IndexedDB persistence
