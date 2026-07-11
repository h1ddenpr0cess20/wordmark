# Electron App

Wordmark ships an optional desktop wrapper in [`electron/main.cjs`](../electron/main.cjs).
It is a thin shell — it serves the built web app (`dist/`) from a local
`127.0.0.1` HTTP server and loads it in a `BrowserWindow`. All app logic still
lives in the web app; the native layer only adds desktop integration that a
plain browser tab cannot provide. It's wired into the project's existing
`package.json` — no separate install step.

The web app runs identically to the browser: API calls go straight from the
desktop to the OpenAI/xAI endpoint or a local LM Studio/Ollama server, and all
conversation data stays in local storage / IndexedDB inside the window's
session. There is no backend.

## What the desktop shell adds

- **Local static server** — `electron/main.cjs` serves `dist/` over
  `http://127.0.0.1` on an OS-assigned port with an `index.html` SPA
  fallback, since Vite's root-relative asset paths (`/assets/...`) don't
  resolve under `file://`.
- **Downloads** — files (chat exports, generated images) save straight to the
  OS Downloads folder instead of prompting a save dialog.
- **External links** — navigation to any origin other than the local server
  opens in the system browser; the app window itself never navigates away.
- **Geolocation & media permissions** — granted automatically when the web
  app requests them, since there is no browser permission UI in a packaged
  desktop app.
- **Single instance** — a second launch focuses the existing window instead
  of opening a duplicate.

## Run in development

```bash
npm install
npm run build      # produce dist/
npm run electron   # launch the desktop app
```

## Package a distributable

```bash
npm run build
npm run electron:dist
# -> release/
```

Produces a `dmg`/`zip` on macOS, an `AppImage` on Linux, and an `nsis`
installer on Windows, per the `build` config in `package.json`. Use
`npm run electron:pack` instead for an unpacked app directory, useful for
quick local testing without building an installer.

## Local AI servers

The window's origin is `http://127.0.0.1:<port>`, so the web app's CSP
(`connect-src 'self' https: http: ws: wss:`) already permits reaching a local
LM Studio or Ollama server with no extra configuration. See
[LM Studio](lm-studio.md) and [Ollama](ollama.md).
