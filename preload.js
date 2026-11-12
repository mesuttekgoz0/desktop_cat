const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kedi', {
  menu: (open) => ipcRenderer.invoke('menu', open),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: () => ipcRenderer.send('drag-move'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  onBlur: (cb) => ipcRenderer.on('blur', cb),
  getScale: () => ipcRenderer.invoke('get-scale'),
  setScale: (s) => ipcRenderer.invoke('set-scale', s),
  onScale: (cb) => ipcRenderer.on('scale', (_e, s) => cb(s)),
});
