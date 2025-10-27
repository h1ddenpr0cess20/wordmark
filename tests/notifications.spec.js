import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWindowScript } from './helpers/loadWindowScript.js';

process.on('uncaughtException', (e) => { console.error('uncaughtException', e); });
process.on('unhandledRejection', (e) => { console.error('unhandledRejection', e); });

function createDom() {
  const elementsById = new Map();
  const makeElement = () => {
    const el = {
      tagName: 'DIV',
      className: '',
      _id: '',
      textContent: '',
      innerHTML: '',
      children: [],
      parentNode: null,
      listeners: {},
      setAttribute() {},
      addEventListener(type, cb) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(cb);
      },
      dispatchEvent(evt) {
        (this.listeners[evt.type] || []).forEach(fn => fn(evt));
      },
      appendChild(child) { this.children.push(child); child.parentNode = this; },
      removeChild(child) { const i=this.children.indexOf(child); if(i>=0) this.children.splice(i,1); child.parentNode=null; },
      querySelectorAll(sel) {
        // Only need to support selection of top-level notifications for tests
        if (sel === '.notification') return this.children.filter(c => (c.className||'').includes('notification'));
        return [];
      },
    };
    // Define id with registry updates
    Object.defineProperty(el, 'id', {
      get() { return el._id; },
      set(v) { el._id = v; if (v) elementsById.set(v, el); },
      enumerable: true,
      configurable: true,
    });

    // Minimal classList implementation backed by className
    el.classList = {
      add: (name) => {
        const parts = (el.className || '').split(/\s+/).filter(Boolean);
        if (!parts.includes(name)) parts.push(name);
        el.className = parts.join(' ');
      },
      remove: (name) => {
        const parts = (el.className || '').split(/\s+/).filter(Boolean).filter(c => c !== name);
        el.className = parts.join(' ');
      },
      contains: (name) => (el.className || '').split(/\s+/).includes(name),
    };
    return el;
  };
  const container = makeElement();
  const head = { appendChild() {} };
  const api = {
    readyState: 'complete',
    body: container,
    head,
    createElement(tag){ const el = makeElement(); el.tagName = tag.toUpperCase(); return el; },
    getElementById(id){ return elementsById.get(id) || null; },
    addEventListener(){},
  };
  return { api, container };
}

const file = path.resolve('src/js/utils/notifications.js');

test('initNotificationSystem creates container once', () => {
  const { api, container } = createDom();
  const win = loadWindowScript(file, {
    document: api,
    window: {},
    globals: {
      requestAnimationFrame: (cb) => cb(),
    },
  });
  // Container should be created and appended
  const nc = api.getElementById('notification-container');
  assert.ok(nc);
  const firstCount = container.children.length;
  win.initNotificationSystem();
  assert.equal(container.children.length, firstCount);
});

test('showNotification adds and clears notifications', async () => {
  const { api, container } = createDom();
  const win = loadWindowScript(file, {
    document: api,
    window: {},
    globals: {
      requestAnimationFrame: (cb) => cb(),
    },
  });
  const note = win.showSuccess('saved!', 0); // persistent
  assert.ok(note.className.includes('success'));
  const nc = api.getElementById('notification-container');
  assert.equal(nc.querySelectorAll('.notification').length, 1);
  win.clearAllNotifications();
  // clearAll removes with animation; simulate timeout completion
  await new Promise(r => setTimeout(r, 320));
  assert.equal(nc.querySelectorAll('.notification').length, 0);
});
