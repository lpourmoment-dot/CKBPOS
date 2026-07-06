import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { useAuthStore } from '../stores/authStore';
import { setSetting } from '../db/sqlite';

interface Props {
  onBack: () => void;
}

export default function ImportDbScreen({ onBack }: Props) {
  const { checkSetup } = useAuthStore();
  const [status, setStatus] = useState<'idle' | 'importing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [recordCount, setRecordCount] = useState(0);

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setStatus('importing');

      const file = result.assets[0];
      const sourceUri = file.uri;

      // Validate file has .db extension
      const fileName = file.name || '';
      if (!fileName.endsWith('.db') && !fileName.endsWith('.sqlite') && !fileName.endsWith('.sqlite3')) {
        // Try reading anyway — some files might not have proper extension
      }

      // Read file content to validate it's a valid SQLite DB
      const content = await FileSystem.readAsStringAsync(sourceUri, { encoding: FileSystem.EncodingType.Base64 });
      // SQLite magic header: "SQLite format 3\0"
      const isValidSqlite = content.startsWith('U1FMaXRlIGZvcm1hdCAz');

      if (!isValidSqlite) {
        // Try reading as UTF-8 to check for SQL
        const textContent = await FileSystem.readAsStringAsync(sourceUri);
        if (!textContent.includes('CREATE TABLE') && !textContent.includes('INSERT INTO')) {
          setErrorMsg(t('setup.invalidDb'));
          setStatus('error');
          return;
        }
      }

      // Get the DB path
      const dbDir = `${FileSystem.documentDirectory}SQLite`;
      const dbPath = `${dbDir}/ckbpos.db`;

      // Ensure directory exists
      const dirInfo = await FileSystem.getInfoAsync(dbDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dbDir, { intermediates: true });
      }

      // Copy imported file to DB path (replaces existing)
      await FileSystem.copyAsync({ from: sourceUri, to: dbPath });

      // Clean up WAL/SHM files if they exist
      try {
        const walPath = `${dbDir}/ckbpos.db-wal`;
        const shmPath = `${dbDir}/ckbpos.db-shm`;
        const walInfo = await FileSystem.getInfoAsync(walPath);
        if (walInfo.exists) await FileSystem.deleteAsync(walPath);
        const shmInfo = await FileSystem.getInfoAsync(shmPath);
        if (shmInfo.exists) await FileSystem.deleteAsync(shmPath);
      } catch {}

      // Count records in imported DB
      try {
        const sqlite = await import('expo-sqlite');
        const tempDb = await sqlite.openDatabaseAsync('ckbpos.db');
        const userResult = await tempDb.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users');
        const productResult = await tempDb.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM products');
        setRecordCount((userResult?.cnt || 0) + (productResult?.cnt || 0));
        await tempDb.closeAsync();
      } catch {
        setRecordCount(0);
      }

      // Mark setup as done
      await setSetting('setup_done', '1');

      setStatus('done');

      // Reload app after 2s
      setTimeout(() => {
        checkSetup();
      }, 2000);
    } catch (e: any) {
      console.error('[IMPORT_DB] Error:', e);
      setErrorMsg(e.message || t('setup.importError'));
      setStatus('error');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>← {t('common.back')}</Text>
        </TouchableOpacity>

        <Text style={styles.screenTitle}>{t('setup.restoreDb')}</Text>

        {status === 'idle' && (
          <View style={styles.center}>
            <Text style={styles.icon}>💾</Text>
            <Text style={styles.desc}>{t('setup.restoreDbDesc')}</Text>
            <Text style={styles.hint}>
              Sélectionnez un fichier ckbpos.db depuis le stockage de votre téléphone
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleImport}>
              <Text style={styles.primaryBtnText}>{t('setup.selectFile')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === 'importing' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.statusText}>{t('setup.importing')}</Text>
          </View>
        )}

        {status === 'done' && (
          <View style={styles.center}>
            <Text style={styles.doneEmoji}>✅</Text>
            <Text style={styles.doneTitle}>{t('setup.importDone')}</Text>
            {recordCount > 0 && (
              <Text style={styles.doneSubtitle}>
                {recordCount} {t('setup.recordsImported')}
              </Text>
            )}
          </View>
        )}

        {status === 'error' && (
          <View style={styles.center}>
            <Text style={styles.errorEmoji}>❌</Text>
            <Text style={styles.errorTitle}>{t('setup.importError')}</Text>
            <Text style={styles.errorDetail}>{errorMsg}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setStatus('idle')}>
              <Text style={styles.primaryBtnText}>{t('setup.tryAgain')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, padding: SPACING.lg },
  backBtn: { marginBottom: SPACING.md },
  backBtnText: { color: COLORS.primary, fontSize: 16, fontWeight: '600' },
  screenTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.text, textAlign: 'center', marginBottom: SPACING.xl },
  center: { alignItems: 'center', paddingTop: SPACING.xl * 2 },
  icon: { fontSize: 64, marginBottom: SPACING.lg },
  desc: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.md, paddingHorizontal: SPACING.lg },
  hint: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginBottom: SPACING.xl, paddingHorizontal: SPACING.lg },
  primaryBtn: {
    backgroundColor: COLORS.primary, paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl, borderRadius: RADIUS.md, minWidth: 200,
  },
  primaryBtnText: { color: COLORS.black, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  statusText: { fontSize: 16, color: COLORS.textSecondary, marginTop: SPACING.md },
  doneEmoji: { fontSize: 64, marginBottom: SPACING.md },
  doneTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.success, textAlign: 'center' },
  doneSubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: SPACING.sm },
  errorEmoji: { fontSize: 64, marginBottom: SPACING.md },
  errorTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.error, textAlign: 'center' },
  errorDetail: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginBottom: SPACING.lg, paddingHorizontal: SPACING.lg },
});
