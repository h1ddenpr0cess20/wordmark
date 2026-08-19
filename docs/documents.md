# Documents & Attachments

Wordmark can attach documents to a message so the model can answer questions about them. How a document is handled depends on the active provider — hosted providers use their native file features, while local providers process documents entirely in the browser.

Attach files with the upload button in the composer, by drag-and-drop, or by paste. You can attach individual files or a whole folder.

Folder uploads keep each file's relative path so files with the same basename remain distinct. To avoid drowning codebase retrieval in generated dependencies, folders named `.git`, `node_modules`, `.venv`, `venv`, `__pycache__`, and common tool caches are skipped, along with source maps and minified JavaScript/CSS. The upload notification reports how many were ignored. Uploading one of those files individually still accepts it when its format is supported.

## Per-provider handling

| Provider | How documents are handled |
| --- | --- |
| **OpenAI** | Uploaded via `/v1/files` (purpose `user_data`) and referenced as `input_file` parts on the message. PDFs go in as extracted text plus page images; documents, text, and code are text-extracted; spreadsheets use the provider's tabular flow. |
| **xAI (Grok)** | Uploaded via `/v1/files` and referenced as `input_file` parts on the message. |
| **OpenRouter** | Extracted to text in the browser and injected under a character budget. |
| **LM Studio / Ollama** | Extracted to text and searched **in the browser** via embeddings — nothing is uploaded anywhere. See [Local retrieval](#local-retrieval-lm-studio--ollama). |

The provider capabilities behind this are `usesDirectFileUpload()` and `extractsDocumentsClientSide()` in `src/ts/services/providers.ts`.

Vector stores are no longer part of attaching a file. They remain available for corpora too large to send whole: enable **File Search** in Settings → Tools and manage stores in Settings → Data, and the tool searches them on every turn. An attached file goes to the model in full, which is what makes it answerable without a retrieval step, and it stays on the message for the rest of the conversation.

### Files renamed for upload

A Files API validates the extension, not the bytes, so a `.wgsl` shader or a `.toml` config is refused even though it is plain text. Wordmark appends `.txt` to those before uploading (`terrain.wgsl` goes up as `terrain.wgsl.txt`), which gets the same bytes accepted while leaving the original name visible to the model. Formats the provider already understands are uploaded untouched. `src/ts/services/fileSupport.ts` holds the extension sets and the rename.

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

SVG is markup, so it is attached as a document rather than sent as an image — vision endpoints refuse it, as they do TIFF, HEIC, and BMP. PNG, JPEG, GIF, and WebP are the image formats sent as images.

Genuine binaries (images, audio/video, executables, fonts) are rejected rather than dumped as garbage — a binary-extension denylist plus a NUL-byte sniff. `isExtractableDocument(name)` in `src/ts/services/parsers/index.ts` is the single source of truth for what is accepted.

The parsers use only in-browser primitives (`TextDecoder`, `DecompressionStream`, `DOMParser`) and make **no network requests**.

## Local retrieval (LM Studio / Ollama)

Local servers have no files API or vector store, so documents are indexed and searched client-side. Dumping every file's full text into the prompt would overflow a local model's context (LM Studio reports a "Channel Error"), so only the relevant passages are sent:

1. **Extract** each attached file to text.
2. **Chunk** the text into ~2000-character pieces on paragraph/sentence/word boundaries (`chunkText`), with a small overlap so facts at chunk boundaries remain searchable.
3. **Embed** the chunks via the provider's OpenAI-compatible `/embeddings` endpoint (`fetchEmbeddings`) and hold them in an in-memory index (`src/ts/services/localDocRetrieval.ts`).
4. On **each turn**, combine semantic similarity with an in-browser BM25-style exact-term score over chunk text and source paths. This lets queries for filenames, identifiers, error codes, and config keys work alongside natural-language questions.
5. Re-rank the candidate set for relevance and novelty so one large or repetitive file cannot occupy every result in a folder. At most 12 chunks and roughly 24,000 characters are sent. The per-source limit adapts to the number of matching files, so a single document can use the full budget while larger folders receive broader source coverage.

Questions such as “which files are available?” also receive a compact source-path inventory. Retrieved text is delimited and labeled as untrusted reference material so document content is not presented as application instructions.

The index is per-conversation and is cleared when you start a new conversation. Loading a saved conversation restores its index before retrieval is allowed to run.

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
- `src/ts/utils/documentPaths.ts` — relative-path normalization and dependency/cache filtering for folder uploads
- `src/ts/components/interaction.ts` — `indexDocumentsLocally` and `injectRetrievedContext` wire retrieval into the send flow
- `src/ts/services/providers.ts` — `extractsDocumentsClientSide`, `usesDirectFileUpload`, `directUploadPurpose`
- `src/ts/services/fileSupport.ts` — which formats each provider path accepts (`canAttachDocument`), the upload rename (`toUploadableFile`), and which images are sent as images (`isModelViewableImage`)
