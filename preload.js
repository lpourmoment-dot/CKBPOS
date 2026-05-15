const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Window controls
  minimize: ()        => ipcRenderer.send('window-minimize'),
  maximize: ()        => ipcRenderer.send('window-maximize'),
  close:    ()        => ipcRenderer.send('window-close'),

  // Store
  storeGet:    (key)        => ipcRenderer.invoke('store-get', key),
  storeSet:    (key, value) => ipcRenderer.invoke('store-set', key, value),
  storeDelete: (key)        => ipcRenderer.invoke('store-delete', key),

  // Database
  dbQuery: (sql, params) => ipcRenderer.invoke('db-query', sql, params),
  dbGet:   (sql, params) => ipcRenderer.invoke('db-get',   sql, params),

  // Google Drive
  driveAuth:   ()     => ipcRenderer.invoke('drive-auth'),
  driveToken:  (code) => ipcRenderer.invoke('drive-token', code),
  driveSync:   ()     => ipcRenderer.invoke('drive-sync'),
  driveStatus: ()     => ipcRenderer.invoke('drive-status'),

  // Backup & Reset
  forceMigration:   () => ipcRenderer.invoke('force-migration'),
  getMachineId:     () => ipcRenderer.invoke('get-machine-id'),
  setMachineLabel:  (label) => ipcRenderer.invoke('set-machine-label', label),
  backupLocal: () => ipcRenderer.invoke('backup-local'),
  resetApp:    () => ipcRenderer.invoke('reset-app'),

  // Impression
  printTicket:          (data) => ipcRenderer.invoke('print-ticket', data),
  printShiftReport:     (data) => ipcRenderer.invoke('print-shift-report', data),
  printHistoriqueReport:(data) => ipcRenderer.invoke('print-historique-report', data),
  printProdutosReport:  (data) => ipcRenderer.invoke('print-produtos-report', data),

  // ── v1.0.9 ──────────────────────────────────
  getPrinters: () => ipcRenderer.invoke('get-printers'),

  // Numéro de facture séquentiel
  nextFactureNum: () => ipcRenderer.invoke('next-facture-num'),

  // Empresas
  empresasList:   ()       => ipcRenderer.invoke('empresas-list'),
  empresasAdd:    (data)   => ipcRenderer.invoke('empresas-add', data),
  empresasDelete: (id)     => ipcRenderer.invoke('empresas-delete', id),

  // Réservations
  reservationCreate:  (data) => ipcRenderer.invoke('reservation-create', data),
  reservationList:    ()     => ipcRenderer.invoke('reservation-list'),
  reservationPayer:   (data) => ipcRenderer.invoke('reservation-payer', data),
  reservationEntregar:(data) => ipcRenderer.invoke('reservation-entregar', data),
  reservationAnular:  (data) => ipcRenderer.invoke('reservation-anular', data),
});
