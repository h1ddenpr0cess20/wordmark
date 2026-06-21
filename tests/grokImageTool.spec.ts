import test, { mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Unit tests for the xAI Grok image tool handlers. grokImageTool.ts registers
 * grok_generate_image / grok_edit_image on toolImplementations as a side effect
 * of import, calling fetch and the media helpers. config, apiKeyStorage, and
 * mediaTools are replaced with controllable fakes via mock.module (requires
 * --experimental-test-module-mocks, wired in npm test); fetch is swapped on
 * globalThis per test.
 */

let apiKeyValue = "test-key";
let latestMediaRef: string | null = null;

mock.module(new URL("../src/config/config.ts", import.meta.url).href, {
  namedExports: {
    config: { services: { xai: { baseUrl: "https://api.x.ai/v1/" } } },
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
  },
});

await import("../src/ts/services/grokImageTool.ts");
const { toolImplementations } = await import("../src/ts/services/toolImplementations.ts");

const generate = (args: unknown) => toolImplementations.grok_generate_image(args);
const edit = (args: unknown) => toolImplementations.grok_edit_image(args);

interface FetchCall { url: string; options: { method?: string; headers?: Record<string, string>; body?: string } }
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
    };
  }) as unknown as typeof fetch;
}

const okImage = { data: [{ b64_json: "AAAA", mime_type: "image/png" }], id: "resp_1" };
const lastBody = () => JSON.parse(fetchCalls[0].options.body || "{}");

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
    backend: "grok",
    mediaType: "image",
    count: 1,
    filenames: ["generated.png"],
  });
  assert.equal(fetchCalls[0].url, "https://api.x.ai/v1/images/generations");
  assert.equal(fetchCalls[0].options.headers?.Authorization, "Bearer test-key");
});

test("clamps n into the 1..10 range and defaults non-finite values to 1", async () => {
  stubFetch(okImage);
  await generate({ prompt: "p", n: 99 });
  assert.equal(lastBody().n, 10);

  stubFetch(okImage);
  await generate({ prompt: "p", n: 0 });
  assert.equal(lastBody().n, 1);

  stubFetch(okImage);
  await generate({ prompt: "p", n: "not-a-number" });
  assert.equal(lastBody().n, 1);
});

test("only forwards a whitelisted aspect_ratio and resolution", async () => {
  stubFetch(okImage);
  await generate({ prompt: "p", aspect_ratio: "16:9", resolution: "2k" });
  let body = lastBody();
  assert.equal(body.aspect_ratio, "16:9");
  assert.equal(body.resolution, "2k");

  stubFetch(okImage);
  await generate({ prompt: "p", aspect_ratio: "100:1", resolution: "8k" });
  body = lastBody();
  assert.equal(body.aspect_ratio, undefined, "invalid aspect ratio is dropped");
  assert.equal(body.resolution, undefined, "invalid resolution is dropped");
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

test("edit mode targets the edits endpoint and uses the provided image_url", async () => {
  stubFetch(okImage);
  latestMediaRef = null;
  const result = await edit({ prompt: "make it blue", image_url: "https://img/src.png" });
  assert.equal(result.filenames[0], "edited.png");
  assert.equal(fetchCalls[0].url, "https://api.x.ai/v1/images/edits");
  assert.deepEqual(lastBody().image, { type: "image_url", url: "https://img/src.png" });
});

test("edit mode falls back to the latest media reference, or errors if none", async () => {
  stubFetch(okImage);
  latestMediaRef = "data:image/png;base64,ZZZZ";
  await edit({ prompt: "edit" });
  assert.deepEqual(lastBody().image, { type: "image_url", url: "data:image/png;base64,ZZZZ" });

  stubFetch(okImage);
  latestMediaRef = null;
  await assert.rejects(() => edit({ prompt: "edit" }), /No source image is available/i);
});
