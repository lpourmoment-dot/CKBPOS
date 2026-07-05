import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { dbAll, dbRun, getSetting } from '../db/sqlite';
import { useAuthStore } from '../stores/authStore';
import { Ionicons } from '@expo/vector-icons';

export default function ReservationsScreen() {
  const { user } = useAuthStore();
  const [reservations, setReservations] = useState<any[]>([]);
  const [currency, setCurrency] = useState('Kz');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const cur = await getSetting('currency');
    setCurrency(cur || 'Kz');
    const data = await dbAll(
      `SELECT r.*, u.nom as vendeur_nom FROM reservations r LEFT JOIN users u ON r.user_id=u.id WHERE r.statut='pendente' ORDER BY r.created_at DESC`
    );
    setReservations(data);
  };

  const deliverReservation = async (id: number) => {
    try {
      const res = await dbAll('SELECT * FROM reservations WHERE id=?', [id]);
      if (!res[0]) return;
      const year = new Date().getFullYear();
      const seq = (id + 1000).toString().padStart(4, '0');
      const shortId = (await getSetting('machine_id') || '').slice(0, 8).toUpperCase();
      const factureNum = `FR CKB${year}/${shortId}-${seq}`;
      await dbRun("UPDATE reservations SET statut='entregue' WHERE id=?", [id]);
      loadData();
      Alert.alert(t('common.success'), factureNum);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const cancelReservation = async (id: number) => {
    Alert.alert(t('common.confirm'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), onPress: async () => {
        await dbRun("UPDATE reservations SET statut='anulada' WHERE id=?", [id]);
        loadData();
      }},
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={reservations}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>{t('common.noData')}</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardId}>#{item.id}</Text>
              <View style={[styles.statusBadge, item.type === 'A' ? { backgroundColor: COLORS.info + '20' } : { backgroundColor: COLORS.success + '20' }]}>
                <Text style={[styles.statusText, item.type === 'A' ? { color: COLORS.info } : { color: COLORS.success }]}>{item.type === 'A' ? 'Tipo A' : 'Tipo B'}</Text>
              </View>
            </View>
            <Text style={styles.cardClient}>{item.client_nom || t('caisse.finalConsumer')}</Text>
            <Text style={styles.cardTotal}>{item.total?.toLocaleString('fr-FR')} {currency}</Text>
            <Text style={styles.cardDate}>{new Date(item.created_at).toLocaleDateString('pt-BR')} {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => deliverReservation(item.id)}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                <Text style={[styles.actionText, { color: COLORS.success }]}>{t('reservation.deliver')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => cancelReservation(item.id)}>
                <Ionicons name="close-circle" size={18} color={COLORS.error} />
                <Text style={[styles.actionText, { color: COLORS.error }]}>{t('reservation.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: SPACING.md },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: SPACING.xxl, fontSize: 14 },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  cardId: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary },
  statusBadge: { borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  statusText: { fontSize: 12, fontWeight: '600' },
  cardClient: { color: COLORS.text, fontSize: 14, marginBottom: 4 },
  cardTotal: { color: COLORS.primary, fontWeight: 'bold', fontSize: 18 },
  cardDate: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontWeight: '600', fontSize: 14 },
});
