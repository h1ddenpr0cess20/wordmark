import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWindowScript } from './helpers/loadWindowScript.js';

const file = path.resolve('src/js/utils/icons.js');

test('icon helper renders expected SVG attributes', () => {
  const win = loadWindowScript(file, {});
  const svg = win.icon('settings', { width: 24, height: 24, className: 'c', style: 'opacity:1' });
  assert.match(svg, /<svg[^>]+width="24"/);
  assert.match(svg, /class="c"/);
  assert.match(svg, /<use href="src\/assets\/icons\.svg#settings"><\/use>/);
});

