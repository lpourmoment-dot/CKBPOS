import { create } from 'zustand';
import { createClient } from '@supabase/supabase-js';
import { dbAll, dbRun, getSetting, setSetting, getDb } from '../db/sqlite';

interface SyncState {
  status: 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'synced' | 'error';
  lastSync: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  pushToCloud: () => Promise<void>;
  pullFromCloud: () => Promise<void>;
}

let supabaseClient: any = null;
let realtimeChannel: any = null;

const SYNC_TABLES = new Set([
  'ventes', 'vente_items', 'products', 'stock_mouvements',
  'caderno_entries', 'caderno_motivos', 'caderno_trabalhadores',
  'caderno_produtos', 'users', 'settings'
]);

const LOCAL_SETTINGS = new Set([
  'machine_id', 'machine_label', 'network_key', 'supabase_url', 'supabase_key',
  'cloud_last_seq', 'sync_applying', 'printer_mode', 'printer_machine_id',
  'setup_done',
]);

async function applyCloudRow(entry: any) {
  if (!SYNC_TABLES.has(entry.table_name)) return;
  const db = await getDb();

  try {
    await db.runAsync("UPDATE settings SET value='1' WHERE key='sync_applying'");
    try {
      if (entry.operation === 'DELETE') {
        await db.runAsync(`DELETE FROM "${entry.table_name}" WHERE id=?`, [entry.record_id]);
      } else if (entry.row_data && typeof entry.row_data === 'object') {
        if (entry.table_name === 'settings') {
          if (LOCAL_SETTINGS.has(entry.row_data.key)) return;
          await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [entry.row_data.key, entry.row_data.value]);
        } else if (entry.table_name === 'ventes' && entry.row_data.uuid) {
          const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM ventes WHERE uuid=?', [entry.row_data.uuid]);
          const cols = Object.keys(entry.row_data);
          if (existing) {
            const skip = new Set(['id', 'uuid']);
            const sets = cols.filter(k => !skip.has(k)).map(k => `"${k}"=?`).join(',');
            const vals = cols.filter(k => !skip.has(k)).map(k => entry.row_data[k]);
            if (sets) await db.runAsync(`UPDATE ventes SET ${sets} WHERE uuid=?`, [...vals, entry.row_data.uuid]);
          } else {
            const skip = new Set(['id']);
            const filteredCols = cols.filter(k => !skip.has(k));
            const placeholders = filteredCols.map(() => '?').join(',');
            const vals = filteredCols.map(k => entry.row_data[k]);
            await db.runAsync(`INSERT INTO ventes (${filteredCols.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`, vals as any);
          }
        } else {
          const cols = Object.keys(entry.row_data);
          const placeholders = cols.map(() => '?').join(',');
          const vals = Object.values(entry.row_data);
          await db.runAsync(`INSERT OR REPLACE INTO "${entry.table_name}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`, vals as any);
        }
      }
    } finally {
      await db.runAsync("UPDATE settings SET value='0' WHERE key='sync_applying'");
    }
  } catch (e) {
    console.error('[CLOUD] applyCloudRow error:', e);
  }
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: 'disconnected',
  lastSync: null,
  error: null,

  connect: async () => {
    try {
      set({ status: 'connecting', error: null });
      const url = await getSetting('supabase_url');
      const key = await getSetting('supabase_key');
      if (!url || !key) {
        set({ status: 'disconnected', error: 'Supabase non configuré' });
        return;
      }

      supabaseClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Test connection
      const { error } = await supabaseClient.from('cloud_sync_log').select('id').limit(1);
      if (error) throw error;

      set({ status: 'connected' });

      // Subscribe to realtime
      if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
      const machineId = await getSetting('machine_id');
      realtimeChannel = supabaseClient
        .channel('cloud_sync_log_changes')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'cloud_sync_log' },
          async (payload: any) => {
            const entry = payload.new;
            if (!entry || entry.source_machine_id === machineId) return;
            await applyCloudRow(entry);
          }
        )
        .subscribe();

      // Initial pull + push
      await get().pullFromCloud();
      await get().pushToCloud();
    } catch (e: any) {
      set({ status: 'error', error: e.message });
    }
  },

  disconnect: () => {
    if (realtimeChannel && supabaseClient) {
      supabaseClient.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    supabaseClient = null;
    set({ status: 'disconnected', error: null });
  },

  pushToCloud: async () => {
    if (!supabaseClient) return;
    try {
      set({ status: 'syncing' });
      const machineId = await getSetting('machine_id');
      const pending = await dbAll(
        "SELECT * FROM sync_log WHERE machine_id=? AND (synced_to NOT LIKE '%\"cloud\"%' OR synced_to='[]') ORDER BY id LIMIT 100",
        [machineId]
      );

      if (pending.length === 0) {
        set({ status: 'synced' });
        return;
      }

      const rows = pending.map(e => {
        if (!SYNC_TABLES.has(e.table_name)) return null;
        return {
          source_machine_id: machineId,
          source_seq: e.id,
          table_name: e.table_name,
          record_id: e.record_id,
          operation: e.operation,
          row_data: null,
          created_at: e.created_at,
        };
      }).filter(Boolean);

      if (rows.length === 0) { set({ status: 'synced' }); return; }

      const { error } = await supabaseClient.from('cloud_sync_log').insert(rows);
      if (error) throw error;

      // Mark as pushed
      for (const e of pending) {
        const arr = JSON.parse(e.synced_to || '[]');
        if (!arr.includes('cloud')) {
          arr.push('cloud');
          await dbRun('UPDATE sync_log SET synced_to=? WHERE id=?', [JSON.stringify(arr), e.id]);
        }
      }

      set({ status: 'synced', lastSync: new Date().toISOString() });
    } catch (e: any) {
      set({ status: 'error', error: e.message });
    }
  },

  pullFromCloud: async () => {
    if (!supabaseClient) return;
    try {
      const machineId = await getSetting('machine_id');
      const seqRow = await getSetting('cloud_last_seq');
      const lastSeq = parseInt(seqRow || '0', 10);

      const { data, error } = await supabaseClient
        .from('cloud_sync_log')
        .select('*')
        .neq('source_machine_id', machineId)
        .gt('id', lastSeq)
        .order('id', { ascending: true })
        .limit(200);

      if (error) throw error;
      if (!data || data.length === 0) return;

      for (const entry of data) {
        await applyCloudRow(entry);
      }

      const newSeq = data[data.length - 1].id;
      await setSetting('cloud_last_seq', String(newSeq));
      set({ lastSync: new Date().toISOString() });
    } catch (e: any) {
      console.error('[CLOUD] pullFromCloud:', e);
    }
  },
}));
