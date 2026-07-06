# Documents & Attachments

Wordmark can attach documents to a message so the model can answer questions about them. How a document is handled depends on the active provider — hosted providers use their native file features, while local providers process documents entirely in the browser.

Attach files with the upload button in the composer, by drag-and-drop, or by paste. You can attach individual files or a whole folder.

## Per-provider handling

| Provider | How documents are handled |
| --- | --- |
| **OpenAI** | Uploaded to a vector store and searched with the `file_search` tool. Requires the File Search tool to be enabled in Settings → Tools. |
| **xAI (Grok)** | Uploaded via `/v1/files` and referenced as `input_file` parts on the message. |
| **LM Studio / Ollama** | Extracted to text and searched **in the browser** via embeddings — nothing is uploaded anywhere. See [Local retrieval](#local-retrieval-lm-studio--ollama). |

The provider capability that selects the local path is `extractsDocumentsClientSide()` in `src/ts/services/providers.ts` (true for local servers).

## Supported formats

Extraction is **text-by-default**: any file that is not a known binary type is read as UTF-8 text, so code, config, and data files of any extension work without an allowlist (`.rs`, `.kt`, `.vue`, `.toml`, `Makefile`, `.eml`, and so on).

Known binary document formats have dedicated dependency-free parsers (`src/ts/services/parsers/`):

- **PDF** — text streams, FlateDecode, and `ASCII85Decode` filter chains
- **Word** — `.docx` and legacy `.doc`
- **Excel** — `.xlsx` and legacy `.xls`
- **PowerPoint** — `.pptx` and legacy `.ppt`
- **OpenDocument** — `.odt`, `.ods`, `.odp`, `.odg`
- **Ebooks** — `.epub`, `.mobi`, `.azw`, `.azw3`
- **Rich text** — `.rtf`
- **Archives** — `.zip` (extracts text from each supported file inside)

Genuine binaries (images, audio/video, executables, fonts) are rejected rather than dumped as garbage — a binary-extension denylist plus a NUL-byte sniff. `isExtractableDocument(name)` in `src/ts/services/parsers/index.ts` is the single source of truth for what is accepted.

The parsers use only in-browser primitives (`TextDecoder`, `DecompressionStream`, `DOMParser`) and make **no network requests**.

## Local retrieval (LM Studio / Ollama)

Local servers have no files API or vector store, so documents are indexed and searched client-side. Dumping every file's full text into the prompt would overflow a local model's context (LM Studio reports a "Channel Error"), so only the relevant passages are sent:

1. **Extract** each attached file to text.
2. **Chunk** the text into ~2000-character pieces on paragraph/sentence/word boundaries (`chunkText`).
3. **Embed** the chunks via the provider's OpenAI-compatible `/embeddings` endpoint (`fetchEmbeddings`) and hold them in an in-memory index (`src/ts/services/localDocRetrieval.ts`).
4. On **each turn**, embed the user's question and append only the top matching chunks (cosine similarity) to the message.

The index is per-conversation and is cleared when you start or load a conversation.

### Embedding model selection

Local model fetches keep embedding models out of the chat model dropdown but record them in `service.embeddingModels`. The embedding model is resolved by `resolveEmbeddingModel()`:

1. The value set in **Settings → Local Server Configuration → Embedding Model**, if any.
2. Otherwise a preferred model from the provider's embedding-model list — **nomic** first, then `mxbai`, `bge`, `gte`, `e5`, `embeddinggemma`, `snowflake`/`arctic`, `jina`.
3. Otherwise the first available embedding model.

You must have an embedding model loaded in your local server (for example `text-embedding-nomic-embed-text-v1.5` in LM Studio, or `nomic-embed-text` pulled in Ollama). If none is available, indexing reports a clear error instead of failing silently.

## Privacy

For local providers, document contents never leave your machine — extraction, chunking, embedding, and retrieval all run against your local server. See [Security](security.md).

## Code pointers

- `src/ts/services/parsers/` — format parsers and the `extractDocumentText` / `isExtractableDocument` dispatcher
- `src/ts/services/embeddings.ts` — `chunkText`, `cosineSim`, `fetchEmbeddings`, `resolveEmbeddingModel`
- `src/ts/services/localDocRetrieval.ts` — the in-memory index (`indexDocuments`, `retrieveRelevantChunks`, `clearLocalDocIndex`)
- `src/ts/components/interaction.ts` — `indexDocumentsLocally` and `injectRetrievedContext` wire retrieval into the send flow
- `src/ts/services/providers.ts` — `extractsDocumentsClientSide`, `usesDirectFileUpload`
