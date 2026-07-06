import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { dbAll, getSetting } from '../db/sqlite';
import { Ionicons } from '@expo/vector-icons';

interface CoordData {
  machines: any[];
  reservations: any[];
  stockAlerte: any[];
  todayStats: { total: number; count: number };
  topProducts: any[];
}

function KpiCard({ icon, label, value, color, sub }: { icon: string; label: string; value: string | number; color: string; sub?: string }) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIcon, { backgroundColor: color + '1a' }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <View style={styles.kpiInfo}>
        <Text style={styles.kpiValue}>{value}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
        {sub && <Text style={[styles.kpiSub, { color }]}>{sub}</Text>}
      </View>
    </View>
  );
}

export default function CoordDashboardScreen() {
  const [data, setData] = useState<CoordData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [machineId, setMachineId] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const mid = await getSetting('machine_id');
      setMachineId(mid || '');

      // Today stats
      const todayRes = await dbAll<{ total: number; count: number }>(
        `SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count
         FROM ventes WHERE statut!='annule' AND date(date_vente)=date('now')`
      );

      // Top products 7j
      const topProducts = await dbAll(
        `SELECT p.nom, COALESCE(SUM(vi.sous_total),0) as rev, COALESCE(SUM(vi.quantite),0) as qte
         FROM vente_items vi JOIN products p ON vi.product_id=p.id JOIN ventes v ON vi.vente_id=v.id
         WHERE v.statut != 'annule' AND v.date_vente >= datetime('now','-7 days')
         GROUP BY p.id ORDER BY rev DESC LIMIT 5`
      );

      // Stock alerts
      const stockAlerte = await dbAll(
        `SELECT * FROM products WHERE actif=1 AND stock_cartons <= stock_alerte ORDER BY stock_cartons ASC`
      );

      // Pending reservations
      const reservations = await dbAll(
        `SELECT * FROM reservations WHERE statut='pendente' ORDER BY created_at DESC`
      );

      setData({
        machines: [{ machine_id: mid, status: 'online', isLocal: true }],
        reservations,
        stockAlerte,
        todayStats: todayRes[0] || { total: 0, count: 0 },
        topProducts,
      });
    } catch (e) {
      console.error('[COORD] Load error:', e);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      {/* KPI Cards */}
      <View style={styles.kpiRow}>
        <KpiCard icon="wallet" label={t('dashboard.todayRevenue')} value={`${(data?.todayStats.total || 0).toLocaleString('pt-BR')} Kz`} color={COLORS.primary} />
        <KpiCard icon="cart" label={t('dashboard.todaySales')} value={data?.todayStats.count || 0} color={COLORS.success} />
      </View>

      {/* Stock Alerts */}
      {data?.stockAlerte && data.stockAlerte.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="warning" size={16} color={COLORS.warning} />
            <Text style={styles.sectionTitle}>{t('coord.stockAlert')}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{data.stockAlerte.length}</Text>
            </View>
          </View>
          {data.stockAlerte.slice(0, 5).map((p: any) => (
            <View key={p.id} style={styles.alertRow}>
              <Text style={styles.alertName}>{p.nom}</Text>
              <Text style={[styles.alertStock, p.stock_cartons <= 0 && { color: COLORS.error }]}>
                {p.stock_cartons} cx
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Reservations */}
      {data?.reservations && data.reservations.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="time" size={16} color={COLORS.info} />
            <Text style={styles.sectionTitle}>{t('coord.activeReservations')}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{data.reservations.length}</Text>
            </View>
          </View>
          {data.reservations.slice(0, 5).map((r: any) => (
            <View key={r.id} style={styles.reservationRow}>
              <View style={styles.reservationInfo}>
                <Text style={styles.reservationClient}>{r.client_nom || 'CONSUMIDOR FINAL'}</Text>
                <Text style={styles.reservationDate}>{new Date(r.created_at).toLocaleDateString('pt-BR')}</Text>
              </View>
              <Text style={styles.reservationTotal}>{r.total?.toLocaleString('pt-BR')} Kz</Text>
            </View>
          ))}
        </View>
      )}

      {/* Top Products */}
      {data?.topProducts && data.topProducts.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="trending-up" size={16} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>{t('dashboard.topProducts')}</Text>
          </View>
          {data.topProducts.map((p: any, i: number) => (
            <View key={i} style={styles.productRow}>
              <View style={styles.productRank}>
                <Text style={styles.productRankText}>{i + 1}</Text>
              </View>
              <Text style={styles.productName}>{p.nom}</Text>
              <Text style={styles.productRevenue}>{p.rev?.toLocaleString('pt-BR')} Kz</Text>
            </View>
          ))}
        </View>
      )}

      {/* Network Status */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="wifi" size={16} color={COLORS.success} />
          <Text style={styles.sectionTitle}>{t('coord.networkStatus')}</Text>
        </View>
        <View style={styles.machineCard}>
          <View style={styles.machineStatus}>
            <View style={[styles.statusDot, { backgroundColor: COLORS.success }]} />
            <Text style={styles.machineName}>{data?.machines[0]?.machine_id?.slice(0, 8) || '—'}</Text>
          </View>
          <View style={styles.machineBadges}>
            <View style={[styles.machineBadge, { backgroundColor: COLORS.success + '20' }]}>
              <Text style={[styles.machineBadgeText, { color: COLORS.success }]}>Online</Text>
            </View>
            <View style={[styles.machineBadge, { backgroundColor: COLORS.primary + '20' }]}>
              <Text style={[styles.machineBadgeText, { color: COLORS.primary }]}>Local</Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, paddingBottom: 100 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textMuted, fontSize: 14 },
  kpiRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  kpiCard: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: SPACING.md, backgroundColor: COLORS.card, borderRadius: RADIUS.md, gap: SPACING.sm },
  kpiIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  kpiInfo: { flex: 1 },
  kpiValue: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  kpiLabel: { fontSize: 11, color: COLORS.textMuted },
  kpiSub: { fontSize: 10, fontWeight: '600' },
  section: { marginBottom: SPACING.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.8, flex: 1 },
  badge: { backgroundColor: COLORS.primary + '20', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },
  alertRow: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.sm, backgroundColor: COLORS.card, borderRadius: RADIUS.sm, marginBottom: 4 },
  alertName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  alertStock: { fontSize: 13, fontWeight: '700', color: COLORS.warning },
  reservationRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.sm, backgroundColor: COLORS.card, borderRadius: RADIUS.sm, marginBottom: 4 },
  reservationInfo: { flex: 1 },
  reservationClient: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  reservationDate: { fontSize: 11, color: COLORS.textMuted },
  reservationTotal: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  productRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  productRank: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.sm },
  productRankText: { color: COLORS.black, fontWeight: 'bold', fontSize: 12 },
  productName: { flex: 1, fontSize: 13, color: COLORS.text },
  productRevenue: { fontSize: 13, fontWeight: '700', color: COLORS.success },
  machineCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.md, backgroundColor: COLORS.card, borderRadius: RADIUS.md },
  machineStatus: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  machineName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  machineBadges: { flexDirection: 'row', gap: 4 },
  machineBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  machineBadgeText: { fontSize: 10, fontWeight: '700' },
});
