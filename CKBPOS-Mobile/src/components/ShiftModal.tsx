import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { useAuthStore } from '../stores/authStore';
import { dbAll, dbRun, getSetting } from '../db/sqlite';
import { Ionicons } from '@expo/vector-icons';

interface ShiftData {
  total: number;
  count: number;
  totalDinheiro: number;
  totalExpress: number;
  items: any[];
  date: string;
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  shopNif: string;
  fundoCaixa: number;
}

interface Props {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isAdmin: boolean;
}

export default function ShiftModal({ visible, onConfirm, onCancel, isAdmin }: Props) {
  const { user } = useAuthStore();
  const [shiftData, setShiftData] = useState<ShiftData | null>(null);
  const [argentEnMain, setArgentEnMain] = useState('');
  const [argentEnvoye, setArgentEnvoye] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState('Kz');

  useEffect(() => {
    if (visible) loadShiftData();
  }, [visible]);

  const loadShiftData = async () => {
    const cur = await getSetting('currency');
    setCurrency(cur || 'Kz');

    const today = new Date().toISOString().slice(0, 10);

    const totalRes = await dbAll<{ total: number; count: number; total_dinheiro: number; total_express: number }>(
      `SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count,
       COALESCE(SUM(montant_dinheiro),0) as total_dinheiro,
       COALESCE(SUM(montant_express),0) as total_express
       FROM ventes
       WHERE user_id=? AND statut!='annule' AND date(date_vente)=date('now')`,
      [user?.id || 0]
    );

    const itemsRes = await dbAll(
      `SELECT p.nom, SUM(vi.quantite) as qty, vi.type_vente, SUM(vi.sous_total) as subtotal
       FROM vente_items vi
       JOIN products p ON vi.product_id=p.id
       JOIN ventes v ON vi.vente_id=v.id
       WHERE v.user_id=? AND vi.statut='normal'
       AND v.statut!='annule' AND date(v.date_vente)=date('now')
       GROUP BY p.id, vi.type_vente ORDER BY subtotal DESC`,
      [user?.id || 0]
    );

    const shopName = await getSetting('shop_name');
    const shopAddress = await getSetting('shop_address');
    const shopPhone = await getSetting('shop_phone');
    const shopNif = await getSetting('shop_nif');
    const fundoRes = await getSetting('fundo_caixa_hoje');
    const fundo = Number(fundoRes || 0);

    const data = totalRes[0];
    setShiftData({
      total: data?.total || 0,
      count: data?.count || 0,
      totalDinheiro: data?.total_dinheiro || 0,
      totalExpress: data?.total_express || 0,
      items: itemsRes || [],
      date: new Date().toLocaleString('pt-BR'),
      shopName: shopName || 'CKBPOS',
      shopAddress: shopAddress || '',
      shopPhone: shopPhone || '',
      shopNif: shopNif || '',
      fundoCaixa: fundo,
    });
  };

  const diffMain = (Number(argentEnMain) || 0) - (shiftData?.totalDinheiro || 0);
  const diffExpress = (Number(argentEnvoye) || 0) - (shiftData?.totalExpress || 0);
  const ecartCaixa = (Number(argentEnMain) || 0) - (shiftData?.fundoCaixa || 0) - (shiftData?.totalDinheiro || 0);

  const handlePrintAndLogout = async () => {
    if (!isAdmin && !argentEnMain && !argentEnvoye) {
      return;
    }
    setLoading(true);
    try {
      await dbRun(
        "INSERT INTO shifts (user_id,debut,fin,total_ventes,total_dinheiro,total_express,argent_en_main,argent_envoye,note,actif) VALUES (?,datetime('now'),datetime('now'),?,?,?,?,?,?,0)",
        [user?.id || 0, shiftData?.total || 0, shiftData?.totalDinheiro || 0, shiftData?.totalExpress || 0,
         Number(argentEnMain) || 0, Number(argentEnvoye) || 0, note]
      );
      onConfirm();
    } catch (e: any) {
      console.error('[SHIFT] Error:', e);
    }
    setLoading(false);
  };

  // Group items by product
  const grouped: Record<string, { carton: number; demi: number; unite: number; subtotal: number }> = {};
  (shiftData?.items || []).forEach((i: any) => {
    if (!grouped[i.nom]) grouped[i.nom] = { carton: 0, demi: 0, unite: 0, subtotal: 0 };
    grouped[i.nom][i.type_vente as keyof typeof grouped[string]] += Math.round(i.qty * 100) / 100;
    grouped[i.nom].subtotal += i.subtotal;
  });

  if (!shiftData) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>{t('common.loading')}</Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{t('shift.title')}</Text>
              {isAdmin && (
                <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
                  <Ionicons name="close" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Meta */}
            <View style={styles.meta}>
              <Text style={styles.metaText}>{t('shift.seller')} <Text style={styles.metaBold}>{user?.nom}</Text></Text>
              <Text style={styles.metaText}>{new Date().toLocaleDateString('pt-BR')}</Text>
            </View>

            {/* Fundo de Caixa */}
            {shiftData.fundoCaixa > 0 && (
              <View style={styles.fundoRow}>
                <Text style={styles.fundoLabel}>{t('shift.cashFund')}</Text>
                <Text style={styles.fundoValue}>{shiftData.fundoCaixa.toLocaleString('pt-BR')} {currency}</Text>
              </View>
            )}

            {/* Total Card */}
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>TOTAL VENDAS HOJE</Text>
              <Text style={styles.totalValue}>{shiftData.total.toLocaleString('pt-BR')} {currency}</Text>
              <Text style={styles.totalCount}>{shiftData.count} transação(ões)</Text>
              <View style={styles.totalRow}>
                <View style={styles.totalSubCard}>
                  <Text style={styles.totalSubLabel}>Dinheiro (sistema)</Text>
                  <Text style={[styles.totalSubValue, { color: COLORS.success }]}>{shiftData.totalDinheiro.toLocaleString('pt-BR')} {currency}</Text>
                </View>
                <View style={styles.totalSubCard}>
                  <Text style={styles.totalSubLabel}>App Express (sistema)</Text>
                  <Text style={[styles.totalSubValue, { color: COLORS.info }]}>{shiftData.totalExpress.toLocaleString('pt-BR')} {currency}</Text>
                </View>
              </View>
            </View>

            {/* Products List */}
            {Object.keys(grouped).length > 0 && (
              <View style={styles.productsCard}>
                <Text style={styles.productsTitle}>PRODUTOS VENDIDOS HOJE</Text>
                {Object.entries(grouped).map(([nom, v], i) => {
                  const parts: string[] = [];
                  if (v.carton > 0) parts.push(`${Math.round(v.carton * 100) / 100} cx`);
                  if (v.demi > 0) parts.push(`${Math.round(v.demi * 100) / 100} demi`);
                  if (v.unite > 0) parts.push(`${Math.round(v.unite * 100) / 100} un`);
                  return (
                    <View key={i} style={styles.productRow}>
                      <Text style={styles.productName}><Text style={styles.productBold}>{nom}</Text>: {parts.join(' + ')}</Text>
                      <Text style={styles.productSubtotal}>{v.subtotal.toLocaleString('pt-BR')} {currency}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Confirmation Inputs */}
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>CONFIRMAÇÃO DO VENDEDOR</Text>
              <View style={styles.confirmRow}>
                <View style={styles.confirmField}>
                  <Text style={styles.confirmLabel}>Dinheiro real em mãos ({currency})</Text>
                  <View style={styles.confirmInputRow}>
                    <TextInput
                      style={styles.confirmInput}
                      value={argentEnMain}
                      onChangeText={setArgentEnMain}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <TouchableOpacity
                      style={styles.exactBtn}
                      onPress={() => {
                        setArgentEnMain(String(shiftData.totalDinheiro || 0));
                        setArgentEnvoye(String(shiftData.totalExpress || 0));
                      }}
                    >
                      <Text style={styles.exactBtnText}>Exato</Text>
                    </TouchableOpacity>
                  </View>
                  {argentEnMain !== '' && (
                    <Text style={[styles.diffText, { color: diffMain >= 0 ? COLORS.success : COLORS.error }]}>
                      {diffMain >= 0 ? `+${diffMain.toLocaleString('pt-BR')}` : diffMain.toLocaleString('pt-BR')} {currency}
                    </Text>
                  )}
                </View>
                <View style={styles.confirmField}>
                  <Text style={styles.confirmLabel}>App Express real ({currency})</Text>
                  <TextInput
                    style={styles.confirmInput}
                    value={argentEnvoye}
                    onChangeText={setArgentEnvoye}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  {argentEnvoye !== '' && (
                    <Text style={[styles.diffText, { color: diffExpress >= 0 ? COLORS.success : COLORS.error }]}>
                      {diffExpress >= 0 ? `+${diffExpress.toLocaleString('pt-BR')}` : diffExpress.toLocaleString('pt-BR')} {currency}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.noteField}>
                <Text style={styles.confirmLabel}>Observação (opcional)</Text>
                <TextInput
                  style={styles.confirmInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Ex: Faltaram 500 AOA..."
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            </View>

            {/* Ecart Caixa */}
            {(argentEnMain !== '' || argentEnvoye !== '') && (
              <View style={[styles.ecartCard, { backgroundColor: ecartCaixa >= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', borderColor: ecartCaixa >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)' }]}>
                <View style={styles.ecartRow}>
                  <Text style={styles.ecartLabel}>{t('shift.cashInHand')}</Text>
                  <Text style={styles.ecartValue}>{(Number(argentEnMain) || 0).toLocaleString('pt-BR')} {currency}</Text>
                </View>
                {shiftData.fundoCaixa > 0 && (
                  <View style={styles.ecartRow}>
                    <Text style={styles.ecartLabel}>{t('shift.cashFund')}</Text>
                    <Text style={styles.ecartValue}>-{shiftData.fundoCaixa.toLocaleString('pt-BR')} {currency}</Text>
                  </View>
                )}
                <View style={styles.ecartRow}>
                  <Text style={styles.ecartLabel}>{t('shift.totalCashSystem')}</Text>
                  <Text style={styles.ecartValue}>-{(shiftData.totalDinheiro || 0).toLocaleString('pt-BR')} {currency}</Text>
                </View>
                <View style={[styles.ecartRow, styles.ecartTotal]}>
                  <Text style={[styles.ecartLabel, { fontWeight: '800', color: ecartCaixa >= 0 ? COLORS.success : COLORS.error }]}>{t('shift.gapTitle')}</Text>
                  <Text style={[styles.ecartValue, { fontWeight: '800', color: ecartCaixa >= 0 ? COLORS.success : COLORS.error }]}>
                    {ecartCaixa >= 0 ? '+' : ''}{ecartCaixa.toLocaleString('pt-BR')} {currency}
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            {isAdmin && (
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.printBtn, loading && styles.printBtnDisabled]}
              onPress={handlePrintAndLogout}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Ionicons name="print" size={16} color="#000" style={{ marginRight: 6 }} />
              )}
              <Text style={styles.printBtnText}>{loading ? t('shift.printing') : t('shift.printAndExit')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  loadingContainer: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center' },
  loadingText: { color: COLORS.textSecondary, marginTop: SPACING.md, fontSize: 14 },
  container: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, width: '90%', maxHeight: '85%', padding: SPACING.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  closeBtn: { padding: SPACING.xs },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md },
  metaText: { fontSize: 12, color: COLORS.textMuted },
  metaBold: { fontWeight: '700', color: COLORS.text },
  fundoRow: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.sm, backgroundColor: COLORS.surfaceLight, borderRadius: RADIUS.sm, marginBottom: SPACING.md },
  fundoLabel: { fontSize: 12, color: COLORS.textSecondary },
  fundoValue: { fontFamily: 'monospace', fontWeight: '700', color: COLORS.primary },
  totalCard: { backgroundColor: COLORS.surfaceLight, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  totalLabel: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center' },
  totalValue: { fontSize: 24, fontWeight: '800', color: COLORS.primary, textAlign: 'center', fontFamily: 'monospace' },
  totalCount: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.sm },
  totalRow: { flexDirection: 'row', gap: SPACING.sm },
  totalSubCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: RADIUS.sm, padding: SPACING.sm, textAlign: 'center' },
  totalSubLabel: { fontSize: 11, color: COLORS.textMuted },
  totalSubValue: { fontFamily: 'monospace', fontWeight: '700' },
  productsCard: { backgroundColor: COLORS.surfaceLight, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.md, maxHeight: 150 },
  productsTitle: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SPACING.xs },
  productRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  productName: { fontSize: 12, color: COLORS.text, flex: 1 },
  productBold: { fontWeight: '700' },
  productSubtotal: { fontFamily: 'monospace', color: COLORS.primary, fontSize: 12 },
  confirmCard: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  confirmTitle: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SPACING.sm },
  confirmRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  confirmField: { flex: 1 },
  confirmLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 },
  confirmInputRow: { flexDirection: 'row', gap: SPACING.xs },
  confirmInput: { flex: 1, backgroundColor: COLORS.input, color: COLORS.text, borderRadius: RADIUS.sm, padding: SPACING.sm, fontSize: 14, fontFamily: 'monospace' },
  exactBtn: { paddingHorizontal: SPACING.md, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15', justifyContent: 'center' },
  exactBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  diffText: { fontSize: 10, marginTop: 2 },
  noteField: { marginTop: SPACING.sm },
  ecartCard: { borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1 },
  ecartRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  ecartLabel: { fontSize: 12, color: COLORS.textSecondary },
  ecartValue: { fontFamily: 'monospace', fontSize: 12 },
  ecartTotal: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.sm, marginTop: SPACING.xs },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  cancelBtn: { flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  cancelBtnText: { color: COLORS.textSecondary, fontWeight: '600' },
  printBtn: { flex: 2, flexDirection: 'row', paddingVertical: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  printBtnDisabled: { opacity: 0.6 },
  printBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },
});
