import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { getSetting, setSetting } from '../db/sqlite';
import { evaluateLicenseStatus, getSalesUsed, hasFeature } from '../services/licensing';
import { Ionicons } from '@expo/vector-icons';

export default function LicenseScreen() {
  const [status, setStatus] = useState<any>(null);
  const [salesUsed, setSalesUsed] = useState(0);
  const [machineId, setMachineId] = useState('');
  const [ckbInput, setCkbInput] = useState('');

  useEffect(() => { loadStatus(); }, []);

  const loadStatus = async () => {
    const mid = await getSetting('machine_id') || '';
    setMachineId(mid);
    const used = await getSalesUsed();
    setSalesUsed(used);
    const s = await evaluateLicenseStatus(mid, used);
    setStatus(s);
  };

  const statusColor = status?.valid ? COLORS.success : COLORS.error;
  const statusIcon = status?.valid ? 'checkmark-circle' : 'close-circle';
  const statusText = status?.valid ? t('license.valid') :
    status?.reason === 'expired' ? t('license.expired') :
    status?.reason === 'no_license' ? t('license.noLicense') :
    status?.reason === 'sales_limit_reached' ? `${t('license.salesLimit')}: ${salesUsed}/30` :
    t('license.invalid');

  return (
    <View style={styles.container}>
      {/* Status Card */}
      <View style={[styles.statusCard, { borderLeftColor: statusColor }]}>
        <Ionicons name={statusIcon as any} size={40} color={statusColor} />
        <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
        {status?.payload?.tier && (
          <Text style={styles.tierText}>{t('license.tier')}: {status.payload.tier}</Text>
        )}
        {status?.payload?.expires_at && (
          <Text style={styles.expiresText}>{t('license.expiresAt')}: {new Date(status.payload.expires_at).toLocaleDateString('pt-BR')}</Text>
        )}
      </View>

      {/* Free Mode Info */}
      {!status?.valid && status?.reason === 'no_license' && (
        <View style={styles.freeCard}>
          <Text style={styles.freeTitle}>{t('license.freeMode')}</Text>
          <Text style={styles.freeText}>{salesUsed}/30 {t('license.salesUsed')}</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(salesUsed / 30) * 100}%` }]} />
          </View>
        </View>
      )}

      {/* Features */}
      {status?.payload?.features && (
        <View style={styles.featuresCard}>
          <Text style={styles.featuresTitle}>{t('license.features')}</Text>
          {Object.entries(status.payload.features).map(([key, val]) => (
            <View key={key} style={styles.featureRow}>
              <Ionicons name={val ? 'checkmark' : 'close'} size={16} color={val ? COLORS.success : COLORS.error} />
              <Text style={styles.featureText}>{key}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Machine Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>{t('license.machineId')}</Text>
        <Text style={styles.infoValue}>{machineId}</Text>
      </View>

      {/* Activate */}
      <View style={styles.activateSection}>
        <Text style={styles.activateTitle}>{t('license.activate')}</Text>
        <TextInput
          style={styles.ckbInput}
          placeholder={t('license.enterCkb')}
          placeholderTextColor={COLORS.textMuted}
          value={ckbInput}
          onChangeText={setCkbInput}
          multiline
          numberOfLines={4}
        />
        <TouchableOpacity style={styles.activateBtn} onPress={() => Alert.alert('Info', 'Activation via licence .ckb — utilisez CKBPOS-ADMIN pour générer')}>
          <Text style={styles.activateBtnText}>{t('license.activate')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.md },
  statusCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.lg, alignItems: 'center', borderLeftWidth: 4, marginBottom: SPACING.md },
  statusText: { fontSize: 20, fontWeight: 'bold', marginTop: SPACING.sm, flexShrink: 1 },
  tierText: { color: COLORS.textSecondary, fontSize: 14, marginTop: 4 },
  expiresText: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  freeCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  freeTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  freeText: { color: COLORS.textSecondary, marginBottom: SPACING.sm },
  progressBar: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.warning, borderRadius: 3 },
  featuresCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  featuresTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 4 },
  featureText: { color: COLORS.textSecondary, fontSize: 14 },
  infoCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  infoLabel: { fontSize: 12, color: COLORS.textMuted },
  infoValue: { fontSize: 16, color: COLORS.text, fontWeight: '600', marginTop: 4 },
  activateSection: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md },
  activateTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  ckbInput: { backgroundColor: COLORS.input, color: COLORS.text, borderRadius: RADIUS.md, padding: SPACING.md, fontSize: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm, minHeight: 80, textAlignVertical: 'top' },
  activateBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center' },
  activateBtnText: { color: COLORS.black, fontSize: 16, fontWeight: '700' },
});
