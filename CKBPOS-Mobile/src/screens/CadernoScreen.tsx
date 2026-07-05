import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, Modal } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { dbAll, dbRun, getSetting } from '../db/sqlite';
import { useAuthStore } from '../stores/authStore';
import { Ionicons } from '@expo/vector-icons';

export default function CadernoScreen() {
  const { user } = useAuthStore();
  const [entries, setEntries] = useState<any[]>([]);
  const [motivos, setMotivos] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nom: '', motivo: '', montant: '', direction: 'entree' as 'entree' | 'sortie' | 'perte', note: '' });
  const [today, setToday] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('Kz');

  useEffect(() => { loadData(); }, [today]);

  const loadData = async () => {
    const cur = await getSetting('currency');
    setCurrency(cur || 'Kz');
    const data = await dbAll(
      `SELECT e.*, u.nom as user_nom FROM caderno_entries e JOIN users u ON e.user_id=u.id WHERE e.date_jour=? ORDER BY e.created_at ASC`,
      [today]
    );
    setEntries(data);
    const m = await dbAll('SELECT * FROM caderno_motivos WHERE actif=1 ORDER BY id');
    setMotivos(m);
  };

  const totals = {
    plus: entries.filter(e => e.direction === 'entree').reduce((s, e) => s + (e.montant || 0), 0),
    moins: entries.filter(e => e.direction !== 'entree').reduce((s, e) => s + (e.montant || 0), 0),
    dettes: entries.filter(e => e.est_dette && e.statut_dette !== 'pago').reduce((s, e) => s + (e.montant || 0), 0),
  };

  const saveEntry = async () => {
    if (!form.nom.trim() || !form.motivo || !form.montant) {
      Alert.alert(t('common.error'), 'Nom, motif et montant requis');
      return;
    }
    try {
      await dbRun(
        `INSERT INTO caderno_entries (nom, motivo, montant, note, direction, est_dette, user_id, machine_id, date_jour)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [form.nom, form.motivo, parseFloat(form.montant) || 0, form.note, form.direction, 0, user?.id || 0, 'LOCAL', today]
      );
      setShowForm(false);
      setForm({ nom: '', motivo: '', montant: '', direction: 'entree', note: '' });
      loadData();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{t('caderno.entryDir')}</Text>
          <Text style={[styles.summaryValue, { color: COLORS.success }]}>+{totals.plus.toLocaleString('fr-FR')}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{t('caderno.exitDir')}</Text>
          <Text style={[styles.summaryValue, { color: COLORS.error }]}>-{totals.moins.toLocaleString('fr-FR')}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{t('caderno.net')}</Text>
          <Text style={[styles.summaryValue, (totals.plus - totals.moins) >= 0 ? { color: COLORS.success } : { color: COLORS.error }]}>
            {(totals.plus - totals.moins) >= 0 ? '+' : ''}{(totals.plus - totals.moins).toLocaleString('fr-FR')}
          </Text>
        </View>
      </View>

      <FlatList
        data={entries}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.entryRow}>
            <View style={[styles.entryDir, { backgroundColor: item.direction === 'entree' ? COLORS.success + '20' : COLORS.error + '20' }]}>
              <Text style={[styles.entryDirText, { color: item.direction === 'entree' ? COLORS.success : COLORS.error }]}>{item.direction === 'entree' ? '+' : '-'}</Text>
            </View>
            <View style={styles.entryInfo}>
              <Text style={styles.entryName}>{item.nom}</Text>
              <Text style={styles.entryMotivo}>{item.motivo}</Text>
            </View>
            <Text style={[styles.entryAmount, { color: item.direction === 'entree' ? COLORS.success : COLORS.error }]}>
              {item.direction === 'entree' ? '+' : '-'}{item.montant?.toLocaleString('fr-FR')} {currency}
            </Text>
          </View>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowForm(true)}>
        <Ionicons name="add" size={28} color={COLORS.black} />
      </TouchableOpacity>

      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('caderno.addEntry')}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder={t('caderno.name')} placeholderTextColor={COLORS.textMuted} value={form.nom} onChangeText={v => setForm({ ...form, nom: v })} />
            <View style={styles.motivosRow}>
              {motivos.map(m => (
                <TouchableOpacity key={m.id} style={[styles.motivoChip, form.motivo === m.label && styles.motivoActive]} onPress={() => setForm({ ...form, motivo: m.label, direction: m.direction })}>
                  <Text style={styles.motivoEmoji}>{m.icone}</Text>
                  <Text style={[styles.motivoText, form.motivo === m.label && { color: COLORS.primary }]} numberOfLines={1}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder={t('caderno.amount')} placeholderTextColor={COLORS.textMuted} value={form.montant} onChangeText={v => setForm({ ...form, montant: v })} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder={t('caderno.note')} placeholderTextColor={COLORS.textMuted} value={form.note} onChangeText={v => setForm({ ...form, note: v })} />
            <TouchableOpacity style={styles.saveBtn} onPress={saveEntry}>
              <Text style={styles.saveBtnText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  summary: { flexDirection: 'row', padding: SPACING.md, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: COLORS.textMuted },
  summaryValue: { fontSize: 18, fontWeight: 'bold' },
  list: { padding: SPACING.md },
  entryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.sm, gap: SPACING.sm },
  entryDir: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  entryDirText: { fontSize: 16, fontWeight: 'bold' },
  entryInfo: { flex: 1 },
  entryName: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
  entryMotivo: { color: COLORS.textMuted, fontSize: 12 },
  entryAmount: { fontWeight: '700', fontSize: 14 },
  fab: { position: 'absolute', bottom: SPACING.lg, right: SPACING.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', elevation: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  input: { backgroundColor: COLORS.input, color: COLORS.text, borderRadius: RADIUS.md, padding: SPACING.md, fontSize: 16, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  motivosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.sm },
  motivoChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceLight, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 4, gap: 4 },
  motivoActive: { backgroundColor: COLORS.primary + '20', borderWidth: 1, borderColor: COLORS.primary },
  motivoEmoji: { fontSize: 14 },
  motivoText: { fontSize: 11, color: COLORS.textSecondary, maxWidth: 80 },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center', marginTop: SPACING.sm },
  saveBtnText: { color: COLORS.black, fontSize: 16, fontWeight: '700' },
});
