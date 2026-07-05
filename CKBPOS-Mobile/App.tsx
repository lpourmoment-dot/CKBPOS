import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { COLORS } from './src/theme';
import { useI18n } from './src/i18n';
import { useAuthStore } from './src/stores/authStore';
import { initDb } from './src/db/sqlite';
import AppNavigator from './src/navigation/AppNavigator';

const Logo = require('./assets/icon.png');

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const { initLang } = useI18n();
  const { checkSetup } = useAuthStore();

  useEffect(() => {
    bootstrap();
  }, []);

  const bootstrap = async () => {
    try {
      await initLang();
      await initDb();
      await checkSetup();
      setDbReady(true);
    } catch (e: any) {
      console.error('[APP] Bootstrap error:', e);
      setDbError(e.message || 'Database initialization failed');
    }
  };

  if (dbError) {
    return (
      <View style={styles.loadingContainer}>
        <Image source={Logo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.errorText}>Erreur de connexion</Text>
        <Text style={styles.errorDetail}>{dbError}</Text>
      </View>
    );
  }

  if (!dbReady) {
    return (
      <View style={styles.loadingContainer}>
        <Image source={Logo} style={styles.logo} resizeMode="contain" />
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 16 }} />
        <Text style={styles.loadingSubtext}>Initialisation...</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar style="light" />
      <AppNavigator />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  logo: { width: 180, height: 180 },
  loadingSubtext: { fontSize: 14, color: COLORS.textMuted, marginTop: 8 },
  errorText: { fontSize: 18, fontWeight: 'bold', color: COLORS.error, marginBottom: 8, marginTop: 16 },
  errorDetail: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', paddingHorizontal: 32 },
});
