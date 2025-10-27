// Minimal loader to execute browser scripts that attach to `window`
// Uses Node's VM to evaluate the file with a provided window stub
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';

export function loadWindowScript(filePath, extraContext = {}) {
  const absPath = path.resolve(filePath);
  const code = fs.readFileSync(absPath, 'utf-8');

  const window = extraContext.window || {};
  const requireFn = createRequire(import.meta.url);
  const sandbox = {
    window,
    console,
    require: requireFn,
    // Supply minimal stubs for browser APIs if scripts reference them lazily
    document: extraContext.document || undefined,
    navigator: extraContext.navigator || undefined,
    URL: extraContext.URL || URL,
    Blob: extraContext.Blob || Blob,
    FileReader: extraContext.FileReader || undefined,
    fetch: extraContext.fetch || globalThis.fetch,
    atob: extraContext.atob || globalThis.atob,
    btoa: extraContext.btoa || globalThis.btoa,
    setTimeout,
    clearTimeout,
    setImmediate,
  };

  // Allow injecting additional top-level globals if provided
  if (extraContext.globals && typeof extraContext.globals === 'object') {
    for (const [k, v] of Object.entries(extraContext.globals)) {
      sandbox[k] = v;
    }
  }

  const context = vm.createContext(sandbox);
  vm.runInContext(code, context, { filename: absPath });
  return context.window;
}
