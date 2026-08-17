const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("wordmarkDesktop", {
  platform: process.platform,
  setTitleBarColors: (colors) => ipcRenderer.invoke("titlebar:set-colors", colors),
  writeText: (text) => ipcRenderer.invoke("clipboard:write-text", text),
  showMessageBox: (options) => ipcRenderer.invoke("dialog:message-box", options),
});
