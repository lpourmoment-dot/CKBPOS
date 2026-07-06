import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { dbAll, getSetting } from '../db/sqlite';

export default function HistoriqueScreen() {
  const [sales, setSales] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [currency, setCurrency] = useState('Kz');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const cur = await getSetting('currency');
    setCurrency(cur || 'Kz');
    const data = await dbAll(
      `SELECT v.*, u.nom as vendeur FROM ventes v LEFT JOIN users u ON v.user_id=u.id ORDER BY v.date_vente DESC LIMIT 100`
    );
    setSales(data);
    const sum = data.filter((s: any) => s.statut !== 'annule').reduce((acc: number, s: any) => acc + (s.total || 0), 0);
    setTotal(sum);
  };

  const payLabel: Record<string, string> = { dinheiro: 'NUM', express: 'EXP', misto: 'MIS' };
  const statutLabel: Record<string, string> = { annule: 'ANUL', modifie: 'MOD', normal: 'OK', pago_retirar: 'RES' };

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <Text style={styles.summaryCount}>{sales.length} {t('historique.count')}</Text>
        <Text style={styles.summaryTotal}>{total.toLocaleString('fr-FR')} {currency}</Text>
      </View>
      <FlatList
        data={sales}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <Text style={[styles.headerCell, { flex: 0.8 }]}>#</Text>
            <Text style={[styles.headerCell, { flex: 2.5 }]}>Data</Text>
            <Text style={[styles.headerCell, { flex: 0.8 }]}>Pag</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>Stat</Text>
            <Text style={[styles.headerCell, { flex: 1.2, textAlign: 'right' }]}>{currency}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={[styles.cell, { flex: 0.8, color: COLORS.primary }]}>{item.id}</Text>
            <Text style={[styles.cell, { flex: 2.5 }]} numberOfLines={1}>{new Date(item.date_vente).toLocaleDateString('pt-BR')} {new Date(item.date_vente).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
            <Text style={[styles.cell, { flex: 0.8 }]}>{payLabel[item.mode_paiement] || 'NUM'}</Text>
            <Text style={[styles.cell, { flex: 1, fontWeight: 'bold', color: item.statut === 'annule' ? COLORS.error : COLORS.success }]}>{statutLabel[item.statut] || 'OK'}</Text>
            <Text style={[styles.cell, { flex: 1.2, textAlign: 'right', fontWeight: '700', color: item.statut === 'annule' ? COLORS.error : COLORS.text }]}>{item.total?.toLocaleString('fr-FR')}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  summary: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.md, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  summaryCount: { color: COLORS.textSecondary, fontSize: 14 },
  summaryTotal: { color: COLORS.primary, fontWeight: 'bold', fontSize: 16 },
  list: { padding: SPACING.md },
  headerRow: { flexDirection: 'row', paddingVertical: SPACING.sm, borderBottomWidth: 2, borderBottomColor: COLORS.border },
  headerCell: { fontSize: 11, fontWeight: 'bold', color: COLORS.textMuted, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border + '40' },
  cell: { fontSize: 12, color: COLORS.textSecondary, flexShrink: 1 },
});
