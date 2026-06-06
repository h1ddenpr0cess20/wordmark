import test from "node:test";
import assert from "node:assert/strict";

// notifications.js is an ES module that initializes against `document` at import
// time, so install a DOM stub on globalThis before importing it.
function makeElement() {
  const el = {
    tagName: "DIV",
    className: "",
    _id: "",
    textContent: "",
    innerHTML: "",
    children: [],
    parentNode: null,
    listeners: {},
    setAttribute() {},
    addEventListener(type, cb) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(cb);
    },
    appendChild(child) { this.children.push(child); child.parentNode = this; },
    removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; },
    querySelectorAll(sel) {
      if (sel === ".notification") return this.children.filter(c => (c.className || "").includes("notification"));
      return [];
    },
  };
  Object.defineProperty(el, "id", {
    get() { return el._id; },
    set(v) { el._id = v; if (v) elementsById.set(v, el); },
    enumerable: true,
    configurable: true,
  });
  el.classList = {
    add: (name) => {
      const parts = (el.className || "").split(/\s+/).filter(Boolean);
      if (!parts.includes(name)) parts.push(name);
      el.className = parts.join(" ");
    },
    remove: (name) => {
      el.className = (el.className || "").split(/\s+/).filter(Boolean).filter(c => c !== name).join(" ");
    },
    contains: (name) => (el.className || "").split(/\s+/).includes(name),
  };
  return el;
}

const elementsById = new Map();
const body = makeElement();
globalThis.document = {
  readyState: "complete",
  body,
  head: { appendChild() {} },
  createElement(tag) { const el = makeElement(); el.tagName = tag.toUpperCase(); return el; },
  getElementById(id) { return elementsById.get(id) || null; },
  addEventListener() {},
};
globalThis.requestAnimationFrame = (cb) => cb();

const { initNotificationSystem, showSuccess, clearAllNotifications } =
  await import("../src/js/utils/notifications.js");

test("initNotificationSystem creates container once", () => {
  const nc = globalThis.document.getElementById("notification-container");
  assert.ok(nc);
  const firstCount = body.children.length;
  initNotificationSystem();
  assert.equal(body.children.length, firstCount);
});

test("showNotification adds and clears notifications", async () => {
  const note = showSuccess("saved!", 0); // persistent
  assert.ok(note.className.includes("success"));
  const nc = globalThis.document.getElementById("notification-container");
  assert.equal(nc.querySelectorAll(".notification").length, 1);
  clearAllNotifications();
  await new Promise(r => setTimeout(r, 320));
  assert.equal(nc.querySelectorAll(".notification").length, 0);
});
