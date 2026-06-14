import test from "node:test";
import assert from "node:assert/strict";

const { IMAGE_PLACEHOLDER_PATTERN, createImagePlaceholderRegex } = await import(
  "../src/ts/utils/placeholders.js"
);

test("createImagePlaceholderRegex captures the filename and is global", () => {
  const re = createImagePlaceholderRegex();
  assert.equal(re.global, true);
  const m = "before [[IMAGE: cat.png]] after".match(createImagePlaceholderRegex());
  assert.deepEqual(m, ["[[IMAGE: cat.png]]"]);

  const exec = createImagePlaceholderRegex().exec("x [[IMAGE: a.jpg]] y");
  assert.equal(exec?.[1], "a.jpg");
});

test("tolerates zero or more spaces after the colon", () => {
  assert.match("[[IMAGE:nospace.png]]", createImagePlaceholderRegex());
  assert.match("[[IMAGE:   wide.png]]", createImagePlaceholderRegex());
});

test("returns a fresh regex each call (independent lastIndex)", () => {
  const a = createImagePlaceholderRegex();
  const b = createImagePlaceholderRegex();
  assert.notEqual(a, b);
  a.exec("[[IMAGE: one.png]][[IMAGE: two.png]]");
  // b is unaffected by a's advanced lastIndex
  assert.equal(b.lastIndex, 0);
});

test("matches all placeholders in a string", () => {
  const input = "[[IMAGE: a.png]] mid [[IMAGE: b.png]]";
  const all = input.match(createImagePlaceholderRegex());
  assert.deepEqual(all, ["[[IMAGE: a.png]]", "[[IMAGE: b.png]]"]);
});

test("pattern constant is the regex source", () => {
  assert.equal(createImagePlaceholderRegex().source, IMAGE_PLACEHOLDER_PATTERN);
});
