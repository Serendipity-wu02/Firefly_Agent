'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// Synthetic QA host only. Remote guests never receive this preload.
contextBridge.exposeInMainWorld('qaBrowser', {
  command: input => ipcRenderer.invoke('browser:command', input),
  availability: () => ipcRenderer.invoke('browser:availability'),
});
