import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, Modal } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { dbAll, dbRun, getSetting } from '../db/sqlite';
import { useAuthStore } from '../stores/authStore';
import { Ionicons } from '@expo/vector-icons';

export default function EstoqueScreen() {
  const { user } = useAuthStore();
  const [products, setProducts] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [showMovement, setShowMovement] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [movForm, setMovForm] = useState({ type: 'entree', type_mesure: 'carton', quantite: '', motif: '', note: '', cout_entree: '', fournisseur: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const prods = await dbAll('SELECT * FROM products WHERE actif=1 ORDER BY stock_cartons ASC');
    setProducts(prods);
    const movs = await dbAll(
      `SELECT m.*, p.nom as product_nom, u.nom as user_nom
       FROM stock_mouvements m
       JOIN products p ON m.product_id=p.id
       JOIN users u ON m.user_id=u.id
       ORDER BY m.date_mouvement DESC LIMIT 50`
    );
    setMovements(movs);
  };

  const openMovement = (product: any) => {
    setSelectedProduct(product);
    setMovForm({ type: 'entree', type_mesure: 'carton', quantite: '', motif: '', note: '', cout_entree: '', fournisseur: '' });
    setShowMovement(true);
  };

  const saveMovement = async () => {
    if (!movForm.quantite || !selectedProduct) {
      Alert.alert(t('common.error'), 'Quantité requise');
      return;
    }
    const qty = parseFloat(movForm.quantite) || 0;
    const stockBefore = selectedProduct.stock_cartons || 0;
    let stockAfter = stockBefore;

    if (movForm.type === 'entree' || movForm.type === 'retour') {
      stockAfter = stockBefore + qty;
    } else {
      stockAfter = Math.max(0, stockBefore - qty);
    }

    try {
      await dbRun(
        `INSERT INTO stock_mouvements (product_id, user_id, type, type_mesure, quantite, quantite_cartons, stock_avant, stock_apres, motif, note, cout_entree, fournisseur)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [selectedProduct.id, user?.id || 0, movForm.type, movForm.type_mesure, qty, qty, stockBefore, stockAfter, movForm.motif, movForm.note, parseFloat(movForm.cout_entree) || 0, movForm.fournisseur]
      );
      await dbRun('UPDATE products SET stock_cartons=?, updated_at=datetime(\'now\',\'utc\') WHERE id=?', [stockAfter, selectedProduct.id]);
      setShowMovement(false);
      loadData();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const types = [
    { key: 'entree', label: t('estoque.entry'), color: COLORS.success },
    { key: 'sortie', label: t('estoque.exit'), color: COLORS.error },
    { key: 'ajuste', label: t('estoque.adjustment'), color: COLORS.warning },
    { key: 'retour', label: t('estoque.return'), color: COLORS.info },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('estoque.currentStock')}</Text>
      <FlatList
        data={products}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.stockCard} onPress={() => openMovement(item)}>
            <View style={styles.stockInfo}>
              <Text style={styles.stockName}>{item.nom}</Text>
              <Text style={styles.stockCat}>{item.categorie}</Text>
            </View>
            <View style={[styles.stockBadge, item.stock_cartons <= item.stock_alerte && styles.stockBadgeAlert]}>
              <Text style={[styles.stockValue, item.stock_cartons <= item.stock_alerte && { color: COLORS.error }]}>{item.stock_cartons}</Text>
              <Text style={styles.stockUnit}>cx</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
        ListHeaderComponent={<Text style={styles.sectionTitle2}>{t('estoque.history')}</Text>}
        ListFooterComponent={
          <View>
            {movements.map((m: any) => (
              <View key={m.id} style={styles.movRow}>
                <View style={[styles.movType, { backgroundColor: types.find(t => t.key === m.type)?.color || COLORS.textMuted }]}>
                  <Text style={styles.movTypeText}>{m.type?.slice(0, 3).toUpperCase()}</Text>
                </View>
                <View style={styles.movInfo}>
                  <Text style={styles.movProduct}>{m.product_nom}</Text>
                  <Text style={styles.movDetail}>{m.quantite} {m.type_mesure} — {m.user_nom}</Text>
                </View>
                <Text style={styles.movDate}>{new Date(m.date_mouvement).toLocaleDateString('pt-BR')}</Text>
              </View>
            ))}
          </View>
        }
      />

      <Modal visible={showMovement} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedProduct?.nom}</Text>
              <TouchableOpacity onPress={() => setShowMovement(false)}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
            </View>
            <View style={styles.typeRow}>
              {types.map(tp => (
                <TouchableOpacity key={tp.key} style={[styles.typeBtn, movForm.type === tp.key && { backgroundColor: tp.color + '30', borderColor: tp.color }]} onPress={() => setMovForm({ ...movForm, type: tp.key as any })}>
                  <Text style={[styles.typeBtnText, movForm.type === tp.key && { color: tp.color }]}>{tp.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder={t('estoque.quantity')} placeholderTextColor={COLORS.textMuted} value={movForm.quantite} onChangeText={v => setMovForm({ ...movForm, quantite: v })} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder={t('estoque.reason')} placeholderTextColor={COLORS.textMuted} value={movForm.motif} onChangeText={v => setMovForm({ ...movForm, motif: v })} />
            <TextInput style={styles.input} placeholder={t('estoque.costEntry')} placeholderTextColor={COLORS.textMuted} value={movForm.cout_entree} onChangeText={v => setMovForm({ ...movForm, cout_entree: v })} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder={t('estoque.supplier')} placeholderTextColor={COLORS.textMuted} value={movForm.fournisseur} onChangeText={v => setMovForm({ ...movForm, fournisseur: v })} />
            <TextInput style={[styles.input, { height: 60 }]} placeholder={t('estoque.note')} placeholderTextColor={COLORS.textMuted} value={movForm.note} onChangeText={v => setMovForm({ ...movForm, note: v })} multiline />
            <TouchableOpacity style={styles.saveBtn} onPress={saveMovement}>
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
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, padding: SPACING.md, paddingBottom: SPACING.sm },
  sectionTitle2: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  list: { padding: SPACING.md, paddingTop: 0 },
  stockCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  stockInfo: { flex: 1 },
  stockName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  stockCat: { fontSize: 12, color: COLORS.textMuted },
  stockBadge: { flexDirection: 'row', alignItems: 'baseline', backgroundColor: COLORS.surfaceLight, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 4, marginRight: SPACING.sm },
  stockBadgeAlert: { backgroundColor: COLORS.error + '20' },
  stockValue: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  stockUnit: { fontSize: 11, color: COLORS.textMuted, marginLeft: 2 },
  movRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.sm },
  movType: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  movTypeText: { color: COLORS.white, fontSize: 10, fontWeight: 'bold' },
  movInfo: { flex: 1 },
  movProduct: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
  movDetail: { color: COLORS.textMuted, fontSize: 12 },
  movDate: { color: COLORS.textSecondary, fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  typeRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  typeBtn: { flex: 1, padding: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  typeBtnText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  input: { backgroundColor: COLORS.input, color: COLORS.text, borderRadius: RADIUS.md, padding: SPACING.md, fontSize: 16, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center', marginTop: SPACING.sm },
  saveBtnText: { color: COLORS.black, fontSize: 16, fontWeight: '700' },
});
