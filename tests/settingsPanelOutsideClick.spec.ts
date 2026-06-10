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

type ClickHandler = (event: unknown) => void;
const clickHandlers: ClickHandler[] = [];
globalThis.document = {
  addEventListener(type: string, fn: ClickHandler) {
    if (type === "click") clickHandlers.push(fn);
  },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => makeStubEl(),
  head: makeStubEl(),
  documentElement: makeStubEl(),
  body: { classList: { toggle() {} }, appendChild() {}, removeChild() {}, style: {} },
} as unknown as Document;
globalThis.window = { addEventListener: () => {} } as unknown as Window & typeof globalThis;
globalThis.localStorage = {
  getItem: () => null,
  setItem() {},
} as unknown as Storage;

const { state, elements } = await import("../src/ts/init/state.ts");
const { initializeSettingsPanelControls } = await import(
  "../src/ts/init/eventListeners/settingsPanel.ts"
);

function makeGalleryPanel() {
  const attrs: Record<string, string> = { "aria-hidden": "false" };
  return {
    getAttribute: (k: string) => attrs[k],
    setAttribute: (k: string, v: string) => { attrs[k] = v; },
    contains: () => false,
    focus: () => {},
  };
}
type GalleryPanel = ReturnType<typeof makeGalleryPanel>;

// Click somewhere outside the gallery; the synthetic target matches no selector.
function outsideClickEvent() {
  return {
    target: { closest: () => null },
    defaultPrevented: false,
    cancelBubble: false,
    handled: false,
  };
}

function registerHandlerWithGallery(galleryPanel: GalleryPanel) {
  clickHandlers.length = 0;
  // Disable the settings/history branches so only the gallery branch can fire.
  elements.settingsButton = null;
  elements.settingsPanel = null;
  elements.closeSettingsButton = null;
  elements.historyPanel = null;
  elements.historyButton = null;
  elements.galleryButton = { setAttribute() {}, focus() {} } as unknown as HTMLButtonElement;
  elements.galleryPanel = galleryPanel as unknown as HTMLElement;

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
