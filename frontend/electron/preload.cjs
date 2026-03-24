'use strict'

const { contextBridge } = require('electron')

// Exponer al renderer SOLO lo estrictamente necesario.
// No exponer ipcRenderer ni APIs de Node directamente.
contextBridge.exposeInMainWorld('appBridge', {
  version: require('../package.json').version,
})
