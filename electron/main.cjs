const { app, BrowserWindow, clipboard, ipcMain, protocol, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const DIST_DIR = path.join(__dirname, "..", "dist");
const APP_ORIGIN = "wordmark://app";

const TITLEBAR_HEIGHT = 36;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".wasm": "application/wasm",
};

protocol.registerSchemesAsPrivileged([{
  scheme: "wordmark",
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
}]);

async function readAppAsset(url) {
  let requestPath;
  try {
    requestPath = decodeURIComponent(new URL(url).pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const relativePath = requestPath === "/" ? "index.html" : `.${requestPath}`;
  const filePath = path.resolve(DIST_DIR, relativePath);
  if (filePath !== DIST_DIR && !filePath.startsWith(`${DIST_DIR}${path.sep}`)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const data = await fs.promises.readFile(filePath);
    return new Response(data, {
      headers: { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream" },
    });
  } catch {
    try {
      const data = await fs.promises.readFile(path.join(DIST_DIR, "index.html"));
      return new Response(data, { headers: { "Content-Type": "text/html" } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }
}

let mainWindow = null;

async function createWindow() {
  if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) {
    throw new Error(`Build not found at ${DIST_DIR}. Run "npm run build" in the project root first.`);
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 500,
    icon: path.join(__dirname, "icon.png"),
    backgroundColor: "#1a1a1a",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#1a1a1a",
      symbolColor: "#ffffff",
      height: TITLEBAR_HEIGHT,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "geolocation" || permission === "media");
  });

  mainWindow.webContents.session.on("will-download", (_event, item) => {
    item.setSavePath(path.join(app.getPath("downloads"), item.getFilename()));
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(`${APP_ORIGIN}/`);
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  ipcMain.handle("titlebar:set-colors", (event, colors) => {
    if (process.platform === "darwin") return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !colors || !HEX_COLOR.test(colors.color) || !HEX_COLOR.test(colors.symbolColor)) {
      return;
    }
    try {
      win.setTitleBarOverlay({
        color: colors.color,
        symbolColor: colors.symbolColor,
        height: TITLEBAR_HEIGHT,
      });
    } catch {}
  });

  ipcMain.handle("clipboard:write-text", (_event, text) => {
    if (typeof text !== "string") {
      throw new TypeError("Clipboard text must be a string");
    }
    clipboard.writeText(text);
  });

  app.whenReady().then(async () => {
    try {
      protocol.handle("wordmark", request => readAppAsset(request.url));
      await createWindow();
    } catch (err) {
      console.error(err.message);
      app.quit();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
