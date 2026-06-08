import test from "node:test";
import assert from "node:assert/strict";

// menuSystem.js is an ES module that imports panel markup via Vite `?raw`
// imports (resolved in tests by tests/helpers/rawLoader.mjs) and exports the
// HTMLLoader utility plus initializeMenus(), which inserts the panels and
// initializes the theme selector (the app's initialize() is called by main.js,
// not here).

function createDom() {
  const elements = new Map();
  const document = {
    readyState: "complete",
    body: { appendChild() {}, removeChild() {} },
    head: { appendChild() {} },
    addEventListener() {},
    getElementById(id) { return elements.get(id) || null; },
    createElement(tag) {
      return { tagName: String(tag).toUpperCase(), innerHTML: "", setAttribute() {}, addEventListener() {}, parentNode: null };
    },
  };
  return { document, elements };
}

let importCounter = 0;
async function loadMenuSystem(windowStub, document) {
  // Keep the stubs on globalThis for the duration of the test so module code
  // that references bare `window`/`document` works during later calls too.
  globalThis.window = windowStub;
  globalThis.document = document;
  // Cache-bust so the module re-evaluates against the new stubs.
  const mod = await import(`../src/js/utils/menuSystem.js?case=${importCounter++}`);
  return mod;
}

const SETTINGS_CONTENT_IDS = [
  "content-personality",
  "content-model",
  "content-tools",
  "content-data",
  "content-memory",
  "content-tts",
  "content-theme",
  "content-apikeys",
  "content-location",
  "content-about",
];

test("HTMLLoader.loadHTML inserts bundled content into container", async () => {
  const { document, elements } = createDom();
  const container = { id: "menu-panels-container", innerHTML: "" };
  elements.set("menu-panels-container", container);
  SETTINGS_CONTENT_IDS.forEach(id => elements.set(id, { id, innerHTML: "" }));

  const windowStub = { addEventListener() {}, initialize() {}, initTheme: async () => {} };
  const mod = await loadMenuSystem(windowStub, document);

  const target = { id: "x", innerHTML: "" };
  elements.set("x", target);
  await mod.HTMLLoader.loadHTML("src/html/panels/settings/personality.html", "x");
  assert.ok(target.innerHTML.length > 0, "should insert real panel markup");
  assert.match(target.innerHTML, /personality/i);
});

test("HTMLLoader.loadHTML warns on unknown path", async () => {
  const { document, elements } = createDom();
  elements.set("menu-panels-container", { id: "menu-panels-container", innerHTML: "" });
  SETTINGS_CONTENT_IDS.forEach(id => elements.set(id, { id, innerHTML: "" }));

  const windowStub = { addEventListener() {}, initialize() {}, initTheme: async () => {} };
  const mod = await loadMenuSystem(windowStub, document);

  const target = { id: "y", innerHTML: "" };
  elements.set("y", target);
  await mod.HTMLLoader.loadHTML("does/not/exist.html", "y");
  assert.equal(target.innerHTML, "", "unknown path leaves container untouched");
});

test("initializeMenus loads panels and resolves true", async () => {
  const { document, elements } = createDom();
  const panelsContainer = { id: "menu-panels-container", innerHTML: "" };
  elements.set("menu-panels-container", panelsContainer);
  SETTINGS_CONTENT_IDS.forEach(id => elements.set(id, { id, innerHTML: "" }));

  // initTheme is a static ESM import (no window seam to intercept); it runs for
  // real and bails early because there is no #theme-selector element here.
  const windowStub = { addEventListener() {} };

  const mod = await loadMenuSystem(windowStub, document);
  const ready = await mod.initializeMenus();

  assert.equal(ready, true, "initializeMenus resolves true on success");
  assert.ok(panelsContainer.innerHTML.length > 0, "panels.html inserted");
  assert.ok(elements.get("content-personality").innerHTML.length > 0, "personality tab inserted");
  assert.ok(elements.get("content-model").innerHTML.length > 0, "model tab inserted");
});
