import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, Modal, ActivityIndicator } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { useCartStore, CartItem } from '../stores/cartStore';
import { useAuthStore } from '../stores/authStore';
import { dbAll, dbRun, getSetting } from '../db/sqlite';
import { Ionicons } from '@expo/vector-icons';
import ShiftModal from '../components/ShiftModal';
import ClientPickerModal from '../components/ClientPickerModal';
import { lanService } from '../services/lanService';

const CameraView = lazy(() => import('expo-camera').then(m => ({ default: m.CameraView })));
let useCameraPermissions: any = null;
try { useCameraPermissions = require('expo-camera').useCameraPermissions; } catch {}

export default function CaisseScreen() {
  const { user, logout } = useAuthStore();
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
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{ id: number | null; nom: string; nif: string }>({ id: null, nom: 'CONSUMIDOR FINAL', nif: 'CONSUMIDOR FINAL' });
  const [scannedProduct, setScannedProduct] = useState<any>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [lanConnected, setLanConnected] = useState(false);
  const [showLanModal, setShowLanModal] = useState(false);
  const [lanIp, setLanIp] = useState('');
  const [lanConnecting, setLanConnecting] = useState(false);
  const lastScannedRef = useRef<string>('');
  const scanCooldownRef = useRef(false);

  useEffect(() => {
    loadProducts();
    loadSettings();
    // Listen for LAN connection status
    lanService.onStatusChange((connected) => setLanConnected(connected));
    // Auto-connect via USB if possible
    lanService.connectViaUSB().then(ok => {
      if (ok) console.log('[LAN] Connected via USB');
    }).catch(() => {});
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

  const handleLanConnect = async () => {
    if (!lanIp.trim()) return;
    setLanConnecting(true);
    const ok = await lanService.connect(lanIp.trim());
    setLanConnecting(false);
    if (ok) {
      setShowLanModal(false);
      Alert.alert('Connecté', `Desktop connecté: ${lanIp}`);
    } else {
      Alert.alert('Erreur', `Impossible de se connecter à ${lanIp}`);
    }
  };

  const handleAddProduct = (product: any) => {
    setScannedProduct(product);
    setShowTypePicker(true);
    setShowProductPicker(false);
    setSearch('');
  };

  const handleTypeSelect = (type: 'carton' | 'demi' | 'unite') => {
    if (!scannedProduct) return;
    const price = type === 'carton'
      ? scannedProduct.prix_carton
      : type === 'demi'
        ? (scannedProduct.prix_demi || (scannedProduct.prix_carton || 0) / 2)
        : (scannedProduct.prix_unite || (scannedProduct.prix_carton || 0) / (scannedProduct.unites_par_carton || 1));
    addItem({
      productId: scannedProduct.id,
      name: scannedProduct.nom,
      type,
      qty: 1,
      price: price || 0,
      unitsPerCarton: scannedProduct.unites_par_carton || 1,
    });
    setShowTypePicker(false);
    setScannedProduct(null);
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanCooldownRef.current) return;
    if (data === lastScannedRef.current) return;

    scanCooldownRef.current = true;
    lastScannedRef.current = data;

    try {
      // 1. Search locally first
      let matched = await dbAll<any>('SELECT * FROM products WHERE barcode=? AND actif=1', [data]);

      // 2. If not found locally, query desktop via LAN/USB
      if (matched.length === 0 && lanService.isConnected()) {
        const desktopProduct = await lanService.queryProduct(data);
        if (desktopProduct) {
          // Save to local DB for future scans
          await dbRun(
            `INSERT OR REPLACE INTO products (id, nom, categorie, prix_carton, prix_demi, prix_unite, unites_par_carton, stock_cartons, stock_alerte, actif, barcode)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [desktopProduct.id, desktopProduct.nom, desktopProduct.categorie || 'General',
             desktopProduct.prix_carton, desktopProduct.prix_demi, desktopProduct.prix_unite,
             desktopProduct.unites_par_carton || 1, desktopProduct.stock_cartons || 0,
             desktopProduct.stock_alerte || 2, data]
          );
          matched = [desktopProduct];
        }
      }

      if (matched.length > 0) {
        setShowScanner(false);
        setScannedProduct(matched[0]);
        setShowTypePicker(true);
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
        `INSERT INTO ventes (user_id, client_id, client_nom, client_nif, total, montant_recu, monnaie_rendue, mode_paiement, montant_dinheiro, montant_express, machine_id, uuid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user?.id || 0,
          selectedClient.id,
          selectedClient.nom,
          selectedClient.nif || 'CONSUMIDOR FINAL',
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

      // Push sale to desktop via LAN/USB if connected
      if (lanService.isConnected()) {
        lanService.pushSale({
          uuid: generateUUID(),
          user_id: user?.id || 1,
          client_nom: selectedClient.nom,
          client_nif: selectedClient.nif || 'CONSUMIDOR FINAL',
          total, montant_recu: totalPaid, monnaie_rendue: change,
          mode_paiement: payMode,
          montant_dinheiro: payMode === 'dinheiro' ? total : (payMode === 'misto' ? parseFloat(cashGiven) || 0 : 0),
          montant_express: payMode === 'express' ? total : (payMode === 'misto' ? parseFloat(expressAmount) || 0 : 0),
          machine_id: machineId, facture_num: factureNum, statut: 'normal',
          date_vente: new Date().toISOString(),
          items: items.map(item => ({
            product_id: item.productId, type_vente: item.type, quantite: item.qty,
            prix_unitaire: item.price, sous_total: item.subtotal,
          })),
        });
      }

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
          <View style={styles.cartHeaderLeft}>
            <Text style={styles.cartTitle}>{t('caisse.cart')} ({getItemCount()})</Text>
            <TouchableOpacity style={styles.clientBadge} onPress={() => setShowClientPicker(true)}>
              <Ionicons name="person" size={14} color={COLORS.primary} />
              <Text style={styles.clientBadgeText} numberOfLines={1}>{selectedClient.nom}</Text>
              <Ionicons name="chevron-down" size={12} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.cartHeaderRight}>
            {items.length > 0 && (
              <TouchableOpacity onPress={() => { Alert.alert('Vider le panier?', '', [{ text: t('common.cancel') }, { text: t('common.confirm'), onPress: clear }]); }}>
                <Ionicons name="trash-outline" size={20} color={COLORS.error} />
              </TouchableOpacity>
            )}
          </View>
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
      <View style={styles.lanBar}>
        <TouchableOpacity style={styles.lanStatus} onPress={() => setShowLanModal(true)}>
          <View style={[styles.lanDot, { backgroundColor: lanConnected ? COLORS.success : COLORS.error }]} />
          <Text style={styles.lanText}>{lanConnected ? 'Desktop connecté' : 'USB/WiFi déconnecté'}</Text>
          <Ionicons name="settings-outline" size={14} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>
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
                  <Text style={styles.productItemName} numberOfLines={1}>{item.nom}</Text>
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

      {/* Shift Modal */}
      <ShiftModal
        visible={showShiftModal}
        onConfirm={() => { setShowShiftModal(false); logout(); }}
        onCancel={() => setShowShiftModal(false)}
        isAdmin={user?.role === 'admin'}
      />

      {/* Client Picker Modal */}
      <ClientPickerModal
        visible={showClientPicker}
        onSelect={setSelectedClient}
        onClose={() => setShowClientPicker(false)}
      />

      {/* Type Picker Modal (carton / demi / unite) */}
      <Modal visible={showTypePicker} transparent animationType="fade">
        <View style={styles.typePickerOverlay}>
          <View style={styles.typePickerContainer}>
            <Text style={styles.typePickerTitle}>{scannedProduct?.nom}</Text>
            <Text style={styles.typePickerSubtitle}>Choisir le type de vente</Text>

            {/* Carton */}
            <TouchableOpacity style={styles.typeOption} onPress={() => handleTypeSelect('carton')}>
              <View style={styles.typeOptionLeft}>
                <View style={[styles.typeIcon, { backgroundColor: COLORS.primary + '20' }]}>
                  <Ionicons name="cube" size={20} color={COLORS.primary} />
                </View>
                <View>
                  <Text style={styles.typeOptionName}>Carton</Text>
                  <Text style={styles.typeOptionSub}>{scannedProduct?.unites_par_carton || 1} unités/ct</Text>
                </View>
              </View>
              <Text style={styles.typeOptionPrice}>{scannedProduct?.prix_carton?.toLocaleString('fr-FR')} {currency}</Text>
            </TouchableOpacity>

            {/* Demi */}
            {scannedProduct?.prix_demi > 0 && (
              <TouchableOpacity style={styles.typeOption} onPress={() => handleTypeSelect('demi')}>
                <View style={styles.typeOptionLeft}>
                  <View style={[styles.typeIcon, { backgroundColor: COLORS.info + '20' }]}>
                    <Ionicons name="cube-outline" size={20} color={COLORS.info} />
                  </View>
                  <View>
                    <Text style={styles.typeOptionName}>Demi</Text>
                    <Text style={styles.typeOptionSub}>Demi carton</Text>
                  </View>
                </View>
                <Text style={styles.typeOptionPrice}>{scannedProduct?.prix_demi?.toLocaleString('fr-FR')} {currency}</Text>
              </TouchableOpacity>
            )}

            {/* Unite */}
            <TouchableOpacity style={styles.typeOption} onPress={() => handleTypeSelect('unite')}>
              <View style={styles.typeOptionLeft}>
                <View style={[styles.typeIcon, { backgroundColor: COLORS.success + '20' }]}>
                  <Ionicons name="fitness" size={20} color={COLORS.success} />
                </View>
                <View>
                  <Text style={styles.typeOptionName}>Unité</Text>
                  <Text style={styles.typeOptionSub}>1 unité</Text>
                </View>
              </View>
              <Text style={styles.typeOptionPrice}>{(scannedProduct?.prix_unite || (scannedProduct?.prix_carton || 0) / (scannedProduct?.unites_par_carton || 1))?.toLocaleString('fr-FR')} {currency}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.typePickerCancel} onPress={() => { setShowTypePicker(false); setScannedProduct(null); }}>
              <Text style={styles.typePickerCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* LAN Connection Modal */}
      <Modal visible={showLanModal} transparent animationType="fade">
        <View style={styles.typePickerOverlay}>
          <View style={styles.typePickerContainer}>
            <Text style={styles.typePickerTitle}>Connexion Desktop</Text>
            <Text style={styles.typePickerSubtitle}>Connectez-vous au desktop via USB ou WiFi</Text>

            {lanConnected ? (
              <View style={{ alignItems: 'center', padding: SPACING.md }}>
                <Ionicons name="checkmark-circle" size={48} color={COLORS.success} />
                <Text style={{ color: COLORS.success, fontWeight: '700', marginTop: SPACING.sm }}>Connecté au desktop</Text>
                <TouchableOpacity style={[styles.typePickerCancel, { marginTop: SPACING.md }]} onPress={() => { lanService.disconnect(); setLanConnected(false); }}>
                  <Text style={styles.typePickerCancelText}>Déconnecter</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.typeOption}
                  onPress={async () => {
                    setLanConnecting(true);
                    const ok = await lanService.connectViaUSB();
                    setLanConnecting(false);
                    if (ok) { setShowLanModal(false); Alert.alert('Connecté', 'Desktop connecté via USB'); }
                    else Alert.alert('Erreur', 'USB non détecté. Vérifiez le câble USB et ADB.');
                  }}
                >
                  <View style={styles.typeOptionLeft}>
                    <View style={[styles.typeIcon, { backgroundColor: COLORS.info + '20' }]}>
                      <Ionicons name="hardware-chip" size={20} color={COLORS.info} />
                    </View>
                    <View>
                      <Text style={styles.typeOptionName}>USB (ADB)</Text>
                      <Text style={styles.typeOptionSub}>Connexion directe par câble</Text>
                    </View>
                  </View>
                  {lanConnecting && <ActivityIndicator size="small" color={COLORS.primary} />}
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', marginVertical: SPACING.sm }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>OU</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
                </View>

                <Text style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: SPACING.sm }}>IP du desktop (WiFi):</Text>
                <TextInput
                  style={[styles.searchInput, { marginBottom: SPACING.sm }]}
                  placeholder="ex: 192.168.1.100"
                  placeholderTextColor={COLORS.textMuted}
                  value={lanIp}
                  onChangeText={setLanIp}
                  keyboardType="decimal-pad"
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={[styles.typeOption, { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '10' }]}
                  onPress={handleLanConnect}
                  disabled={lanConnecting}
                >
                  <View style={styles.typeOptionLeft}>
                    <View style={[styles.typeIcon, { backgroundColor: COLORS.primary + '20' }]}>
                      {lanConnecting ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="wifi" size={20} color={COLORS.primary} />}
                    </View>
                    <Text style={[styles.typeOptionName, { color: COLORS.primary }]}>Connecter via WiFi</Text>
                  </View>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.typePickerCancel} onPress={() => setShowLanModal(false)}>
              <Text style={styles.typePickerCancelText}>Fermer</Text>
            </TouchableOpacity>
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
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.md },
  cartHeaderLeft: { flex: 1 },
  cartHeaderRight: { flexDirection: 'row', gap: SPACING.sm },
  cartTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  clientBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, backgroundColor: COLORS.surfaceLight, paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.sm, alignSelf: 'flex-start' },
  clientBadgeText: { fontSize: 11, color: COLORS.primary, fontWeight: '600', maxWidth: 120 },
  emptyCart: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.sm },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },
  cartItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.sm, gap: SPACING.sm },
  cartItemInfo: { flex: 1 },
  cartItemName: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
  cartItemType: { color: COLORS.textMuted, fontSize: 11, flexShrink: 1 },
  cartItemQty: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  qtyText: { color: COLORS.text, fontWeight: 'bold', minWidth: 20, textAlign: 'center' },
  cartItemTotal: { color: COLORS.primary, fontWeight: '700', fontSize: 14, minWidth: 50, textAlign: 'right', flexShrink: 1 },
  lanBar: { paddingHorizontal: SPACING.md, paddingTop: SPACING.xs, paddingBottom: 0, backgroundColor: COLORS.surface },
  lanStatus: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingVertical: 4 },
  lanDot: { width: 6, height: 6, borderRadius: 3 },
  lanText: { fontSize: 11, color: COLORS.textMuted, flex: 1 },
  bottomBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', padding: SPACING.md, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, gap: SPACING.sm },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary, flexShrink: 1 },
  addBtnText: { color: COLORS.primary, fontWeight: '600' },
  totalSection: { flex: 1, minWidth: 0 },
  totalLabel: { fontSize: 11, color: COLORS.textMuted },
  totalValue: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  validateBtn: { backgroundColor: COLORS.success, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.md, flexShrink: 1 },
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
  paymentTotal: { fontSize: 28, fontWeight: 'bold', color: COLORS.primary, textAlign: 'center', marginBottom: SPACING.lg },
  payModes: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  payModeBtn: { flex: 1, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  payModeActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '20' },
  payModeText: { color: COLORS.textSecondary, fontWeight: '600' },
  payModeTextActive: { color: COLORS.primary },
  payInput: { backgroundColor: COLORS.input, color: COLORS.text, borderRadius: RADIUS.md, padding: SPACING.md, fontSize: 18, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border, textAlign: 'center' },
  changeText: { fontSize: 16, color: COLORS.success, textAlign: 'center', fontWeight: '700', marginBottom: SPACING.md },
  validatePayBtn: { backgroundColor: COLORS.success, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center' },
  validatePayBtnText: { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15', flexShrink: 1 },
  scanBtnText: { color: COLORS.primary, fontWeight: '600' },
  scannerContainer: { flex: 1, backgroundColor: COLORS.black },
  scannerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg, paddingTop: SPACING.xl, backgroundColor: 'rgba(0,0,0,0.8)' },
  scannerTitle: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  camera: { flex: 1 },
  scannerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  scannerFrame: { width: 250, height: 250, borderWidth: 2, borderColor: COLORS.primary, borderRadius: RADIUS.md, backgroundColor: 'transparent' },
  scannerHint: { color: COLORS.white, fontSize: 14, marginTop: SPACING.md, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.sm },
  typePickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  typePickerContainer: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, width: '85%', maxWidth: 360 },
  typePickerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, textAlign: 'center', marginBottom: 4 },
  typePickerSubtitle: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginBottom: SPACING.lg },
  typeOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.md, backgroundColor: COLORS.card, borderRadius: RADIUS.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  typeOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  typeIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  typeOptionName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  typeOptionSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  typeOptionPrice: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  typePickerCancel: { marginTop: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  typePickerCancelText: { color: COLORS.textSecondary, fontWeight: '600' },
});
