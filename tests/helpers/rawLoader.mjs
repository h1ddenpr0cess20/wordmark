// Node ESM customization hooks so tests can import Vite-style `*?raw` modules.
// Mirrors Vite's `?raw` import: returns the file contents as a default-export string.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const RAW_SUFFIX = "?raw";

// DOMPurify's default export is a factory needing a DOM `window` to yield a
// working instance, which Node test processes lack. Source imports it directly
// (`import DOMPurify from "dompurify"`); substitute an identity-sanitizer stub
// so DOM-free unit tests can run.
const DOMPURIFY_URL = "test-stub:dompurify";

export async function resolve(specifier, context, next) {
  if (specifier === "dompurify") {
    return { url: DOMPURIFY_URL, format: "module", shortCircuit: true };
  }
  if (specifier.endsWith(RAW_SUFFIX)) {
    const bare = specifier.slice(0, -RAW_SUFFIX.length);
    const resolved = await next(bare, context);
    return { ...resolved, url: `${resolved.url}${RAW_SUFFIX}`, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url === DOMPURIFY_URL) {
    return {
      format: "module",
      source: "export default { sanitize: (html) => html, addHook: () => {} };",
      shortCircuit: true,
    };
  }
  if (url.endsWith(RAW_SUFFIX)) {
    const filePath = fileURLToPath(url.slice(0, -RAW_SUFFIX.length));
    const source = await readFile(filePath, "utf8");
    return {
      format: "module",
      source: `export default ${JSON.stringify(source)};`,
      shortCircuit: true,
    };
  }
  return next(url, context);
}
