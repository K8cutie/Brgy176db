// ChurchOS — Electron preload (runs in an isolated context with access to
// Node, bridging a safe API to the renderer). The SQLite data API will be
// exposed here in the next phase via ipcRenderer.invoke(...).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('churchos', {
  isDesktop: true,
  platform: process.platform,
  db: {
    getAll: () => ipcRenderer.invoke('churchos:db:getAll'),
    set: (key, value) => ipcRenderer.invoke('churchos:db:set', key, value),
    delete: (key) => ipcRenderer.invoke('churchos:db:delete', key),
  },
  auth: {
    hasUsers: () => ipcRenderer.invoke('churchos:auth:hasUsers'),
    list: () => ipcRenderer.invoke('churchos:auth:list'),
    current: () => ipcRenderer.invoke('churchos:auth:current'),
    create: (payload) => ipcRenderer.invoke('churchos:auth:create', payload),
    login: (username, password) => ipcRenderer.invoke('churchos:auth:login', username, password),
    logout: () => ipcRenderer.invoke('churchos:auth:logout'),
    changePassword: (payload) => ipcRenderer.invoke('churchos:auth:changePassword', payload),
  },
  ai: {
    status: () => ipcRenderer.invoke('churchos:ai:status'),
    setKey: (key) => ipcRenderer.invoke('churchos:ai:setKey', key),
    chat: (messages) => ipcRenderer.invoke('churchos:ai:chat', messages),
  },
  backup: {
    now: () => ipcRenderer.invoke('churchos:backup:now'),
    list: () => ipcRenderer.invoke('churchos:backup:list'),
    openFolder: () => ipcRenderer.invoke('churchos:backup:openFolder'),
    export: () => ipcRenderer.invoke('churchos:backup:export'),
    restore: () => ipcRenderer.invoke('churchos:backup:restore'),
  },
  sync: {
    status: () => ipcRenderer.invoke('churchos:sync:status'),
    config: (patch) => ipcRenderer.invoke('churchos:sync:config', patch),
    now: () => ipcRenderer.invoke('churchos:sync:now'),
  },
  appVersion: () => ipcRenderer.invoke('churchos:app:version'),
  update: {
    check: () => ipcRenderer.invoke('churchos:update:check'),
    status: () => ipcRenderer.invoke('churchos:update:status'),
    install: () => ipcRenderer.invoke('churchos:update:install'),
    onEvent: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on('churchos:update:event', handler);
      return () => ipcRenderer.removeListener('churchos:update:event', handler);
    },
  },
});
