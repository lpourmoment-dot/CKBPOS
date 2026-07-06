import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, Modal } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { dbAll, dbRun } from '../db/sqlite';
import { hashPassword } from '../stores/authStore';
import { Ionicons } from '@expo/vector-icons';

export default function UsersScreen() {
  const [users, setUsers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [form, setForm] = useState({ nom: '', email: '', role: 'vendeur', pin: '', password: '', peut_modifier_factures: false });

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    const data = await dbAll('SELECT * FROM users WHERE actif=1 ORDER BY role, nom');
    setUsers(data);
  };

  const openForm = (user?: any) => {
    if (user) {
      setEditUser(user);
      setForm({ nom: user.nom, email: user.email, role: user.role, pin: user.pin || '', password: '', peut_modifier_factures: !!user.peut_modifier_factures });
    } else {
      setEditUser(null);
      setForm({ nom: '', email: '', role: 'vendeur', pin: '', password: '', peut_modifier_factures: false });
    }
    setShowForm(true);
  };

  const saveUser = async () => {
    if (!form.nom || !form.email) { Alert.alert(t('common.error'), 'Nom et email requis'); return; }
    try {
      if (editUser) {
        await dbRun(
          'UPDATE users SET nom=?, email=?, role=?, pin=? WHERE id=?',
          [form.nom, form.email.toLowerCase().trim(), form.role, form.pin || null, editUser.id]
        );
      } else {
        const hash = await hashPassword(form.password || 'admin123');
        await dbRun(
          'INSERT INTO users (nom, email, role, password_hash, pin, peut_modifier_factures, tentativas_login) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [form.nom, form.email.toLowerCase().trim(), form.role, hash, form.pin || null, form.peut_modifier_factures ? 1 : 0, 0]
        );
      }
      setShowForm(false);
      loadUsers();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const deleteUser = (user: any) => {
    Alert.alert(t('products.confirmDelete'), user.nom, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        await dbRun('UPDATE users SET actif=0 WHERE id=?', [user.id]);
        loadUsers();
      }},
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={users}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{item.nom}</Text>
              <Text style={styles.cardEmail}>{item.email}</Text>
              <View style={styles.cardMeta}>
                <View style={[styles.roleBadge, item.role === 'admin' && { backgroundColor: COLORS.primary + '20' }]}>
                  <Text style={[styles.roleText, item.role === 'admin' && { color: COLORS.primary }]}>{item.role === 'admin' ? t('users.admin') : t('users.seller')}</Text>
                </View>
                {item.pin && <Text style={styles.pinBadge}>PIN: {item.pin}</Text>}
              </View>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => openForm(item)}><Ionicons name="pencil" size={18} color={COLORS.primary} /></TouchableOpacity>
              <TouchableOpacity onPress={() => deleteUser(item)}><Ionicons name="trash" size={18} color={COLORS.error} /></TouchableOpacity>
            </View>
          </View>
        )}
      />
      <TouchableOpacity style={styles.fab} onPress={() => openForm()}>
        <Ionicons name="add" size={28} color={COLORS.black} />
      </TouchableOpacity>

      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editUser ? t('common.edit') : t('users.add')}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder={t('users.name')} placeholderTextColor={COLORS.textMuted} value={form.nom} onChangeText={v => setForm({ ...form, nom: v })} />
            <TextInput style={styles.input} placeholder={t('users.email')} placeholderTextColor={COLORS.textMuted} value={form.email} onChangeText={v => setForm({ ...form, email: v })} keyboardType="email-address" autoCapitalize="none" />
            <View style={styles.roleRow}>
              <TouchableOpacity style={[styles.roleBtn, form.role === 'admin' && styles.roleActive]} onPress={() => setForm({ ...form, role: 'admin' })}>
                <Text style={[styles.roleBtnText, form.role === 'admin' && { color: COLORS.primary }]}>{t('users.admin')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.roleBtn, form.role === 'vendeur' && styles.roleActive]} onPress={() => setForm({ ...form, role: 'vendeur' })}>
                <Text style={[styles.roleBtnText, form.role === 'vendeur' && { color: COLORS.primary }]}>{t('users.seller')}</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder={t('users.pin')} placeholderTextColor={COLORS.textMuted} value={form.pin} onChangeText={v => setForm({ ...form, pin: v })} keyboardType="numeric" maxLength={6} />
            {!editUser && <TextInput style={styles.input} placeholder={t('users.password')} placeholderTextColor={COLORS.textMuted} value={form.password} onChangeText={v => setForm({ ...form, password: v })} secureTextEntry />}
            <TouchableOpacity style={styles.saveBtn} onPress={saveUser}>
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
  list: { padding: SPACING.md },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: COLORS.text, flexShrink: 1 },
  cardEmail: { fontSize: 12, color: COLORS.textMuted },
  cardMeta: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  roleBadge: { backgroundColor: COLORS.surfaceLight, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  roleText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  pinBadge: { fontSize: 11, color: COLORS.textMuted },
  cardActions: { flexDirection: 'row', gap: SPACING.md },
  fab: { position: 'absolute', bottom: SPACING.lg, right: SPACING.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', elevation: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  input: { backgroundColor: COLORS.input, color: COLORS.text, borderRadius: RADIUS.md, padding: SPACING.md, fontSize: 16, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  roleRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  roleBtn: { flex: 1, padding: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  roleActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '10' },
  roleBtnText: { color: COLORS.textSecondary, fontWeight: '600' },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center', marginTop: SPACING.sm },
  saveBtnText: { color: COLORS.black, fontSize: 16, fontWeight: '700' },
});
