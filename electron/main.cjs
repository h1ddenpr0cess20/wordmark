const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

const DIST_DIR = path.join(__dirname, "..", "dist");

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

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestPath = decodeURIComponent(req.url.split("?")[0]);
      const filePath = path.join(DIST_DIR, requestPath === "/" ? "index.html" : requestPath);

      if (!filePath.startsWith(DIST_DIR)) {
        res.writeHead(403);
        res.end();
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          fs.readFile(path.join(DIST_DIR, "index.html"), (fallbackErr, fallbackData) => {
            if (fallbackErr) {
              res.writeHead(404);
              res.end();
              return;
            }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(fallbackData);
          });
          return;
        }
        res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream" });
        res.end(data);
      });
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

let mainWindow = null;

async function createWindow() {
  if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) {
    throw new Error(`Build not found at ${DIST_DIR}. Run "npm run build" in the project root first.`);
  }

  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 500,
    icon: path.join(__dirname, "icon.png"),
    backgroundColor: "#1a1a1a",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(origin)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(origin)) {
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
    server.close();
  });

  await mainWindow.loadURL(origin);
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

  app.whenReady().then(async () => {
    try {
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
