import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  server: {
    port: 3000,
    open: true,
  },
  preview: {
    port: 8080,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
