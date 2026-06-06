// Registers test-time ESM loader hooks (e.g. Vite `?raw` imports).
import { register } from "node:module";

register("./rawLoader.mjs", import.meta.url);
