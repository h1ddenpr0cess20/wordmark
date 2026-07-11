const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("wordmarkDesktop", {
  platform: process.platform,
  setTitleBarColors: (colors) => ipcRenderer.invoke("titlebar:set-colors", colors),
});
