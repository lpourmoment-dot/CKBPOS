import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { useAuthStore } from '../stores/authStore';
import lanService from '../services/lanService';

type Phase = 'scan' | 'select' | 'auth' | 'syncing' | 'done' | 'error';

interface Peer {
  machine_id: string;
  machine_label: string;
  ip: string;
}

interface Props {
  onBack: () => void;
}

export default function JoinNetworkScreen({ onBack }: Props) {
  const { checkSetup } = useAuthStore();
  const [phase, setPhase] = useState<Phase>('scan');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<Peer | null>(null);
  const [authInput, setAuthInput] = useState('');
  const [syncProgress, setSyncProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [scanning, setScanning] = useState(false);

  const scanForPeers = useCallback(async () => {
    setScanning(true);
    setPeers([]);
    try {
      // Connect to localhost (USB via ADB) or try known IPs
      const usbOk = await lanService.connectViaUSB();
      if (usbOk) {
        const state = lanService.getState();
        const peer: Peer = {
          machine_id: state.desktopMachineId || 'DESKTOP',
          machine_label: state.desktopLabel || 'Desktop (USB)',
          ip: '127.0.0.1',
        };
        setSelectedPeer(peer);
        setScanning(false);
        setPhase('auth'); // Skip select phase, go directly to auth
        return;
      }
    } catch {}

    // Try common local IPs
    const commonIps = ['192.168.1.1', '192.168.0.1', '192.168.43.1', '192.168.137.1', '10.0.0.1'];
    const found: Peer[] = [];

    for (const ip of commonIps) {
      try {
        const ok = await lanService.connect(ip);
        if (ok) {
          const state = lanService.getState();
          found.push({
            machine_id: state.desktopMachineId || ip,
            machine_label: state.desktopLabel || ip,
            ip,
          });
          lanService.disconnect();
          break; // Found one, stop scanning
        }
      } catch {}
    }

    setPeers(found);
    setScanning(false);
    if (found.length === 1) {
      // Only one peer found, skip select phase
      setSelectedPeer(found[0]);
      setPhase('auth');
    } else if (found.length > 1) {
      setPhase('select');
    } else {
      setPhase('scan');
      Alert.alert(t('setup.noPeers'), t('setup.tryAgain'));
    }
  }, []);

  useEffect(() => {
    scanForPeers();
    return () => {
      lanService.disconnect();
    };
  }, [scanForPeers]);

  const handleSelectPeer = async (peer: Peer) => {
    setSelectedPeer(peer);
    // If not already connected to this peer, connect first
    if (!lanService.isConnected() || lanService.getState().desktopIp !== peer.ip) {
      lanService.disconnect();
      const ok = await lanService.connect(peer.ip);
      if (!ok) {
        setErrorMsg('Impossible de se connecter à ' + peer.machine_label);
        setPhase('error');
        return;
      }
    }
    setPhase('auth');
  };

  const handleAuth = async () => {
    if (!authInput.trim()) {
      Alert.alert(t('common.error'), t('setup.networkKeyOrCode'));
      return;
    }
    setPhase('syncing');
    setSyncProgress(0);

    // Set up snapshot listeners
    const onData = async (msg: any) => {
      try {
        const snapshot = msg.snapshot || {};
        const nk = msg.network_key || '';
        setSyncProgress(50);
        const result = await lanService.applySnapshot(snapshot, nk);
        setSyncProgress(100);
        console.log('[JOIN] Snapshot applied:', result.total, 'records,', result.errors, 'errors');
        setPhase('done');
        setTimeout(() => {
          checkSetup();
        }, 1500);
      } catch (e: any) {
        setErrorMsg(e.message || t('setup.syncError'));
        setPhase('error');
      }
    };

    const onChunk = async (msg: any) => {
      try {
        // Accumulate chunks
        const { snapshotChunks, snapshotTotal } = lanService as any;
        if (!snapshotChunks) (lanService as any).snapshotChunks = [];
        (lanService as any).snapshotChunks[msg.index] = msg.data;
        (lanService as any).snapshotTotal = msg.total;
        setSyncProgress(Math.min(90, 10 + (msg.index / msg.total) * 80));

        const received = (lanService as any).snapshotChunks.filter(Boolean).length;
        if (received === msg.total) {
          const full = JSON.parse((lanService as any).snapshotChunks.join(''));
          (lanService as any).snapshotChunks = [];
          await onData(full);
        }
      } catch (e: any) {
        setErrorMsg(e.message || t('setup.syncError'));
        setPhase('error');
      }
    };

    const onDenied = () => {
      setErrorMsg(t('setup.denied'));
      setPhase('error');
    };

    lanService.on('snapshot:data', onData);
    lanService.on('snapshot:chunk', onChunk);
    lanService.on('snapshot:denied', onDenied);

    // Determine if input is invite code (6 digits) or network key
    const isCode = /^\d{6}$/.test(authInput.trim());
    await lanService.requestSnapshot(
      isCode ? { invite_code: authInput.trim() } : { network_key: authInput.trim() }
    );
  };

  const renderPhase = () => {
    switch (phase) {
      case 'scan':
        return (
          <View style={styles.phaseContainer}>
            {scanning ? (
              <>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.phaseText}>{t('setup.scanning')}</Text>
              </>
            ) : (
              <>
                <Text style={styles.phaseTitle}>{t('setup.noPeers')}</Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={scanForPeers}>
                  <Text style={styles.primaryBtnText}>{t('setup.tryAgain')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        );

      case 'select':
        return (
          <View style={styles.phaseContainer}>
            <Text style={styles.phaseTitle}>{t('setup.scan')}</Text>
            {peers.map((peer) => (
              <TouchableOpacity key={peer.machine_id} style={styles.peerBtn} onPress={() => handleSelectPeer(peer)}>
                <Text style={styles.peerIcon}>🖥</Text>
                <View style={styles.peerInfo}>
                  <Text style={styles.peerName}>{peer.machine_label}</Text>
                  <Text style={styles.peerIp}>{peer.ip}</Text>
                </View>
                <Text style={styles.peerArrow}>→</Text>
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'auth':
        return (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.phaseContainer}>
              <Text style={styles.phaseTitle}>{t('setup.connect')}</Text>
              <Text style={styles.phaseSubtitle}>{selectedPeer?.machine_label}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('setup.inviteCode') + ' / ' + t('settings.networkKey')}
                placeholderTextColor={COLORS.textMuted}
                value={authInput}
                onChangeText={setAuthInput}
                autoCapitalize="characters"
                keyboardType="default"
              />
              <Text style={styles.hint}>{t('setup.networkKeyOrCode')}</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleAuth}>
                <Text style={styles.primaryBtnText}>{t('setup.connect')}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        );

      case 'syncing':
        return (
          <View style={styles.phaseContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.phaseText}>{t('setup.syncing')}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${syncProgress}%` }]} />
            </View>
            <Text style={styles.progressText}>{syncProgress}%</Text>
          </View>
        );

      case 'done':
        return (
          <View style={styles.phaseContainer}>
            <Text style={styles.doneEmoji}>✅</Text>
            <Text style={styles.phaseTitle}>{t('setup.syncDone')}</Text>
          </View>
        );

      case 'error':
        return (
          <View style={styles.phaseContainer}>
            <Text style={styles.errorEmoji}>❌</Text>
            <Text style={styles.phaseTitle}>{t('setup.syncError')}</Text>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setPhase('scan')}>
              <Text style={styles.primaryBtnText}>{t('setup.tryAgain')}</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{t('setup.joinNetwork')}</Text>
        {renderPhase()}
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
  phaseContainer: { alignItems: 'center', paddingTop: SPACING.xl },
  phaseTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, textAlign: 'center', marginBottom: SPACING.md },
  phaseSubtitle: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.lg },
  phaseText: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.md },
  input: {
    width: '100%', backgroundColor: COLORS.input, color: COLORS.text,
    borderRadius: RADIUS.md, padding: SPACING.md, fontSize: 16,
    marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
    textAlign: 'center',
  },
  hint: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginBottom: SPACING.lg },
  primaryBtn: {
    backgroundColor: COLORS.primary, paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl, borderRadius: RADIUS.md, minWidth: 200,
  },
  primaryBtnText: { color: COLORS.black, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  peerBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md, padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border, width: '100%',
  },
  peerIcon: { fontSize: 32, marginRight: SPACING.md },
  peerInfo: { flex: 1 },
  peerName: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  peerIp: { fontSize: 13, color: COLORS.textMuted },
  peerArrow: { fontSize: 20, color: COLORS.primary, fontWeight: 'bold' },
  progressBar: {
    width: '80%', height: 8, backgroundColor: COLORS.border,
    borderRadius: 4, overflow: 'hidden', marginTop: SPACING.lg,
  },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 4 },
  progressText: { fontSize: 14, color: COLORS.textSecondary, marginTop: SPACING.sm },
  doneEmoji: { fontSize: 64, marginBottom: SPACING.md },
  errorEmoji: { fontSize: 64, marginBottom: SPACING.md },
  errorText: { fontSize: 14, color: COLORS.error, textAlign: 'center', marginBottom: SPACING.lg, paddingHorizontal: SPACING.lg },
});
