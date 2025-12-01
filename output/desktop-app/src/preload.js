const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startOrchestrator: () => ipcRenderer.invoke('orch-start'),
  stopOrchestrator: () => ipcRenderer.invoke('orch-stop'),
  runScrape: (q) => ipcRenderer.invoke('run-scrape', q),
  runPreview: (templates) => ipcRenderer.invoke('run-preview', templates),
  runSend: (payload) => ipcRenderer.invoke('run-send', payload),
  selectCredentials: () => ipcRenderer.invoke('select-credentials'),
  dockerUp: () => ipcRenderer.invoke('docker-up'),
  onLog: (cb) => ipcRenderer.on('log', (e, data) => cb(data))
});
