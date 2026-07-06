/**
 * In-browser semantic retrieval over attached documents for local providers.
 *
 * @remarks
 * Local servers (LM Studio / Ollama) have no files API or vector store, so
 * attached documents are indexed client-side: each file is extracted to text,
 * split into chunks, and embedded via the provider's `/embeddings` endpoint.
 * At send time the user's question is embedded and the most similar chunks are
 * returned, so only the relevant passages reach the model rather than every
 * file's full text. The index is per-conversation and cleared on reset.
 */

import { extractDocumentText } from "./parsers/index.ts";
import { chunkText, cosineSim, fetchEmbeddings, resolveEmbeddingModel } from "./embeddings.ts";

interface IndexedChunk {
  name: string;
  text: string;
  vector: number[];
}

const index: IndexedChunk[] = [];

/** Number of indexed chunks currently held. */
export function localDocIndexSize(): number {
  return index.length;
}

/** Drops all indexed chunks (called when a conversation is reset or loaded). */
export function clearLocalDocIndex(): void {
  index.length = 0;
}

/**
 * Extracts, chunks, and embeds the given files, adding them to the index.
 *
 * @param files - The document files to index.
 * @returns A summary of what was indexed and which files could not be read.
 * @throws If no embedding model can be resolved.
 */
export async function indexDocuments(
  files: File[],
): Promise<{ indexed: number; chunks: number; failed: string[] }> {
  const model = resolveEmbeddingModel();
  if (!model) {
    throw new Error(
      "No embedding model set. Choose one in Settings → Local Server Configuration, or load an embedding model in your local server.",
    );
  }

  const pending: { name: string; text: string }[] = [];
  const failed: string[] = [];

  for (const file of files) {
    try {
      const text = await extractDocumentText(file);
      if (!text.trim()) {
        failed.push(file.name);
        continue;
      }
      for (const chunk of chunkText(text)) {
        pending.push({ name: file.name, text: chunk });
      }
    } catch {
      failed.push(file.name);
    }
  }

  if (pending.length === 0) {
    return { indexed: 0, chunks: 0, failed };
  }

  const vectors = await fetchEmbeddings(pending.map((p) => p.text), model);
  for (let i = 0; i < pending.length; i++) {
    index.push({ name: pending[i].name, text: pending[i].text, vector: vectors[i] });
  }

  const indexed = new Set(pending.map((p) => p.name)).size;
  return { indexed, chunks: pending.length, failed };
}

/**
 * Returns the chunks most relevant to a query, ranked by cosine similarity.
 *
 * @param query - The user's message.
 * @param topK - Maximum chunks to return.
 * @returns The matching chunks (name + text), most relevant first.
 */
export async function retrieveRelevantChunks(
  query: string,
  topK = 8,
): Promise<{ name: string; text: string }[]> {
  if (index.length === 0 || !query.trim()) return [];

  const model = resolveEmbeddingModel();
  if (!model) return [];

  const [queryVector] = await fetchEmbeddings([query], model);

  return index
    .map((chunk) => ({ chunk, score: cosineSim(queryVector, chunk.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk }) => ({ name: chunk.name, text: chunk.text }));
}
