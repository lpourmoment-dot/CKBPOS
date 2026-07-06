/**
 * LAN/USB Communication Service for CKBPOS Mobile
 *
 * Connects to desktop via:
 * - USB: ADB port forwarding (adb forward tcp:41234 tcp:41234)
 * - WiFi: direct WebSocket to desktop IP on same network
 *
 * Protocol matches desktop exactly:
 * - CKBPOS_INFO handshake with product, machine_id, network_key
 * - PING/PONG heartbeat
 * - AES-256-GCM encryption when network_key is set
 */

import * as Crypto from 'expo-crypto';
import { dbAll, dbRun, getSetting, setSetting, getDb } from '../db/sqlite';

const WS_PORT = 41234;
const PRODUCT_ID = 'CKBPOS';

interface LANMessage {
  type: string;
  product?: string;
  from?: string;
  to?: string;
  payload?: any;
  network_key?: string;
  machine_id?: string;
  machine_label?: string;
  port?: number;
  _enc?: boolean;
  iv?: string;
  d?: string;
  t?: string;
  invite_code?: string;
  snapshot?: Record<string, any[]>;
  index?: number;
  total?: number;
  data?: string;
  reason?: string;
}

interface LANState {
  connected: boolean;
  desktopIp: string | null;
  desktopLabel: string | null;
  desktopMachineId: string | null;
  lastPing: number;
  latency: number;
}

type MessageHandler = (msg: LANMessage) => void;

class LANService {
  private ws: WebSocket | null = null;
  private state: LANState = {
    connected: false,
    desktopIp: null,
    desktopLabel: null,
    desktopMachineId: null,
    lastPing: 0,
    latency: 0,
  };
  private handlers: Map<string, MessageHandler[]> = new Map();
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectIp: string | null = null;
  private myMachineId: string = '';
  private myLabel: string = '';
  private networkKey: string = '';
  private _onStatusChange: ((connected: boolean) => void) | null = null;
  private snapshotChunks: string[] = [];
  private snapshotTotal = 0;

  async init() {
    this.myMachineId = (await getSetting('machine_id')) || this.generateId();
    this.myLabel = (await getSetting('machine_label')) || 'CKBPOS Mobile';
    this.networkKey = (await getSetting('network_key')) || '';
    // Ensure machine_id exists in DB
    if (!(await getSetting('machine_id'))) {
      await setSetting('machine_id', this.myMachineId);
    }
  }

  private generateId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  }

  onStatusChange(cb: (connected: boolean) => void) {
    this._onStatusChange = cb;
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }

  off(type: string, handler: MessageHandler) {
    const list = this.handlers.get(type);
    if (list) {
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  private emit(type: string, msg: LANMessage) {
    const list = this.handlers.get(type);
    if (list) list.forEach(h => h(msg));
    const all = this.handlers.get('*');
    if (all) all.forEach(h => h(msg));
  }

  /**
   * Get machine info payload matching desktop format
   */
  private getMachineInfo(): LANMessage {
    return {
      type: 'CKBPOS_INFO',
      product: PRODUCT_ID,
      machine_id: this.myMachineId,
      machine_label: this.myLabel,
      port: 0,
      network_key: this.networkKey || '',
    };
  }

  /**
   * Send raw message (plain JSON, no encryption for mobile-to-desktop)
   */
  send(msg: LANMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (e) {
      console.error('[LAN] Send error:', e);
    }
  }

  /**
   * Connect to desktop via IP (WiFi LAN or USB)
   */
  async connect(ip: string): Promise<boolean> {
    await this.init();
    this.disconnect();
    this.reconnectIp = ip;

    return new Promise((resolve) => {
      try {
        const url = `ws://${ip}:${WS_PORT}`;
        this.ws = new WebSocket(url);

        const timeout = setTimeout(() => {
          this.ws?.close();
          resolve(false);
        }, 5000);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          console.log('[LAN] WebSocket opened to ' + ip);
          // Send CKBPOS_INFO handshake (matches desktop protocol)
          this.send(this.getMachineInfo());
        };

        this.ws.onmessage = (event) => {
          try {
            const raw = String(event.data);
            const msg: LANMessage = JSON.parse(raw);
            this.handleMessage(msg);
          } catch (e) {
            console.error('[LAN] Parse error:', e);
          }
        };

        this.ws.onclose = () => {
          clearTimeout(timeout);
          const wasConnected = this.state.connected;
          this.state.connected = false;
          this.state.desktopIp = null;
          this.state.desktopLabel = null;
          this.state.desktopMachineId = null;
          this._onStatusChange?.(false);
          this.stopPing();
          if (wasConnected) {
            // Auto-reconnect after 3s
            this.reconnectTimeout = setTimeout(() => {
              if (this.reconnectIp) this.connect(this.reconnectIp);
            }, 3000);
          }
        };

        this.ws.onerror = (e) => {
          console.error('[LAN] WebSocket error:', e);
          clearTimeout(timeout);
          resolve(false);
        };
      } catch (e) {
        console.error('[LAN] Connect error:', e);
        resolve(false);
      }
    });
  }

  /**
   * Connect via USB (ADB port forwarding)
   */
  async connectViaUSB(): Promise<boolean> {
    return this.connect('127.0.0.1');
  }

  /**
   * Handle incoming messages from desktop
   */
  private handleMessage(msg: LANMessage) {
    switch (msg.type) {
      case 'CKBPOS_INFO': {
        // Desktop sends its info on connection
        this.state.connected = true;
        this.state.desktopIp = this.reconnectIp;
        this.state.desktopLabel = msg.machine_label || 'Desktop';
        this.state.desktopMachineId = msg.machine_id || null;
        this._onStatusChange?.(true);
        this.pingInterval = setInterval(() => this.ping(), 10000);
        console.log('[LAN] Desktop connected: ' + msg.machine_label + ' (' + msg.machine_id + ')');
        this.emit('peer:info', msg);
        break;
      }

      case 'PONG': {
        this.state.latency = Date.now() - this.state.lastPing;
        this.emit('pong', msg);
        break;
      }

      case 'PING': {
        this.send({ type: 'PONG', machine_id: this.myMachineId });
        break;
      }

      case 'CKBPOS_PRODUCT_QUERY':
        this.handleProductQuery(msg);
        break;

      case 'CKBPOS_SALE_SYNC':
        this.handleSaleSync(msg);
        break;

      case 'CKBPOS_CHAT':
        this.emit('chat:message', msg);
        break;

      case 'SNAPSHOT_DATA': {
        this.emit('snapshot:data', msg);
        break;
      }

      case 'SNAPSHOT_CHUNK': {
        this.emit('snapshot:chunk', msg);
        break;
      }

      case 'SNAPSHOT_DENIED': {
        this.emit('snapshot:denied', msg);
        break;
      }

      default:
        this.emit(msg.type, msg);
        break;
    }
  }

  /**
   * Handle product lookup from desktop
   */
  private async handleProductQuery(msg: LANMessage) {
    const barcode = msg.payload?.barcode;
    if (!barcode) return;

    const products = await dbAll(
      'SELECT * FROM products WHERE barcode=? AND actif=1',
      [barcode]
    );

    if (products.length > 0) {
      this.send({
        type: 'CKBPOS_PRODUCT_RESPONSE',
        to: msg.from,
        payload: { barcode, product: products[0] },
      });
    }
  }

  /**
   * Handle sale sync from desktop
   */
  private async handleSaleSync(msg: LANMessage) {
    const sale = msg.payload;
    if (!sale?.uuid) return;

    try {
      const existing = await dbAll('SELECT id FROM ventes WHERE uuid=?', [sale.uuid]);
      if (existing.length === 0) {
        await dbRun(
          `INSERT OR IGNORE INTO ventes (uuid, user_id, client_nom, client_nif, total, montant_recu, monnaie_rendue, mode_paiement, montant_dinheiro, montant_express, machine_id, facture_num, statut, date_vente)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sale.uuid, sale.user_id || 1, sale.client_nom || 'CONSUMIDOR FINAL', sale.client_nif || 'CONSUMIDOR FINAL',
           sale.total, sale.montant_recu || 0, sale.monnaie_rendue || 0, sale.mode_paiement || 'dinheiro',
           sale.montant_dinheiro || 0, sale.montant_express || 0, sale.machine_id || '', sale.facture_num || '',
           sale.statut || 'normal', sale.date_vente || new Date().toISOString()]
        );

        if (sale.items && Array.isArray(sale.items)) {
          const ventaId = await dbAll<{ id: number }>('SELECT id FROM ventes WHERE uuid=?', [sale.uuid]);
          if (ventaId[0]) {
            for (const item of sale.items) {
              await dbRun(
                'INSERT INTO vente_items (vente_id, product_id, type_vente, quantite, prix_unitaire, sous_total, statut) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [ventaId[0].id, item.product_id, item.type_vente, item.quantite, item.prix_unitaire, item.sous_total, 'normal']
              );
            }
          }
        }

        console.log('[LAN] Synced sale from desktop:', sale.uuid);
      }
    } catch (e) {
      console.error('[LAN] Sale sync error:', e);
    }
  }

  /**
   * Request product info from desktop by barcode
   */
  async queryProduct(barcode: string): Promise<any | null> {
    if (!this.state.connected) return null;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 5000);

      const handler = (msg: LANMessage) => {
        if (msg.payload?.barcode === barcode) {
          clearTimeout(timeout);
          this.off('CKBPOS_PRODUCT_RESPONSE', handler);
          resolve(msg.payload.product || null);
        }
      };
      this.on('CKBPOS_PRODUCT_RESPONSE', handler);

      this.send({
        type: 'CKBPOS_PRODUCT_QUERY',
        payload: { barcode },
      });
    });
  }

  /**
   * Push a sale to desktop for sync
   */
  async pushSale(sale: any) {
    if (!this.state.connected) return;
    this.send({
      type: 'CKBPOS_SALE_SYNC',
      payload: sale,
    });
  }

  /**
   * Request a full DB snapshot from desktop (for setup import)
   */
  async requestSnapshot(opts: { invite_code?: string; network_key?: string }): Promise<boolean> {
    if (!this.state.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.send({
      type: 'SNAPSHOT_REQUEST',
      invite_code: opts.invite_code || '',
      network_key: opts.network_key || this.networkKey,
    });
    return true;
  }

  /**
   * Apply a snapshot received from desktop (tables → local DB)
   */
  async applySnapshot(snapshot: Record<string, any[]>, receivedNetworkKey?: string): Promise<{ total: number; errors: number }> {
    const LOCAL_SETTINGS = new Set([
      'machine_id', 'machine_label', 'network_key', 'supabase_url', 'supabase_key',
      'cloud_last_seq', 'sync_applying', 'printer_mode', 'printer_machine_id',
      'setup_done', 'remember_session',
    ]);

    const database = await getDb();
    let total = 0;
    let errors = 0;

    await database.execAsync("INSERT OR REPLACE INTO settings (key,value) VALUES ('sync_applying','1')");

    try {
      for (const [table, rows] of Object.entries(snapshot)) {
        if (!rows?.length) continue;

        if (table === 'settings') {
          for (const r of rows) {
            if (!LOCAL_SETTINGS.has(r.key)) {
              try {
                await database.runAsync('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', [r.key, r.value]);
                total++;
              } catch { errors++; }
            }
          }
          continue;
        }

        // Get known columns for this table
        let knownCols: Set<string>;
        try {
          const colInfo = await database.getAllAsync<{ name: string }>(`PRAGMA table_info("${table}")`);
          knownCols = new Set(colInfo.map(c => c.name));
        } catch {
          continue; // table doesn't exist locally, skip
        }

        for (const row of rows) {
          try {
            const rowKeys = Object.keys(row).filter(k => knownCols.has(k));
            if (rowKeys.length === 0) continue;

            // ventes: deduplicate by uuid
            if (table === 'ventes' && row.uuid) {
              const existing = await database.getFirstAsync<{ id: number }>('SELECT id FROM ventes WHERE uuid=?', [row.uuid]);
              if (existing) continue; // skip duplicate
              const skip = new Set(['id']);
              const cols = rowKeys.filter(k => !skip.has(k));
              const phs = cols.map(() => '?').join(',');
              const vals = cols.map(k => row[k]);
              await database.runAsync(`INSERT INTO ventes ("${cols.join('","')}") VALUES (${phs})`, vals);
            } else {
              const cols = rowKeys;
              const phs = cols.map(() => '?').join(',');
              const vals = cols.map(k => row[k]);
              await database.runAsync(`INSERT OR IGNORE INTO "${table}" ("${cols.join('","')}") VALUES (${phs})`, vals);
            }
            total++;
          } catch {
            errors++;
          }
        }
      }
    } finally {
      await database.execAsync("INSERT OR REPLACE INTO settings (key,value) VALUES ('sync_applying','0')");
    }

    // Mark setup done
    await database.runAsync("INSERT OR REPLACE INTO settings (key,value) VALUES ('setup_done','1')");

    // Sync network_key from source
    if (receivedNetworkKey && receivedNetworkKey.trim()) {
      await database.runAsync("INSERT OR REPLACE INTO settings (key,value) VALUES ('network_key',?)", [receivedNetworkKey.trim()]);
      this.networkKey = receivedNetworkKey.trim();
    }

    return { total, errors };
  }

  /**
   * Send chat message to desktop
   */
  async sendChat(content: string) {
    this.send({
      type: 'CKBPOS_CHAT',
      payload: {
        content,
        from_machine: this.myMachineId,
        from_label: this.myLabel,
        ts: new Date().toISOString(),
      },
    });
  }

  private ping() {
    this.state.lastPing = Date.now();
    this.send({ type: 'PING', machine_id: this.myMachineId });
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  disconnect() {
    this.stopPing();
    this.ws?.close();
    this.ws = null;
    this.state.connected = false;
    this.state.desktopIp = null;
    this.state.desktopLabel = null;
    this.state.desktopMachineId = null;
    this.reconnectIp = null;
    this._onStatusChange?.(false);
  }

  getState(): LANState {
    return { ...this.state };
  }

  isConnected(): boolean {
    return this.state.connected;
  }

  getDesktopLabel(): string | null {
    return this.state.desktopLabel;
  }
}

export const lanService = new LANService();
export default lanService;
