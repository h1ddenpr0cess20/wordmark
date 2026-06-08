import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

// Vite 8 removed the `--https` CLI flag. HTTPS dev is opt-in via self-signed
// certs: run `npm run cert:generate` to create key.pem/cert.pem, then
// `npm run dev:https`. When the certs are absent the server falls back to HTTP.
const https =
  existsSync("key.pem") && existsSync("cert.pem")
    ? { key: readFileSync("key.pem"), cert: readFileSync("cert.pem") }
    : undefined;

export default defineConfig({
  root: ".",
  publicDir: "public",
  // Inject the app version from package.json (single source of truth) so only
  // the version string lands in the bundle, not the whole package.json.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 3000,
    open: true,
    https,
  },
  preview: {
    port: 8080,
    https,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
