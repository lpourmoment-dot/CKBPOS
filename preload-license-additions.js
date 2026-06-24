// ── A AJOUTER dans preload.js (dans contextBridge.exposeInMainWorld('electron', {...})) ──

  // Licence
  licenseActivateManual: (ckbContent) => ipcRenderer.invoke('license-activate-manual', ckbContent),
  licenseStatus:         ()          => ipcRenderer.invoke('license-status'),
  licenseListenRealtime: (email)     => ipcRenderer.invoke('license-listen-realtime', email),
  licenseStopListen:     ()          => ipcRenderer.invoke('license-stop-listen'),
  onLicenseReceived: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('license-received', handler);
    return () => ipcRenderer.removeListener('license-received', handler);
  },
