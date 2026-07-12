import { register } from "node:module";
import { register as registerTsx } from "tsx/esm/api";
import pkg from "../../package.json" with { type: "json" };

registerTsx();
register("./rawLoader.mjs", import.meta.url);

globalThis.__APP_VERSION__ = pkg.version;
