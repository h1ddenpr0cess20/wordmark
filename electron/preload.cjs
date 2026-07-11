// Bridge between the web app and the desktop shell. Exposed as
// window.wordmarkDesktop; its presence is how the web app detects it is
// running inside Electron (see src/ts/components/desktopTitlebar.ts).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("wordmarkDesktop", {
  platform: process.platform,
  setTitleBarColors: (colors) => ipcRenderer.invoke("titlebar:set-colors", colors),
});
