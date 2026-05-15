import React, { useState, useEffect } from 'react';
import { useAuth } from '../App';
import { useLang } from '../utils/useLang';
import { Plus, Minus, AlertTriangle, Search, X, Layers } from 'lucide-react';

export default function EstoquePage() {
  const { user } = useAuth();
  const { t } = useLang();
  const [products, setProducts] = useState([]);
  const [mouvements, setMouvements] = useState([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('produtos');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('entree');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [variants, setVariants] = useState([]);
  const [typeMesure, setTypeMesure] = useState('carton');
  const [quantite, setQuantite] = useState('');
  const [motif, setMotif] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [alertas, setAlertas] = useState([]);

  useEffect(() => { loadProducts(); loadMouvements(); }, []);

  const loadProducts = async () => {
    const res = await window.electron.dbQuery("SELECT * FROM products WHERE actif=1 ORDER BY nom", []);
    const prods = res.data || [];
    setProducts(prods);
    setAlertas(prods.filter(p => p.stock_cartons <= p.stock_alerte));
  };

  const loadMouvements = async () => {
    const res = await window.electron.dbQuery(
      `SELECT sm.*, p.nom as product_nom, u.nom as user_nom, pv.nom as variant_nom
       FROM stock_mouvements sm
       JOIN products p ON sm.product_id=p.id
       JOIN users u ON sm.user_id=u.id
       LEFT JOIN product_variants pv ON sm.variant_id=pv.id
       ORDER BY sm.date_mouvement DESC LIMIT 300`, []
    );
    setMouvements(res.data || []);
  };

  const loadVariants = async (productId) => {
    const res = await window.electron.dbQuery(
      "SELECT * FROM product_variants WHERE product_id=? AND actif=1 ORDER BY nom", [productId]
    );
    setVariants(res.data || []);
  };

  const openModal = async (product, type) => {
    setSelectedProduct(product);
    setModalType(type);
    setSelectedVariant(null);
    setTypeMesure('carton');
    setQuantite('');
    setMotif('');
    setNote('');
    if (product.has_variants) await loadVariants(product.id);
    else setVariants([]);
    setShowModal(true);
  };

  const getUnitsPerCarton = (p) => Math.max(1, Math.round(p.unites_par_carton));

  const convertToCartons = (qty, type, upc) => {
    if (type === 'carton') return qty;
    if (type === 'demi') return qty * Math.ceil(upc / 2) / upc;
    return qty / upc;
  };

  const handleMouvement = async () => {
    if (!quantite || Number(quantite) <= 0) { alert('Informe uma quantidade válida'); return; }
    if (modalType === 'sortie' && !motif) { alert(t('stock','selectMotive')); return; }
    if (selectedProduct.has_variants && !selectedVariant) { alert(t('stock','chooseVariant')); return; }

    const upc = getUnitsPerCarton(selectedProduct);
    const qty = Number(quantite);
    const cartonsQty = convertToCartons(qty, typeMesure, upc);
    const stockSource = selectedVariant || selectedProduct;
    const stockAntes = stockSource.stock_cartons;

    if (modalType === 'sortie' && cartonsQty > stockAntes) {
      alert(`Stock insuficiente! Disponível: ${Math.round(stockAntes * 100) / 100} caixas`); return;
    }

    setLoading(true);
    try {
      const stockDepois = modalType === 'entree' ? stockAntes + cartonsQty : Math.max(0, stockAntes - cartonsQty);
      const motifLabels = {
        defeituoso: t('stock','defective'),
        vencido: t('stock','expired'),
        perdido: t('stock','lost'),
      };
      const noteText = motif ? `${motifLabels[motif]||motif}${note?' - '+note:''}` : note;

      if (selectedVariant) {
        await window.electron.dbQuery("UPDATE product_variants SET stock_cartons=? WHERE id=?", [stockDepois, selectedVariant.id]);
        const totalRes = await window.electron.dbGet(
          "SELECT COALESCE(SUM(stock_cartons),0) as total FROM product_variants WHERE product_id=? AND actif=1",
          [selectedProduct.id]
        );
        await window.electron.dbQuery("UPDATE products SET stock_cartons=?,updated_at=datetime('now') WHERE id=?", [totalRes.data?.total || 0, selectedProduct.id]);
      } else {
        await window.electron.dbQuery("UPDATE products SET stock_cartons=?,updated_at=datetime('now') WHERE id=?", [stockDepois, selectedProduct.id]);
      }

      await window.electron.dbQuery(
        "INSERT INTO stock_mouvements (product_id,variant_id,user_id,type,type_mesure,quantite,quantite_cartons,stock_avant,stock_apres,motif,note) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [selectedProduct.id, selectedVariant?.id||null, user.id, modalType, typeMesure, qty, cartonsQty, stockAntes, stockDepois, motif||null, noteText||null]
      );
      await window.electron.dbQuery(
        "INSERT INTO historique_modifications (user_id,table_name,record_id,action,details) VALUES (?,?,?,?,?)",
        [user.id, 'stock_mouvements', selectedProduct.id,
         modalType === 'entree' ? 'ENTRADA' : 'SAÍDA',
         `${selectedProduct.nom}${selectedVariant?' '+selectedVariant.nom:''}: ${modalType==='entree'?'+':'-'}${qty} ${typeMesure}${noteText?' ('+noteText+')':''}`]
      );

      setShowModal(false); loadProducts(); loadMouvements();
    } catch(e) { alert('Erro: '+e.message); }
    setLoading(false);
  };

  const handleUpdateAlerte = async (productId, value) => {
    await window.electron.dbQuery("UPDATE products SET stock_alerte=? WHERE id=?", [Number(value), productId]);
    loadProducts();
  };

  const filteredProducts = products.filter(p =>
    p.nom.toLowerCase().includes(search.toLowerCase()) ||
    (p.categorie||'').toLowerCase().includes(search.toLowerCase())
  );

  const filteredMouvements = mouvements.filter(m =>
    m.product_nom?.toLowerCase().includes(search.toLowerCase()) ||
    (m.variant_nom||'').toLowerCase().includes(search.toLowerCase())
  );

  const typeColor = { entree:'var(--success)', sortie:'var(--danger)', ajuste:'var(--warning)', vente:'var(--info)', retour:'var(--accent)' };
  const roundStock = (n) => Math.round(n * 100) / 100;

  const upc = selectedProduct ? getUnitsPerCarton(selectedProduct) : 1;
  const cartonsPreview = quantite ? convertToCartons(Number(quantite), typeMesure, upc) : 0;
  const stockSrc = selectedVariant || selectedProduct;
  const newStock = stockSrc ? (modalType==='entree' ? stockSrc.stock_cartons + cartonsPreview : Math.max(0, stockSrc.stock_cartons - cartonsPreview)) : 0;

  const TYPE_MESURE = [
    { key:'carton', label:`📦 ${t('cashier','box')}` },
    { key:'demi',   label:`½ ${t('cashier','half')}` },
    { key:'unite',  label:`🔹 ${t('cashier','unit')}` },
  ];

  const MOTIFS_SORTIE = [
    { key:'defeituoso', label: t('stock','defective') },
    { key:'vencido',    label: t('stock','expired') },
    { key:'perdido',    label: t('stock','lost') },
  ];

  const quantityLabel = typeMesure==='carton' ? t('stock','quantityCaixas')
    : typeMesure==='demi' ? t('stock','quantityDemi')
    : t('stock','quantityUnits');

  return (
    <div style={{ padding:24, height:'100%', overflowY:'auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700 }}>{t('stock','title')}</h1>
          <p style={{ color:'var(--text-secondary)', fontSize:14 }}>
            {products.length} {t('stock','products')}
            {alertas.length > 0 && <span style={{ color:'var(--danger)', fontWeight:600, marginLeft:8 }}>⚠️ {alertas.length} {t('alert','lowStock')}</span>}
          </p>
        </div>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:10, padding:14, marginBottom:16 }}>
          <div style={{ fontWeight:600, color:'var(--danger)', marginBottom:8 }}>
            <AlertTriangle size={16} style={{ display:'inline', marginRight:6 }}/>{t('alert','lowStockDesc')}
          </div>
          {alertas.map(p => (
            <div key={p.id} style={{ fontSize:13, padding:'2px 0' }}>
              • <strong>{p.nom}</strong>: {roundStock(p.stock_cartons)} cx ({t('stock','alert').replace('(cx)','').trim()}: {p.stock_alerte})
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:4, marginBottom:16, gap:4, maxWidth:400 }}>
        {[{key:'produtos',label:t('stock','productsTab')},{key:'historico',label:t('stock','historyTab')}].map(tb=>(
          <button key={tb.key} onClick={()=>setTab(tb.key)}
            style={{ flex:1, padding:'8px', borderRadius:8, border:'none', cursor:'pointer', background:tab===tb.key?'var(--accent)':'transparent', color:tab===tb.key?'#000':'var(--text-secondary)', fontWeight:600, fontSize:13, fontFamily:'inherit' }}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position:'relative', marginBottom:16, maxWidth:400 }}>
        <Search size={16} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}/>
        <input type="text" className="form-input" placeholder={t('stock','search')} value={search} onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:36 }}/>
      </div>

      {/* Products tab */}
      {tab === 'produtos' && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('stock','product')}</th>
                <th>{t('stock','stockCols')}</th>
                <th>{t('stock','alert')}</th>
                <th>{t('stock','status')}</th>
                <th>{t('stock','actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => {
                const isLow = p.stock_cartons <= p.stock_alerte;
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ fontWeight:600 }}>{p.nom}</div>
                        {p.has_variants && <Layers size={12} color="var(--accent)"/>}
                      </div>
                      <div style={{ fontSize:11, color:'var(--text-muted)' }}>{p.categorie} · {p.unites_par_carton} {t('cashier','units')}</div>
                    </td>
                    <td>
                      <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:16, color:isLow?'var(--danger)':'var(--text-primary)' }}>
                        {roundStock(p.stock_cartons)}
                      </span>
                      <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:4 }}>cx</span>
                    </td>
                    <td>
                      <input type="number" value={p.stock_alerte} min="0" step="0.5"
                        onChange={e => handleUpdateAlerte(p.id, e.target.value)}
                        style={{ width:70, background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px', color:'var(--text-primary)', fontFamily:'monospace', fontSize:13 }}/>
                    </td>
                    <td>
                      {isLow
                        ? <span className="badge badge-danger"><AlertTriangle size={10} style={{ display:'inline', marginRight:3 }}/>Baixo</span>
                        : <span className="badge badge-success">OK</span>}
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => openModal(p, 'entree')} className="btn btn-sm btn-success" style={{ display:'flex', alignItems:'center', gap:4 }}>
                          <Plus size={12}/> {t('stock','entry').replace('+','')}
                        </button>
                        <button onClick={() => openModal(p, 'sortie')} className="btn btn-sm btn-danger" style={{ display:'flex', alignItems:'center', gap:4 }}>
                          <Minus size={12}/> {t('stock','exit').replace('−','')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* History tab */}
      {tab === 'historico' && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {filteredMouvements.map(m => (
            <div key={m.id} className="card" style={{ padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:80, fontSize:12, fontWeight:700, color:typeColor[m.type] }}>
                {m.type==='entree'?'➕':m.type==='sortie'?'➖':m.type==='vente'?'🛒':m.type==='retour'?'↩️':'✏️'} {m.type}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:13 }}>
                  {m.product_nom}{m.variant_nom ? ` — ${m.variant_nom}` : ''}
                </div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                  {new Date(m.date_mouvement).toLocaleString('fr-FR')} · {m.user_nom}
                </div>
                {(m.motif||m.note) && (
                  <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:2 }}>📝 {m.note}</div>
                )}
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:'monospace', fontWeight:700, color:typeColor[m.type], fontSize:16 }}>
                  {m.type==='entree'||m.type==='retour'?'+':'-'}{Math.round(m.quantite*100)/100} {m.type_mesure||'cx'}
                </div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                  {Math.round(m.stock_avant*100)/100} → {Math.round(m.stock_apres*100)/100} cx
                </div>
              </div>
            </div>
          ))}
          {filteredMouvements.length === 0 && (
            <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-muted)' }}>{t('stock','noHistory')}</div>
          )}
        </div>
      )}

      {/* Modal Entrada/Saída */}
      {showModal && selectedProduct && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:460 }}>
            <div className="modal-header">
              <h2 className="modal-title">
                {modalType==='entree' ? t('stock','entryTitle') : t('stock','exitTitle')} {selectedProduct.nom}
              </h2>
              <button onClick={()=>setShowModal(false)} className="btn btn-icon btn-secondary"><X size={16}/></button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* Variant */}
              {selectedProduct.has_variants && variants.length > 0 && (
                <div className="form-group">
                  <label className="form-label">{t('stock','chooseVariant')}</label>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {variants.map(v => (
                      <button key={v.id} onClick={() => setSelectedVariant(v)}
                        style={{ padding:'10px 14px', borderRadius:8, border:`2px solid ${selectedVariant?.id===v.id?'var(--accent)':'var(--border)'}`, background:selectedVariant?.id===v.id?'var(--accent-dim)':'var(--bg-hover)', cursor:'pointer', display:'flex', justifyContent:'space-between', fontFamily:'inherit', color:'var(--text-primary)' }}>
                        <span style={{ fontWeight:600 }}>{v.nom}</span>
                        <span style={{ fontSize:12, color:'var(--text-muted)' }}>Stock: {roundStock(v.stock_cartons)} cx</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Type mesure */}
              <div className="form-group">
                <label className="form-label">{t('stock','measureType')}</label>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                  {TYPE_MESURE.map(tm => (
                    <button key={tm.key} onClick={() => setTypeMesure(tm.key)}
                      style={{ padding:'8px', borderRadius:8, border:`2px solid ${typeMesure===tm.key?'var(--accent)':'var(--border)'}`, background:typeMesure===tm.key?'var(--accent-dim)':'var(--bg-hover)', cursor:'pointer', color:typeMesure===tm.key?'var(--accent)':'var(--text-secondary)', fontFamily:'inherit', fontSize:12, fontWeight:typeMesure===tm.key?700:400, textAlign:'center' }}>
                      {tm.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantité */}
              <div className="form-group">
                <label className="form-label">{quantityLabel}</label>
                <input type="number" className="form-input" value={quantite}
                  onChange={e=>setQuantite(e.target.value)} placeholder="0" min="1" step="1" autoFocus
                  style={{ fontSize:18, fontFamily:'monospace', fontWeight:700 }}/>
              </div>

              {/* Preview */}
              {quantite && stockSrc && (
                <div style={{ background:modalType==='entree'?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)', border:`1px solid ${modalType==='entree'?'rgba(34,197,94,0.3)':'rgba(239,68,68,0.3)'}`, borderRadius:8, padding:'10px 14px', display:'flex', justifyContent:'space-between', fontSize:13 }}>
                  <span>Novo stock:</span>
                  <span style={{ fontFamily:'monospace', fontWeight:700, color:modalType==='entree'?'var(--success)':'var(--danger)' }}>
                    {Math.round(newStock*100)/100} cx ({Math.round(cartonsPreview*100)/100} cx = {quantite} {typeMesure})
                  </span>
                </div>
              )}

              {/* Motif sortie */}
              {modalType === 'sortie' && (
                <div className="form-group">
                  <label className="form-label">{t('stock','motive')}</label>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {MOTIFS_SORTIE.map(m => (
                      <button key={m.key} onClick={() => setMotif(m.key)}
                        style={{ padding:'10px 14px', borderRadius:8, border:`2px solid ${motif===m.key?'var(--danger)':'var(--border)'}`, background:motif===m.key?'rgba(239,68,68,0.1)':'var(--bg-hover)', cursor:'pointer', textAlign:'left', fontFamily:'inherit', color:'var(--text-primary)', fontSize:13, fontWeight:motif===m.key?600:400 }}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Note */}
              <div className="form-group">
                <label className="form-label">{t('stock','observation')}</label>
                <input type="text" className="form-input" value={note} onChange={e=>setNote(e.target.value)} placeholder={t('stock','observationPlaceholder')}/>
              </div>

              <div style={{ display:'flex', gap:10 }}>
                <button onClick={()=>setShowModal(false)} className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}>{t('stock','cancel')}</button>
                <button onClick={handleMouvement} disabled={loading}
                  className={`btn ${modalType==='entree'?'btn-success':'btn-danger'}`}
                  style={{ flex:1, justifyContent:'center' }}>
                  {loading ? '...' : modalType==='entree' ? t('stock','confirmEntry') : t('stock','confirmExit')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
