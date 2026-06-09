// Registers test-time ESM loader hooks.
//  - tsx/esm: transparently transpiles `.ts` source and resolves `.js`-suffixed
//    import specifiers to their `.ts` files (source uses `.js` extensions).
//  - rawLoader.mjs: Vite `?raw` imports + the DOMPurify DOM-free stub.
import { register } from "node:module";
import { register as registerTsx } from "tsx/esm/api";
import pkg from "../../package.json" with { type: "json" };

registerTsx();
register("./rawLoader.mjs", import.meta.url);

// Vite injects `__APP_VERSION__` via `define` at build time; the test runner
// doesn't go through Vite, so provide the same value from package.json here.
globalThis.__APP_VERSION__ = pkg.version;
