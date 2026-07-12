import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const RAW_SUFFIX = "?raw";

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
