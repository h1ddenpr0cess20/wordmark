/**
 * Local embedding utilities for client-side document retrieval.
 *
 * @remarks
 * Ported from the dataset-generator source: text chunking, cosine similarity,
 * and a call to the active provider's OpenAI-compatible `/embeddings` endpoint.
 * Used to build an in-browser vector index over attached documents so
 * providers with no native document ingestion (LM Studio, Ollama, and
 * OpenRouter) retrieve only the relevant passages per turn instead of
 * receiving every file's full text. See {@link ./localDocRetrieval.ts}.
 */

import { getActiveServiceKey, getBaseUrl } from "./api/clientConfig.ts";
import { buildHeaders } from "./api/requestTransport.ts";
import { config } from "../../config/config.ts";

/** localStorage key for the user-set embedding model (blank = auto-detect). */
export const EMBEDDING_MODEL_STORAGE_KEY = "wordmark:embeddingModel";

/** Maximum inputs per `/embeddings` request. */
export const EMBEDDING_BATCH_SIZE = 64;

/**
 * Splits text into chunks of about `size` characters, preferring paragraph,
 * then line, sentence, and word boundaries so chunks stay coherent.
 *
 * @param t - The text to split.
 * @param size - Target chunk size in characters.
 * @param overlap - Approximate characters repeated across adjacent chunks so
 * facts at a boundary remain retrievable.
 */
export function chunkText(t: string, size = 2000, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  const safeSize = Math.max(100, size);
  const safeOverlap = Math.max(0, Math.min(overlap, Math.floor(safeSize / 3)));

  while (start < t.length) {
    if (start + safeSize >= t.length) {
      const tail = t.slice(start).trim();
      if (tail) chunks.push(tail);
      break;
    }

    const window = t.slice(start, start + safeSize);
    let breakAt = -1;

    const paraIdx = window.lastIndexOf("\n\n");
    if (paraIdx >= safeSize * 0.4) breakAt = paraIdx + 2;

    if (breakAt < 0) {
      const nlIdx = window.lastIndexOf("\n");
      if (nlIdx >= safeSize * 0.4) breakAt = nlIdx + 1;
    }

    if (breakAt < 0) {
      const sentMatches = [...window.matchAll(/[.!?]\s+/g)];
      if (sentMatches.length) {
        const last = sentMatches[sentMatches.length - 1];
        if ((last.index ?? -1) >= safeSize * 0.4) breakAt = (last.index ?? 0) + last[0].length;
      }
    }

    if (breakAt < 0) {
      const spIdx = window.lastIndexOf(" ");
      if (spIdx >= safeSize * 0.4) breakAt = spIdx + 1;
    }

    if (breakAt < 0) breakAt = safeSize;

    const chunk = t.slice(start, start + breakAt).trim();
    if (chunk) chunks.push(chunk);
    const nextStart = start + breakAt;
    start = Math.max(start + 1, nextStart - safeOverlap);
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

/** Reads the user-set embedding model from localStorage, or `null` if unset. */
function readStoredEmbeddingModel(): string | null {
  try {
    return localStorage.getItem(EMBEDDING_MODEL_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

const EMBEDDING_NAME_RE =
  /embed|bge|nomic|gte|e5|minilm|mxbai|jina|snowflake|arctic|sentence|instructor|multilingual-e5|granite-embedding/i;

/** Preferred embedding models in priority order; nomic is the default. */
const PREFERRED_EMBEDDING_PATTERNS = [
  /nomic/i,
  /mxbai/i,
  /bge/i,
  /gte/i,
  /(^|[^a-z])e5([^a-z]|$)|multilingual-e5/i,
  /embeddinggemma|gemma-embed/i,
  /snowflake|arctic/i,
  /jina/i,
];

/** Picks the highest-priority known embedding model, else the first one given. */
function pickPreferred(models: string[]): string | null {
  if (models.length === 0) return null;
  for (const pattern of PREFERRED_EMBEDDING_PATTERNS) {
    const match = models.find((m) => pattern.test(m));
    if (match) return match;
  }
  return models[0];
}

/**
 * Resolves the embedding model for the active provider, in priority order:
 * the user-set value; else, from the provider's actually-fetched
 * embedding-model list — its curated default (e.g. OpenRouter's free
 * Nemotron embedding model) when that list contains it, otherwise a
 * preferred embedding model (nomic first, then known alternatives, then any
 * available); else a name-pattern scan of its chat model list.
 *
 * @remarks
 * A provider's `defaultEmbeddingModel` is only ever picked when the server's
 * own fetched list actually contains it — it is a priority hint, not an
 * override, so a stale/wrong default can't be used against a provider that
 * doesn't (or doesn't yet) report that model.
 *
 * @returns The model id, or `null` if none can be determined.
 */
export function resolveEmbeddingModel(): string | null {
  const stored = readStoredEmbeddingModel();
  if (stored) return stored;

  const service = config?.services?.[getActiveServiceKey()];

  const embeddingModels = service?.embeddingModels;
  if (Array.isArray(embeddingModels) && embeddingModels.length > 0) {
    if (service?.defaultEmbeddingModel && embeddingModels.includes(service.defaultEmbeddingModel)) {
      return service.defaultEmbeddingModel;
    }
    return pickPreferred(embeddingModels);
  }

  const models = service?.models;
  if (Array.isArray(models)) {
    return pickPreferred(models.filter((m) => EMBEDDING_NAME_RE.test(m)));
  }
  return null;
}

/**
 * Fetches embedding vectors for a batch of texts from the active provider's
 * OpenAI-compatible `/embeddings` endpoint. Inputs are sent in batches of
 * {@link EMBEDDING_BATCH_SIZE} so a large document doesn't produce one request
 * the local server rejects or times out on.
 *
 * @param texts - The input texts.
 * @param model - The embedding model id.
 * @param signal - Optional abort signal.
 * @returns One vector per input, in input order.
 * @throws If a request fails.
 */
export async function fetchEmbeddings(
  texts: string[],
  model: string,
  signal?: AbortSignal,
): Promise<number[][]> {
  const base = getBaseUrl();
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
    const res = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: { ...buildHeaders(), Accept: "application/json" },
      body: JSON.stringify({ model, input: batch }),
      signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Embeddings request failed: HTTP ${res.status} — ${err.slice(0, 200)}`);
    }
    const data = await res.json();
    const rows = Array.isArray(data?.data) ? data.data as { index: number; embedding: number[] }[] : [];
    if (rows.length !== batch.length) {
      throw new Error(`Embeddings response returned ${rows.length} vector(s) for ${batch.length} input(s)`);
    }
    const ordered = rows.slice().sort((a, b) => a.index - b.index);
    const dimensions = ordered[0]?.embedding?.length || 0;
    const valid = dimensions > 0 && ordered.every((row, index) =>
      row.index === index &&
      Array.isArray(row.embedding) &&
      row.embedding.length === dimensions &&
      row.embedding.every(Number.isFinite),
    );
    if (!valid) {
      throw new Error("Embeddings response contained missing, malformed, or inconsistent vectors");
    }
    vectors.push(...ordered.map((row) => row.embedding));
  }
  return vectors;
}
