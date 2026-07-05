import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { useAuthStore } from '../stores/authStore';
import { getSetting } from '../db/sqlite';

export default function LoginScreen() {
  const { login } = useAuthStore();
  const [email, setEmail] = useState('admin@ckbpos.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(t('common.error'), 'Email et mot de passe requis');
      return;
    }
    setLoading(true);
    const success = await login(email, password);
    setLoading(false);
    if (!success) {
      Alert.alert(t('auth.loginError'));
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <Text style={styles.logo}>CKBPOS</Text>
        <Text style={styles.subtitle}>{t('app.name')} — {t('settings.title')}</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder={t('auth.email')}
            placeholderTextColor={COLORS.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder={t('auth.password')}
            placeholderTextColor={COLORS.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
            <Text style={styles.loginBtnText}>{loading ? t('common.loading') : t('auth.loginButton')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, justifyContent: 'center', padding: SPACING.xl },
  logo: { fontSize: 42, fontWeight: 'bold', color: COLORS.primary, textAlign: 'center', marginBottom: SPACING.xs },
  subtitle: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginBottom: SPACING.xxl },
  form: { gap: SPACING.md },
  input: { backgroundColor: COLORS.input, color: COLORS.text, borderRadius: RADIUS.md, padding: SPACING.md, fontSize: 16, borderWidth: 1, borderColor: COLORS.border },
  loginBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center', marginTop: SPACING.sm },
  loginBtnText: { color: COLORS.black, fontSize: 18, fontWeight: '700' },
});
