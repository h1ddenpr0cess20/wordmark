/**
 * HTTP transport for the Responses API.
 *
 * @remarks
 * The low-level request layer: builds auth headers and POSTs request bodies to
 * the `/responses` endpoint in streaming or non-streaming mode. Separated from
 * the turn orchestration and payload assembly in {@link ./requestClient.ts} so
 * the network plumbing is isolated.
 */

import { ensureApiKey, getBaseUrl } from "./clientConfig.ts";
import type { ResponseObject } from "../../../types/api.ts";

/** Builds the JSON request headers for the Responses endpoint, including bearer auth. */
export function buildHeaders() {
  const apiKey = ensureApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "text/event-stream",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

/**
 * POSTs a request to the Responses endpoint and returns the streaming response.
 *
 * @throws If the response status is not ok.
 */
export async function executeStreamingRequest(body: unknown, abortController?: AbortController | null): Promise<Response> {
  const endpoint = `${getBaseUrl()}/responses`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body),
    signal: abortController ? abortController.signal : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Responses API error ${response.status}: ${text || response.statusText}`);
  }
  return response;
}

/**
 * POSTs a request to the Responses endpoint and returns the parsed JSON body.
 *
 * @throws If the response status is not ok.
 */
export async function executeNonStreamingRequest(body: unknown, abortController?: AbortController | null): Promise<ResponseObject> {
  const endpoint = `${getBaseUrl()}/responses`;
  const headers = buildHeaders();
  headers.Accept = "application/json";
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: abortController ? abortController.signal : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Responses API error ${response.status}: ${text || response.statusText}`);
  }
  return response.json();
}
