import test from "node:test";
import assert from "node:assert/strict";

const { STATIC_TOOLS } = await import("../src/ts/services/api/staticTools.ts");

const KNOWN_SERVICES = new Set(["openai", "xai", "google", "anthropic", "ollama", "lmstudio"]);

test("every static tool has the required catalog fields", () => {
  for (const tool of STATIC_TOOLS) {
    assert.ok(tool.key && typeof tool.key === "string", `missing key: ${JSON.stringify(tool)}`);
    assert.ok(tool.displayName, `${tool.key} missing displayName`);
    assert.ok(tool.description, `${tool.key} missing description`);
    assert.equal(typeof tool.defaultEnabled, "boolean", `${tool.key} defaultEnabled must be boolean`);
    assert.ok(tool.definition && typeof tool.definition === "object", `${tool.key} missing definition`);
  }
});

test("tool keys are unique", () => {
  const keys = STATIC_TOOLS.map(t => t.key);
  assert.equal(new Set(keys).size, keys.length, `duplicate key in ${keys.join(", ")}`);
});

test("each key is namespaced 'type:name' and the prefix matches the tool type", () => {
  for (const tool of STATIC_TOOLS) {
    const [prefix, name] = tool.key.split(":");
    assert.ok(name, `${tool.key} should be of the form '<type>:<name>'`);
    assert.equal(prefix, tool.type, `${tool.key} prefix should match type '${tool.type}'`);
  }
});

test("function tools expose a definition whose name matches the key suffix", () => {
  for (const tool of STATIC_TOOLS.filter(t => t.type === "function")) {
    const def = tool.definition as { type?: string; name?: string; parameters?: unknown };
    assert.equal(def.type, "function", `${tool.key} definition.type should be 'function'`);
    assert.equal(def.name, tool.key.split(":")[1], `${tool.key} definition.name must match the key suffix`);
    assert.ok(def.parameters && typeof def.parameters === "object", `${tool.key} needs a parameters schema`);
  }
});

test("onlyServices, when present, is a non-empty list of known services", () => {
  for (const tool of STATIC_TOOLS) {
    if (!tool.onlyServices) {
      continue;
    }
    assert.ok(Array.isArray(tool.onlyServices) && tool.onlyServices.length > 0, `${tool.key} onlyServices must be non-empty`);
    for (const svc of tool.onlyServices) {
      assert.ok(KNOWN_SERVICES.has(svc), `${tool.key} references unknown service '${svc}'`);
    }
  }
});

test("requiresApiKeyService, when present, names a known service", () => {
  for (const tool of STATIC_TOOLS) {
    if (tool.requiresApiKeyService) {
      assert.ok(KNOWN_SERVICES.has(tool.requiresApiKeyService), `${tool.key} requires unknown service '${tool.requiresApiKeyService}'`);
    }
  }
});
