import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

const https =
  existsSync("key.pem") && existsSync("cert.pem")
    ? { key: readFileSync("key.pem"), cert: readFileSync("cert.pem") }
    : undefined;

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
