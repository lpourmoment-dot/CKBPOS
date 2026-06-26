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

  // Auth (v4.9.6 — bcrypt déplacé côté main, évite polyfill 'crypto' webpack)
  authHashPassword:   (plain)       => ipcRenderer.invoke('auth-hash-password', plain),
  authVerifyPassword: (plain, hash) => ipcRenderer.invoke('auth-verify-password', plain, hash),

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
  backupRestore:  () => ipcRenderer.invoke('backup-restore'),  // \u2705 v1.1.6 — Restaurer backup
  resetApp:       () => ipcRenderer.invoke('reset-app'),

  // ── v1.1.6 ──────────────────────────────────
  appVersion:     () => ipcRenderer.invoke('app-version'),     // \u2705 Version depuis package.json

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
  networkPeerRemove: (machine_id) => ipcRenderer.invoke('network-peer-remove', machine_id),
  networkStatus:    () => ipcRenderer.invoke('network-status'),
  machinesStats:    () => ipcRenderer.invoke('machines-stats'),
  // ── v1.8.0 Clé réseau LAN ──────────────────────────────
  getNetworkKey: ()      => ipcRenderer.invoke('get-network-key'),
  setNetworkKey: (key)   => ipcRenderer.invoke('set-network-key', key),

  // ── v1.9.1 Impression partagée ──────────────────────────
  getPrinterMachines: () => ipcRenderer.invoke('get-printer-machines'),
  setPrinterMode: (mode, targetMachineId) => ipcRenderer.invoke('set-printer-mode', { mode, targetMachineId }),
  getPrinterMode: () => ipcRenderer.invoke('get-printer-mode'),
  onPrinterModeChanged: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('printer-mode-changed', handler);
    return () => ipcRenderer.removeListener('printer-mode-changed', handler);
  },

  // ── v3.0 Coordinateur ───────────────────────────────────
  coordStatus:    () => ipcRenderer.invoke('coord-status'),
  coordDashboard: () => ipcRenderer.invoke('coord-dashboard'),
  coordForceSync: () => ipcRenderer.invoke('coord-force-sync'),
  coordRescan:    () => ipcRenderer.invoke('coord-rescan'),
  coordClearQueue:() => ipcRenderer.invoke('coord-clear-queue'),
  coordMetrics:   () => ipcRenderer.invoke('coord-metrics'),
  printQueueStatus: () => ipcRenderer.invoke('print-queue-status'),
  onCoordStatusChanged: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('coord-status-changed', handler);
    return () => ipcRenderer.removeListener('coord-status-changed', handler);
  },

  // ── v3.0 Stock Lock ─────────────────────────────────────
  stockReserve: (product_id, variant_id, qty) => ipcRenderer.invoke('stock-reserve', { product_id, variant_id, qty }),
  stockRelease: (reservation_id, consumed)    => ipcRenderer.invoke('stock-release', { reservation_id, consumed }),

  // ── v3.4 Setup & Onboarding ─────────────────────────────
  checkSetup:          ()       => ipcRenderer.invoke('check-setup'),
  healthCheck:         ()       => ipcRenderer.invoke('health-check'),
  setupComplete:       (data)   => ipcRenderer.invoke('setup-complete', data),
  lanScanForSnapshot:  ()       => ipcRenderer.invoke('lan-scan-for-snapshot'),
  generateInviteCode:  ()       => ipcRenderer.invoke('generate-invite-code'),
  requestSnapshot:     (data)   => ipcRenderer.invoke('request-snapshot', data),
  setRememberSession:  (r)      => ipcRenderer.invoke('set-remember-session', { remember: r }),
  getRememberSession:  ()       => ipcRenderer.invoke('get-remember-session'),
  onSnapshotProgress: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('snapshot-progress', handler);
    return () => ipcRenderer.removeListener('snapshot-progress', handler);
  },
  onSnapshotDone: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('snapshot-done', handler);
    return () => ipcRenderer.removeListener('snapshot-done', handler);
  },
  onSnapshotDenied: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('snapshot-denied', handler);
    return () => ipcRenderer.removeListener('snapshot-denied', handler);
  },

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

  // ── v3.6.0 Rapport journalier ────────────────────────────────
  getFundoCaixa: () => ipcRenderer.invoke('get-fundo-caixa'),

  // ── v3.7.0 Historique connexions ────────────────────────────────
  getUserSessions: (userId) => ipcRenderer.invoke('get-user-sessions', userId),

  // ── v3.8.0 Import DB (Setup wizard) ─────────────────────────────
  importDbFile: () => ipcRenderer.invoke('import-db-file'),

  // ── v4.1.0 Messagerie interne ────────────────────────────────────
  chatSend:       (data)     => ipcRenderer.invoke('chat-send', data),  chatHistory:    (params)   => ipcRenderer.invoke('chat-history', params),
  chatMarkRead:   (data)     => ipcRenderer.invoke('chat-mark-read', data),
  chatUnreadCount:()         => ipcRenderer.invoke('chat-unread-count'),
  chatDeleteMessage:      (data) => ipcRenderer.invoke('chat-delete-message', data),
  chatDeleteConversation: (data) => ipcRenderer.invoke('chat-delete-conversation', data),
  onChatMessage: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('chat-message', handler);
    return () => ipcRenderer.removeListener('chat-message', handler);
  },
  onChatDeleted: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('chat-deleted', handler);
    return () => ipcRenderer.removeListener('chat-deleted', handler);
  },
  onChatConvDeleted: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('chat-conv-deleted', handler);
    return () => ipcRenderer.removeListener('chat-conv-deleted', handler);
  },

  // ── v4.2.0 Audit Log ─────────────────────────────────────────────
  auditList:    (params) => ipcRenderer.invoke('audit-list', params),
  auditActions: ()       => ipcRenderer.invoke('audit-actions'),
  printAuditPdf:(data)   => ipcRenderer.invoke('print-audit-pdf', data),
  auditLogin:   (data)   => ipcRenderer.invoke('audit-login', data),

  // ── v4.3.0 Email rapport ─────────────────────────────────────────
  emailReportSend:  (data) => ipcRenderer.invoke('email-report-send', data),
  emailReportBuild: (data) => ipcRenderer.invoke('email-report-build', data),
  emailConfigGet:   ()     => ipcRenderer.invoke('email-config-get'),
  emailConfigSet:   (data) => ipcRenderer.invoke('email-config-set', data),

  // ── v4.4.0 Coord avancé ──────────────────────────────────────────
  coordConnectedUsers: () => ipcRenderer.invoke('coord-connected-users'),
  coordBroadcastMsg:  (data) => ipcRenderer.invoke('coord-broadcast-msg', data),

  // ── v4.5.0 Export Excel ──────────────────────────────────────────
  excelExportSales: (params) => ipcRenderer.invoke('excel-export-sales', params),
  excelExportStock: ()       => ipcRenderer.invoke('excel-export-stock'),

  // ── v4.6.2 Console SQL debug ─────────────────────────────────────
  devSqlQuery: (sql) => ipcRenderer.invoke('dev-sql-query', sql),

  // ── v4.9.0 Auto-update ────────────────────────────────────────────
  updateCheck:   () => ipcRenderer.invoke('update-check'),
  updateDownload:() => ipcRenderer.invoke('update-download'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  onUpdateStatus: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },

  // ── Licensing ────────────────────────────────────────────────────
  licenseActivateManual: (ckbContent) => ipcRenderer.invoke('license-activate-manual', ckbContent),
  licenseStatus:         ()          => ipcRenderer.invoke('license-status'),
  licenseListenRealtime: (email)     => ipcRenderer.invoke('license-listen-realtime', email),
  licenseStopListen:     ()          => ipcRenderer.invoke('license-stop-listen'),
  onLicenseReceived: (cb) => {
    const handler = (_, payload) => cb(payload);
    ipcRenderer.on('license-received', handler);
    return () => ipcRenderer.removeListener('license-received', handler);
  },
  onLicenseSalesUpdated: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('license-sales-updated', handler);
    return () => ipcRenderer.removeListener('license-sales-updated', handler);
  },
});
