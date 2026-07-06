import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { useAuthStore } from '../stores/authStore';
import { hashPassword } from '../stores/authStore';
import { dbRun, setSetting, generateMachineId } from '../db/sqlite';
import JoinNetworkScreen from './JoinNetworkScreen';
import ImportDbScreen from './ImportDbScreen';

type ViewMode = 'choice' | 'new' | 'join' | 'importdb';

export default function SetupScreen() {
  const { checkSetup } = useAuthStore();
  const [view, setView] = useState<ViewMode>('choice');
  const [step, setStep] = useState(0);
  const [shopName, setShopName] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopNif, setShopNif] = useState('');
  const [currency, setCurrency] = useState('AOA');
  const [machineLabel, setMachineLabel] = useState('Caixa Principal');
  const [networkKey, setNetworkKey] = useState('');
  const [adminName, setAdminName] = useState('Administrador');
  const [adminEmail, setAdminEmail] = useState('admin@ckbpos.com');
  const [adminPassword, setAdminPassword] = useState('');

  const handleFinish = async () => {
    try {
      if (shopName) await setSetting('shop_name', shopName);
      if (shopAddress) await setSetting('shop_address', shopAddress);
      if (shopPhone) await setSetting('shop_phone', shopPhone);
      if (shopNif) await setSetting('shop_nif', shopNif);
      await setSetting('currency', currency);

      const machineId = generateMachineId();
      await setSetting('machine_id', machineId);
      await setSetting('machine_label', machineLabel);

      const nk = networkKey || `CKB-${generateMachineId()}-${generateMachineId()}`.slice(0, 13);
      await setSetting('network_key', nk);

      const adminHash = await hashPassword(adminPassword || 'admin123');
      await dbRun(
        'INSERT OR REPLACE INTO users (nom, email, role, password_hash, peut_modifier_factures, tentativas_login) VALUES (?, ?, ?, ?, ?, ?)',
        [adminName, adminEmail.toLowerCase().trim(), 'admin', adminHash, 1, 0]
      );

      await setSetting('setup_done', '1');
      await checkSetup();
      Alert.alert(t('setup.complete'), '', [{ text: t('common.ok') }]);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  // Render sub-screens for join/import
  if (view === 'join') {
    return <JoinNetworkScreen onBack={() => setView('choice')} />;
  }
  if (view === 'importdb') {
    return <ImportDbScreen onBack={() => setView('choice')} />;
  }

  // Choice screen
  if (view === 'choice') {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.stepContainer}>
            <Text style={styles.welcomeEmoji}>🏪</Text>
            <Text style={styles.title}>{t('setup.welcome')}</Text>
            <Text style={styles.subtitle}>{t('setup.title')}</Text>
          </View>

          <TouchableOpacity style={styles.choiceBtn} onPress={() => setView('new')}>
            <Text style={styles.choiceIcon}>🆕</Text>
            <View style={styles.choiceTextWrap}>
              <Text style={styles.choiceTitle}>{t('setup.newStore')}</Text>
              <Text style={styles.choiceDesc}>{t('setup.newStoreDesc')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.choiceBtn} onPress={() => setView('join')}>
            <Text style={styles.choiceIcon}>🌐</Text>
            <View style={styles.choiceTextWrap}>
              <Text style={styles.choiceTitle}>{t('setup.joinNetwork')}</Text>
              <Text style={styles.choiceDesc}>{t('setup.joinNetworkDesc')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.choiceBtn} onPress={() => setView('importdb')}>
            <Text style={styles.choiceIcon}>💾</Text>
            <View style={styles.choiceTextWrap}>
              <Text style={styles.choiceTitle}>{t('setup.restoreDb')}</Text>
              <Text style={styles.choiceDesc}>{t('setup.restoreDbDesc')}</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // New store wizard
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>{t('setup.shopInfo')}</Text>
            <TextInput style={styles.input} placeholder={t('settings.shopName')} placeholderTextColor={COLORS.textMuted} value={shopName} onChangeText={setShopName} />
            <TextInput style={styles.input} placeholder={t('settings.shopAddress')} placeholderTextColor={COLORS.textMuted} value={shopAddress} onChangeText={setShopAddress} />
            <TextInput style={styles.input} placeholder={t('settings.shopPhone')} placeholderTextColor={COLORS.textMuted} value={shopPhone} onChangeText={setShopPhone} keyboardType="phone-pad" />
            <TextInput style={styles.input} placeholder={t('settings.shopNif')} placeholderTextColor={COLORS.textMuted} value={shopNif} onChangeText={setShopNif} />
            <TextInput style={styles.input} placeholder={t('settings.currency')} placeholderTextColor={COLORS.textMuted} value={currency} onChangeText={setCurrency} />
          </View>
        );
      case 1:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>{t('setup.machineInfo')}</Text>
            <TextInput style={styles.input} placeholder={t('settings.machineLabel')} placeholderTextColor={COLORS.textMuted} value={machineLabel} onChangeText={setMachineLabel} />
            <TextInput style={styles.input} placeholder={t('settings.networkKey')} placeholderTextColor={COLORS.textMuted} value={networkKey} onChangeText={setNetworkKey} autoCapitalize="characters" />
            <Text style={styles.hint}>Laissez vide pour générer automatiquement</Text>
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>{t('setup.adminAccount')}</Text>
            <TextInput style={styles.input} placeholder={t('users.name')} placeholderTextColor={COLORS.textMuted} value={adminName} onChangeText={setAdminName} />
            <TextInput style={styles.input} placeholder={t('auth.email')} placeholderTextColor={COLORS.textMuted} value={adminEmail} onChangeText={setAdminEmail} keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={styles.input} placeholder={t('auth.password')} placeholderTextColor={COLORS.textMuted} value={adminPassword} onChangeText={setAdminPassword} secureTextEntry />
            <Text style={styles.hint}>Mot de passe par défaut: admin123</Text>
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.doneEmoji}>✅</Text>
            <Text style={styles.title}>{t('setup.complete')}</Text>
            <Text style={styles.subtitle}>{shopName || 'Minha Loja'}</Text>
            <Text style={styles.subtitle}>Machine: {machineLabel}</Text>
            <Text style={styles.subtitle}>ID: {generateMachineId()}</Text>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backToChoice} onPress={() => setView('choice')}>
          <Text style={styles.backToChoiceText}>← {t('common.back')}</Text>
        </TouchableOpacity>
        {renderStep()}
        <View style={styles.buttons}>
          {step > 0 && (
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep(step - 1)}>
              <Text style={styles.backBtnText}>{t('common.back')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.nextBtn, step === 3 && styles.finishBtn]}
            onPress={() => {
              if (step < 3) setStep(step + 1);
              else handleFinish();
            }}
          >
            <Text style={styles.nextBtnText}>{step < 3 ? t('setup.next') : t('setup.finish')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.dots}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.dot, step === i && styles.dotActive]} />
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, padding: SPACING.lg, justifyContent: 'center' },
  stepContainer: { alignItems: 'center', marginBottom: SPACING.xl },
  welcomeEmoji: { fontSize: 64, marginBottom: SPACING.md },
  doneEmoji: { fontSize: 64, marginBottom: SPACING.md },
  title: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.sm },
  hint: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.xs },
  input: { width: '100%', backgroundColor: COLORS.input, color: COLORS.text, borderRadius: RADIUS.md, padding: SPACING.md, fontSize: 16, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  buttons: { flexDirection: 'row', justifyContent: 'center', gap: SPACING.md, flexWrap: 'wrap' },
  backBtn: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  backBtnText: { color: COLORS.textSecondary, fontSize: 16, fontWeight: '600' },
  nextBtn: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.md, backgroundColor: COLORS.primary },
  finishBtn: { backgroundColor: COLORS.success },
  nextBtnText: { color: COLORS.black, fontSize: 16, fontWeight: '700' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.lg, gap: SPACING.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  dotActive: { backgroundColor: COLORS.primary, width: 24 },
  // Choice screen
  choiceBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md, padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border, width: '100%',
  },
  choiceIcon: { fontSize: 36, marginRight: SPACING.md },
  choiceTextWrap: { flex: 1 },
  choiceTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 4 },
  choiceDesc: { fontSize: 14, color: COLORS.textSecondary },
  backToChoice: { alignSelf: 'flex-start', marginBottom: SPACING.lg },
  backToChoiceText: { color: COLORS.primary, fontSize: 16, fontWeight: '600' },
});
