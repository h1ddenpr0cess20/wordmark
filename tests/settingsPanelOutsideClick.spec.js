import test from "node:test";
import assert from "node:assert/strict";

// Regression test for the variable-shadowing bug in settingsPanel.js: the
// outside-click handler reads the GLOBAL `state.isSlideshowOpen` to decide
// whether to auto-close the gallery. A `state` parameter once shadowed the
// import, so the check read the wrong object and the gallery closed even while
// the image slideshow was open.
//
// setupOutsideClickHandler registers its listener via document.addEventListener,
// so we record click handlers on a stub document, run the real
// initializeSettingsPanelControls(), then invoke the recorded handler.

function makeStubEl() {
  return {
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    getAttribute: () => null,
    removeAttribute() {},
    appendChild() {},
    removeChild() {},
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    remove() {},
  };
}

const clickHandlers = [];
globalThis.document = {
  addEventListener(type, fn) {
    if (type === "click") clickHandlers.push(fn);
  },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => makeStubEl(),
  head: makeStubEl(),
  documentElement: makeStubEl(),
  body: { classList: { toggle() {} }, appendChild() {}, removeChild() {}, style: {} },
};
globalThis.window = { addEventListener: () => {} };
globalThis.localStorage = {
  getItem: () => null,
  setItem() {},
};

const { state, elements } = await import("../src/js/init/state.js");
const { initializeSettingsPanelControls } = await import(
  "../src/js/init/eventListeners/settingsPanel.js"
);

function makeGalleryPanel() {
  const attrs = { "aria-hidden": "false" };
  return {
    getAttribute: (k) => attrs[k],
    setAttribute: (k, v) => { attrs[k] = v; },
    contains: () => false,
    focus: () => {},
  };
}

// Click somewhere outside the gallery; the synthetic target matches no selector.
function outsideClickEvent() {
  return {
    target: { closest: () => null },
    defaultPrevented: false,
    cancelBubble: false,
    handled: false,
  };
}

function registerHandlerWithGallery(galleryPanel) {
  clickHandlers.length = 0;
  // Disable the settings/history branches so only the gallery branch can fire.
  elements.settingsButton = null;
  elements.settingsPanel = null;
  elements.closeSettingsButton = null;
  elements.historyPanel = null;
  elements.historyButton = null;
  elements.galleryButton = { setAttribute() {}, focus() {} };
  elements.galleryPanel = galleryPanel;

  initializeSettingsPanelControls();
  // setupOutsideClickHandler registers last, so it is the most recent handler.
  return clickHandlers[clickHandlers.length - 1];
}

test("outside click does NOT close the gallery while the slideshow is open", () => {
  const galleryPanel = makeGalleryPanel();
  state.isSlideshowOpen = true;

  const handler = registerHandlerWithGallery(galleryPanel);
  handler(outsideClickEvent());

  assert.equal(
    galleryPanel.getAttribute("aria-hidden"),
    "false",
    "gallery must stay open when the slideshow is open",
  );
});

test("outside click DOES close the gallery when the slideshow is closed", () => {
  const galleryPanel = makeGalleryPanel();
  state.isSlideshowOpen = false;

  const handler = registerHandlerWithGallery(galleryPanel);
  handler(outsideClickEvent());

  assert.equal(
    galleryPanel.getAttribute("aria-hidden"),
    "true",
    "gallery should close on an outside click when the slideshow is closed",
  );
});
