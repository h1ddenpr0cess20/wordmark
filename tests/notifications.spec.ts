import test from "node:test";
import assert from "node:assert/strict";

type FakeEl = {
  tagName: string;
  className: string;
  _id: string;
  id?: string;
  textContent: string;
  innerHTML: string;
  children: FakeEl[];
  parentNode: FakeEl | null;
  attributes: Record<string, string>;
  listeners: Record<string, Array<(e: unknown) => void>>;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  addEventListener(type: string, cb: (e: unknown) => void): void;
  appendChild(child: FakeEl): void;
  removeChild(child: FakeEl): void;
  querySelectorAll(sel: string): FakeEl[];
  classList?: { add(name: string): void; remove(name: string): void; contains(name: string): boolean };
};

function makeElement() {
  const el: FakeEl = {
    tagName: "DIV",
    className: "",
    _id: "",
    textContent: "",
    innerHTML: "",
    children: [],
    parentNode: null,
    attributes: {},
    listeners: {},
    setAttribute(name: string, value: string) { this.attributes[name] = value; },
    getAttribute(name: string) { return name in this.attributes ? this.attributes[name] : null; },
    addEventListener(type: string, cb: (e: unknown) => void) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(cb);
    },
    appendChild(child: FakeEl) { this.children.push(child); child.parentNode = this; },
    removeChild(child: FakeEl) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; },
    querySelectorAll(sel: string) {
      if (sel === ".notification") return this.children.filter(c => (c.className || "").includes("notification"));
      return [];
    },
  };
  Object.defineProperty(el, "id", {
    get() { return el._id; },
    set(v: string) { el._id = v; if (v) elementsById.set(v, el); },
    enumerable: true,
    configurable: true,
  });
  el.classList = {
    add: (name: string) => {
      const parts = (el.className || "").split(/\s+/).filter(Boolean);
      if (!parts.includes(name)) parts.push(name);
      el.className = parts.join(" ");
    },
    remove: (name: string) => {
      el.className = (el.className || "").split(/\s+/).filter(Boolean).filter(c => c !== name).join(" ");
    },
    contains: (name: string) => (el.className || "").split(/\s+/).includes(name),
  };
  return el;
}

const elementsById = new Map<string, FakeEl>();
const body = makeElement();
globalThis.document = {
  readyState: "complete",
  body,
  head: { appendChild() {} },
  createElement(tag: string) { const el = makeElement(); el.tagName = tag.toUpperCase(); return el; },
  getElementById(id: string) { return elementsById.get(id) || null; },
  addEventListener() {},
} as unknown as Document;
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => { cb(0); return 0; }) as unknown as typeof requestAnimationFrame;

const { initNotificationSystem, showSuccess, showError, clearAllNotifications } =
  await import("../src/ts/utils/notifications.ts");

test("initNotificationSystem creates container once", () => {
  const nc = globalThis.document.getElementById("notification-container");
  assert.ok(nc);
  const firstCount = body.children.length;
  initNotificationSystem();
  assert.equal(body.children.length, firstCount);
});

test("showNotification adds and clears notifications", async () => {
  const note = showSuccess("saved!");
  assert.ok(note);
  assert.ok(note.className.includes("success"));
  const nc = globalThis.document.getElementById("notification-container");
  assert.ok(nc);
  assert.equal(nc.querySelectorAll(".notification").length, 1);
  clearAllNotifications();
  await new Promise(r => setTimeout(r, 320));
  assert.equal(nc.querySelectorAll(".notification").length, 0);
});

test("notifications carry an ARIA live role so screen readers announce them", () => {
  const ok = showSuccess("done") as unknown as FakeEl;
  assert.equal(ok.getAttribute("role"), "status", "success should be a polite status");

  const err = showError("boom") as unknown as FakeEl;
  assert.equal(err.getAttribute("role"), "alert", "errors should be assertive alerts");

  clearAllNotifications();
});
