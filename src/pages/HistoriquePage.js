import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../App';
import { useLang } from '../utils/useLang';
import { Search, ChevronDown, ChevronUp, Printer, Edit2, X, RotateCcw, Calendar, User, Filter, Clock, Trash2, CheckSquare, Square } from 'lucide-react';
import { useAlert, useConfirm } from '../components/AlertModal'; // ✅ AJOUT

export default function HistoriquePage() {
  const { user } = useAuth();
  const { currency, t } = useLang();
  const isAdmin = user?.role === 'admin';
  const canEdit = isAdmin || user?.peut_modifier_factures;

  // ✅ Hooks modals React (remplacent alert() et confirm() natifs)
  const { showAlert, AlertModalComponent } = useAlert();
  const { showConfirm, ConfirmModalComponent } = useConfirm();

  const [ventes, setVentes] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [items, setItems] = useState({});
  const [search, setSearch] = useState('');
  const [shopName, setShopName] = useState('CKBPOS');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone]   = useState('');
  const [shopNif, setShopNif]       = useState('');
  const [editVente, setEditVente] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [filterUser, setFilterUser] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [users, setUsers] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [tab, setTab] = useState('ventes');
  const [modifications, setModifications] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [produtoStats, setProdutoStats] = useState([]);
  const [produtoSort, setProdutoSort] = useState('total');


  // ✅ v1.2.7 — Infinite scroll par jour
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [currentDay, setCurrentDay] = useState(() => todayStr());
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterActive, setFilterActive] = useState(false);
  const loaderRef = useRef(null);
  const currentDayRef = useRef(todayStr());
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);

  useEffect(() => { loadVentesDay(todayStr(), true); loadSettings(); loadModifications(); loadProdutos(); if(isAdmin) loadUsers(); }, []);

  // ✅ v1.2.7 — Quand filtres changent : mode filtre ou retour mode jour
  useEffect(() => {
    if (tab === 'produtos')      { loadProdutos(); return; }
    if (tab === 'modifications') { loadModifications(); return; }
    const hasFilter = filterDateFrom || filterDateTo || (filterUser !== 'all');
    if (hasFilter) {
      setFilterActive(true);
      loadVentesFiltered();
    } else {
      // Retour mode jour : reset depuis aujourd'hui
      setFilterActive(false);
      const today = new Date().toISOString().slice(0, 10);
      currentDayRef.current = today;
      hasMoreRef.current = true;
      setCurrentDay(today);
      setHasMore(true);
      loadVentesDay(today, true);
    }
  }, [tab, filterDateFrom, filterDateTo, filterUser]); // eslint-disable-line

  const loadSettings = async () => {
    const res = await window.electron.dbGet("SELECT value FROM settings WHERE key='shop_name'");
    if (res.data) setShopName(res.data.value);
    const addr = await window.electron.dbGet("SELECT value FROM settings WHERE key='shop_address'");
    if (addr.data) setShopAddress(addr.data.value);
    const phone = await window.electron.dbGet("SELECT value FROM settings WHERE key='shop_phone'");
    if (phone.data) setShopPhone(phone.data.value);
    const nif = await window.electron.dbGet("SELECT value FROM settings WHERE key='shop_nif'");
    if (nif.data) setShopNif(nif.data.value);
  };

  const loadUsers = async () => {
    const res = await window.electron.dbQuery("SELECT id, nom FROM users ORDER BY nom", []);
    setUsers(res.data || []);
  };

  // ✅ v1.2.7 — Charge les ventes d'un jour précis
  const loadVentesDay = async (day, reset = false) => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const where = !isAdmin ? `AND v.user_id=${user.id}` : '';
      const res = await window.electron.dbQuery(
        `SELECT v.*, u.nom as vendeur FROM ventes v JOIN users u ON v.user_id=u.id
         WHERE date(v.date_vente) = ? ${where}
         ORDER BY v.date_vente DESC`, [day]
      );
      const rows = res.data || [];
      if (reset) {
        setVentes(rows);
        setSelected(new Set());
      } else {
        setVentes(prev => [...prev, ...rows]);
      }
      // Chercher le jour précédent qui a des ventes
      const prevRes = await window.electron.dbGet(
        `SELECT date(date_vente) as d FROM ventes
         WHERE date(date_vente) < '?' ${!isAdmin ? `AND user_id=${user.id}` : ''}
         ORDER BY date_vente DESC LIMIT 1`.replace("'?'", "?"), [day]
      );
      const prevDay = prevRes.data?.d || null;
      hasMoreRef.current = !!prevDay;
      setHasMore(!!prevDay);
      if (prevDay) {
        currentDayRef.current = prevDay;
        setCurrentDay(prevDay);
      }
    } catch(e) { console.error(e); }
    loadingMoreRef.current = false;
    setLoadingMore(false);
  };

  // ✅ v1.2.7 — Charge toute une période (mode filtre actif)
  const loadVentesFiltered = async () => {
    const where = !isAdmin ? `AND v.user_id=${user.id}` : '';
    const params = [];
    let dateFilter = '';
    if (filterDateFrom) { dateFilter += ' AND v.date_vente >= ?'; params.push(filterDateFrom); }
    if (filterDateTo)   { dateFilter += ' AND v.date_vente <= ?'; params.push(filterDateTo + 'T23:59:59'); }
    if (filterUser !== 'all') { dateFilter += ' AND v.user_id = ?'; params.push(Number(filterUser)); }
    const res = await window.electron.dbQuery(
      `SELECT v.*, u.nom as vendeur FROM ventes v JOIN users u ON v.user_id=u.id
       WHERE 1=1 ${where} ${dateFilter}
       ORDER BY v.date_vente DESC LIMIT 1000`, params
    );
    setVentes(res.data || []);
    setSelected(new Set());
    setHasMore(false);
    hasMoreRef.current = false;
  };

  // ✅ v1.2.7 — IntersectionObserver : détecte quand on arrive en bas
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !loadingMoreRef.current && !filterActive) {
          loadVentesDay(currentDayRef.current, false);
        }
      },
      { threshold: 0.1 }
    );
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [filterActive]); // eslint-disable-line

  const loadProdutos = async () => {
    let sql = `
      SELECT p.id as product_id, p.nom, pv.nom as variant_nom, vi.type_vente,
             SUM(vi.quantite) as total_qty, SUM(vi.sous_total) as total_revenue
      FROM vente_items vi
      JOIN ventes v ON vi.vente_id = v.id
      JOIN products p ON vi.product_id = p.id
      LEFT JOIN product_variants pv ON vi.variant_id = pv.id
      WHERE vi.statut != 'retourne' AND v.statut != 'annule'
    `;
    const params = [];
    if (filterDateFrom) { sql += " AND v.date_vente >= ?"; params.push(filterDateFrom); }
    if (filterDateTo)   { sql += " AND v.date_vente <= ?"; params.push(filterDateTo + 'T23:59:59'); }
    if (filterUser !== 'all') { sql += " AND v.user_id = ?"; params.push(Number(filterUser)); }
    sql += " GROUP BY p.id, pv.id, vi.type_vente ORDER BY total_revenue DESC";
    const res = await window.electron.dbQuery(sql, params);
    const map = {};
    for (const row of (res.data || [])) {
      const key = row.product_id + '_' + (row.variant_nom || '');
      if (!map[key]) map[key] = { nom: row.nom, variant_nom: row.variant_nom, carton:0, demi:0, unite:0, total:0 };
      map[key][row.type_vente] = (map[key][row.type_vente] || 0) + row.total_qty;
      map[key].total += row.total_revenue;
    }
    setProdutoStats(Object.values(map));
  };

  // ✅ v1.3.0 — Helper reload adaptatif (filtre actif ou par jour)
  const loadVentes = () => {
    const hasFilter = filterDateFrom || filterDateTo || filterUser !== 'all';
    if (hasFilter) {
      loadVentesFiltered();
    } else {
      const today = todayStr();
      currentDayRef.current = today;
      hasMoreRef.current = true;
      setCurrentDay(today);
      setHasMore(true);
      loadVentesDay(today, true);
    }
  };

  const loadModifications = async () => {
    let sql = `SELECT hm.*, u.nom as user_nom FROM historique_modifications hm LEFT JOIN users u ON hm.user_id=u.id WHERE 1=1`;
    const params = [];
    if (filterDateFrom) { sql += ' AND hm.date_action >= ?'; params.push(filterDateFrom); }
    if (filterDateTo)   { sql += ' AND hm.date_action <= ?'; params.push(filterDateTo + 'T23:59:59'); }
    if (filterUser !== 'all') { sql += ' AND hm.user_id = ?'; params.push(Number(filterUser)); }
    sql += ' ORDER BY hm.date_action DESC LIMIT 300';
    const res = await window.electron.dbQuery(sql, params);
    setModifications(res.data || []);
  };

  const loadItems = async (venteId) => {
    if (items[venteId]) return;
    const res = await window.electron.dbQuery(
      `SELECT vi.*, p.nom, p.unites_par_carton, pv.nom as variant_nom
       FROM vente_items vi JOIN products p ON vi.product_id=p.id
       LEFT JOIN product_variants pv ON vi.variant_id=pv.id
       WHERE vi.vente_id=?`, [venteId]
    );
    setItems(prev => ({ ...prev, [venteId]: res.data || [] }));
  };

  const toggleExpand = (id) => {
    if (selectMode) return;
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id); loadItems(id);
  };

  const handleDeleteVente = async (e, v) => {
    e.stopPropagation();
    // ✅ Remplacé window.confirm() natif → showConfirm React (async/await)
    const ok = await showConfirm(t('history','deleteConfirm'), `#${v.id} ?`, 'warning');
    if (!ok) return;
    setSaving(true);
    try {
      await window.electron.dbQuery("DELETE FROM vente_items WHERE vente_id=?", [v.id]);
      await window.electron.dbQuery("DELETE FROM ventes WHERE id=?", [v.id]);
      await window.electron.dbQuery(
        "INSERT INTO historique_modifications (user_id,table_name,record_id,action,details) VALUES (?,?,?,?,?)",
        [user.id, 'ventes', v.id, 'DELETE', `Venda #${v.id} supprimée (${v.total.toLocaleString('fr-FR')} ${currency})`]
      );
      loadVentes();
    } catch(e) {
      // ✅ Remplacé alert() natif → showAlert React
      showAlert('Erro', e.message, 'error');
    }
    setSaving(false);
  };

  const toggleSelect = (e, id) => {
    if (e) e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(v => v.id)));
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    // ✅ Remplacé window.confirm() natif → showConfirm React (async/await)
    const ok = await showConfirm(
      t('history','deleteSelectedConfirm'),
      `${selected.size} ${t('history','deleteSelectedConfirm2')}`,
      'warning'
    );
    if (!ok) return;
    setSaving(true);
    try {
      for (const id of selected) {
        await window.electron.dbQuery("DELETE FROM vente_items WHERE vente_id=?", [id]);
        await window.electron.dbQuery("DELETE FROM ventes WHERE id=?", [id]);
        await window.electron.dbQuery(
          "INSERT INTO historique_modifications (user_id,table_name,record_id,action,details) VALUES (?,?,?,?,?)",
          [user.id, 'ventes', id, 'DELETE', `Venda #${id} supprimée en lot`]
        );
      }
      setSelectMode(false); setSelected(new Set()); loadVentes();
    } catch(e) {
      // ✅ Remplacé alert() natif → showAlert React
      showAlert('Erro', e.message, 'error');
    }
    setSaving(false);
  };

  const filtered = ventes.filter(v => {
    const matchSearch = String(v.id).includes(search) ||
      (v.vendeur||'').toLowerCase().includes(search.toLowerCase()) ||
      (v.client_nom||'').toLowerCase().includes(search.toLowerCase());
    const matchUser = filterUser === 'all' || String(v.user_id) === filterUser;
    const matchFrom = !filterDateFrom || v.date_vente >= filterDateFrom;
    const matchTo   = !filterDateTo   || v.date_vente <= filterDateTo + 'T23:59:59';
    return matchSearch && matchUser && matchFrom && matchTo;
  });
  // ✅ Mise à jour refs après déclaration

  const totalFiltered = filtered.filter(v => v.statut !== 'annule').reduce((s,v) => s+v.total, 0);

  const handlePrint = async (v, forceItems) => {
    const venteItems = forceItems || items[v.id] || await (async () => {
      const res = await window.electron.dbQuery(
        `SELECT vi.*, p.nom, pv.nom as variant_nom FROM vente_items vi
         JOIN products p ON vi.product_id=p.id
         LEFT JOIN product_variants pv ON vi.variant_id=pv.id
         WHERE vi.vente_id=?`, [v.id]
      );
      return res.data || [];
    })();
    await window.electron.printTicket({
      shopName, shopAddress, shopPhone, shopNif,
      clientNom: v.client_nom || 'CONSUMIDOR FINAL',
      clientNif: v.client_nif || 'CONSUMIDOR FINAL',
      numeroFacture: v.facture_num || '',
      segundaVia: true, // ✅ Mention "2ème exemplaire / Segunda via"
      items: venteItems.filter(i => i.statut !== 'retourne').map(i => ({
        name: i.variant_nom ? `${i.nom} ${i.variant_nom}` : i.nom,
        type: i.type_vente, qty: i.quantite,
        price: i.prix_unitaire.toLocaleString('fr-FR'),
        subtotal: i.sous_total.toLocaleString('fr-FR'),
      })),
      total: v.total.toLocaleString('fr-FR'),
      cashGiven: (v.montant_recu||0).toLocaleString('fr-FR'),
      change: (v.monnaie_rendue||0).toLocaleString('fr-FR'),
      payMode: v.mode_paiement || 'dinheiro',
      montantDinheiro: (v.montant_dinheiro||0).toLocaleString('fr-FR'),
      montantExpress: (v.montant_express||0).toLocaleString('fr-FR'),
      currency, seller: v.vendeur,
      date: new Date(v.date_vente).toLocaleString('fr-FR'),
      statut: v.statut,
    });
  };

  const handlePrintAll = async (format = 'a4') => {
    try {
      const res = await window.electron.printHistoriqueReport({
        shopName, ventes: filtered, total: totalFiltered, currency, format,
        filterUser: users.find(u => String(u.id) === filterUser)?.nom || t('history','allSellers'),
        filterDateFrom, filterDateTo, printedAt: new Date().toLocaleString('fr-FR'),
      });
      // ✅ Remplacé alert() natif → showAlert React
      if (res && !res.success) showAlert('Erro ao imprimir', res.error || 'Desconhecido', 'error');
    } catch(e) {
      showAlert('Erro ao imprimir', e.message, 'error');
    }
  };

  const handlePrintProdutos = async (format = 'a4') => {
    try {
      const sorted = [...produtoStats].sort((a,b) =>
        produtoSort === 'nom' ? a.nom.localeCompare(b.nom) :
        produtoSort === 'qty' ? (b.carton+b.demi+b.unite) - (a.carton+a.demi+a.unite) :
        b.total - a.total
      );
      const res = await window.electron.printProdutosReport({
        shopName, format, produtos: sorted, currency,
        filterUser: users.find(u => String(u.id) === filterUser)?.nom || 'Todos',
        filterDateFrom, filterDateTo, printedAt: new Date().toLocaleString('fr-FR'),
      });
      // ✅ Remplacé alert() natif → showAlert React
      if (res && !res.success) showAlert('Erro ao imprimir', res.error || 'Desconhecido', 'error');
    } catch(e) {
      showAlert('Erro ao imprimir', e.message, 'error');
    }
  };

  const openEdit = async (v) => {
    const res = await window.electron.dbQuery(
      `SELECT vi.*, p.nom, p.unites_par_carton, pv.nom as variant_nom
       FROM vente_items vi JOIN products p ON vi.product_id=p.id
       LEFT JOIN product_variants pv ON vi.variant_id=pv.id
       WHERE vi.vente_id=?`, [v.id]
    );
    setEditItems(res.data || []);
    setEditVente({ ...v });
  };

  const handleReturnItem = async (item) => {
    // ✅ Remplacé window.confirm() natif → showConfirm React (async/await)
    const ok = await showConfirm(
      t('history','returnConfirm'),
      `"${item.nom}${item.variant_nom?' '+item.variant_nom:''}" ${t('history','returnConfirm2')}`,
      'warning'
    );
    if (!ok) return;
    setSaving(true);
    try {
      await window.electron.dbQuery("UPDATE vente_items SET statut='retourne' WHERE id=?", [item.id]);
      const upc = Math.max(1, Math.round(item.unites_par_carton));
      const stockReturn = item.type_vente==='carton' ? item.quantite
        : item.type_vente==='demi' ? item.quantite * Math.ceil(upc/2) / upc
        : item.quantite / upc;
      if (item.variant_id) {
        await window.electron.dbQuery("UPDATE product_variants SET stock_cartons=stock_cartons+? WHERE id=?", [stockReturn, item.variant_id]);
        const total = (await window.electron.dbGet("SELECT COALESCE(SUM(stock_cartons),0) as t FROM product_variants WHERE product_id=? AND actif=1",[item.product_id])).data?.t||0;
        await window.electron.dbQuery("UPDATE products SET stock_cartons=? WHERE id=?",[total,item.product_id]);
      } else {
        await window.electron.dbQuery("UPDATE products SET stock_cartons=stock_cartons+? WHERE id=?", [stockReturn, item.product_id]);
      }
      await window.electron.dbQuery("UPDATE ventes SET total=total-?,statut='modifie' WHERE id=?", [item.sous_total, editVente.id]);
      await window.electron.dbQuery(
        "INSERT INTO historique_modifications (user_id,table_name,record_id,action,details) VALUES (?,?,?,?,?)",
        [user.id,'vente_items',item.id,'RETORNO',`Retorno: ${item.nom}${item.variant_nom?' '+item.variant_nom:''} na venda #${editVente.id}`]
      );
      const res = await window.electron.dbQuery(
        `SELECT vi.*, p.nom, p.unites_par_carton, pv.nom as variant_nom FROM vente_items vi
         JOIN products p ON vi.product_id=p.id LEFT JOIN product_variants pv ON vi.variant_id=pv.id
         WHERE vi.vente_id=?`, [editVente.id]
      );
      setEditItems(res.data || []);
      const vRes = await window.electron.dbGet("SELECT * FROM ventes WHERE id=?", [editVente.id]);
      if (vRes.data) setEditVente(vRes.data);
      loadVentes();
      setItems(prev => ({ ...prev, [editVente.id]: undefined }));
    } catch(e) {
      // ✅ Remplacé alert() natif → showAlert React
      showAlert('Erro', e.message, 'error');
    }
    setSaving(false);
  };

  const handleCancelVente = async () => {
    // ✅ Remplacé window.confirm() natif → showConfirm React (async/await)
    const ok = await showConfirm('Confirmação', t('history','cancelConfirm'), 'warning');
    if (!ok) return;
    setSaving(true);
    try {
      for (const item of editItems.filter(i => i.statut !== 'retourne')) {
        const upc = Math.max(1, Math.round(item.unites_par_carton));
        const sr = item.type_vente==='carton' ? item.quantite
          : item.type_vente==='demi' ? item.quantite*Math.ceil(upc/2)/upc
          : item.quantite/upc;
        if (item.variant_id) {
          await window.electron.dbQuery("UPDATE product_variants SET stock_cartons=stock_cartons+? WHERE id=?",[sr,item.variant_id]);
          const tot = (await window.electron.dbGet("SELECT COALESCE(SUM(stock_cartons),0) as t FROM product_variants WHERE product_id=? AND actif=1",[item.product_id])).data?.t||0;
          await window.electron.dbQuery("UPDATE products SET stock_cartons=? WHERE id=?",[tot,item.product_id]);
        } else {
          await window.electron.dbQuery("UPDATE products SET stock_cartons=stock_cartons+? WHERE id=?",[sr,item.product_id]);
        }
      }
      await window.electron.dbQuery("UPDATE ventes SET statut='annule',total=0 WHERE id=?", [editVente.id]);
      await window.electron.dbQuery("UPDATE vente_items SET statut='retourne' WHERE vente_id=?", [editVente.id]);
      await window.electron.dbQuery(
        "INSERT INTO historique_modifications (user_id,table_name,record_id,action,details) VALUES (?,?,?,?,?)",
        [user.id,'ventes',editVente.id,'CANCELAMENTO',`Venda #${editVente.id} cancelada`]
      );
      setEditVente(null); loadVentes();
    } catch(e) {
      // ✅ Remplacé alert() natif → showAlert React
      showAlert('Erro', e.message, 'error');
    }
    setSaving(false);
  };

  const payModeLabel  = { dinheiro:'💵', express:'📱', misto:'🔀' };
  const statusColor   = { normal:'var(--success)', annule:'var(--danger)', modifie:'var(--warning)' };
  const statusLabel   = { normal:'✓', annule:'✗', modifie:'✎' };
  const modifColor    = { CREATE:'var(--success)', UPDATE:'var(--info)', DELETE:'var(--danger)', ENTRADA:'var(--success)', 'SAÍDA':'var(--danger)', RETORNO:'var(--warning)', CANCELAMENTO:'var(--danger)' };

  return (
    <div className="historique-scroll" style={{ padding:24, height:'100%', overflowY:'auto' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700 }}>{t('history','title')}</h1>
          <p style={{ color:'var(--text-secondary)', fontSize:14 }}>
            {filtered.length} {t('history','sales')} · <strong style={{ color:'var(--accent)' }}>{totalFiltered.toLocaleString('fr-FR')} {currency}</strong>
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {isAdmin && tab === 'ventes' && (
            <>
              {selectMode ? (
                <>
                  <button onClick={toggleSelectAll} className="btn btn-secondary" style={{ fontSize:12 }}>
                    {selected.size === filtered.length ? <CheckSquare size={14}/> : <Square size={14}/>}
                    {' '}{selected.size === filtered.length ? t('history','deselectAll') : t('history','selectAll')}
                  </button>
                  {selected.size > 0 && (
                    <button onClick={handleDeleteSelected} disabled={saving} className="btn btn-danger" style={{ fontSize:12 }}>
                      <Trash2 size={14}/> {t('history','deleteSelected')} ({selected.size})
                    </button>
                  )}
                  <button onClick={() => { setSelectMode(false); setSelected(new Set()); }} className="btn btn-secondary" style={{ fontSize:12 }}>
                    <X size={14}/> {t('history','close')}
                  </button>
                </>
              ) : (
                <button onClick={() => setSelectMode(true)} className="btn btn-secondary" style={{ fontSize:12 }}>
                  <CheckSquare size={14}/> {t('history','select')}
                </button>
              )}
            </>
          )}
          <button onClick={() => setShowFilters(!showFilters)} className="btn btn-secondary">
            <Filter size={14}/> {t('history','filters')}
          </button>
          {tab !== 'modifications' && (
            <div style={{ position:'relative', display:'flex', gap:0 }}>
              <button onClick={() => tab==='produtos' ? handlePrintProdutos('a4') : handlePrintAll('a4')}
                className="btn btn-secondary" title="Imprimir em A4"
                style={{ borderRadius:'8px 0 0 8px', borderRight:'1px solid var(--border)' }}>
                <Printer size={14}/> A4
              </button>
              <button onClick={() => tab==='produtos' ? handlePrintProdutos('ticket') : handlePrintAll('ticket')}
                className="btn btn-secondary" title="Imprimir em 72mm (impressora t\u00e9rmica)"
                style={{ borderRadius:'0 8px 8px 0', fontSize:12, paddingLeft:8, paddingRight:10 }}>
                🧾 72mm
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:4, marginBottom:16, gap:4, maxWidth:520 }}>
        {[
          { key:'ventes',        label: t('history','salesTab') },
          { key:'produtos',      label: '📦 Produtos' },
          { key:'modifications', label: t('history','modificationsTab') },
        ].map(tb => (
          <button key={tb.key} onClick={()=>setTab(tb.key)}
            style={{ flex:1, padding:'8px', borderRadius:8, border:'none', cursor:'pointer',
              background:tab===tb.key?'var(--accent)':'transparent',
              color:tab===tb.key?'#000':'var(--text-secondary)',
              fontWeight:600, fontSize:13, fontFamily:'inherit' }}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      {showFilters && tab !== 'modifications' && (
        <div className="card" style={{ marginBottom:16, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
          <div className="form-group">
            <label className="form-label"><Calendar size={12} style={{ display:'inline', marginRight:4 }}/>{t('history','dateFrom')}</label>
            <input type="date" className="form-input" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}/>
          </div>
          <div className="form-group">
            <label className="form-label"><Calendar size={12} style={{ display:'inline', marginRight:4 }}/>{t('history','dateTo')}</label>
            <input type="date" className="form-input" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}/>
          </div>
          {isAdmin && (
            <div className="form-group">
              <label className="form-label"><User size={12} style={{ display:'inline', marginRight:4 }}/>{t('history','seller')}</label>
              <select className="form-input" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                <option value="all">{t('history','allSellers')}</option>
                {users.map(u => <option key={u.id} value={String(u.id)}>{u.nom}</option>)}
              </select>
            </div>
          )}
          <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterUser('all'); }} className="btn btn-secondary btn-sm">
            {t('history','clearFilters')}
          </button>
        </div>
      )}

      {/* Search */}
      <div style={{ position:'relative', marginBottom:16, maxWidth:400 }}>
        <Search size={16} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}/>
        <input type="text" className="form-input" placeholder={t('history','search')} value={search}
          onChange={e => setSearch(e.target.value)} style={{ paddingLeft:36 }}/>
      </div>

      {/* Ventes tab */}
      {tab === 'ventes' && (
        <div className="historique-scroll" style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {filtered.map((v, rIdx) => (
            <div key={v.id} className="card historique-row" style={{ padding:0, overflow:'hidden', opacity:v.statut==='annule'?0.6:1,
              border: selected.has(v.id) ? '1px solid var(--accent)' : '1px solid var(--border)',
              transition:'border 0.1s, box-shadow 0.1s' }}>
              <div onClick={() => selectMode ? toggleSelect(null, v.id) : toggleExpand(v.id)}
                style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}>
                {selectMode && isAdmin && (
                  <div onClick={e => toggleSelect(e, v.id)} style={{ cursor:'pointer', color: selected.has(v.id) ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {selected.has(v.id) ? <CheckSquare size={18}/> : <Square size={18}/>}
                  </div>
                )}
                <div style={{ fontFamily:'monospace', color:'var(--text-muted)', fontSize:12, minWidth:36 }}>#{v.id}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontWeight:600, fontSize:14 }}>{v.total.toLocaleString('fr-FR')} {currency}</span>
                    <span style={{ fontSize:11, color:statusColor[v.statut]||'var(--success)' }}>{statusLabel[v.statut]||'✓'}</span>
                    {v.mode_paiement && <span style={{ fontSize:12 }}>{payModeLabel[v.mode_paiement]||''}</span>}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                    {new Date(v.date_vente).toLocaleString('fr-FR')}
                    {isAdmin && ` · ${v.vendeur}`}
                    {v.client_nom && ` · 👤 ${v.client_nom}`}
                  </div>
                </div>
                {!selectMode && (
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={e=>{e.stopPropagation();handlePrint(v);}} className="btn btn-icon btn-secondary" title={t('history','print')}><Printer size={14}/></button>
                    {canEdit && v.statut !== 'annule' && (
                      <button onClick={e=>{e.stopPropagation();openEdit(v);}} className="btn btn-icon btn-secondary" title={t('history','edit')}><Edit2 size={14}/></button>
                    )}
                    {isAdmin && (
                      <button onClick={e => handleDeleteVente(e, v)} disabled={saving} className="btn btn-icon btn-danger" title={t('history','delete')}><Trash2 size={14}/></button>
                    )}
                  </div>
                )}
                {!selectMode && (expanded===v.id?<ChevronUp size={16}/>:<ChevronDown size={16}/>)}
              </div>

              {!selectMode && expanded===v.id && (
                <div style={{ borderTop:'1px solid var(--border)', padding:'12px 16px', background:'var(--bg-hover)' }}>
                  {(items[v.id]||[]).map(i => (
                    <div key={i.id} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:13, opacity:i.statut==='retourne'?0.4:1, textDecoration:i.statut==='retourne'?'line-through':'none' }}>
                      <span>
                        {i.variant_nom ? `${i.nom} ${i.variant_nom}` : i.nom}
                        <span style={{ color:'var(--text-muted)', fontSize:11 }}> ({i.type_vente})</span> × {Math.round(i.quantite*100)/100}
                      </span>
                      <span style={{ fontFamily:'monospace', color:'var(--accent)' }}>{i.sous_total.toLocaleString('fr-FR')} {currency}</span>
                    </div>
                  ))}
                  {v.client_nom && <div style={{ marginTop:8, fontSize:12, color:'var(--text-secondary)' }}>👤 {v.client_nom}</div>}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && !loadingMore && <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-muted)' }}>{t('history','noSales')}</div>}

          {/* ✅ v1.2.7 — Sentinelle scroll infini */}
          {!filterActive && (
            <div ref={loaderRef} style={{ padding:'16px 0', textAlign:'center' }}>
              {loadingMore && (
                <div style={{ color:'var(--text-muted)', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  <span style={{ display:'inline-block', width:14, height:14, border:'2px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                  Carregando...
                </div>
              )}
              {!hasMore && ventes.length > 0 && (
                <div style={{ color:'var(--text-muted)', fontSize:12 }}>— Fim do histórico —</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Produtos tab */}
      {tab === 'produtos' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <span style={{ fontSize:13, color:'var(--text-muted)' }}>Ordenar por:</span>
              {['total','qty','nom'].map(s => (
                <button key={s} onClick={() => setProdutoSort(s)} className={'btn btn-sm ' + (produtoSort===s?'btn-primary':'btn-secondary')} style={{ fontSize:11 }}>
                  {s==='total'?'💰 Receita':s==='qty'?'📦 Qtd':'🔤 Nome'}
                </button>
              ))}
            </div>
            <div style={{ display:'flex', gap:0 }}>
              <button onClick={() => handlePrintProdutos('a4')} className='btn btn-secondary' title='Imprimir A4' style={{ borderRadius:'8px 0 0 8px', borderRight:'1px solid var(--border)', fontSize:12 }}>
                <Printer size={13}/> A4
              </button>
              <button onClick={() => handlePrintProdutos('ticket')} className='btn btn-secondary' title='Imprimir 72mm' style={{ borderRadius:'0 8px 8px 0', fontSize:12 }}>
                🧾 72mm
              </button>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 120px', gap:8, padding:'6px 14px', fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', borderBottom:'1px solid var(--border)' }}>
              <span>Produto</span><span style={{textAlign:'center'}}>Caixas</span><span style={{textAlign:'center'}}>Demi</span><span style={{textAlign:'center'}}>Unid.</span><span style={{textAlign:'right'}}>Total</span>
            </div>
            {[...produtoStats].sort((a,b) =>
              produtoSort==='nom' ? a.nom.localeCompare(b.nom) :
              produtoSort==='qty' ? (b.carton+b.demi+b.unite)-(a.carton+a.demi+a.unite) :
              b.total-a.total
            ).map((p, i) => (
              <div key={i} className='card' style={{ padding:'10px 14px', display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 120px', gap:8, alignItems:'center' }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:13 }}>{p.nom}</div>
                  {p.variant_nom && <div style={{ fontSize:11, color:'var(--text-muted)' }}>{p.variant_nom}</div>}
                </div>
                <div style={{ textAlign:'center', fontSize:13 }}>{p.carton > 0 ? <span style={{fontWeight:700}}>{Math.round(p.carton*100)/100}</span> : <span style={{color:'var(--text-muted)'}}>-</span>}</div>
                <div style={{ textAlign:'center', fontSize:13 }}>{p.demi > 0 ? <span style={{fontWeight:700}}>{Math.round(p.demi*100)/100}</span> : <span style={{color:'var(--text-muted)'}}>-</span>}</div>
                <div style={{ textAlign:'center', fontSize:13 }}>{p.unite > 0 ? <span style={{fontWeight:700}}>{Math.round(p.unite*100)/100}</span> : <span style={{color:'var(--text-muted)'}}>-</span>}</div>
                <div style={{ textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'var(--accent)', fontSize:13 }}>{p.total.toLocaleString('fr-FR')} {currency}</div>
              </div>
            ))}
            {produtoStats.length === 0 && <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-muted)' }}>Nenhum produto vendido</div>}
          </div>
          {produtoStats.length > 0 && (
            <div style={{ marginTop:12, padding:'12px 16px', background:'var(--bg-card)', border:'1px solid var(--accent)', borderRadius:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontWeight:700 }}>{produtoStats.length} produto(s) vendido(s)</span>
              <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:16, color:'var(--accent)' }}>
                {produtoStats.reduce((s,p)=>s+p.total,0).toLocaleString('fr-FR')} {currency}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Modifications tab */}
      {tab === 'modifications' && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {modifications.map(m => (
            <div key={m.id} className="card" style={{ padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:100, fontSize:11, fontWeight:700, color:modifColor[m.action]||'var(--text-secondary)' }}>{m.action}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:'var(--text-primary)' }}>{m.details}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                  <Clock size={10} style={{ display:'inline', marginRight:4 }}/>
                  {new Date(m.date_action).toLocaleString('fr-FR')} · {m.user_nom||'Sistema'}
                </div>
              </div>
            </div>
          ))}
          {modifications.length === 0 && <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-muted)' }}>{t('history','noSales')}</div>}
        </div>
      )}

      {/* Edit Modal */}
      {editVente && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:540 }}>
            <div className="modal-header">
              <h2 className="modal-title">{t('history','editSale')}{editVente.id}</h2>
              <button onClick={()=>setEditVente(null)} className="btn btn-icon btn-secondary"><X size={16}/></button>
            </div>
            {editVente.client_nom && (
              <div style={{ marginBottom:12, padding:'8px 12px', background:'var(--bg-hover)', borderRadius:8, fontSize:13 }}>
                👤 {t('history','client')}: <strong>{editVente.client_nom}</strong>
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16, maxHeight:300, overflowY:'auto' }}>
              {editItems.map(item => (
                <div key={item.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:10, background:item.statut==='retourne'?'rgba(239,68,68,0.05)':'var(--bg-hover)', border:'1px solid var(--border)', opacity:item.statut==='retourne'?0.5:1 }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13, textDecoration:item.statut==='retourne'?'line-through':'none' }}>
                      {item.variant_nom ? `${item.nom} ${item.variant_nom}` : item.nom}
                    </div>
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                      {item.type_vente} × {Math.round(item.quantite*100)/100} = {item.sous_total.toLocaleString('fr-FR')} {currency}
                    </div>
                  </div>
                  {item.statut !== 'retourne' ? (
                    <button onClick={() => handleReturnItem(item)} disabled={saving} className="btn btn-sm btn-danger" style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <RotateCcw size={12}/> {t('history','returnItem')}
                    </button>
                  ) : <span style={{ fontSize:11, color:'var(--danger)' }}>{t('history','returned')}</span>}
                </div>
              ))}
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0', borderTop:'1px solid var(--border)', marginBottom:16 }}>
              <span style={{ fontWeight:700 }}>{t('history','updatedTotal')}</span>
              <span style={{ fontFamily:'monospace', fontWeight:700, color:'var(--accent)' }}>{(editVente.total||0).toLocaleString('fr-FR')} {currency}</span>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => handlePrint(editVente, editItems)} className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}><Printer size={16}/> {t('history','print')}</button>
              <button onClick={handleCancelVente} disabled={saving} className="btn btn-danger" style={{ flex:1, justifyContent:'center' }}><X size={16}/> {t('history','cancelSale')}</button>
              <button onClick={() => setEditVente(null)} className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}>{t('history','close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Modals React purs — zéro focus trap */}
      {AlertModalComponent}
      {ConfirmModalComponent}
    </div>
  );
}
