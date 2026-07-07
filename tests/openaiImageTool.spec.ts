import test, { mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Unit tests for the OpenAI gpt-image-2 tool handlers. openaiImageTool.ts
 * registers openai_generate_image / openai_edit_image on toolImplementations as
 * a side effect of import, calling fetch and the media helpers. config,
 * apiKeyStorage, and mediaTools are replaced with controllable fakes via
 * mock.module (requires --experimental-test-module-mocks, wired in npm test);
 * fetch is swapped on globalThis per test.
 */

let apiKeyValue = "test-key";
let latestMediaRef: string | null = null;

mock.module(new URL("../src/config/config.ts", import.meta.url).href, {
  namedExports: {
    config: { services: { openai: { baseUrl: "https://api.openai.com/v1/" } } },
  },
});

mock.module(new URL("../src/ts/services/apiKeyStorage.ts", import.meta.url).href, {
  namedExports: { getApiKey: () => apiKeyValue },
});

mock.module(new URL("../src/ts/services/mediaTools.ts", import.meta.url).href, {
  namedExports: {
    registerGeneratedMedia: (rec: { filename?: string }) => ({ filename: rec.filename }),
    resolveLatestMediaReference: async () => latestMediaRef,
    makeFilename: (prefix: string, mimeType: string) =>
      `${prefix}.${mimeType === "image/jpeg" ? "jpg" : "png"}`,
    decodeDataUri: (reference: string) => {
      const encoded = String(reference).split(",", 2)[1] || "";
      return new Blob([Buffer.from(encoded, "base64")], { type: "image/png" });
    },
  },
});

await import("../src/ts/services/openaiImageTool.ts");
const { toolImplementations } = await import("../src/ts/services/toolImplementations.ts");

const generate = (args: unknown) => toolImplementations.openai_generate_image(args);
const edit = (args: unknown) => toolImplementations.openai_edit_image(args);

interface FetchCall { url: string; options: { method?: string; headers?: Record<string, string>; body?: string | FormData } }
let fetchCalls: FetchCall[] = [];

function stubFetch(body: unknown, { ok = true, status = 200 } = {}) {
  fetchCalls = [];
  globalThis.fetch = (async (url: string, options: FetchCall["options"] = {}) => {
    fetchCalls.push({ url, options });
    return {
      ok,
      status,
      statusText: ok ? "OK" : "Error",
      json: async () => body,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
      blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    };
  }) as unknown as typeof fetch;
}

const okImage = { data: [{ b64_json: "AAAA", mime_type: "image/png" }] };
const lastJsonBody = () => JSON.parse(fetchCalls[fetchCalls.length - 1].options.body as string || "{}");
const apiCall = () => fetchCalls.find(call => call.url.includes("api.openai.com"))!;

test("rejects when the prompt is missing or blank", async () => {
  apiKeyValue = "test-key";
  stubFetch(okImage);
  await assert.rejects(() => generate({}), /prompt is required/i);
  await assert.rejects(() => generate({ prompt: "   " }), /prompt is required/i);
  assert.equal(fetchCalls.length, 0, "should not call the API without a prompt");
});

test("rejects with a key-setup message when no API key is configured", async () => {
  apiKeyValue = "";
  stubFetch(okImage);
  await assert.rejects(() => generate({ prompt: "a cat" }), /API key/i);
  apiKeyValue = "test-key";
});

test("generates an image and summarizes the result", async () => {
  stubFetch(okImage);
  const result = await generate({ prompt: "a cat" });
  assert.deepEqual(result, {
    ok: true,
    backend: "openai",
    mediaType: "image",
    count: 1,
    filenames: ["generated.png"],
  });
  assert.equal(fetchCalls[0].url, "https://api.openai.com/v1/images/generations");
  assert.equal(fetchCalls[0].options.headers?.Authorization, "Bearer test-key");
  assert.equal(lastJsonBody().model, "gpt-image-2");
});

test("clamps n into the 1..10 range and defaults non-finite values to 1", async () => {
  stubFetch(okImage);
  await generate({ prompt: "p", n: 99 });
  assert.equal(lastJsonBody().n, 10);

  stubFetch(okImage);
  await generate({ prompt: "p", n: 0 });
  assert.equal(lastJsonBody().n, 1);

  stubFetch(okImage);
  await generate({ prompt: "p", n: "not-a-number" });
  assert.equal(lastJsonBody().n, 1);
});

test("only forwards a whitelisted size and quality", async () => {
  stubFetch(okImage);
  await generate({ prompt: "p", size: "1536x1024", quality: "high" });
  let body = lastJsonBody();
  assert.equal(body.size, "1536x1024");
  assert.equal(body.quality, "high");

  stubFetch(okImage);
  await generate({ prompt: "p", size: "512x512", quality: "ultra" });
  body = lastJsonBody();
  assert.equal(body.size, undefined, "invalid size is dropped");
  assert.equal(body.quality, undefined, "invalid quality is dropped");
});

test("parses url-based response items as well as base64", async () => {
  stubFetch({ data: [{ url: "https://img.example/x.png" }] });
  const result = await generate({ prompt: "p" });
  assert.equal(result.count, 1);
});

test("rejects when the API returns no usable images", async () => {
  stubFetch({ data: [{ nonsense: true }] });
  await assert.rejects(() => generate({ prompt: "p" }), /did not return any images/i);
});

test("surfaces a non-ok HTTP status as an error", async () => {
  stubFetch("rate limited", { ok: false, status: 429 });
  await assert.rejects(() => generate({ prompt: "p" }), /429/);
});

test("edit mode targets the edits endpoint with multipart form data", async () => {
  stubFetch(okImage);
  latestMediaRef = null;
  const result = await edit({ prompt: "make it blue", image_url: "data:image/png;base64,QUFBQQ==" });
  assert.equal(result.filenames[0], "edited.png");
  const call = apiCall();
  assert.equal(call.url, "https://api.openai.com/v1/images/edits");
  assert.ok(call.options.body instanceof FormData, "edit request body should be FormData");
  const form = call.options.body as FormData;
  assert.equal(form.get("model"), "gpt-image-2");
  assert.equal(form.get("prompt"), "make it blue");
  assert.ok(form.get("image[]") instanceof Blob, "source image should be attached as a blob");
  assert.equal(call.options.headers?.["Content-Type"], undefined, "multipart boundary must be set by fetch");
});

test("edit mode fetches remote source images before uploading them", async () => {
  stubFetch(okImage);
  latestMediaRef = null;
  await edit({ prompt: "edit", image_url: "https://img/src.png" });
  assert.equal(fetchCalls[0].url, "https://img/src.png", "remote source is fetched first");
  assert.equal(apiCall().url, "https://api.openai.com/v1/images/edits");
});

test("edit mode falls back to the latest media reference, or errors if none", async () => {
  stubFetch(okImage);
  latestMediaRef = "data:image/png;base64,QUFBQQ==";
  await edit({ prompt: "edit" });
  assert.ok((apiCall().options.body as FormData).get("image[]") instanceof Blob);

  stubFetch(okImage);
  latestMediaRef = null;
  await assert.rejects(() => edit({ prompt: "edit" }), /No source image is available/i);
});
