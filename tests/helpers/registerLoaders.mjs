// Registers test-time ESM loader hooks (e.g. Vite `?raw` imports).
import { register } from "node:module";
import pkg from "../../package.json" with { type: "json" };

register("./rawLoader.mjs", import.meta.url);

// Vite injects `__APP_VERSION__` via `define` at build time; the test runner
// doesn't go through Vite, so provide the same value from package.json here.
globalThis.__APP_VERSION__ = pkg.version;
