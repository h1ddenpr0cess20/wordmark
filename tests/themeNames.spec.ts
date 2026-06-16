import test from 'node:test';
import assert from 'node:assert/strict';

const { parseThemeClassNames, getThemeDisplayName } = await import('../src/ts/components/themeNames.js');

test('parseThemeClassNames extracts theme classes (without the dot), in order', () => {
  const css = `
.theme-dark-red {
  --bg-primary: #000;
}
.theme-aurora {
  --accent-color: #4ffbb0;
}
`;
  assert.deepEqual(parseThemeClassNames(css), ['theme-dark-red', 'theme-aurora']);
});

test('parseThemeClassNames ignores descendant/decorated selectors and de-dupes', () => {
  const css = `
.theme-aurora {
  --bg-primary: #0a0e1a;
}
.theme-aurora .tab-button.active {
  color: var(--accent-color);
}
.theme-aurora #wordmark-logo path {
  stroke: var(--accent-color);
}
.theme-aurora {
  /* a second base block — should not duplicate */
}
`;
  assert.deepEqual(parseThemeClassNames(css), ['theme-aurora']);
});

test('parseThemeClassNames returns [] for empty or matchless input', () => {
  assert.deepEqual(parseThemeClassNames(''), []);
  assert.deepEqual(parseThemeClassNames('.button { color: red; }'), []);
  assert.deepEqual(parseThemeClassNames(null as unknown as string), []);
});

test('getThemeDisplayName title-cases the slug', () => {
  assert.equal(getThemeDisplayName('theme-dark-red'), 'Dark Red');
  assert.equal(getThemeDisplayName('theme-aurora'), 'Aurora');
  assert.equal(getThemeDisplayName('theme-tidepool'), 'Tidepool');
});

test('getThemeDisplayName honors the override map', () => {
  assert.equal(getThemeDisplayName('theme-usa'), 'USA');
  assert.equal(getThemeDisplayName('theme-uk'), 'United Kingdom');
});
