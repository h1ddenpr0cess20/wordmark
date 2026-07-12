import test from "node:test";
import assert from "node:assert/strict";

const { getDocumentSourceName, normalizeDocumentPath, shouldIgnoreDirectoryPath } =
  await import("../src/ts/utils/documentPaths.ts");

test("getDocumentSourceName prefers browser and drag/drop relative paths", () => {
  assert.equal(getDocumentSourceName({
    name: "app.ts",
    webkitRelativePath: "project/src/app.ts",
  } as File), "project/src/app.ts");
  assert.equal(getDocumentSourceName({
    name: "app.ts",
    _relativePath: "dropped\\src\\app.ts",
  } as unknown as File), "dropped/src/app.ts");
});

test("normalizeDocumentPath removes unsafe control characters and empty segments", () => {
  assert.equal(normalizeDocumentPath("./project//src\n/../app.ts"), "project/src/app.ts");
});

test("directory filtering skips dependency/cache/generated noise only", () => {
  assert.equal(shouldIgnoreDirectoryPath("project/node_modules/pkg/index.js"), true);
  assert.equal(shouldIgnoreDirectoryPath("project/.git/objects/abc"), true);
  assert.equal(shouldIgnoreDirectoryPath("project/src/app.min.js"), true);
  assert.equal(shouldIgnoreDirectoryPath("project/src/app.js.map"), true);
  assert.equal(shouldIgnoreDirectoryPath("project/src/app.ts"), false);
  assert.equal(shouldIgnoreDirectoryPath("project/docs/build-guide.md"), false);
});
