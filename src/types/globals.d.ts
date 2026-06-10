/**
 * Ambient declarations for build-time injected globals and Vite-specific imports.
 */

/**
 * Application version string, injected at build time by Vite `define`
 * (`vite.config.ts`) and by the test loader
 * (`tests/helpers/registerLoaders.mjs`) from `package.json`.
 */
declare const __APP_VERSION__: string;

/** Vite `?raw` imports return the file contents as a string. */
declare module "*?raw" {
  const content: string;
  export default content;
}
