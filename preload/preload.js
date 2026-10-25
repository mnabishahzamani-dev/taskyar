const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getDefaultFolder: () => ipcRenderer.invoke('backup:get-default-folder'),
    selectFolder: () => ipcRenderer.invoke('backup:select-folder'),
    openFolder: (folderPath) => ipcRenderer.invoke('backup:open-folder', folderPath),
    saveBackupFile: (payload) => ipcRenderer.invoke('backup:save-file', payload),
    exportFileDialog: (data) => ipcRenderer.invoke('backup:export-dialog', data),
    importFileDialog: () => ipcRenderer.invoke('backup:import-dialog'),
    onMenuAction: (channel, callback) => {
        ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
});

