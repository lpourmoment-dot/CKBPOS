import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { dbAll, dbRun } from '../db/sqlite';
import { Ionicons } from '@expo/vector-icons';

interface Client {
  id: number;
  nom: string;
  telephone?: string;
  nif?: string;
}

interface Props {
  visible: boolean;
  onSelect: (client: { id: number | null; nom: string; nif: string }) => void;
  onClose: () => void;
}

export default function ClientPickerModal({ visible, onSelect, onClose }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newNom, setNewNom] = useState('');
  const [newTel, setNewTel] = useState('');
  const [newNif, setNewNif] = useState('');

  useEffect(() => {
    if (visible) loadClients();
  }, [visible]);

  const loadClients = async () => {
    const data = await dbAll<Client>('SELECT * FROM clients WHERE actif=1 ORDER BY nom');
    setClients(data);
  };

  const filtered = clients.filter(c =>
    c.nom.toLowerCase().includes(search.toLowerCase()) ||
    (c.telephone || '').includes(search) ||
    (c.nif || '').includes(search)
  );

  const handleSelect = (client: Client) => {
    onSelect({ id: client.id, nom: client.nom, nif: (client as any).nif || '' });
    onClose();
    setSearch('');
  };

  const handleSelectDefault = () => {
    onSelect({ id: null, nom: 'CONSUMIDOR FINAL', nif: 'CONSUMIDOR FINAL' });
    onClose();
    setSearch('');
  };

  const handleCreate = async () => {
    if (!newNom.trim()) return;
    try {
      await dbRun(
        'INSERT INTO clients (nom, telephone) VALUES (?, ?)',
        [newNom.trim(), newTel.trim() || null]
      );
      setNewNom('');
      setNewTel('');
      setNewNif('');
      setShowForm(false);
      loadClients();
    } catch (e) {
      console.error('[CLIENT] Create error:', e);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('caisse.selectClient')}</Text>
            <TouchableOpacity onPress={() => { onClose(); setSearch(''); }}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Default client */}
          <TouchableOpacity style={styles.defaultBtn} onPress={handleSelectDefault}>
            <Ionicons name="person" size={20} color={COLORS.textMuted} />
            <View style={styles.defaultInfo}>
              <Text style={styles.defaultName}>CONSUMIDOR FINAL</Text>
              <Text style={styles.defaultSub}>Client par défaut</Text>
            </View>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
          </TouchableOpacity>

          {/* Search */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('products.search')}
              placeholderTextColor={COLORS.textMuted}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {/* Client list */}
          <FlatList
            data={filtered}
            keyExtractor={item => String(item.id)}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.clientRow} onPress={() => handleSelect(item)}>
                <View style={styles.clientAvatar}>
                  <Text style={styles.clientAvatarText}>{item.nom[0]?.toUpperCase()}</Text>
                </View>
                <View style={styles.clientInfo}>
                  <Text style={styles.clientName}>{item.nom}</Text>
                  {item.telephone && <Text style={styles.clientTel}>{item.telephone}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>{t('common.noData')}</Text>
            }
          />

          {/* Add client */}
          {!showForm ? (
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
              <Ionicons name="add-circle" size={20} color={COLORS.primary} />
              <Text style={styles.addBtnText}>{t('users.add')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.form}>
              <TextInput style={styles.input} placeholder="Nom du client" placeholderTextColor={COLORS.textMuted} value={newNom} onChangeText={setNewNom} />
              <TextInput style={styles.input} placeholder="Téléphone (optionnel)" placeholderTextColor={COLORS.textMuted} value={newTel} onChangeText={setNewTel} keyboardType="phone-pad" />
              <View style={styles.formActions}>
                <TouchableOpacity style={styles.cancelFormBtn} onPress={() => { setShowForm(false); setNewNom(''); setNewTel(''); }}>
                  <Text style={styles.cancelFormBtnText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveFormBtn} onPress={handleCreate}>
                  <Text style={styles.saveFormBtnText}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  container: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg, maxHeight: '80%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  defaultBtn: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, backgroundColor: COLORS.card, borderRadius: RADIUS.md, marginBottom: SPACING.sm, gap: SPACING.sm },
  defaultInfo: { flex: 1 },
  defaultName: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
  defaultSub: { color: COLORS.textMuted, fontSize: 12 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.input, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, marginBottom: SPACING.sm, gap: SPACING.sm },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 16, paddingVertical: SPACING.sm },
  clientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.sm },
  clientAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  clientAvatarText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
  clientInfo: { flex: 1 },
  clientName: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
  clientTel: { color: COLORS.textMuted, fontSize: 12 },
  emptyText: { textAlign: 'center', color: COLORS.textMuted, marginTop: SPACING.xl, fontSize: 14 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: SPACING.md, backgroundColor: COLORS.card, borderRadius: RADIUS.md, marginTop: SPACING.sm, gap: SPACING.sm },
  addBtnText: { color: COLORS.primary, fontWeight: '600' },
  form: { marginTop: SPACING.sm, gap: SPACING.sm },
  input: { backgroundColor: COLORS.input, color: COLORS.text, borderRadius: RADIUS.md, padding: SPACING.md, fontSize: 16, borderWidth: 1, borderColor: COLORS.border },
  formActions: { flexDirection: 'row', gap: SPACING.sm },
  cancelFormBtn: { flex: 1, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  cancelFormBtnText: { color: COLORS.textSecondary, fontWeight: '600' },
  saveFormBtn: { flex: 1, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center' },
  saveFormBtnText: { color: COLORS.black, fontWeight: '700' },
});
