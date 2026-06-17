import test from 'node:test';
import assert from 'node:assert/strict';
import { icon } from '../src/ts/utils/icons.js';

test('icon helper renders expected SVG attributes', () => {
  const svg = icon('settings', { width: 24, height: 24, className: 'c', style: 'opacity:1' });
  assert.match(svg, /<svg[^>]+width="24"/);
  assert.match(svg, /class="c"/);
  assert.match(svg, /<use href="#settings"><\/use>/);
});

test('icon helper marks decorative icons hidden from assistive tech', () => {
  const svg = icon('trash');
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, /focusable="false"/);
});
