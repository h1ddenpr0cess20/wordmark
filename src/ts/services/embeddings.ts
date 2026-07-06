/**
 * Local embedding utilities for client-side document retrieval.
 *
 * @remarks
 * Ported from the dataset-generator source: text chunking, cosine similarity,
 * and a call to the active provider's OpenAI-compatible `/embeddings` endpoint.
 * Used to build an in-browser vector index over attached documents so local
 * providers (LM Studio / Ollama) retrieve only the relevant passages per turn
 * instead of receiving every file's full text. See {@link ./localDocRetrieval.ts}.
 */

import { getActiveServiceKey, getBaseUrl } from "./api/clientConfig.ts";
import { buildHeaders } from "./api/requestTransport.ts";
import { config } from "../../config/config.ts";

/** localStorage key for the user-set embedding model (blank = auto-detect). */
export const EMBEDDING_MODEL_STORAGE_KEY = "wordmark:embeddingModel";

/**
 * Splits text into chunks of about `size` characters, preferring paragraph,
 * then line, sentence, and word boundaries so chunks stay coherent.
 *
 * @param t - The text to split.
 * @param size - Target chunk size in characters.
 */
export function chunkText(t: string, size = 2000): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < t.length) {
    if (start + size >= t.length) {
      const tail = t.slice(start).trim();
      if (tail) chunks.push(tail);
      break;
    }

    const window = t.slice(start, start + size);
    let breakAt = -1;

    const paraIdx = window.lastIndexOf("\n\n");
    if (paraIdx >= size * 0.4) breakAt = paraIdx + 2;

    if (breakAt < 0) {
      const nlIdx = window.lastIndexOf("\n");
      if (nlIdx >= size * 0.4) breakAt = nlIdx + 1;
    }

    if (breakAt < 0) {
      const sentMatches = [...window.matchAll(/[.!?]\s+/g)];
      if (sentMatches.length) {
        const last = sentMatches[sentMatches.length - 1];
        if ((last.index ?? -1) >= size * 0.4) breakAt = (last.index ?? 0) + last[0].length;
      }
    }

    if (breakAt < 0) {
      const spIdx = window.lastIndexOf(" ");
      if (spIdx >= size * 0.4) breakAt = spIdx + 1;
    }

    if (breakAt < 0) breakAt = size;

    const chunk = t.slice(start, start + breakAt).trim();
    if (chunk) chunks.push(chunk);
    start += breakAt;
  }

  return chunks;
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/**
 * Resolves the embedding model to use for the active provider: the user-set
 * value if present, otherwise a model whose id looks like an embedding model.
 *
 * @returns The model id, or `null` if none can be determined.
 */
function readStoredEmbeddingModel(): string | null {
  try {
    return localStorage.getItem(EMBEDDING_MODEL_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function resolveEmbeddingModel(): string | null {
  const stored = readStoredEmbeddingModel();
  if (stored) return stored;

  const serviceKey = getActiveServiceKey();
  const models = config?.services?.[serviceKey]?.models;
  if (Array.isArray(models)) {
    const match = models.find((m) => /embed|bge|nomic|gte|e5|minilm/i.test(m));
    if (match) return match;
  }
  return null;
}

/**
 * Fetches embedding vectors for a batch of texts from the active provider's
 * OpenAI-compatible `/embeddings` endpoint.
 *
 * @param texts - The input texts.
 * @param model - The embedding model id.
 * @param signal - Optional abort signal.
 * @returns One vector per input, in input order.
 * @throws If the request fails.
 */
export async function fetchEmbeddings(
  texts: string[],
  model: string,
  signal?: AbortSignal,
): Promise<number[][]> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers: { ...buildHeaders(), Accept: "application/json" },
    body: JSON.stringify({ model, input: texts }),
    signal,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embeddings request failed: HTTP ${res.status} — ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.data as { index: number; embedding: number[] }[])
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
