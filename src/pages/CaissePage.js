import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../App';
import { useLang } from '../utils/useLang';
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, Printer, X, User, Layers, Clock, CheckCircle, Package } from 'lucide-react';
import { useAlert, useConfirm } from '../components/AlertModal';

export default function CaissePage() {
  const { user } = useAuth();
  const { currency, t, lang } = useLang();
  const intlLocale = lang === 'fr' ? 'fr-FR' : lang === 'en' ? 'en-US' : 'pt-BR';

  // \u2705 Hooks modals React (remplacent alert() et confirm() natifs Electron)
  const { showAlert, AlertModalComponent } = useAlert();
  const { showConfirm, ConfirmModalComponent } = useConfirm();

  const [shopName, setShopName]       = useState('CKBPOS');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone]     = useState('');
  const [shopNif, setShopNif]         = useState('');

  const [products, setProducts] = useState([]);
  const [search, setSearch]     = useState('');
  const [cart, setCart]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const isProcessing = useRef(false);
  const isPrinting    = useRef(false); // \u2705 Anti double-impression

  // \u2705 v1.2.4 — Flags personnalisation ticket (lus depuis settings)
  const [ticketFlags, setTicketFlags] = useState({
    showFactureNum:true, showClientNom:true, showSeller:true,
    showObrigado:true, showVersion:true, showSecondaVia:true,
    showQr:true, showAddress:true, showPhone:true, showNif:true,
    showClientNif:true, showMentionLegal:true,
  });

  const gridRef      = useRef(null);
  const scanBuffer   = useRef('');   // \u2705 buffer scanner code-barres
  const scanLastTime = useRef(0);
  const totalRef     = useRef(0);   // \u2705 ref pour accès dans useEffect sans TDZ
  const [scanFeedback, setScanFeedback] = useState(null); // { nom, type } pour feedback visuel
  const [printingBtn, setPrintingBtn] = useState(false); // \u2705 Visuel Imprimindo...

  // Anti double-clic : wrapper qui bloque re-clic pendant 800ms
  const withDebounce = useCallback((fn) => async (...args) => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    try { await fn(...args); }
    finally { setTimeout(() => { isProcessing.current = false; }, 800); }
  }, []);

  const [clientNom, setClientNom]           = useState('');
  const [clientNif, setClientNif]           = useState('');
  const [clients, setClients]               = useState([]);
  const [showClientList, setShowClientList] = useState(false);

  const [empresas, setEmpresas]               = useState([]);
  const [showEmpresaList, setShowEmpresaList] = useState(false);

  const [showPayment, setShowPayment]         = useState(false);
  const [payMode, setPayMode]                 = useState('dinheiro');
  const [montantDinheiro, setMontantDinheiro] = useState('');
  const [montantExpress, setMontantExpress]   = useState('');

  const [showSuccess, setShowSuccess] = useState(null);

  const [showVariantPopup, setShowVariantPopup] = useState(false);
  const [selectedProduct, setSelectedProduct]   = useState(null);
  const [selectedType, setSelectedType]         = useState(null);
  const [variants, setVariants]                 = useState([]);

  const [showReserveModal, setShowReserveModal] = useState(false);
  const [showPagoModal, setShowPagoModal]       = useState(false);
  const [reserveNote, setReserveNote]           = useState('');
  const [reserveExpiry, setReserveExpiry]       = useState('24');
  const [pagoNote, setPagoNote]                 = useState('');
  const [pagoPayMode, setPagoPayMode]           = useState('dinheiro');
  const [pagoMontantD, setPagoMontantD]         = useState('');
  const [pagoMontantE, setPagoMontantE]         = useState('');

  const [reservations, setReservations]         = useState([]);
  const [showReservations, setShowReservations] = useState(false);

  const [showPayerModal, setShowPayerModal] = useState(null);
  const [payerMode, setPayerMode]           = useState('dinheiro');
  const [payerMontantD, setPayerMontantD]   = useState('');
  const [payerMontantE, setPayerMontantE]   = useState('');

  useEffect(() => {
    loadProducts(); loadSettings(); loadClients(); loadEmpresas(); loadReservations();
  }, []);

  // \u2705 Déclaré ici pour être accessible par le useEffect scanner/navigation ci-dessous
  const filtered = products.filter(p =>
    p.nom.toLowerCase().includes(search.toLowerCase()) ||
    (p.categorie||'').toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode && p.barcode.includes(search))
  );

  // \u2705 v1.2.3 — Handler global scanner code-barres USB/sans fil
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';

      // ── Scanner code-barres : saisie rapide ──
      if (!isInput) return;
      if (document.activeElement?.type !== 'text' && document.activeElement?.type !== 'search') return;
      if (tag === 'textarea') return;

      const now = Date.now();
      const timeSinceLastChar = now - scanLastTime.current;

      if (e.key === 'Enter') {
        const code = scanBuffer.current.trim();
        scanBuffer.current = '';
        scanLastTime.current = 0;
        if (code.length >= 4) handleBarcodeScanned(code);
        return;
      }

      if (timeSinceLastChar < 80 || scanBuffer.current.length === 0) {
        if (e.key.length === 1) { scanBuffer.current += e.key; scanLastTime.current = now; }
      } else {
        scanBuffer.current = e.key.length === 1 ? e.key : '';
        scanLastTime.current = now;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products]);

  const loadSettings = async () => {
    for (const key of ['shop_name','shop_address','shop_phone','shop_nif']) {
      const res = await window.electron.dbGet(`SELECT value FROM settings WHERE key='${key}'`);
      if (res.data?.value !== undefined) {
        if (key==='shop_name')    setShopName(res.data.value);
        if (key==='shop_address') setShopAddress(res.data.value);
        if (key==='shop_phone')   setShopPhone(res.data.value);
        if (key==='shop_nif')     setShopNif(res.data.value);
      }
    }
    // \u2705 v1.2.4 — Charger les flags de personnalisation du ticket
    const flagRes = await window.electron.dbGet("SELECT value FROM settings WHERE key='ticket_flags'");
    if (flagRes.data?.value) {
      try { setTicketFlags(prev => ({ ...prev, ...JSON.parse(flagRes.data.value) })); } catch(e) {}
    }
  };

  const loadProducts = async () => {
    const res = await window.electron.dbQuery("SELECT * FROM products WHERE actif=1 ORDER BY nom", []);
    setProducts(res.data || []);
  };

  const loadClients = async () => {
    const res = await window.electron.dbQuery("SELECT * FROM clients WHERE actif=1 ORDER BY nom", []);
    setClients(res.data || []);
  };

  const loadEmpresas = async () => {
    const res = await window.electron.empresasList();
    setEmpresas(res.data || []);
  };

  const loadReservations = async () => {
    const res = await window.electron.reservationList();
    setReservations(res.data || []);
  };

  // \u2705 v1.2.3 — Traitement du code-barres scanné
  const handleBarcodeScanned = (code) => {
    // Chercher le produit par barcode exact
    const product = products.find(p => p.barcode && p.barcode.trim() === code.trim());
    if (!product) {
      setScanFeedback({ type: 'error', msg: `Code non trouvé : ${code}` });
      setTimeout(() => setScanFeedback(null), 2500);
      return;
    }
    if (!product.actif) {
      setScanFeedback({ type: 'error', msg: `${product.nom} — produit inactif` });
      setTimeout(() => setScanFeedback(null), 2500);
      return;
    }
    // Ajouter au panier en mode carton par défaut
    // Si le produit a des variants \u2192 ouvrir le sélecteur de variant
    if (product.has_variants) {
      setSelectedProduct(product);
      setSelectedType('carton');
      setShowVariantPopup(true);
      setScanFeedback({ type: 'success', msg: `${product.nom} — choisir variant` });
    } else {
      addToCart(product, 'carton', null);
      setScanFeedback({ type: 'success', msg: `\u2713 ${product.nom} ajouté` });
    }
    setTimeout(() => setScanFeedback(null), 2000);
  };

  const getUnitsPerCarton = (p) => Math.max(1, Math.round(p.unites_par_carton));
  const getStockInUnits   = (p) => Math.round(p.stock_cartons * getUnitsPerCarton(p));
  const getUnitsUsed = (item) => {
    if (item.type==='carton') return item.qty * item.unites;
    if (item.type==='demi')   return item.qty * Math.ceil(item.unites/2);
    return item.qty;
  };

  const getPrice = (product, type, variant=null) => {
    const p = variant || product;
    if (type==='carton') return p.prix_carton || product.prix_carton;
    if (type==='demi') { if (p.prix_demi) return p.prix_demi; return (p.prix_carton||product.prix_carton)/2; }
    if (p.prix_unite) return p.prix_unite;
    return (p.prix_carton||product.prix_carton)/product.unites_par_carton;
  };


  const handleTypeClick = async (product, type) => {
    if (product.has_variants) {
      // \u2705 FIX : recharge TOUJOURS les variants frais depuis la BDD (pas de cache stale)
      const res = await window.electron.dbQuery(
        "SELECT * FROM product_variants WHERE product_id=? AND actif=1 ORDER BY nom", [product.id]
      );
      const vars = res.data || [];
      // Affiche le popup même si stock=0 (désactivés visuellement) pour éviter confusion
      if (vars.length > 0) {
        setSelectedProduct(product); setSelectedType(type); setVariants(vars); setShowVariantPopup(true);
        return;
      }
    }
    addToCart(product, type, null);
  };

  const handleVariantSelect = (variant) => { addToCart(selectedProduct, selectedType, variant); setShowVariantPopup(false); };

  // \u2705 Helper : formate un nombre d'unités en "Xcx Y½ Zun" lisible
  const formatAvailableUnits = (availUnits, upc) => {
    if (availUnits <= 0) return '0';
    const cx   = Math.floor(availUnits / upc);
    const rem  = availUnits % upc;
    const demi = Math.floor(rem / Math.ceil(upc / 2));
    const un   = rem % Math.ceil(upc / 2);
    let str = '';
    if (cx   > 0) str += `${cx}cx `;
    if (demi > 0) str += `${demi}½ `;
    if (un   > 0) str += `${un}un`;
    return str.trim() || '0';
  };

  const addToCart = (product, type, variant) => {
    const price   = getPrice(product, type, variant);
    const upc     = getUnitsPerCarton(product);
    const newUnits = type==='carton' ? upc : type==='demi' ? Math.ceil(upc/2) : 1;

    // \u2705 FIX STOCK STALE : on lit TOUJOURS depuis products[] (rechargé après chaque vente)
    // Pour les variants, on utilise l'objet variant frais passé en paramètre (rechargé dans handleTypeClick)
    const freshProduct = products.find(p => p.id === product.id) || product;
    const stockUnits   = variant
      ? Math.round((variant.stock_cartons ?? 0) * upc)
      : Math.round((freshProduct.stock_cartons ?? 0) * upc);

    const usedUnits = cart
      .filter(i => i.productId === product.id && i.variantId === (variant?.id || null))
      .reduce((s, i) => s + getUnitsUsed(i), 0);

    const available = stockUnits - usedUnits;

    if (usedUnits + newUnits > stockUnits) {
      // \u2705 Message lisible en cx/½/un au lieu d'un nombre brut d'unités
      showAlert(
        t('cashier','stockInsuf') || 'Stock insuffisant !',
        `Disponível: ${formatAvailableUnits(available, upc)} (${Math.max(0, available)} unid.)`,
        'warning'
      );
      return;
    }
    // Anti double-clic
    if (isProcessing.current) return;
    isProcessing.current = true;
    setTimeout(() => { isProcessing.current = false; }, 500);

    const cartKey = `${product.id}-${type}-${variant?.id||'none'}`;
    const existingIdx = cart.findIndex(i=>i.cartKey===cartKey);
    if (existingIdx>=0) {
      setCart(prev=>prev.map((item,idx)=>{
        if (idx!==existingIdx) return item;
        const newQty=item.qty+1; return {...item,qty:newQty,subtotal:Math.round(newQty*item.price*100)/100};
      })); return;
    }
    const displayName = variant ? `${product.nom} ${variant.nom}` : product.nom;
    // stockUnits NON stocké dans le cart item — toujours relu depuis products[] state
    setCart(prev=>[...prev,{cartKey,productId:product.id,variantId:variant?.id||null,nom:displayName,productNom:product.nom,variantNom:variant?.nom||null,type,qty:1,price,subtotal:price,unites:upc}]);
  };

  const updateQty = (cartKey, delta) => {
    setCart(prev => prev.map(item => {
      if (item.cartKey !== cartKey) return item;
      const newQty    = Math.max(1, item.qty + delta);
      const upc       = item.unites;
      // FIX: lit le stock FRAIS depuis products[] — jamais item.stockUnits stale
      const freshProduct    = products.find(p => p.id === item.productId);
      const freshStockUnits = freshProduct
        ? Math.round((freshProduct.stock_cartons ?? 0) * upc)
        : item.stockUnits;
      const otherUsed = prev
        .filter(i => i.productId === item.productId && i.variantId === item.variantId && i.cartKey !== cartKey)
        .reduce((s, i) => s + getUnitsUsed(i), 0);
      const thisUnits = item.type==='carton' ? newQty*upc : item.type==='demi' ? newQty*Math.ceil(upc/2) : newQty;
      if (otherUsed + thisUnits > freshStockUnits) return item;
      return { ...item, qty: newQty, subtotal: Math.round(newQty * item.price * 100) / 100 };
    }));
  };

  const setQtyManual = (cartKey, val) => {
    const newQty = parseInt(val); if (!newQty || newQty <= 0) return;
    setCart(prev => prev.map(item => {
      if (item.cartKey !== cartKey) return item;
      const upc = item.unites;

      // \u2705 FIX STOCK STALE : relit le stock frais depuis products[] state
      const freshProduct  = products.find(p => p.id === item.productId);
      const freshStockUnits = freshProduct
        ? Math.round((freshProduct.stock_cartons ?? 0) * upc)
        : item.stockUnits; // fallback sur la valeur initiale si produit introuvable

      const otherUsed  = prev
        .filter(i => i.productId === item.productId && i.variantId === item.variantId && i.cartKey !== cartKey)
        .reduce((s, i) => s + getUnitsUsed(i), 0);
      const thisUnits  = item.type==='carton' ? newQty*upc : item.type==='demi' ? newQty*Math.ceil(upc/2) : newQty;
      const available  = freshStockUnits - otherUsed;

      if (otherUsed + thisUnits > freshStockUnits) {
        // \u2705 Message lisible en cx/½/un
        showAlert(
          t('cashier','stockInsuf') || 'Stock insuffisant !',
          `Disponível: ${formatAvailableUnits(available, upc)} (${Math.max(0, available)} unid.)`,
          'warning'
        );
        return item;
      }
      return { ...item, qty: newQty, subtotal: Math.round(newQty * item.price * 100) / 100 };
    }));
  };

  const removeItem = (cartKey) => setCart(prev=>prev.filter(i=>i.cartKey!==cartKey));
  const clearCart  = () => { setCart([]); setClientNom(''); setClientNif(''); };

  const total     = Math.round(cart.reduce((s,i)=>s+i.subtotal,0)*100)/100;
  const totalPaid = payMode==='dinheiro'?Number(montantDinheiro)||0:payMode==='express'?Number(montantExpress)||0:(Number(montantDinheiro)||0)+(Number(montantExpress)||0);
  totalRef.current = total; // \u2705 mise à jour ref après déclaration
  const change    = Math.max(0,Math.round((totalPaid-total)*100)/100);

  const openPayment = () => { if (cart.length===0) return; setMontantDinheiro(''); setMontantExpress(''); setPayMode('dinheiro'); setShowPayment(true); };

  const deduireStock = async (cartItems) => {
    for (const item of cartItems) {
      const unitsConsumed = item.type==='carton'?item.qty*item.unites:item.type==='demi'?item.qty*Math.ceil(item.unites/2):item.qty;
      const cartonsToRemove = unitsConsumed/item.unites;
      if (item.variantId) {
        const vBefore=(await window.electron.dbGet("SELECT stock_cartons FROM product_variants WHERE id=?",[item.variantId])).data?.stock_cartons||0;
        await window.electron.dbQuery("UPDATE product_variants SET stock_cartons=? WHERE id=?",[Math.max(0,vBefore-cartonsToRemove),item.variantId]);
        const totalV=(await window.electron.dbGet("SELECT COALESCE(SUM(stock_cartons),0) as t FROM product_variants WHERE product_id=? AND actif=1",[item.productId])).data?.t||0;
        await window.electron.dbQuery("UPDATE products SET stock_cartons=?,updated_at=datetime('now') WHERE id=?",[totalV,item.productId]);
      } else {
        const sBefore=(await window.electron.dbGet("SELECT stock_cartons FROM products WHERE id=?",[item.productId])).data?.stock_cartons||0;
        await window.electron.dbQuery("UPDATE products SET stock_cartons=?,updated_at=datetime('now') WHERE id=?",[Math.max(0,sBefore-cartonsToRemove),item.productId]);
      }
    }
  };

  const handleSale = async () => {
    if (isProcessing.current) return;
    // \u2705 Remplacé alert() natifs \u2192 showAlert React (les validations bloquantes sont déjà gérées
    //    par disabled sur le bouton Confirmar, mais on garde les guards pour robustesse)
    if (payMode==='dinheiro'&&!montantDinheiro) { showAlert('', t('cashier','informAmount'), 'warning'); return; }
    if (payMode==='express'&&!montantExpress)   { showAlert('', t('cashier','informAmountExpress'), 'warning'); return; }
    if (payMode==='misto'&&!montantDinheiro&&!montantExpress) { showAlert('', t('cashier','informAmounts'), 'warning'); return; }
    if (totalPaid<total) {
      showAlert(t('cashier','insufficientAmountTitle'), `${t('cashier','missingAmount')} ${(total-totalPaid).toLocaleString(intlLocale)} ${currency}`, 'warning');
      return;
    }
    setLoading(true); setShowPayment(false);
    try {
      const frRes = await window.electron.nextFactureNum();
      const numeroFacture = frRes.success ? frRes.numero : '';
      let clientId=null;
      const finalClientNom=clientNom.trim();
      const finalClientNif=clientNif.trim()||'CONSUMIDOR FINAL';
      if (finalClientNom) {
        const existing=clients.find(c=>c.nom.toLowerCase()===finalClientNom.toLowerCase());
        if (existing) { clientId=existing.id; }
        else { const nc=await window.electron.dbQuery("INSERT INTO clients (nom) VALUES (?)",[finalClientNom]); clientId=nc?.data?.lastInsertRowid||null; loadClients(); }
      }
      const vRes=await window.electron.dbQuery(
        "INSERT INTO ventes (user_id,client_id,client_nom,client_nif,total,montant_recu,monnaie_rendue,mode_paiement,montant_dinheiro,montant_express,facture_num) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [user.id,clientId,finalClientNom||null,finalClientNif,total,totalPaid,change,payMode,Number(montantDinheiro)||0,Number(montantExpress)||0,numeroFacture]
      );
      if (!vRes?.success || !vRes?.data) throw new Error(vRes?.error||t('cashier','saleCreateError'));
      const venteId=vRes.data.lastInsertRowid;
      for (const item of cart) {
        await window.electron.dbQuery(
          "INSERT INTO vente_items (vente_id,product_id,variant_id,type_vente,quantite,prix_unitaire,sous_total) VALUES (?,?,?,?,?,?,?)",
          [venteId,item.productId,item.variantId||null,item.type,item.qty,item.price,item.subtotal]
        );
      }
      await deduireStock(cart);
      window.electron.driveSync().catch(()=>{});
      setShowSuccess({venteId,total,cart:[...cart],cashGiven:totalPaid,change,clientNom:finalClientNom,clientNif:finalClientNif,payMode,montantDinheiro:Number(montantDinheiro)||0,montantExpress:Number(montantExpress)||0,numeroFacture});
      setCart([]); setClientNom(''); setClientNif(''); loadProducts();
    } catch(e) {
      // \u2705 Remplacé alert() natif \u2192 showAlert React
      showAlert(t('cashier','saleErrorTitle'), e.message, 'error');
    }
    setLoading(false);
  };

  const buildPrintData = (sd, items=null) => ({
    shopName, shopAddress, shopPhone, shopNif,
    clientNom: sd.clientNom, clientNif: sd.clientNif,
    numeroFacture: sd.numeroFacture||'',
    items: (items||sd.cart).map(i=>({name:i.nom||i.name,type:i.type,qty:i.qty,price:(i.price||0).toLocaleString(intlLocale),subtotal:(i.subtotal||0).toLocaleString(intlLocale)})),
    total: (sd.total||0).toLocaleString(intlLocale),
    cashGiven: (sd.cashGiven||sd.total||0).toLocaleString(intlLocale),
    change: (sd.change||0).toLocaleString(intlLocale),
    payMode: sd.payMode||'dinheiro',
    montantDinheiro: (sd.montantDinheiro||0).toLocaleString(intlLocale),
    montantExpress: (sd.montantExpress||0).toLocaleString(intlLocale),
    currency, seller: user.nom, date: new Date().toLocaleString(intlLocale),
  });

  const handlePrint = async (sd) => {
    // \u2705 isPrinting géré par le bouton appelant — pas de garde ici
    try {
      await window.electron.printTicket(buildPrintData(sd));
    } finally {
      // Délai 2s avant de permettre une nouvelle impression
      setTimeout(() => { isPrinting.current = false; }, 2000);
    }
  };

  const handleReserveA = async () => {
    if (cart.length===0) return;
    if (isProcessing.current) return;
    setLoading(true);
    try {
      const expiration = reserveExpiry==='0' ? null : new Date(Date.now()+Number(reserveExpiry)*3600000).toISOString();
      const res = await window.electron.reservationCreate({
        userId:user.id, clientNom:clientNom.trim()||null, clientNif:clientNif.trim()||'CONSUMIDOR FINAL',
        items:JSON.stringify(cart.map(i=>({productId:i.productId,variantId:i.variantId,type:i.type,qty:i.qty,price:i.price,subtotal:i.subtotal,unites:i.unites,nom:i.nom}))),
        total, type:'reserva', modeP:'dinheiro', montantD:0, montantE:0, note:reserveNote||null, expiration,
      });
      if (res.success) {
        setShowReserveModal(false); setReserveNote(''); setReserveExpiry('24');
        setCart([]); setClientNom(''); setClientNif('');
        // \u2705 Délai pour laisser React finir le re-render avant de recharger les réservations
        setTimeout(async () => {
          await loadReservations();
          await loadProducts();
        }, 100);
        showAlert(t('cashier','reserveCreated'), `${t('cashier','reserveIdLabel')}${res.id}`, 'success');
      } else {
        showAlert(t('cashier','genericErrorTitle'), res.error, 'error');
      }
    } catch(e) {
      showAlert(t('cashier','genericErrorTitle'), e.message, 'error');
    }
    setLoading(false);
  };

  const handleReserveB = async () => {
    if (cart.length===0) return;
    if (isProcessing.current) return;
    const pagoTotal = pagoPayMode==='dinheiro'?Number(pagoMontantD)||0:pagoPayMode==='express'?Number(pagoMontantE)||0:(Number(pagoMontantD)||0)+(Number(pagoMontantE)||0);
    // \u2705 Remplacé alert() natif \u2192 showAlert React
    if (pagoTotal<total) {
      showAlert(t('cashier','insufficientAmountTitle'), `${t('cashier','missingAmount')} ${(total-pagoTotal).toLocaleString(intlLocale)} ${currency}`, 'warning');
      return;
    }
    setLoading(true);
    try {
      const res = await window.electron.reservationCreate({
        userId:user.id, clientNom:clientNom.trim()||null, clientNif:clientNif.trim()||'CONSUMIDOR FINAL',
        items:JSON.stringify(cart.map(i=>({productId:i.productId,variantId:i.variantId,type:i.type,qty:i.qty,price:i.price,subtotal:i.subtotal,unites:i.unites,nom:i.nom}))),
        total, type:'pago_retirar', modeP:pagoPayMode, montantD:Number(pagoMontantD)||0, montantE:Number(pagoMontantE)||0, note:pagoNote||null, expiration:null,
      });
      if (res.success) {
        setShowPagoModal(false); setPagoNote(''); setPagoPayMode('dinheiro'); setPagoMontantD(''); setPagoMontantE('');
        setCart([]); setClientNom(''); setClientNif('');
        // \u2705 Délai pour laisser React finir le re-render avant de recharger les réservations
        setTimeout(async () => {
          await loadReservations();
          await loadProducts();
        }, 100);
        showAlert(t('cashier','paymentRegistered'), `${t('cashier','awaitingPickup')}\n${t('cashier','reserveIdLabel')}${res.id}`, 'success');
      } else {
        showAlert(t('cashier','genericErrorTitle'), res.error, 'error');
      }
    } catch(e) {
      showAlert(t('cashier','genericErrorTitle'), e.message, 'error');
    }
    setLoading(false);
  };

  const handlePayerReserva = async () => {
    if (!showPayerModal) return;
    if (isProcessing.current) return;
    const r=showPayerModal;
    const pTotal=payerMode==='dinheiro'?Number(payerMontantD)||0:payerMode==='express'?Number(payerMontantE)||0:(Number(payerMontantD)||0)+(Number(payerMontantE)||0);
    // \u2705 Remplacé alert() natif \u2192 showAlert React
    if (pTotal<r.total) {
      showAlert(t('cashier','insufficientAmountTitle'), t('cashier','insufficientAmount'), 'warning');
      return;
    }
    setLoading(true);
    try {
      const res=await window.electron.reservationPayer({id:r.id,userId:user.id,modeP:payerMode,montantD:Number(payerMontantD)||0,montantE:Number(payerMontantE)||0,clientNom:r.client_nom,clientNif:r.client_nif});
      if (res.success) {
        setShowPayerModal(null); setPayerMontantD(''); setPayerMontantE(''); setPayerMode('dinheiro');
        loadReservations(); loadProducts();
        const items=JSON.parse(r.items_json||'[]');
        await window.electron.printTicket(buildPrintData({
          clientNom:r.client_nom,clientNif:r.client_nif,numeroFacture:res.numeroFacture,
          total:res.total,cashGiven:pTotal,change:res.change,
          payMode:payerMode,montantDinheiro:Number(payerMontantD)||0,montantExpress:Number(payerMontantE)||0,
        }, items));
      } else {
        // \u2705 Remplacé alert() natif \u2192 showAlert React
        showAlert(t('cashier','genericErrorTitle'), res.error, 'error');
      }
    } catch(e) {
      showAlert(t('cashier','genericErrorTitle'), e.message, 'error');
    }
    setLoading(false);
  };

  const handleEntregar = async (r) => {
    // \u2705 Remplacé window.confirm() natif \u2192 showConfirm React (async/await)
    const ok = await showConfirm(
      t('cashier','confirmDelivery'),
      `${t('cashier','confirmDelivery')} ${r.client_nom || t('cashier','clientLabel')} ?`,
      'info'
    );
    if (!ok) return;
    setLoading(true);
    try {
      const res=await window.electron.reservationEntregar({id:r.id});
      if (res.success) {
        loadReservations();
        const items=JSON.parse(r.items_json||'[]');
        await window.electron.printTicket(buildPrintData({
          clientNom:r.client_nom,clientNif:r.client_nif,numeroFacture:res.numeroFacture,
          total:r.total,cashGiven:r.total,change:0,
          payMode:r.mode_paiement,montantDinheiro:r.montant_dinheiro||0,montantExpress:r.montant_express||0,
        }, items));
      } else {
        showAlert(t('cashier','genericErrorTitle'), res.error, 'error');
      }
    } catch(e) {
      showAlert(t('cashier','genericErrorTitle'), e.message, 'error');
    }
    setLoading(false);
  };

  const handleAnular = async (r) => {
    // \u2705 Remplacé window.confirm() natif \u2192 showConfirm React (async/await)
    const msg = r.type==='pago_retirar'
      ? t('cashier','cancelReserveMsgFull').replace('{name}', r.client_nom||t('cashier','defaultClientName'))
      : t('cashier','cancelReserveMsgShort').replace('{name}', r.client_nom||t('cashier','defaultClientName'));
    const ok = await showConfirm(t('cashier','confirmTitle'), msg, 'warning');
    if (!ok) return;
    setLoading(true);
    try {
      const res=await window.electron.reservationAnular({id:r.id});
      if (res.success) { loadReservations(); loadProducts(); }
      else { showAlert(t('cashier','genericErrorTitle'), res.error, 'error'); }
    } catch(e) {
      showAlert(t('cashier','genericErrorTitle'), e.message, 'error');
    }
    setLoading(false);
  };

  const getTimerDisplay = (r) => {
    if (!r.expiration) return null;
    const diff=new Date(r.expiration)-new Date();
    if (diff<=0) return {text:t('cashier','expired'),urgent:true};
    const h=Math.floor(diff/3600000); const m=Math.floor((diff%3600000)/60000);
    if (h<1) return {text:`Expira em ${m} min`,urgent:true};
    if (h<3) return {text:`Expira em ${h}h${m>0?` ${m}min`:''}`,urgent:true};
    return {text:`Expira em ${h}h`,urgent:false};
  };

  const typeColor = {carton:'var(--accent)',demi:'var(--info)',unite:'var(--success)'};
  const filteredClients  = clients.filter(c=>c.nom.toLowerCase().includes(clientNom.toLowerCase()));
  const filteredEmpresas = empresas.filter(e=>e.nom.toLowerCase().includes(clientNom.toLowerCase())||e.nif.includes(clientNom));
  const payModes = [{key:'dinheiro',label:'\u{1F4B5} Numerário'},{key:'express',label:'\u{1F4F1} App Express'},{key:'misto',label:'\u{1F500} Misto'}];
  const pendingCount = reservations.filter(r=>r.statut==='pendente').length;

  return (
    <div style={{display:'flex',height:'100%',overflow:'hidden'}}>

      {/* PRODUCTS */}
      <div style={{flex:1,display:'flex',flexDirection:'column',borderRight:'1px solid var(--border)',overflow:'hidden'}}>
        <div style={{padding:16,borderBottom:'1px solid var(--border)',display:'flex',gap:10,alignItems:'center'}}>
          <div style={{position:'relative',flex:1}}>
            <Search size={16} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
            <input type="text" className="form-input" placeholder={t('cashier','search')} value={search} onChange={e=>setSearch(e.target.value)} style={{paddingLeft:36}}/>
          </div>
          {/* {'\u2705'} v1.2.3 — Feedback scanner code-barres */}
          {scanFeedback && (
            <div style={{
              position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
              background: scanFeedback.type === 'success' ? 'var(--success)' : 'var(--danger)',
              color:'#fff', padding:'10px 20px', borderRadius:8, fontWeight:700, fontSize:14,
              zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,0.3)',
              animation:'slideUp 0.2s ease'
            }}>
              {scanFeedback.msg}
            </div>
          )}
          <button onClick={()=>setShowReservations(!showReservations)}
            style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:8,border:`2px solid ${showReservations?'var(--accent)':'var(--border)'}`,background:showReservations?'var(--accent-dim)':'transparent',color:showReservations?'var(--accent)':'var(--text-secondary)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,position:'relative',flexShrink:0,whiteSpace:'nowrap'}}>
            <Clock size={15}/>{t('cashier','reserves')}
            {pendingCount>0&&<span style={{position:'absolute',top:-6,right:-6,background:'var(--danger)',color:'white',borderRadius:'50%',width:17,height:17,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700}}>{pendingCount}</span>}
          </button>
        </div>

        {showReservations ? (
          <div style={{flex:1,overflowY:'auto',padding:16,display:'flex',flexDirection:'column',gap:10}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{t('cashier','activeReserves')} ({pendingCount})</div>
            {reservations.filter(r=>r.statut==='pendente').length===0 ? (
              <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-muted)',fontSize:13}}>
                <Clock size={28} style={{opacity:0.3,marginBottom:8,display:'block',margin:'0 auto 8px'}}/><br/>{t('cashier','noReserveActive')}
              </div>
            ) : reservations.filter(r=>r.statut==='pendente').map(r=>{
              const timer=getTimerDisplay(r);
              const items=JSON.parse(r.items_json||'[]');
              const isB=r.type==='pago_retirar';
              return (
                <div key={r.id} style={{background:isB?'rgba(160,224,64,0.05)':'rgba(74,158,255,0.05)',border:`1px solid ${timer?.urgent?'var(--danger)':isB?'rgba(160,224,64,0.3)':'rgba(74,158,255,0.3)'}`,borderRadius:10,padding:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                    <span style={{fontWeight:700,fontSize:13}}>{'\u{1F464}'} {r.client_nom||t('cashier','noNameLabel')}</span>
                    <span style={{fontFamily:'monospace',fontWeight:800,color:isB?'#a0e040':'var(--accent)',fontSize:13}}>{r.total.toLocaleString(intlLocale)} {currency}</span>
                  </div>
                  <span style={{display:'inline-block',padding:'2px 8px',borderRadius:8,fontSize:10,fontWeight:700,background:isB?'rgba(160,224,64,0.15)':'rgba(74,158,255,0.15)',color:isB?'#a0e040':'#4a9eff',marginBottom:6}}>
                    {isB?'\u2705 PAGO — AGUARDA RETIRADA':'\u{1F4CB} RESERVA SEM PAGAMENTO'}
                  </span>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>
                    {new Date(r.created_at).toLocaleString(intlLocale)}{r.note&&` · \u{1F4DD} ${r.note}`}
                  </div>
                  <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:6}}>
                    {items.map(i=>`${i.nom} ×${i.qty}${i.type==='carton'?'cx':i.type==='demi'?'½':'un'}`).join(' · ')}
                  </div>
                  {timer&&<div style={{fontSize:11,fontWeight:700,color:timer.urgent?'var(--danger)':'#4a9eff',marginBottom:8}}>{timer.urgent?'\u26A0\uFE0F':'\u23F3'} {timer.text}</div>}
                  {isB&&<div style={{fontSize:11,fontWeight:700,color:'#a0e040',marginBottom:8}}>{t('cashier','pago')} · {t('cashier','stockDeducted')}</div>}
                  <div style={{display:'flex',gap:6}}>
                    {isB ? (
                      <button onClick={()=>handleEntregar(r)} style={{flex:1,padding:'7px 6px',borderRadius:8,border:'none',cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit',background:'#a0e040',color:'#000',display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                        <Package size={12}/> Entregue
                      </button>
                    ) : (
                      <button onClick={()=>{setShowPayerModal(r);setPayerMode('dinheiro');setPayerMontantD('');setPayerMontantE('');}} style={{flex:1,padding:'7px 6px',borderRadius:8,border:'none',cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit',background:'var(--accent)',color:'#000',display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                        <CreditCard size={12}/> Pagar
                      </button>
                    )}
                    <button onClick={()=>handleAnular(r)} style={{flex:1,padding:'7px 6px',borderRadius:8,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit',background:'transparent',color:'var(--danger)',border:'1px solid var(--danger)',display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                      <X size={12}/> Anular
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div ref={gridRef} style={{flex:1,overflowY:'auto',padding:16,display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:12,alignContent:'start'}}>
            {filtered.map((product, idx)=>{
              const upc=getUnitsPerCarton(product);
              const stockUnits=getStockInUnits(product);
              const usedUnits=cart.filter(i=>i.productId===product.id).reduce((s,i)=>s+getUnitsUsed(i),0);
              const availUnits=stockUnits-usedUnits;
              const displayCx=Math.floor(availUnits/upc); const remU=availUnits%upc;
              const displayDemi=Math.floor(remU/Math.ceil(upc/2)); const displayUn=remU%Math.ceil(upc/2);
              let stockDisplay='';
              if(displayCx>0) stockDisplay+=`${displayCx}cx`;
              if(displayDemi>0) stockDisplay+=` ${displayDemi}½`;
              if(displayUn>0) stockDisplay+=` ${displayUn}un`;
              if(!stockDisplay) stockDisplay=`${availUnits}un`;
              return (
                <div key={product.id}
                                    className="card product-grid-card"
                  style={{
                    padding:16, display:'flex', flexDirection:'column', gap:10,
                    outline: 'none',
                    transition: 'outline 0.1s, box-shadow 0.1s, transform 0.1s',
                    border: availUnits<=0?'1px solid rgba(239,68,68,0.4)':undefined,
                  }}>
                  <div>
                    <div style={{fontWeight:600,fontSize:14,marginBottom:2,display:'flex',alignItems:'center',gap:6}}>
                      {product.nom}{product.has_variants&&<Layers size={12} color="var(--accent)"/>}
                    </div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>{product.categorie}</div>
                    <div style={{fontSize:11,color:availUnits<=0?'var(--danger)':availUnits<=upc?'var(--warning)':'var(--text-muted)',marginTop:4,display:'flex',alignItems:'center',gap:4}}>
                      {availUnits<=0&&<span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:'var(--danger)',flexShrink:0}}/>}
                      Stock: {stockDisplay}
                      {availUnits<=0&&<span style={{fontSize:9,fontWeight:700,color:'var(--danger)',background:'rgba(239,68,68,0.12)',borderRadius:4,padding:'1px 5px',border:'1px solid rgba(239,68,68,0.3)'}}>RUPTURA</span>}
                    </div>
                  </div>
                  {['carton','demi','unite'].map((type, tIdx)=>{
                    const typeUnits=type==='carton'?upc:type==='demi'?Math.ceil(upc/2):1;
                    const canAdd=availUnits>=typeUnits;
                    return (
                      <button key={type} onClick={()=>canAdd&&handleTypeClick(product,type)}
                        style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px',borderRadius:8,
                          border: '1px solid var(--border)',
                          background: canAdd?'var(--bg-hover)':'rgba(0,0,0,0.2)',
                          cursor:canAdd?'pointer':'not-allowed',
                          color: canAdd?'var(--text-primary)':'var(--text-muted)',
                          fontSize:12,fontFamily:'inherit',transition:'all 0.15s ease',opacity:canAdd?1:0.5}}
                        onMouseEnter={e=>canAdd&&(e.currentTarget.style.borderColor=typeColor[type],e.currentTarget.style.color=typeColor[type])}
                        onMouseLeave={e=>canAdd&&(e.currentTarget.style.borderColor='var(--border)',e.currentTarget.style.color='var(--text-primary)')}>
                        <span>{type==='carton'?t('cashier','typeBox'):type==='demi'?t('cashier','typeHalf'):t('cashier','typeUnit')}</span>
                        <span style={{fontFamily:'JetBrains Mono,monospace',fontWeight:600}}>{getPrice(product,type).toLocaleString(intlLocale)} {currency}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {filtered.length===0&&<div style={{gridColumn:'1/-1',textAlign:'center',padding:'60px 0',color:'var(--text-muted)'}}>{t('cashier','noProduct')}</div>}
          </div>
        )}
      </div>

      {/* CART */}
      <div style={{width:360,display:'flex',flexDirection:'column',background:'var(--bg-secondary)',overflow:'hidden'}}>
        <div style={{padding:'16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,fontWeight:700}}>
            <ShoppingCart size={18} color="var(--accent)"/>{t('cashier','cart')} ({cart.length})
          </div>
          {cart.length>0&&<button onClick={clearCart} style={{background:'none',border:'none',color:'var(--danger)',cursor:'pointer',display:'flex',alignItems:'center',gap:4,fontSize:12,fontFamily:'inherit'}}><Trash2 size={14}/> Limpar</button>}
        </div>

        {/* Client + NIF + Empresas */}
        <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',position:'relative',display:'flex',flexDirection:'column',gap:8}}>
          <div style={{position:'relative'}}>
            <User size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
            <input type="text" className="form-input" placeholder={t('cashier','clientOptional')} value={clientNom}
              onChange={e=>{setClientNom(e.target.value);setShowClientList(true);setShowEmpresaList(true);}}
              onFocus={()=>{setShowClientList(true);setShowEmpresaList(true);}}
              onBlur={()=>setTimeout(()=>{setShowClientList(false);setShowEmpresaList(false);},200)}
              style={{paddingLeft:32,fontSize:13}}/>
          </div>
          <input type="text" className="form-input" placeholder={t('cashier','nifPlaceholder')} value={clientNif}
            onChange={e=>setClientNif(e.target.value)}
            style={{fontSize:12,fontFamily:'monospace',borderColor:clientNif&&clientNif!=='CONSUMIDOR FINAL'?'var(--accent)':'var(--border)'}}/>

          {/* Dropdown clients */}
          {showClientList&&filteredClients.length>0&&clientNom&&(
            <div style={{position:'absolute',zIndex:200,background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,left:16,right:16,top:54,maxHeight:100,overflowY:'auto',boxShadow:'var(--shadow)'}}>
              {filteredClients.map(c=>(
                <div key={c.id} onMouseDown={()=>{setClientNom(c.nom);setShowClientList(false);}}
                  style={{padding:'7px 12px',cursor:'pointer',fontSize:12,borderBottom:'1px solid var(--border)'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  {'\u{1F464}'} {c.nom}
                </div>
              ))}
            </div>
          )}

          {/* Dropdown empresas */}
          {showEmpresaList&&filteredEmpresas.length>0&&(
            <div style={{position:'absolute',zIndex:200,background:'var(--bg-card)',border:'1px solid rgba(240,192,64,0.4)',borderRadius:8,left:16,right:16,top:clientNom?102:54,maxHeight:130,overflowY:'auto',boxShadow:'var(--shadow)'}}>
              <div style={{padding:'4px 12px',fontSize:10,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',borderBottom:'1px solid var(--border)'}}>{'\u{1F3E2}'} Empresas</div>
              {filteredEmpresas.map(e=>(
                <div key={e.id} onMouseDown={()=>{setClientNom(e.nom);setClientNif(e.nif);setShowEmpresaList(false);setShowClientList(false);}}
                  style={{padding:'7px 12px',cursor:'pointer',fontSize:12,borderBottom:'1px solid var(--border)'}}
                  onMouseEnter={ev=>ev.currentTarget.style.background='var(--bg-hover)'}
                  onMouseLeave={ev=>ev.currentTarget.style.background='transparent'}>
                  <div style={{fontWeight:600}}>{e.nom}</div>
                  <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'monospace'}}>NIF: {e.nif}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Items */}
        <div style={{flex:1,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:8}}>
          {cart.length===0?(
            <div style={{textAlign:'center',padding:'60px 0',color:'var(--text-muted)',fontSize:13}}>
              <ShoppingCart size={32} style={{opacity:0.3,marginBottom:8,display:'block',margin:'0 auto 8px'}}/><br/>{t('cashier','emptyCartMsg')}
            </div>
          ):cart.map((item, cIdx)=>(
            <div key={item.cartKey} style={{
              background:'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius:10, padding:12,

              transition:'border 0.1s, box-shadow 0.1s',
            }}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600}}>{item.nom}</div>
                  <div style={{fontSize:11,color:typeColor[item.type]}}>
                    {item.type==='carton'?t('cashier','typeBox'):item.type==='demi'?t('cashier','typeHalf'):t('cashier','typeUnit')}
                  </div>
                </div>
                <button onClick={()=>removeItem(item.cartKey)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--danger)',padding:2}}><X size={14}/></button>
              </div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <button onClick={()=>updateQty(item.cartKey,-1)} style={{width:26,height:26,borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-hover)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Minus size={12}/></button>
                  <input type="number" value={item.qty} onChange={e=>setQtyManual(item.cartKey,e.target.value)}
                    style={{width:52,textAlign:'center',background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:6,padding:'3px 6px',color:'var(--text-primary)',fontFamily:'monospace',fontWeight:700,fontSize:13}} min="1" step="1"/>
                  <button onClick={()=>updateQty(item.cartKey,1)} style={{width:26,height:26,borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-hover)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Plus size={12}/></button>
                </div>
                <div style={{fontFamily:'JetBrains Mono,monospace',fontWeight:700,color:'var(--accent)',fontSize:14}}>{item.subtotal.toLocaleString(intlLocale)} {currency}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Checkout */}
        <div style={{padding:16,borderTop:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:10}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:20,fontWeight:800}}>
            <span>TOTAL</span>
            <span style={{color:'var(--accent)',fontFamily:'JetBrains Mono,monospace'}}>{total.toLocaleString(intlLocale)} {currency}</span>
          </div>
          <button id="ckb-btn-imprimir" onClick={openPayment} disabled={cart.length===0||loading} className="btn btn-success"
            style={{justifyContent:'center',padding:'11px',}}>
            <CreditCard size={16}/> {loading?t('cashier','processing'):t('cashier','printNow')}
          </button>
          <button id="ckb-btn-reservar" onClick={()=>{if(cart.length===0)return;setShowReserveModal(true);}} disabled={cart.length===0||loading}
            style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'10px',borderRadius:10,
              border: '2px solid #4a9eff',
              background:'rgba(74,158,255,0.08)',color:'#4a9eff',cursor:cart.length===0?'not-allowed':'pointer',
              fontFamily:'inherit',fontSize:13,fontWeight:700,opacity:cart.length===0?0.5:1,
}}>
            <Clock size={15}/> {t('cashier','reserveWithoutPay')}
          </button>
          <button id="ckb-btn-pago" onClick={()=>{if(cart.length===0)return;setShowPagoModal(true);setPagoPayMode('dinheiro');setPagoMontantD('');setPagoMontantE('');}} disabled={cart.length===0||loading}
            style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'10px',borderRadius:10,
              border: '2px solid #a0e040',
              background:'rgba(160,224,64,0.08)',color:'#a0e040',cursor:cart.length===0?'not-allowed':'pointer',
              fontFamily:'inherit',fontSize:13,fontWeight:700,opacity:cart.length===0?0.5:1,
}}>
            <CheckCircle size={15}/> {t('cashier','paidPickupLater')}
          </button>
        </div>
      </div>

      {/* VARIANT POPUP */}
      {showVariantPopup&&selectedProduct&&(
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth:420}}>
            <div className="modal-header">
              <h2 className="modal-title">{selectedProduct.nom} — {selectedType==='carton'?t('cashier','typeBox'):selectedType==='demi'?t('cashier','typeHalf'):t('cashier','typeUnit')}</h2>
              <button onClick={()=>setShowVariantPopup(false)} className="btn btn-icon btn-secondary"><X size={16}/></button>
            </div>
            <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:16}}>{t('cashier','chooseVariant')}</p>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {variants.map(v=>{
                const price     = getPrice(selectedProduct, selectedType, v);
                const upc       = getUnitsPerCarton(selectedProduct);
                const typeUnits = selectedType==='carton' ? upc : selectedType==='demi' ? Math.ceil(upc/2) : 1;
                // \u2705 FIX : v.stock_cartons est frais (rechargé depuis BDD dans handleTypeClick)
                const stockUnits = Math.round((v.stock_cartons ?? 0) * upc);
                const usedUnits  = cart
                  .filter(i => i.productId===selectedProduct.id && i.variantId===v.id)
                  .reduce((s,i) => s+getUnitsUsed(i), 0);
                const available = stockUnits - usedUnits;
                const canAdd    = available >= typeUnits;
                // Affichage lisible du stock disponible
                const stockLabel = formatAvailableUnits(available, upc);
                return (
                  <button key={v.id} onClick={()=>canAdd&&handleVariantSelect(v)}
                    style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',borderRadius:10,
                      border:`2px solid ${canAdd?'var(--border)':'rgba(239,68,68,0.3)'}`,
                      background:canAdd?'var(--bg-hover)':'rgba(239,68,68,0.05)',
                      cursor:canAdd?'pointer':'not-allowed',opacity:canAdd?1:0.5,transition:'all 0.15s ease'}}
                    onMouseEnter={e=>canAdd&&(e.currentTarget.style.borderColor='var(--accent)',e.currentTarget.style.background='var(--accent-dim)')}
                    onMouseLeave={e=>canAdd&&(e.currentTarget.style.borderColor='var(--border)',e.currentTarget.style.background='var(--bg-hover)')}>
                    <div>
                      <div style={{fontWeight:700,fontSize:15}}>{v.nom}</div>
                      <div style={{fontSize:11,color:canAdd?'var(--text-muted)':'var(--danger)',marginTop:2}}>
                        {/* {'\u2705'} Affiche stock réel frais — plus de valeur fantôme */}
                        Stock: {canAdd ? stockLabel : '0 — indisponível'}
                      </div>
                    </div>
                    <div style={{fontFamily:'JetBrains Mono,monospace',fontWeight:800,color:canAdd?'var(--accent)':'var(--text-muted)',fontSize:16}}>
                      {price.toLocaleString(intlLocale)} {currency}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {showPayment&&(
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth:420}}>
            <div className="modal-header">
              <h2 className="modal-title">{t('cashier','paymentTitle')}</h2>
              <button onClick={()=>setShowPayment(false)} className="btn btn-icon btn-secondary"><X size={16}/></button>
            </div>
            <div style={{marginBottom:16,padding:'12px 16px',background:'var(--bg-hover)',borderRadius:10,display:'flex',justifyContent:'space-between'}}>
              <span style={{fontWeight:700}}>{t('cashier','totalToPay')}</span>
              <span style={{fontFamily:'monospace',fontWeight:800,color:'var(--accent)',fontSize:18}}>{total.toLocaleString(intlLocale)} {currency}</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16}}>
              {payModes.map(m=>(
                <button key={m.key} onClick={()=>{setPayMode(m.key);setMontantDinheiro('');setMontantExpress('');}}
                  style={{padding:'10px 6px',borderRadius:10,
                    border:`2px solid ${payMode===m.key?'var(--accent)':'var(--border)'}`,
                    background:payMode===m.key?'var(--accent-dim)':'var(--bg-hover)',
                    cursor:'pointer',color:payMode===m.key?'var(--accent)':'var(--text-secondary)',
                    fontFamily:'inherit',fontSize:12,fontWeight:payMode===m.key?700:400,textAlign:'center',
                    outlineOffset:2}}>
                  {m.label}
                </button>
              ))}
            </div>
            {(payMode==='dinheiro'||payMode==='misto')&&(
              <div className="form-group" style={{marginBottom:12}}>
                <label className="form-label">{'\u{1F4B5}'} Valor em Dinheiro ({currency})</label>
                <input type="number" className="form-input" value={montantDinheiro} onChange={e=>setMontantDinheiro(e.target.value)} placeholder="0" style={{fontSize:16,fontFamily:'JetBrains Mono,monospace'}} autoFocus/>
                {payMode==='dinheiro'&&<button type="button" onClick={()=>{setMontantDinheiro(String(total));}} style={{marginTop:6,width:'100%',padding:'8px',borderRadius:8,border:'1px solid var(--success)',background:'rgba(34,197,94,0.08)',color:'var(--success)',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit',letterSpacing:.3}}>{'\u2713'} Exato — {total.toLocaleString(intlLocale)} {currency}</button>}
              </div>
            )}
            {(payMode==='express'||payMode==='misto')&&(
              <div className="form-group" style={{marginBottom:12}}>
                <label className="form-label">{'\u{1F4F1}'} Valor via App Express ({currency})</label>
                <input type="number" className="form-input" value={montantExpress} onChange={e=>setMontantExpress(e.target.value)} placeholder="0" style={{fontSize:16,fontFamily:'JetBrains Mono,monospace'}}/>
                {payMode==='express'&&<button type="button" onClick={()=>{setMontantExpress(String(total));}} style={{marginTop:6,width:'100%',padding:'8px',borderRadius:8,border:'1px solid var(--success)',background:'rgba(34,197,94,0.08)',color:'var(--success)',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit',letterSpacing:.3}}>{'\u2713'} Exato — {total.toLocaleString(intlLocale)} {currency}</button>}
              </div>
            )}
            {totalPaid>0&&(
              <div style={{background:totalPaid>=total?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',border:`1px solid ${totalPaid>=total?'rgba(34,197,94,0.3)':'rgba(239,68,68,0.3)'}`,borderRadius:10,padding:'12px 16px',marginBottom:16}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:4}}>
                  <span>{t('cashier','totalReceived')}</span>
                  <span style={{fontFamily:'monospace',fontWeight:700}}>{totalPaid.toLocaleString(intlLocale)} {currency}</span>
                </div>
                {totalPaid>=total?(
                  <div style={{display:'flex',justifyContent:'space-between',fontWeight:700}}>
                    <span>{t('cashier','changeLabel')}</span><span style={{color:'var(--success)',fontFamily:'monospace'}}>{change.toLocaleString(intlLocale)} {currency}</span>
                  </div>
                ):(
                  <div style={{display:'flex',justifyContent:'space-between',fontWeight:700}}>
                    <span>{t('cashier','missingLabel')}</span><span style={{color:'var(--danger)',fontFamily:'monospace'}}>{(total-totalPaid).toLocaleString(intlLocale)} {currency}</span>
                  </div>
                )}
              </div>
            )}
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setShowPayment(false)} className="btn btn-secondary"
                style={{flex:1,justifyContent:'center',
}}>
                Cancelar
              </button>
              <button id="ckb-btn-confirmar-venda" onClick={handleSale}
                disabled={loading||totalPaid<total||(payMode==='dinheiro'&&!montantDinheiro)||(payMode==='express'&&!montantExpress)}
                className="btn btn-success"
                style={{flex:2,justifyContent:'center',padding:'12px',
}}>
                <CreditCard size={16}/> Confirmar Venda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RESERVA TYPE A */}
      {showReserveModal&&(
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth:420}}>
            <div className="modal-header">
              <h2 className="modal-title">{t('cashier','reserveTitle')}</h2>
              <button onClick={()=>setShowReserveModal(false)} className="btn btn-icon btn-secondary"><X size={16}/></button>
            </div>
            <div style={{padding:'10px 14px',borderRadius:8,background:'rgba(74,158,255,0.08)',border:'1px solid rgba(74,158,255,0.3)',fontSize:12,color:'#4a9eff',marginBottom:14,lineHeight:1.8}}>
              {'\u{1F4E6}'} {cart.length} artigo(s) · <strong>{total.toLocaleString(intlLocale)} {currency}</strong><br/>
              {'\u{1F512}'} Stock bloqueado · {'\u{1F4B3}'} Pagamento na retirada
            </div>
            <div className="form-group">
              <label className="form-label">{t('cashier','clientLabel')}</label>
              <input type="text" className="form-input" value={clientNom||t('cashier','noName')} readOnly style={{opacity:0.7}}/>
            </div>
            <div className="form-group">
              <label className="form-label">{t('cashier','noteOptional')}</label>
              <input type="text" className="form-input" value={reserveNote} onChange={e=>setReserveNote(e.target.value)} placeholder={t('cashier','notePlaceholder')}/>
            </div>
            <div className="form-group">
              <label className="form-label">{t('cashier','validity')}</label>
              <select className="form-input" value={reserveExpiry} onChange={e=>setReserveExpiry(e.target.value)}>
                <option value="2">2 horas</option>
                <option value="24">24 horas</option>
                <option value="48">48 horas</option>
                <option value="72">72 horas</option>
                <option value="0">{t('cashier','noLimit')}</option>
              </select>
            </div>
            <div style={{display:'flex',gap:10,marginTop:4}}>
              <button onClick={()=>setShowReserveModal(false)} className="btn btn-secondary" style={{flex:1,justifyContent:'center'}}>{t('cashier','cancelBtn')}</button>
              <button onClick={handleReserveA} disabled={loading} style={{flex:2,padding:'11px',borderRadius:10,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,background:'#4a9eff',color:'#000',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                <Clock size={15}/> {t('cashier','confirmReserve')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PAGO RETIRAR TYPE B */}
      {showPagoModal&&(
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth:420}}>
            <div className="modal-header">
              <h2 className="modal-title">{t('cashier','pagoTitle')}</h2>
              <button onClick={()=>setShowPagoModal(false)} className="btn btn-icon btn-secondary"><X size={16}/></button>
            </div>
            <div style={{padding:'10px 14px',borderRadius:8,background:'rgba(160,224,64,0.08)',border:'1px solid rgba(160,224,64,0.3)',fontSize:12,color:'#a0e040',marginBottom:14,lineHeight:1.8}}>
              {'\u{1F4E6}'} {cart.length} artigo(s) · <strong>{total.toLocaleString(intlLocale)} {currency}</strong><br/>
              {'\u{1F4C9}'} {t('cashier','stockDeducted')} · {'\u{1F3AB}'} {t('cashier','pickupTicket')}
            </div>
            <div className="form-group">
              <label className="form-label">{t('cashier','clientLabel')}</label>
              <input type="text" className="form-input" value={clientNom||t('cashier','noName')} readOnly style={{opacity:0.7}}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14}}>
              {payModes.map(m=>(
                <button key={m.key} onClick={()=>{setPagoPayMode(m.key);setPagoMontantD('');setPagoMontantE('');}}
                  style={{padding:'9px 6px',borderRadius:10,border:`2px solid ${pagoPayMode===m.key?'#a0e040':'var(--border)'}`,background:pagoPayMode===m.key?'rgba(160,224,64,0.1)':'var(--bg-hover)',cursor:'pointer',color:pagoPayMode===m.key?'#a0e040':'var(--text-secondary)',fontFamily:'inherit',fontSize:11,fontWeight:pagoPayMode===m.key?700:400,textAlign:'center'}}>
                  {m.label}
                </button>
              ))}
            </div>
            {(pagoPayMode==='dinheiro'||pagoPayMode==='misto')&&(
              <div className="form-group">
                <label className="form-label">{'\u{1F4B5}'} Valor em Dinheiro ({currency})</label>
                <input type="number" className="form-input" value={pagoMontantD} onChange={e=>setPagoMontantD(e.target.value)} placeholder="0" style={{fontFamily:'monospace'}} autoFocus/>
                {pagoPayMode==='dinheiro'&&<button type="button" onClick={()=>setPagoMontantD(String(total))} style={{marginTop:6,width:'100%',padding:'8px',borderRadius:8,border:'1px solid var(--success)',background:'rgba(34,197,94,0.08)',color:'var(--success)',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit',letterSpacing:.3}}>{'\u2713'} Exato — {total.toLocaleString(intlLocale)} {currency}</button>}
              </div>
            )}
            {(pagoPayMode==='express'||pagoPayMode==='misto')&&(
              <div className="form-group">
                <label className="form-label">{'\u{1F4F1}'} Valor via App Express ({currency})</label>
                <input type="number" className="form-input" value={pagoMontantE} onChange={e=>setPagoMontantE(e.target.value)} placeholder="0" style={{fontFamily:'monospace'}}/>
                {pagoPayMode==='express'&&<button type="button" onClick={()=>setPagoMontantE(String(total))} style={{marginTop:6,width:'100%',padding:'8px',borderRadius:8,border:'1px solid var(--success)',background:'rgba(34,197,94,0.08)',color:'var(--success)',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit',letterSpacing:.3}}>{'\u2713'} Exato — {total.toLocaleString(intlLocale)} {currency}</button>}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">{t('cashier','noteOptional')}</label>
              <input type="text" className="form-input" value={pagoNote} onChange={e=>setPagoNote(e.target.value)} placeholder={t('cashier','notePlaceholder2')}/>
            </div>
            <div style={{display:'flex',gap:10,marginTop:4}}>
              <button onClick={()=>setShowPagoModal(false)} className="btn btn-secondary" style={{flex:1,justifyContent:'center'}}>{t('cashier','cancelBtn')}</button>
              <button onClick={handleReserveB} disabled={loading} style={{flex:2,padding:'11px',borderRadius:10,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,background:'#a0e040',color:'#000',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                <CheckCircle size={15}/> Confirmar Pagamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PAYER RESERVA TYPE A */}
      {showPayerModal&&(
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth:420}}>
            <div className="modal-header">
              <h2 className="modal-title">{t('cashier','payReserveTitle')} #{showPayerModal?.id}</h2>
              <button onClick={()=>setShowPayerModal(null)} className="btn btn-icon btn-secondary"><X size={16}/></button>
            </div>
            <div style={{marginBottom:14,padding:'12px 16px',background:'var(--bg-hover)',borderRadius:10,display:'flex',justifyContent:'space-between'}}>
              <span style={{fontWeight:700}}>{t('cashier','totalToPay')}</span>
              <span style={{fontFamily:'monospace',fontWeight:800,color:'var(--accent)',fontSize:18}}>{showPayerModal.total.toLocaleString(intlLocale)} {currency}</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14}}>
              {payModes.map(m=>(
                <button key={m.key} onClick={()=>{setPayerMode(m.key);setPayerMontantD('');setPayerMontantE('');}}
                  style={{padding:'9px 6px',borderRadius:10,border:`2px solid ${payerMode===m.key?'var(--accent)':'var(--border)'}`,background:payerMode===m.key?'var(--accent-dim)':'var(--bg-hover)',cursor:'pointer',color:payerMode===m.key?'var(--accent)':'var(--text-secondary)',fontFamily:'inherit',fontSize:11,fontWeight:payerMode===m.key?700:400,textAlign:'center'}}>
                  {m.label}
                </button>
              ))}
            </div>
            {(payerMode==='dinheiro'||payerMode==='misto')&&(
              <div className="form-group" style={{marginBottom:12}}>
                <label className="form-label">{'\u{1F4B5}'} Valor em Dinheiro ({currency})</label>
                <input type="number" className="form-input" value={payerMontantD} onChange={e=>setPayerMontantD(e.target.value)} placeholder="0" style={{fontFamily:'monospace'}} autoFocus/>
                {payerMode==='dinheiro'&&<button type="button" onClick={()=>setPayerMontantD(String(showPayerModal.total))} style={{marginTop:6,width:'100%',padding:'8px',borderRadius:8,border:'1px solid var(--success)',background:'rgba(34,197,94,0.08)',color:'var(--success)',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit',letterSpacing:.3}}>{'\u2713'} Exato — {showPayerModal.total.toLocaleString(intlLocale)} {currency}</button>}
              </div>
            )}
            {(payerMode==='express'||payerMode==='misto')&&(
              <div className="form-group" style={{marginBottom:12}}>
                <label className="form-label">{'\u{1F4F1}'} Valor via App Express ({currency})</label>
                <input type="number" className="form-input" value={payerMontantE} onChange={e=>setPayerMontantE(e.target.value)} placeholder="0" style={{fontFamily:'monospace'}}/>
                {payerMode==='express'&&<button type="button" onClick={()=>setPayerMontantE(String(showPayerModal.total))} style={{marginTop:6,width:'100%',padding:'8px',borderRadius:8,border:'1px solid var(--success)',background:'rgba(34,197,94,0.08)',color:'var(--success)',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit',letterSpacing:.3}}>{'\u2713'} Exato — {showPayerModal.total.toLocaleString(intlLocale)} {currency}</button>}
              </div>
            )}
            <div style={{display:'flex',gap:10,marginTop:4}}>
              <button onClick={()=>setShowPayerModal(null)} className="btn btn-secondary" style={{flex:1,justifyContent:'center'}}>{t('cashier','cancelBtn')}</button>
              <button onClick={handlePayerReserva} disabled={loading} className="btn btn-success" style={{flex:2,justifyContent:'center',padding:'12px'}}>
                <CreditCard size={16}/> Confirmar e Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS MODAL */}
      {showSuccess&&(
        <div className="modal-overlay">
          <div className="modal" style={{textAlign:'center',maxWidth:380}}>
            <div style={{fontSize:56,marginBottom:12}}>{'\u2705'}</div>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:8,color:'var(--success)'}}>{t('cashier','saleDone')}</h2>
            {ticketFlags.showFactureNum && showSuccess.numeroFacture && (
              <p style={{color:'var(--accent)',fontSize:13,marginBottom:4,fontFamily:'monospace',fontWeight:700}}>{showSuccess.numeroFacture}</p>
            )}
            <p style={{color:'var(--text-muted)',marginBottom:4}}>{t('cashier','venda')} #{showSuccess.venteId}</p>
            {ticketFlags.showClientNom && showSuccess.clientNom && (
              <p style={{color:'var(--accent)',fontSize:13,marginBottom:4}}>{'\u{1F464}'} {showSuccess.clientNom}</p>
            )}
            <div style={{fontSize:28,fontWeight:800,color:'var(--accent)',fontFamily:'monospace',marginBottom:8}}>{showSuccess.total.toLocaleString(intlLocale)} {currency}</div>
            <div style={{background:'var(--bg-hover)',borderRadius:10,padding:'10px 16px',marginBottom:12,fontSize:13}}>
              {showSuccess.payMode==='dinheiro'&&<div>{'\u{1F4B5}'} Numerário: {showSuccess.montantDinheiro.toLocaleString(intlLocale)} {currency}</div>}
              {showSuccess.payMode==='express'&&<div>{'\u{1F4F1}'} Express: {showSuccess.montantExpress.toLocaleString(intlLocale)} {currency}</div>}
              {showSuccess.payMode==='misto'&&<><div>{'\u{1F4B5}'} Numerário: {showSuccess.montantDinheiro.toLocaleString(intlLocale)} {currency}</div><div>{'\u{1F4F1}'} Express: {showSuccess.montantExpress.toLocaleString(intlLocale)} {currency}</div></>}
              {showSuccess.change>0&&<div style={{color:'var(--success)',fontWeight:600,marginTop:4}}>{t('cashier','changePrefix')} {showSuccess.change.toLocaleString(intlLocale)} {currency}</div>}
            </div>
            {ticketFlags.showSeller && (
              <p style={{fontSize:11,color:'var(--text-muted)',marginBottom:8}}>{t('cashier','sellerPrefix')} {user.nom}</p>
            )}
            {ticketFlags.showObrigado && (
              <p style={{fontSize:12,color:'var(--text-muted)',marginBottom:12,fontStyle:'italic'}}>{t('cashier','thanksMsg')}</p>
            )}
            <div style={{display:'flex',gap:10}}>
              <button
                id="ckb-btn-success-imprimir"
                onClick={async () => {
                  if (isPrinting.current) return;
                  isPrinting.current = true;
                  setPrintingBtn(true);
                  try {
                    await handlePrint(showSuccess);
                    setShowSuccess(null);
                  } catch(e) {
                    console.error('[Imprimir]', e);
                  } finally {
                    isPrinting.current = false;
                    setPrintingBtn(false);
                  }
                }}
                disabled={printingBtn}
                className="btn btn-secondary"
                style={{flex:1,justifyContent:'center',opacity:printingBtn?0.6:1,cursor:printingBtn?'not-allowed':'pointer',
}}
              >
                {printingBtn
                  ? <><span style={{fontSize:13}}>{'\u{1F6AB}'}</span> Imprimindo...</>
                  : <><Printer size={16}/> Imprimir</>
                }
              </button>
              <button
                id="ckb-btn-success-nova"
                onClick={()=>setShowSuccess(null)}
                className="btn btn-primary"
                style={{flex:1,justifyContent:'center',
}}>
                Nova venda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* {'\u2705'} MODALS REACT PURS — zéro dialog natif Electron, zéro focus trap */}
      {AlertModalComponent}
      {ConfirmModalComponent}
    </div>
  );
}
