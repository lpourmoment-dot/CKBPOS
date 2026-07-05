import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, Modal, ActivityIndicator } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { useCartStore, CartItem } from '../stores/cartStore';
import { useAuthStore } from '../stores/authStore';
import { dbAll, dbRun, getSetting } from '../db/sqlite';
import { Ionicons } from '@expo/vector-icons';

const CameraView = lazy(() => import('expo-camera').then(m => ({ default: m.CameraView })));
let useCameraPermissions: any = null;
try { useCameraPermissions = require('expo-camera').useCameraPermissions; } catch {}

export default function CaisseScreen() {
  const { user } = useAuthStore();
  const { items, addItem, removeItem, updateQty, clear, getTotal, getItemCount } = useCartStore();
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [payMode, setPayMode] = useState<'dinheiro' | 'express' | 'misto'>('dinheiro');
  const [cashGiven, setCashGiven] = useState('');
  const [expressAmount, setExpressAmount] = useState('');
  const [currency, setCurrency] = useState('Kz');
  const [shopName, setShopName] = useState('');
  const [machineId, setMachineId] = useState('');
  const lastScannedRef = useRef<string>('');
  const scanCooldownRef = useRef(false);

  useEffect(() => {
    loadProducts();
    loadSettings();
  }, []);

  const loadProducts = async () => {
    const prods = await dbAll('SELECT * FROM products WHERE actif=1 ORDER BY nom');
    setProducts(prods);
  };

  const loadSettings = async () => {
    const cur = await getSetting('currency');
    const name = await getSetting('shop_name');
    const mid = await getSetting('machine_id');
    if (cur) setCurrency(cur);
    if (name) setShopName(name);
    if (mid) setMachineId(mid);
  };

  const filteredProducts = products.filter(p =>
    p.nom.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddProduct = (product: any) => {
    const type: 'carton' | 'demi' | 'unite' = product.has_variants ? 'unite' : 'carton';
    const price = type === 'carton' ? product.prix_carton : (product.prix_unite || product.prix_carton / (product.unites_par_carton || 1));
    addItem({
      productId: product.id,
      name: product.nom,
      type,
      qty: 1,
      price: price || 0,
      unitsPerCarton: product.unites_par_carton || 1,
    });
    setShowProductPicker(false);
    setSearch('');
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanCooldownRef.current) return;
    if (data === lastScannedRef.current) return;

    scanCooldownRef.current = true;
    lastScannedRef.current = data;

    try {
      const matched = await dbAll<any>('SELECT * FROM products WHERE barcode=? AND actif=1', [data]);
      if (matched.length > 0) {
        handleAddProduct(matched[0]);
        setShowScanner(false);
        Alert.alert(t('common.success'), `Produit ajouté: ${matched[0].nom}`);
      } else {
        Alert.alert(t('common.error'), `Aucun produit trouvé pour ce code: ${data}`);
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }

    setTimeout(() => {
      scanCooldownRef.current = false;
      lastScannedRef.current = '';
    }, 2000);
  };

  const openScanner = async () => {
    try {
      const { Camera } = require('expo-camera');
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.error'), 'Permission caméra requise pour scanner');
        return;
      }
    } catch (e) {
      Alert.alert(t('common.error'), 'Module caméra non disponible');
      return;
    }
    setShowScanner(true);
  };

  const validateSale = async () => {
    if (items.length === 0) {
      Alert.alert(t('common.error'), t('caisse.emptyCart'));
      return;
    }

    const total = getTotal();
    const totalPaid = payMode === 'dinheiro' ? parseFloat(cashGiven) || 0 :
      payMode === 'express' ? parseFloat(expressAmount) || 0 :
      (parseFloat(cashGiven) || 0) + (parseFloat(expressAmount) || 0);

    if (payMode !== 'express' && totalPaid < total) {
      Alert.alert(t('common.error'), 'Montant insuffisant');
      return;
    }

    const change = Math.max(0, totalPaid - total);

    try {
      // Insert vente
      const venteResult = await dbRun(
        `INSERT INTO ventes (user_id, client_nom, total, montant_recu, monnaie_rendue, mode_paiement, montant_dinheiro, montant_express, machine_id, uuid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user?.id || 0,
          'CONSUMIDOR FINAL',
          total,
          totalPaid,
          change,
          payMode,
          payMode === 'dinheiro' ? total : (payMode === 'misto' ? parseFloat(cashGiven) || 0 : 0),
          payMode === 'express' ? total : (payMode === 'misto' ? parseFloat(expressAmount) || 0 : 0),
          machineId,
          generateUUID(),
        ]
      );

      const venteId = Number(venteResult.lastInsertRowId);

      // Insert items
      for (const item of items) {
        await dbRun(
          'INSERT INTO vente_items (vente_id, product_id, type_vente, quantite, prix_unitaire, sous_total) VALUES (?, ?, ?, ?, ?, ?)',
          [venteId, item.productId, item.type, item.qty, item.price, item.subtotal]
        );

        // Update stock
        const unitsConsumed = item.type === 'carton' ? item.qty * item.unitsPerCarton : item.qty;
        const cartonsToRemove = unitsConsumed / item.unitsPerCarton;
        const stockBefore = await dbAll<{ stock_cartons: number }>('SELECT stock_cartons FROM products WHERE id=?', [item.productId]);
        const newStock = Math.max(0, (stockBefore[0]?.stock_cartons || 0) - cartonsToRemove);
        await dbRun('UPDATE products SET stock_cartons=? WHERE id=?', [newStock, item.productId]);
      }

      // Generate invoice number
      const year = new Date().getFullYear();
      const shortId = machineId.slice(0, 8).toUpperCase();
      const seq = (venteId).toString().padStart(4, '0');
      const factureNum = `FR CKB${year}/${shortId}-${seq}`;
      await dbRun('UPDATE ventes SET facture_num=? WHERE id=?', [factureNum, venteId]);

      clear();
      setShowPayment(false);
      setCashGiven('');
      setExpressAmount('');
      Alert.alert(t('caisse.saleComplete'), `#${venteId} — ${factureNum}\nTotal: ${total.toLocaleString('fr-FR')} ${currency}\n${change > 0 ? `Troco: ${change.toLocaleString('fr-FR')} ${currency}` : ''}`);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const total = getTotal();

  return (
    <View style={styles.container}>
      {/* Cart */}
      <View style={styles.cartSection}>
        <View style={styles.cartHeader}>
          <Text style={styles.cartTitle}>{t('caisse.cart')} ({getItemCount()})</Text>
          {items.length > 0 && (
            <TouchableOpacity onPress={() => { Alert.alert('Vider le panier?', '', [{ text: t('common.cancel') }, { text: t('common.confirm'), onPress: clear }]); }}>
              <Ionicons name="trash-outline" size={20} color={COLORS.error} />
            </TouchableOpacity>
          )}
        </View>
        {items.length === 0 ? (
          <View style={styles.emptyCart}>
            <Ionicons name="cart-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>{t('caisse.emptyCart')}</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item, index }) => (
              <View style={styles.cartItem}>
                <View style={styles.cartItemInfo}>
                  <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.cartItemType}>{item.type} — {item.price.toLocaleString('fr-FR')} {currency}</Text>
                </View>
                <View style={styles.cartItemQty}>
                  <TouchableOpacity onPress={() => updateQty(index, item.qty - 1)} style={styles.qtyBtn}>
                    <Ionicons name="remove" size={16} color={COLORS.text} />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{item.qty}</Text>
                  <TouchableOpacity onPress={() => updateQty(index, item.qty + 1)} style={styles.qtyBtn}>
                    <Ionicons name="add" size={16} color={COLORS.text} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.cartItemTotal}>{item.subtotal.toLocaleString('fr-FR')}</Text>
                <TouchableOpacity onPress={() => removeItem(index)}>
                  <Ionicons name="close-circle" size={20} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
          <Ionicons name="scan" size={22} color={COLORS.primary} />
          <Text style={styles.scanBtnText}>Scanner</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowProductPicker(true)}>
          <Ionicons name="add-circle" size={22} color={COLORS.primary} />
          <Text style={styles.addBtnText}>{t('caisse.addItem')}</Text>
        </TouchableOpacity>
        <View style={styles.totalSection}>
          <Text style={styles.totalLabel}>{t('caisse.total')}</Text>
          <Text style={styles.totalValue}>{total.toLocaleString('fr-FR')} {currency}</Text>
        </View>
        <TouchableOpacity
          style={[styles.validateBtn, items.length === 0 && styles.validateBtnDisabled]}
          onPress={() => items.length > 0 && setShowPayment(true)}
          disabled={items.length === 0}
        >
          <Text style={styles.validateBtnText}>{t('caisse.validate')}</Text>
        </TouchableOpacity>
      </View>

      {/* Product Picker Modal */}
      <Modal visible={showProductPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('caisse.addItem')}</Text>
              <TouchableOpacity onPress={() => { setShowProductPicker(false); setSearch(''); }}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <TextInput style={styles.searchInput} placeholder={t('products.search')} placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch} autoFocus />
            <FlatList
              data={filteredProducts}
              keyExtractor={item => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.productItem} onPress={() => handleAddProduct(item)}>
                  <Text style={styles.productItemName}>{item.nom}</Text>
                  <Text style={styles.productItemPrice}>{item.prix_carton?.toLocaleString('fr-FR')} {currency}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Payment Modal */}
      <Modal visible={showPayment} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('caisse.payment')}</Text>
              <TouchableOpacity onPress={() => setShowPayment(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.paymentTotal}>{total.toLocaleString('fr-FR')} {currency}</Text>

            <View style={styles.payModes}>
              <TouchableOpacity style={[styles.payModeBtn, payMode === 'dinheiro' && styles.payModeActive]} onPress={() => setPayMode('dinheiro')}>
                <Text style={[styles.payModeText, payMode === 'dinheiro' && styles.payModeTextActive]}>{t('caisse.cash')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.payModeBtn, payMode === 'express' && styles.payModeActive]} onPress={() => setPayMode('express')}>
                <Text style={[styles.payModeText, payMode === 'express' && styles.payModeTextActive]}>{t('caisse.express')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.payModeBtn, payMode === 'misto' && styles.payModeActive]} onPress={() => setPayMode('misto')}>
                <Text style={[styles.payModeText, payMode === 'misto' && styles.payModeTextActive]}>{t('caisse.mixed')}</Text>
              </TouchableOpacity>
            </View>

            {(payMode === 'dinheiro' || payMode === 'misto') && (
              <TextInput style={styles.payInput} placeholder={`${t('caisse.cash')} (${currency})`} placeholderTextColor={COLORS.textMuted} value={cashGiven} onChangeText={setCashGiven} keyboardType="numeric" />
            )}
            {(payMode === 'express' || payMode === 'misto') && (
              <TextInput style={styles.payInput} placeholder={`${t('caisse.express')} (${currency})`} placeholderTextColor={COLORS.textMuted} value={expressAmount} onChangeText={setExpressAmount} keyboardType="numeric" />
            )}

            {payMode === 'dinheiro' && cashGiven && (
              <Text style={styles.changeText}>{t('caisse.change')}: {Math.max(0, (parseFloat(cashGiven) || 0) - total).toLocaleString('fr-FR')} {currency}</Text>
            )}

            <TouchableOpacity style={styles.validatePayBtn} onPress={validateSale}>
              <Text style={styles.validatePayBtnText}>{t('caisse.validate')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Scanner Modal */}
      <Modal visible={showScanner} animationType="slide">
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Scanner un code-barres</Text>
            <TouchableOpacity onPress={() => setShowScanner(false)}>
              <Ionicons name="close" size={28} color={COLORS.white} />
            </TouchableOpacity>
          </View>
          <Suspense fallback={<View style={styles.camera}><ActivityIndicator size="large" color={COLORS.primary} /></View>}>
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'] }}
              onBarcodeScanned={showScanner ? handleBarcodeScanned : undefined}
            />
          </Suspense>
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerFrame} />
            <Text style={styles.scannerHint}>Placez le code-barres dans le cadre</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  cartSection: { flex: 1, padding: SPACING.md },
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  cartTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  emptyCart: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.sm },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },
  cartItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.sm, gap: SPACING.sm },
  cartItemInfo: { flex: 1 },
  cartItemName: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
  cartItemType: { color: COLORS.textMuted, fontSize: 11 },
  cartItemQty: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  qtyText: { color: COLORS.text, fontWeight: 'bold', minWidth: 20, textAlign: 'center' },
  cartItemTotal: { color: COLORS.primary, fontWeight: '700', fontSize: 14, minWidth: 60, textAlign: 'right' },
  bottomBar: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, gap: SPACING.sm },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary },
  addBtnText: { color: COLORS.primary, fontWeight: '600' },
  totalSection: { flex: 1 },
  totalLabel: { fontSize: 11, color: COLORS.textMuted },
  totalValue: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  validateBtn: { backgroundColor: COLORS.success, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.md },
  validateBtnDisabled: { opacity: 0.5 },
  validateBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  searchInput: { backgroundColor: COLORS.input, color: COLORS.text, borderRadius: RADIUS.md, padding: SPACING.md, fontSize: 16, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  productItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  productItemName: { color: COLORS.text, fontSize: 16, flex: 1 },
  productItemPrice: { color: COLORS.primary, fontWeight: '700' },
  paymentTotal: { fontSize: 32, fontWeight: 'bold', color: COLORS.primary, textAlign: 'center', marginBottom: SPACING.lg },
  payModes: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  payModeBtn: { flex: 1, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  payModeActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '20' },
  payModeText: { color: COLORS.textSecondary, fontWeight: '600' },
  payModeTextActive: { color: COLORS.primary },
  payInput: { backgroundColor: COLORS.input, color: COLORS.text, borderRadius: RADIUS.md, padding: SPACING.md, fontSize: 18, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border, textAlign: 'center' },
  changeText: { fontSize: 16, color: COLORS.success, textAlign: 'center', fontWeight: '700', marginBottom: SPACING.md },
  validatePayBtn: { backgroundColor: COLORS.success, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center' },
  validatePayBtnText: { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15' },
  scanBtnText: { color: COLORS.primary, fontWeight: '600' },
  scannerContainer: { flex: 1, backgroundColor: COLORS.black },
  scannerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg, paddingTop: SPACING.xl, backgroundColor: 'rgba(0,0,0,0.8)' },
  scannerTitle: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  camera: { flex: 1 },
  scannerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  scannerFrame: { width: 250, height: 250, borderWidth: 2, borderColor: COLORS.primary, borderRadius: RADIUS.md, backgroundColor: 'transparent' },
  scannerHint: { color: COLORS.white, fontSize: 14, marginTop: SPACING.md, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.sm },
});
