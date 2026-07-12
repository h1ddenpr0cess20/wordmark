import test from "node:test";
import assert from "node:assert/strict";


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
  elements.settingsButton = null;
  elements.settingsPanel = null;
  elements.closeSettingsButton = null;
  elements.historyPanel = null;
  elements.historyButton = null;
  elements.galleryButton = { setAttribute() {}, focus() {}, contains: () => false } as unknown as HTMLButtonElement;
  elements.galleryPanel = galleryPanel as unknown as HTMLElement;

  initializeSettingsPanelControls();
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

test("outside click dismissal does not steal focus back to the gallery button", () => {
  const galleryPanel = makeGalleryPanel();
  state.isSlideshowOpen = false;

  let focusCalls = 0;
  clickHandlers.length = 0;
  elements.settingsButton = null;
  elements.settingsPanel = null;
  elements.closeSettingsButton = null;
  elements.historyPanel = null;
  elements.historyButton = null;
  elements.galleryButton = {
    setAttribute() {},
    focus() { focusCalls++; },
    contains: () => false,
  } as unknown as HTMLButtonElement;
  elements.galleryPanel = galleryPanel as unknown as HTMLElement;

  initializeSettingsPanelControls();
  const handler = clickHandlers[clickHandlers.length - 1];
  handler(outsideClickEvent());

  assert.equal(galleryPanel.getAttribute("aria-hidden"), "true", "gallery should still close");
  assert.equal(focusCalls, 0, "outside-click dismissal must not move focus to the gallery button");
});
