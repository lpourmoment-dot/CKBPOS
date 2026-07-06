import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, Modal } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { dbAll, dbRun } from '../db/sqlite';
import { Ionicons } from '@expo/vector-icons';

interface Product {
  id: number; nom: string; categorie: string; prix_carton: number; prix_demi: number;
  prix_unite: number; stock_cartons: number; stock_alerte: number; actif: number;
  barcode: string; unites_par_carton: number;
}

export default function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({ nom: '', categorie: 'General', prix_carton: '', prix_demi: '', prix_unite: '', stock_cartons: '', stock_alerte: '2', unites_par_carton: '1', barcode: '' });

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    const prods = await dbAll<Product>('SELECT * FROM products WHERE actif=1 ORDER BY nom');
    setProducts(prods);
  };

  const filtered = products.filter(p => p.nom.toLowerCase().includes(search.toLowerCase()) || (p.categorie || '').toLowerCase().includes(search.toLowerCase()));

  const openForm = (product?: Product) => {
    if (product) {
      setEditProduct(product);
      setForm({ nom: product.nom, categorie: product.categorie || 'General', prix_carton: String(product.prix_carton || ''), prix_demi: String(product.prix_demi || ''), prix_unite: String(product.prix_unite || ''), stock_cartons: String(product.stock_cartons || ''), stock_alerte: String(product.stock_alerte || 2), unites_par_carton: String(product.unites_par_carton || 1), barcode: product.barcode || '' });
    } else {
      setEditProduct(null);
      setForm({ nom: '', categorie: 'General', prix_carton: '', prix_demi: '', prix_unite: '', stock_cartons: '', stock_alerte: '2', unites_par_carton: '1', barcode: '' });
    }
    setShowForm(true);
  };

  const saveProduct = async () => {
    if (!form.nom.trim() || !form.prix_carton) {
      Alert.alert(t('common.error'), 'Nom et prix requis');
      return;
    }
    try {
      if (editProduct) {
        await dbRun(
          'UPDATE products SET nom=?, categorie=?, prix_carton=?, prix_demi=?, prix_unite=?, stock_cartons=?, stock_alerte=?, unites_par_carton=?, barcode=?, updated_at=datetime(\'now\',\'utc\') WHERE id=?',
          [form.nom, form.categorie, parseFloat(form.prix_carton) || 0, parseFloat(form.prix_demi) || 0, parseFloat(form.prix_unite) || 0, parseFloat(form.stock_cartons) || 0, parseFloat(form.stock_alerte) || 2, parseInt(form.unites_par_carton) || 1, form.barcode, editProduct.id]
        );
      } else {
        await dbRun(
          'INSERT INTO products (nom, categorie, prix_carton, prix_demi, prix_unite, stock_cartons, stock_alerte, unites_par_carton, barcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [form.nom, form.categorie, parseFloat(form.prix_carton) || 0, parseFloat(form.prix_demi) || 0, parseFloat(form.prix_unite) || 0, parseFloat(form.stock_cartons) || 0, parseFloat(form.stock_alerte) || 2, parseInt(form.unites_par_carton) || 1, form.barcode]
        );
      }
      setShowForm(false);
      loadProducts();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const deleteProduct = (product: Product) => {
    Alert.alert(t('products.confirmDelete'), product.nom, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        await dbRun('UPDATE products SET actif=0 WHERE id=?', [product.id]);
        loadProducts();
      }},
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput style={styles.searchInput} placeholder={t('products.search')} placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch} />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openForm(item)}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardName}>{item.nom}</Text>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => openForm(item)} style={styles.actionBtn}>
                  <Ionicons name="pencil" size={16} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteProduct(item)} style={styles.actionBtn}>
                  <Ionicons name="trash" size={16} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.cardCategory}>{item.categorie}</Text>
            <View style={styles.cardRow}>
              <Text style={styles.cardPrice}>Cartão: {item.prix_carton?.toLocaleString('fr-FR')} Kz</Text>
              <Text style={[styles.cardStock, item.stock_cartons <= item.stock_alerte && { color: COLORS.error }]}>Stock: {item.stock_cartons}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => openForm()}>
        <Ionicons name="add" size={28} color={COLORS.black} />
      </TouchableOpacity>

      {/* Product Form Modal */}
      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editProduct ? t('products.edit') : t('products.add')}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
            </View>
            <FlatList data={[1]} keyExtractor={() => 'form'} renderItem={() => (
              <View style={styles.form}>
                <TextInput style={styles.input} placeholder={t('products.name')} placeholderTextColor={COLORS.textMuted} value={form.nom} onChangeText={v => setForm({ ...form, nom: v })} />
                <TextInput style={styles.input} placeholder={t('products.category')} placeholderTextColor={COLORS.textMuted} value={form.categorie} onChangeText={v => setForm({ ...form, categorie: v })} />
                <TextInput style={styles.input} placeholder={t('products.priceCarton')} placeholderTextColor={COLORS.textMuted} value={form.prix_carton} onChangeText={v => setForm({ ...form, prix_carton: v })} keyboardType="numeric" />
                <TextInput style={styles.input} placeholder={t('products.priceHalf')} placeholderTextColor={COLORS.textMuted} value={form.prix_demi} onChangeText={v => setForm({ ...form, prix_demi: v })} keyboardType="numeric" />
                <TextInput style={styles.input} placeholder={t('products.priceUnit')} placeholderTextColor={COLORS.textMuted} value={form.prix_unite} onChangeText={v => setForm({ ...form, prix_unite: v })} keyboardType="numeric" />
                <TextInput style={styles.input} placeholder={t('products.stock')} placeholderTextColor={COLORS.textMuted} value={form.stock_cartons} onChangeText={v => setForm({ ...form, stock_cartons: v })} keyboardType="numeric" />
                <TextInput style={styles.input} placeholder={t('products.stockAlert')} placeholderTextColor={COLORS.textMuted} value={form.stock_alerte} onChangeText={v => setForm({ ...form, stock_alerte: v })} keyboardType="numeric" />
                <TextInput style={styles.input} placeholder={t('products.unitsPerCarton')} placeholderTextColor={COLORS.textMuted} value={form.unites_par_carton} onChangeText={v => setForm({ ...form, unites_par_carton: v })} keyboardType="numeric" />
                <TextInput style={styles.input} placeholder={t('products.barcode')} placeholderTextColor={COLORS.textMuted} value={form.barcode} onChangeText={v => setForm({ ...form, barcode: v })} />
                <TouchableOpacity style={styles.saveBtn} onPress={saveProduct}>
                  <Text style={styles.saveBtnText}>{t('products.save')}</Text>
                </TouchableOpacity>
              </View>
            )} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.input, margin: SPACING.md, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, gap: SPACING.sm },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 16, paddingVertical: SPACING.sm },
  list: { padding: SPACING.md, paddingTop: 0, gap: SPACING.sm },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 16, fontWeight: '700', color: COLORS.text, flex: 1 },
  cardActions: { flexDirection: 'row', gap: SPACING.sm },
  actionBtn: { padding: SPACING.xs },
  cardCategory: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.sm },
  cardPrice: { color: COLORS.primary, fontWeight: '600', flexShrink: 1 },
  cardStock: { fontWeight: '600', color: COLORS.textSecondary, flexShrink: 1 },
  fab: { position: 'absolute', bottom: SPACING.lg, right: SPACING.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', elevation: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  form: { gap: SPACING.sm },
  input: { backgroundColor: COLORS.input, color: COLORS.text, borderRadius: RADIUS.md, padding: SPACING.md, fontSize: 16, borderWidth: 1, borderColor: COLORS.border },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center', marginTop: SPACING.sm },
  saveBtnText: { color: COLORS.black, fontSize: 16, fontWeight: '700' },
});
