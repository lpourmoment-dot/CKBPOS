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
  backupLocal:    () => ipcRenderer.invoke('backup-local'),
  backupRestore:  () => ipcRenderer.invoke('backup-restore'),  // ✅ v1.1.6 — Restaurer backup
  resetApp:       () => ipcRenderer.invoke('reset-app'),

  // ── v1.1.6 ──────────────────────────────────
  appVersion:     () => ipcRenderer.invoke('app-version'),     // ✅ Version depuis package.json

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

  // ── Caderno de Caixa v1.2.7 ─────────────────────────────
  // Motivos
  cadernoMotivosList:   ()       => ipcRenderer.invoke('caderno-motivos-list'),
  cadernoMotivosAdd:    (data)   => ipcRenderer.invoke('caderno-motivos-add', data),
  cadernoMotivosDelete: (id)     => ipcRenderer.invoke('caderno-motivos-delete', id),

  // Travailleurs
  cadernoTrabalhList:   ()    => ipcRenderer.invoke('caderno-trabalhadores-list'),
  cadernoTrabalhAdd:    (nom) => ipcRenderer.invoke('caderno-trabalhadores-add', nom),
  cadernoTrabalhDelete: (id)  => ipcRenderer.invoke('caderno-trabalhadores-delete', id),

  // Produits caderno
  cadernoProdutosList:   ()    => ipcRenderer.invoke('caderno-produtos-list'),
  cadernoProdutosAdd:    (nom, prix) => ipcRenderer.invoke('caderno-produtos-add', nom, prix),
  cadernoProdutosDelete: (id)  => ipcRenderer.invoke('caderno-produtos-delete', id),

  // Entrées
  cadernoEntriesList:   (params) => ipcRenderer.invoke('caderno-entries-list', params),
  cadernoEntriesAdd:    (entry)  => ipcRenderer.invoke('caderno-entries-add', entry),
  cadernoEntriesDelete: (id)     => ipcRenderer.invoke('caderno-entries-delete', id),
  cadernoEntriesPago:   (id)     => ipcRenderer.invoke('caderno-entries-pago', id),
  cadernoEntriesClear:  (params) => ipcRenderer.invoke('caderno-entries-clear', params),

  // Jours disponibles
  cadernoDaysList: (params) => ipcRenderer.invoke('caderno-days-list', params),

  // Impression Caderno du jour
  printCaderno: (data) => ipcRenderer.invoke('print-caderno', data),

  // ── v1.4.0 Réseau P2P LAN ────────────────────────────────
  networkPeersList: () => ipcRenderer.invoke('network-peers-list'),
  networkStatus:    () => ipcRenderer.invoke('network-status'),
  machinesStats:    () => ipcRenderer.invoke('machines-stats'),
  // ── v1.8.0 Clé réseau LAN ──────────────────────────────
  getNetworkKey: ()      => ipcRenderer.invoke('get-network-key'),
  setNetworkKey: (key)   => ipcRenderer.invoke('set-network-key', key),

  // Écouter les mises à jour de pairs en temps réel
  // Retourne une fonction de cleanup à appeler dans useEffect return
  onNetworkPeersUpdate: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('network-peers-changed', handler);
    return () => ipcRenderer.removeListener('network-peers-changed', handler);
  },

  // ── v1.4.1 Console in-app ────────────────────────────────
  debugLogsGet: () => ipcRenderer.invoke('debug-logs-get'),
  onDebugLog: (cb) => {
    const handler = (_, entry) => cb(entry);
    ipcRenderer.on('debug-log', handler);
    return () => ipcRenderer.removeListener('debug-log', handler);
  },

  // ── v1.5.0 Sync Delta LAN ────────────────────────────────
  syncStatus: () => ipcRenderer.invoke('sync-status'),
  syncForce:  () => ipcRenderer.invoke('sync-force'),
  onSyncUpdate: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('sync-status-changed', handler);
    return () => ipcRenderer.removeListener('sync-status-changed', handler);
  },

  // ── v1.7.0 Supabase Cloud Bridge ─────────────────────────
  cloudConnect:    ()      => ipcRenderer.invoke('cloud-connect'),
  cloudDisconnect: ()      => ipcRenderer.invoke('cloud-disconnect'),
  cloudStatus:     ()      => ipcRenderer.invoke('cloud-status'),
  cloudPush:       ()      => ipcRenderer.invoke('cloud-push'),
  cloudPull:       ()      => ipcRenderer.invoke('cloud-pull'),
  onCloudStatus: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('cloud-sync-status', handler);
    return () => ipcRenderer.removeListener('cloud-sync-status', handler);
  },
  onCloudDataChanged: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('cloud-data-changed', handler);
    return () => ipcRenderer.removeListener('cloud-data-changed', handler);
  },
});
