import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { useI18n } from '../i18n';
import { getSetting, setSetting } from '../db/sqlite';
import { useSyncStore } from '../stores/syncStore';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { lang, setLang } = useI18n();
  const { status: syncStatus, connect, disconnect } = useSyncStore();
  const [form, setForm] = useState({ shop_name: '', shop_address: '', shop_phone: '', shop_nif: '', currency: 'AOA', machine_id: '', machine_label: '', supabase_url: '', supabase_key: '' });
  const [saved, setSaved] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    const keys = ['shop_name', 'shop_address', 'shop_phone', 'shop_nif', 'currency', 'machine_id', 'machine_label', 'supabase_url', 'supabase_key'];
    const data: any = {};
    for (const k of keys) {
      data[k] = await getSetting(k) || '';
    }
    setForm(data);
  };

  const saveSettings = async () => {
    try {
      for (const [k, v] of Object.entries(form)) {
        await setSetting(k, v);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const handleBackup = async () => {
    try {
      setBackupLoading(true);
      const dbPath = `${FileSystem.documentDirectory}SQLite/ckbpos.db`;

      // Check if DB file exists
      const info = await FileSystem.getInfoAsync(dbPath);
      if (!info.exists) {
        Alert.alert(t('common.error'), 'Base de dados não encontrada');
        return;
      }

      // Copy DB to a shareable location
      const backupDir = `${FileSystem.cacheDirectory}backups/`;
      const dirInfo = await FileSystem.getInfoAsync(backupDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(backupDir, { intermediates: true });
      }

      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const backupPath = `${backupDir}ckbpos_backup_${timestamp}.db`;
      await FileSystem.copyAsync({ from: dbPath, to: backupPath });

      // Share the backup file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(backupPath, {
          mimeType: 'application/octet-stream',
          dialogTitle: 'Salvar backup CKBPOS',
        });
      } else {
        Alert.alert('Backup criado', backupPath);
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestore = async () => {
    Alert.alert(
      'Restaurar backup',
      'Isso vai SUBSTITUIR todos os dados atuais. Tem certeza?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Restaurar',
          style: 'destructive',
          onPress: async () => {
            try {
              setRestoreLoading(true);

              const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: true,
              });

              if (result.canceled || !result.assets?.[0]) {
                setRestoreLoading(false);
                return;
              }

              const file = result.assets[0];
              const sourceUri = file.uri;

              // Validate it's a SQLite DB
              const content = await FileSystem.readAsStringAsync(sourceUri, { encoding: FileSystem.EncodingType.Base64 });
              if (!content.startsWith('U1FMaXRlIGZvcm1hdCAz')) {
                // Try as text
                const textContent = await FileSystem.readAsStringAsync(sourceUri);
                if (!textContent.includes('CREATE TABLE') && !textContent.includes('INSERT INTO')) {
                  Alert.alert(t('setup.invalidDb'));
                  setRestoreLoading(false);
                  return;
                }
              }

              // Get DB path
              const dbDir = `${FileSystem.documentDirectory}SQLite`;
              const dbRestorePath = `${dbDir}/ckbpos.db`;

              // Copy imported file
              await FileSystem.copyAsync({ from: sourceUri, to: dbRestorePath });

              // Clean WAL/SHM
              try {
                const walPath = `${dbDir}/ckbpos.db-wal`;
                const shmPath = `${dbDir}/ckbpos.db-shm`;
                const walInfo = await FileSystem.getInfoAsync(walPath);
                if (walInfo.exists) await FileSystem.deleteAsync(walPath);
                const shmInfo = await FileSystem.getInfoAsync(shmPath);
                if (shmInfo.exists) await FileSystem.deleteAsync(shmPath);
              } catch {}

              Alert.alert('Backup restaurado', 'O aplicativo vai reiniciar', [
                { text: 'OK', onPress: () => { /* App will restart via reload */ } }
              ]);
            } catch (e: any) {
              Alert.alert(t('common.error'), e.message);
            } finally {
              setRestoreLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Shop Info */}
      <Text style={styles.sectionTitle}>{t('setup.shopInfo')}</Text>
      <TextInput style={styles.input} placeholder={t('settings.shopName')} placeholderTextColor={COLORS.textMuted} value={form.shop_name} onChangeText={v => setForm({ ...form, shop_name: v })} />
      <TextInput style={styles.input} placeholder={t('settings.shopAddress')} placeholderTextColor={COLORS.textMuted} value={form.shop_address} onChangeText={v => setForm({ ...form, shop_address: v })} />
      <TextInput style={styles.input} placeholder={t('settings.shopPhone')} placeholderTextColor={COLORS.textMuted} value={form.shop_phone} onChangeText={v => setForm({ ...form, shop_phone: v })} keyboardType="phone-pad" />
      <TextInput style={styles.input} placeholder={t('settings.shopNif')} placeholderTextColor={COLORS.textMuted} value={form.shop_nif} onChangeText={v => setForm({ ...form, shop_nif: v })} />
      <TextInput style={styles.input} placeholder={t('settings.currency')} placeholderTextColor={COLORS.textMuted} value={form.currency} onChangeText={v => setForm({ ...form, currency: v })} />

      {/* Machine */}
      <Text style={styles.sectionTitle}>{t('setup.machineInfo')}</Text>
      <TextInput style={styles.input} placeholder={t('settings.machineLabel')} placeholderTextColor={COLORS.textMuted} value={form.machine_label} onChangeText={v => setForm({ ...form, machine_label: v })} />
      <TextInput style={[styles.input, { color: COLORS.textMuted }]} value={form.machine_id} editable={false} />

      {/* Language */}
      <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
      <View style={styles.langRow}>
        {(['pt-BR', 'fr', 'en'] as const).map(l => (
          <TouchableOpacity key={l} style={[styles.langBtn, lang === l && styles.langActive]} onPress={() => setLang(l)}>
            <Text style={[styles.langText, lang === l && { color: COLORS.primary }]}>{l === 'pt-BR' ? 'Portugais' : l === 'fr' ? 'Français' : 'English'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Cloud Sync */}
      <Text style={styles.sectionTitle}>{t('sync.title')}</Text>
      <TextInput style={styles.input} placeholder="Supabase URL" placeholderTextColor={COLORS.textMuted} value={form.supabase_url} onChangeText={v => setForm({ ...form, supabase_url: v })} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Supabase Key" placeholderTextColor={COLORS.textMuted} value={form.supabase_key} onChangeText={v => setForm({ ...form, supabase_key: v })} autoCapitalize="none" secureTextEntry />
      <View style={styles.syncRow}>
        <View style={styles.syncStatus}>
          <View style={[styles.syncDot, { backgroundColor: syncStatus === 'connected' ? COLORS.success : syncStatus === 'syncing' ? COLORS.warning : COLORS.error }]} />
          <Text style={styles.syncText}>{syncStatus === 'connected' ? t('sync.connected') : syncStatus === 'syncing' ? t('sync.syncing') : t('sync.disconnected')}</Text>
        </View>
        <TouchableOpacity style={styles.syncBtn} onPress={syncStatus === 'connected' ? disconnect : connect}>
          <Text style={styles.syncBtnText}>{syncStatus === 'connected' ? t('sync.disconnect') : t('sync.connect')}</Text>
        </TouchableOpacity>
      </View>

      {/* Backup / Restore */}
      <Text style={styles.sectionTitle}>Backup / Restore</Text>
      <View style={styles.backupRow}>
        <TouchableOpacity style={styles.backupBtn} onPress={handleBackup} disabled={backupLoading}>
          {backupLoading ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Ionicons name="cloud-upload" size={20} color={COLORS.primary} />
          )}
          <Text style={styles.backupBtnText}>Backup</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backupBtn} onPress={handleRestore} disabled={restoreLoading}>
          {restoreLoading ? (
            <ActivityIndicator size="small" color={COLORS.warning} />
          ) : (
            <Ionicons name="cloud-download" size={20} color={COLORS.warning} />
          )}
          <Text style={styles.backupBtnText}>Restaurar</Text>
        </TouchableOpacity>
      </View>

      {/* Navigation Links */}
      <Text style={styles.sectionTitle}>Navigation</Text>
      <TouchableOpacity style={styles.navLink} onPress={() => navigation.navigate('Users')}>
        <Ionicons name="people" size={20} color={COLORS.primary} />
        <Text style={styles.navLinkText}>{t('nav.users')}</Text>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.navLink} onPress={() => navigation.navigate('License')}>
        <Ionicons name="key" size={20} color={COLORS.primary} />
        <Text style={styles.navLinkText}>{t('nav.license')}</Text>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.navLink} onPress={() => navigation.navigate('Reservations')}>
        <Ionicons name="calendar" size={20} color={COLORS.primary} />
        <Text style={styles.navLinkText}>{t('nav.reservations')}</Text>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity style={[styles.saveBtn, saved && styles.saveBtnSaved]} onPress={saveSettings}>
        <Text style={styles.saveBtnText}>{saved ? t('settings.saved') : t('settings.save')}</Text>
      </TouchableOpacity>

      <Text style={styles.version}>{t('app.name')} {t('settings.version')} 1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, paddingBottom: 100 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.primary, marginTop: SPACING.lg, marginBottom: SPACING.sm, textTransform: 'uppercase' },
  input: { backgroundColor: COLORS.input, color: COLORS.text, borderRadius: RADIUS.md, padding: SPACING.md, fontSize: 16, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  langRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  langBtn: { flex: 1, padding: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  langActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '10' },
  langText: { color: COLORS.textSecondary, fontWeight: '600', flexShrink: 1 },
  syncRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  syncStatus: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  syncText: { color: COLORS.textSecondary, fontSize: 14 },
  syncBtn: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary },
  syncBtnText: { color: COLORS.primary, fontWeight: '600' },
  navLink: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, gap: SPACING.sm },
  navLinkText: { flex: 1, color: COLORS.text, fontSize: 16 },
  backupRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  backupBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  backupBtnText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center', marginTop: SPACING.lg },
  saveBtnSaved: { backgroundColor: COLORS.success },
  saveBtnText: { color: COLORS.black, fontSize: 16, fontWeight: '700' },
  version: { textAlign: 'center', color: COLORS.textMuted, fontSize: 12, marginTop: SPACING.lg },
});
