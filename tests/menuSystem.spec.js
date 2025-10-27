import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWindowScript } from './helpers/loadWindowScript.js';

function createDom() {
  const elements = new Map();
  const body = { appendChild() {}, removeChild() {} };
  const head = { appendChild() {} };
  const api = {
    readyState: 'complete',
    body,
    head,
    addEventListener() {},
    getElementById(id) { return elements.get(id) || null; },
    createElement(tag) { return { tagName: tag.toUpperCase(), innerHTML: '', setAttribute() {}, addEventListener() {}, parentNode: null }; },
  };
  return { api, elements };
}

const menuPath = path.resolve('src/js/utils/menuSystem.js');

test('HTMLLoader.loadHTML inserts content into container', async () => {
  const { api, elements } = createDom();
  const container = { id: 'c1', innerHTML: '' };
  elements.set('c1', container);
  const win = loadWindowScript(menuPath, {
    window: { addEventListener: () => {} },
    document: api,
    fetch: async (fp) => ({ ok: true, text: async () => `<p>Loaded: ${fp}</p>` }),
    globals: { fetch: async (fp) => ({ ok: true, text: async () => `<p>Loaded: ${fp}</p>` }) },
  });

  await win.HTMLLoader.loadHTML('file.html', 'c1');
  assert.match(container.innerHTML, /Loaded: file\.html/);
});

test('initializeMenus IIFE loads panels and calls initialize', async () => {
  const { api, elements } = createDom();
  const container = { id: 'menu-panels-container', innerHTML: '' };
  elements.set('menu-panels-container', container);
  const tabIds = [
    'content-personality',
    'content-model',
    'content-tools',
    'content-data',
    'content-memory',
    'content-tts',
    'content-theme',
    'content-apikeys',
    'content-location',
    'content-about',
  ];
  tabIds.forEach(id => elements.set(id, { id, innerHTML: '' }));
  let initCalled = 0, themeCalled = 0;
  const basePanelHtml = [
    'content-personality',
    'content-model',
    'content-tools',
    'content-data',
    'content-memory',
    'content-tts',
    'content-theme',
    'content-apikeys',
    'content-location',
    'content-about',
  ].map(id => `<div id=\"${id}\"></div>`).join('');
  const fetchStub = async (resource) => {
    const path = typeof resource === 'string' ? resource : resource?.url ?? '';
    if (path === 'src/html/panels.html') {
      return { ok: true, text: async () => basePanelHtml };
    }
    return { ok: true, text: async () => `<p>${path}</p>` };
  };
  const win = loadWindowScript(menuPath, {
    window: {
      addEventListener: () => {},
      initialize: () => { initCalled++; },
      initTheme: async () => { themeCalled++; },
    },
    document: api,
    fetch: fetchStub,
    globals: { fetch: fetchStub },
  });

  // The IIFE runs on load; give microtask a tick
  await new Promise(r => setTimeout(r, 0));
  assert.equal(container.innerHTML, basePanelHtml);
  assert.equal(elements.get('content-personality').innerHTML, '<p>src/html/panels/settings/personality.html</p>');
  assert.equal(elements.get('content-model').innerHTML, '<p>src/html/panels/settings/model.html</p>');
  assert.equal(elements.get('content-tools').innerHTML, '<p>src/html/panels/settings/tools.html</p>');
  assert.equal(themeCalled, 1);
  assert.equal(initCalled, 1);
});

test('HTMLLoader.loadMultiple loads all targets', async () => {
  const { api, elements } = createDom();
  const c1 = { id: 'a', innerHTML: '' };
  const c2 = { id: 'b', innerHTML: '' };
  elements.set('a', c1);
  elements.set('b', c2);
  const win = loadWindowScript(menuPath, {
    window: { addEventListener: () => {} },
    document: api,
    fetch: async ({}) => ({ ok: true, text: async () => 'X' }),
    globals: { fetch: async () => ({ ok: true, text: async () => 'X' }) },
  });

  await win.HTMLLoader.loadMultiple([
    { filePath: '1.html', containerId: 'a' },
    { filePath: '2.html', containerId: 'b' },
  ]);
  assert.equal(c1.innerHTML, 'X');
  assert.equal(c2.innerHTML, 'X');
});
