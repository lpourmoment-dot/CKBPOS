import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { useAuthStore } from '../stores/authStore';
import { useNavigation } from '@react-navigation/native';
import { dbAll, getSetting } from '../db/sqlite';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface DashboardData {
  todaySales: number;
  todayRevenue: number;
  totalProducts: number;
  lowStockCount: number;
  recentSales: any[];
  topProducts: any[];
}

export default function DashboardScreen() {
  const { user, logout } = useAuthStore();
  const navigation = useNavigation<any>();
  const [data, setData] = useState<DashboardData>({ todaySales: 0, todayRevenue: 0, totalProducts: 0, lowStockCount: 0, recentSales: [], topProducts: [] });
  const [shopName, setShopName] = useState('');
  const [syncStatus, setSyncStatus] = useState('disconnected');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const name = await getSetting('shop_name');
      setShopName(name || 'CKBPOS');

      const today = new Date().toISOString().slice(0, 10);

      const todaySales = await dbAll<{ cnt: number; tot: number }>(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as tot FROM ventes WHERE date(date_vente)=? AND statut != 'annule'",
        [today]
      );
      const totalProducts = await dbAll<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM products WHERE actif=1'
      );
      const lowStock = await dbAll<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM products WHERE actif=1 AND stock_cartons <= stock_alerte'
      );
      const recentSales = await dbAll(
        "SELECT v.*, u.nom as vendeur FROM ventes v LEFT JOIN users u ON v.user_id=u.id ORDER BY v.date_vente DESC LIMIT 5"
      );
      const topProducts = await dbAll(
        `SELECT p.nom, COALESCE(SUM(vi.sous_total),0) as rev, COALESCE(SUM(vi.quantite),0) as qte
         FROM vente_items vi JOIN products p ON vi.product_id=p.id JOIN ventes v ON vi.vente_id=v.id
         WHERE v.statut != 'annule' AND v.date_vente >= datetime('now','-7 days')
         GROUP BY p.id ORDER BY rev DESC LIMIT 5`
      );

      setData({
        todaySales: todaySales[0]?.cnt || 0,
        todayRevenue: todaySales[0]?.tot || 0,
        totalProducts: totalProducts[0]?.cnt || 0,
        lowStockCount: lowStock[0]?.cnt || 0,
        recentSales,
        topProducts,
      });
    } catch (e) {
      console.error('[DASHBOARD] loadData error:', e);
    }
  };

  const QuickAction = ({ icon, label, onPress, badge }: { icon: string; label: string; onPress: () => void; badge?: number }) => (
    <TouchableOpacity style={styles.quickAction} onPress={onPress}>
      <View style={styles.quickActionIcon}>
        <Ionicons name={icon as any} size={24} color={COLORS.primary} />
        {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Olá, {user?.nom || 'Vendedor'}</Text>
          <Text style={styles.shopName}>{shopName}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={22} color={COLORS.error} />
        </TouchableOpacity>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderLeftColor: COLORS.primary }]}>
          <Text style={styles.statValue}>{data.todaySales}</Text>
          <Text style={styles.statLabel}>{t('dashboard.todaySales')}</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: COLORS.success }]}>
          <Text style={styles.statValue}>{data.todayRevenue.toLocaleString('fr-FR')}</Text>
          <Text style={styles.statLabel}>{t('dashboard.todayRevenue')}</Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderLeftColor: COLORS.info }]}>
          <Text style={styles.statValue}>{data.totalProducts}</Text>
          <Text style={styles.statLabel}>{t('dashboard.totalProducts')}</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: data.lowStockCount > 0 ? COLORS.error : COLORS.success }]}>
          <Text style={[styles.statValue, data.lowStockCount > 0 && { color: COLORS.error }]}>{data.lowStockCount}</Text>
          <Text style={styles.statLabel}>{t('dashboard.lowStock')}</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Accès rapide</Text>
      <View style={styles.quickActions}>
        <QuickAction icon="cart" label={t('nav.caisse')} onPress={() => navigation.navigate('Caisse')} />
        <QuickAction icon="pricetags" label={t('nav.products')} onPress={() => navigation.navigate('Products')} />
        <QuickAction icon="archive" label={t('nav.stock')} onPress={() => navigation.navigate('Estoque')} />
        <QuickAction icon="time" label={t('nav.history')} onPress={() => navigation.navigate('Historique')} />
        <QuickAction icon="book" label={t('nav.caderno')} onPress={() => navigation.navigate('Caderno')} />
        <QuickAction icon="calendar" label={t('nav.reservations')} onPress={() => navigation.navigate('Reservations')} />
      </View>

      {/* Recent Sales */}
      {data.recentSales.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('dashboard.recentSales')}</Text>
          {data.recentSales.map((sale: any, i: number) => (
            <View key={i} style={styles.saleRow}>
              <View style={styles.saleInfo}>
                <Text style={styles.saleId}>#{sale.id}</Text>
                <Text style={styles.saleDate}>{new Date(sale.date_vente).toLocaleDateString('pt-BR')}</Text>
              </View>
              <Text style={[styles.saleTotal, sale.statut === 'annule' && styles.saleCancelled]}>
                {sale.total?.toLocaleString('fr-FR')} Kz
              </Text>
            </View>
          ))}
        </>
      )}

      {/* Top Products */}
      {data.topProducts.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('dashboard.topProducts')}</Text>
          {data.topProducts.map((prod: any, i: number) => (
            <View key={i} style={styles.productRow}>
              <Text style={styles.productRank}>{i + 1}</Text>
              <Text style={styles.productName}>{prod.nom}</Text>
              <Text style={styles.productRevenue}>{prod.rev?.toLocaleString('fr-FR')} Kz</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg, marginTop: SPACING.xxl },
  greeting: { fontSize: 24, fontWeight: 'bold', color: COLORS.text },
  shopName: { fontSize: 14, color: COLORS.primary, marginTop: 2 },
  logoutBtn: { padding: SPACING.sm },
  statsRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.sm },
  statCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md, borderLeftWidth: 3 },
  statValue: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  statLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  quickAction: { width: (width - SPACING.md * 2 - SPACING.md * 2) / 3, alignItems: 'center', padding: SPACING.md, backgroundColor: COLORS.card, borderRadius: RADIUS.md },
  quickActionIcon: { position: 'relative', marginBottom: SPACING.xs },
  badge: { position: 'absolute', top: -4, right: -8, backgroundColor: COLORS.error, borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: COLORS.white, fontSize: 10, fontWeight: 'bold' },
  quickActionLabel: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center' },
  saleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  saleInfo: { flexDirection: 'row', gap: SPACING.sm },
  saleId: { color: COLORS.primary, fontWeight: '600' },
  saleDate: { color: COLORS.textSecondary, fontSize: 12 },
  saleTotal: { fontWeight: '700', color: COLORS.text },
  saleCancelled: { color: COLORS.error, textDecorationLine: 'line-through' },
  productRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  productRank: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary, color: COLORS.black, textAlign: 'center', lineHeight: 24, fontWeight: 'bold', fontSize: 12, marginRight: SPACING.sm },
  productName: { flex: 1, color: COLORS.text },
  productRevenue: { color: COLORS.success, fontWeight: '700' },
});
