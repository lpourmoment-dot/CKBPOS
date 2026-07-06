import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { dbAll } from '../db/sqlite';
import { Ionicons } from '@expo/vector-icons';

const ACTION_COLORS: Record<string, string> = {
  LOGIN: '#22c55e',
  LOGOUT: '#6b7280',
  VENTE: '#60a5fa',
  ANNULATION: '#ef4444',
  RETORNO: '#f97316',
  CREATE: '#22c55e',
  UPDATE: '#facc15',
  DELETE: '#ef4444',
  ENTRADA: '#22c55e',
  SAIDA: '#ef4444',
  CANCELAMENTO: '#ef4444',
  SETTING: '#a78bfa',
  SYNC: '#38bdf8',
  PRINT: '#fb923c',
};

function actionColor(action: string): string {
  if (!action) return COLORS.textMuted;
  for (const [k, v] of Object.entries(ACTION_COLORS)) {
    if (action.toUpperCase().includes(k)) return v;
  }
  return '#6b7280';
}

function fmtTs(ts: string): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts.replace(' ', 'T') + 'Z');
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return ts; }
}

const PAGE_SIZE = 50;

export default function AuditLogScreen() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [actions, setActions] = useState<string[]>([]);

  useEffect(() => {
    loadFilters();
  }, []);

  const loadFilters = async () => {
    const userData = await dbAll('SELECT id, nom FROM users ORDER BY nom');
    setUsers(userData);
    const actionData = await dbAll('SELECT DISTINCT action FROM historique_modifications WHERE action IS NOT NULL ORDER BY action');
    setActions(actionData.map((a: any) => a.action));
  };

  const load = useCallback(async (p = 0) => {
    setLoading(true);
    try {
      let where = '1=1';
      const params: any[] = [];

      if (filterUser) {
        where += ' AND h.user_id = ?';
        params.push(filterUser);
      }
      if (filterAction) {
        where += ' AND h.action = ?';
        params.push(filterAction);
      }

      const countRes = await dbAll<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM historique_modifications h WHERE ${where}`,
        params
      );
      setTotal(countRes[0]?.cnt || 0);

      const data = await dbAll(
        `SELECT h.*, u.nom as user_nom
         FROM historique_modifications h
         LEFT JOIN users u ON h.user_id = u.id
         WHERE ${where}
         ORDER BY h.date_action DESC
         LIMIT ? OFFSET ?`,
        [...params, PAGE_SIZE, p * PAGE_SIZE]
      );

      let filtered = data;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        filtered = data.filter((r: any) =>
          r.user_nom?.toLowerCase().includes(q) ||
          r.action?.toLowerCase().includes(q) ||
          r.details?.toLowerCase().includes(q)
        );
      }

      setLogs(filtered);
    } catch (e) {
      console.error('[AUDIT] Load error:', e);
    }
    setLoading(false);
  }, [filterUser, filterAction, search]);

  useEffect(() => { setPage(0); load(0); }, [filterUser, filterAction]);
  useEffect(() => { load(page); }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetFilters = () => {
    setFilterUser('');
    setFilterAction('');
    setSearch('');
    setPage(0);
  };

  return (
    <View style={styles.container}>
      {/* Filters */}
      <View style={styles.filtersCard}>
        {/* User filter */}
        <View style={styles.filterRow}>
          <View style={styles.filterField}>
            <Text style={styles.filterLabel}>{t('audit.filterUser')}</Text>
            <TouchableOpacity
              style={styles.filterSelect}
              onPress={() => {
                const nextIdx = users.findIndex(u => String(u.id) === filterUser) + 1;
                setFilterUser(nextIdx < users.length ? String(users[nextIdx].id) : '');
              }}
            >
              <Text style={styles.filterSelectText}>
                {filterUser ? users.find(u => String(u.id) === filterUser)?.nom : t('audit.allUsers')}
              </Text>
              <Ionicons name="chevron-down" size={14} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.filterField}>
            <Text style={styles.filterLabel}>{t('audit.filterType')}</Text>
            <TouchableOpacity
              style={styles.filterSelect}
              onPress={() => {
                const nextIdx = actions.indexOf(filterAction) + 1;
                setFilterAction(nextIdx < actions.length ? actions[nextIdx] : '');
              }}
            >
              <Text style={styles.filterSelectText}>
                {filterAction || t('audit.allTypes')}
              </Text>
              <Ionicons name="chevron-down" size={14} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('audit.search')}
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {(search || filterUser || filterAction) && (
            <TouchableOpacity onPress={resetFilters}>
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Count */}
      <Text style={styles.countText}>{total} {t('audit.entries')}</Text>

      {/* Log list */}
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item, i) => String(item.id || i)}
          renderItem={({ item, index }) => (
            <View style={[styles.logRow, index % 2 === 1 && styles.logRowAlt]}>
              <View style={[styles.actionBadge, { backgroundColor: actionColor(item.action) + '18' }]}>
                <Text style={[styles.actionText, { color: actionColor(item.action) }]}>{item.action || '—'}</Text>
              </View>
              <View style={styles.logInfo}>
                <Text style={styles.logUser}>{item.user_nom || '—'}</Text>
                <Text style={styles.logDetails} numberOfLines={2}>{item.details || '—'}</Text>
              </View>
              <Text style={styles.logDate}>{fmtTs(item.date_action)}</Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>{t('audit.noLogs')}</Text>
          }
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <View style={styles.pagination}>
          <TouchableOpacity
            style={[styles.pageBtn, page === 0 && styles.pageBtnDisabled]}
            onPress={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <Ionicons name="chevron-back" size={16} color={page === 0 ? COLORS.textMuted : COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.pageText}>{page + 1} / {totalPages}</Text>
          <TouchableOpacity
            style={[styles.pageBtn, page >= totalPages - 1 && styles.pageBtnDisabled]}
            onPress={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            <Ionicons name="chevron-forward" size={16} color={page >= totalPages - 1 ? COLORS.textMuted : COLORS.text} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  filtersCard: { padding: SPACING.md, backgroundColor: COLORS.card, margin: SPACING.md, borderRadius: RADIUS.md },
  filterRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  filterField: { flex: 1 },
  filterLabel: { fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700', marginBottom: 4 },
  filterSelect: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.input, borderRadius: RADIUS.sm, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  filterSelectText: { color: COLORS.text, fontSize: 12 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.input, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, gap: SPACING.xs },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14, paddingVertical: SPACING.xs },
  countText: { fontSize: 12, color: COLORS.textMuted, paddingHorizontal: SPACING.md, marginBottom: SPACING.sm },
  logRow: { flexDirection: 'row', alignItems: 'center', padding: SPACING.sm, paddingHorizontal: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.sm },
  logRowAlt: { backgroundColor: COLORS.surfaceLight },
  actionBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.sm },
  actionText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  logInfo: { flex: 1 },
  logUser: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  logDetails: { fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },
  logDate: { fontSize: 10, color: COLORS.textMuted, fontFamily: 'monospace' },
  emptyText: { textAlign: 'center', color: COLORS.textMuted, marginTop: SPACING.xl, fontSize: 14 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  pageBtn: { padding: SPACING.sm, borderRadius: RADIUS.sm, backgroundColor: COLORS.card },
  pageBtnDisabled: { opacity: 0.4 },
  pageText: { fontSize: 13, color: COLORS.textSecondary, fontFamily: 'monospace' },
});
