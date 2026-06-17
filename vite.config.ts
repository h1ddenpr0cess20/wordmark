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

// Inline the icon sprite into index.html so every `<use href="#id">` is a
// same-document reference. Android System WebView does not fetch an external
// SVG sprite for `<use>` elements inserted after initial load (e.g. message
// copy buttons, dynamically injected panels), so external refs render blank
// there. A same-document sprite resolves reliably in every engine.
const inlineIconSprite = {
  name: "inline-icon-sprite",
  transformIndexHtml: {
    order: "pre" as const,
    handler(html: string) {
      const sprite = readFileSync("src/assets/icons.svg", "utf-8");
      return html.replace("<body>", `<body>\n${sprite}`);
    },
  },
};

export default defineConfig({
  plugins: [inlineIconSprite],
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
    rollupOptions: {
      output: {
        // Split the heavy, rarely-changing vendor libraries out of the main
        // app chunk so they cache independently across app deploys.
        manualChunks(id: string) {
          if (id.includes("node_modules/highlight.js")) return "highlight";
          if (id.includes("node_modules/marked") || id.includes("node_modules/dompurify")) {
            return "markdown";
          }
          return undefined;
        },
      },
    },
  },
});
