const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  analyze: (url) => ipcRenderer.invoke('analyze-twitter', url),
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  // 代理请求，用于解决跨域问题
  proxyRequest: (url) => ipcRenderer.invoke('proxy-request', url),
  // 设置相关
  getConfig: () => ipcRenderer.invoke('get-config'),
  selectDownloadPath: () => ipcRenderer.invoke('select-download-path'),
  openDownloadsFolder: () => ipcRenderer.invoke('open-downloads-folder'),
  // 下载
  downloadFile: (url, filename) => ipcRenderer.invoke('download-file', url, filename),
  saveGif: (buffer, filename) => ipcRenderer.invoke('save-gif', buffer, filename),
});