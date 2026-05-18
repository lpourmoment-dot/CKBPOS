import React, { useState, useEffect } from 'react';
import { useLang } from '../utils/useLang';
import { useAuth } from '../App';
import { Plus, Search, Edit2, Trash2, Package, AlertTriangle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useAlert, useConfirm } from '../components/AlertModal'; // ✅ AJOUT

const emptyForm = {
  nom:'', categorie:'General', prix_carton:'', cout_carton:'',
  unites_par_carton:12, stock_cartons:0, prix_demi:'', prix_unite:'',
  prix_demi_manual:false, prix_unite_manual:false, has_variants:false
};

const emptyVariant = { nom:'', prix_carton:'', prix_demi:'', prix_unite:'', stock_cartons:0 };

export default function ProductsPage() {
  const { t, fmt, currency } = useLang();
  const { user } = useAuth();

  // ✅ Hooks modals React (remplacent alert() et confirm() natifs)
  const { showAlert, AlertModalComponent } = useAlert();
  const { showConfirm, ConfirmModalComponent } = useConfirm();

  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState([]);
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [productVariants, setProductVariants] = useState({});

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    const res = await window.electron.dbQuery("SELECT * FROM products WHERE actif=1 ORDER BY nom", []);
    setProducts(res.data || []);
  };

  const loadVariants = async (productId) => {
    const res = await window.electron.dbQuery(
      "SELECT * FROM product_variants WHERE product_id=? AND actif=1 ORDER BY nom", [productId]
    );
    setProductVariants(prev => ({ ...prev, [productId]: res.data || [] }));
    return res.data || [];
  };

  const filtered = products.filter(p =>
    p.nom.toLowerCase().includes(search.toLowerCase()) ||
    (p.categorie||'').toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => { setForm(emptyForm); setEditing(null); setVariants([]); setShowModal(true); };

  const openEdit = async (p) => {
    setForm({
      nom:p.nom, categorie:p.categorie||'', prix_carton:p.prix_carton,
      cout_carton:p.cout_carton, unites_par_carton:p.unites_par_carton,
      stock_cartons:p.stock_cartons,
      prix_demi: p.prix_demi_manual ? p.prix_demi : '',
      prix_unite: p.prix_unite_manual ? p.prix_unite : '',
      prix_demi_manual: !!p.prix_demi_manual,
      prix_unite_manual: !!p.prix_unite_manual,
      has_variants: !!p.has_variants,
    });
    setEditing(p.id);
    const vars = await loadVariants(p.id);
    setVariants(vars.map(v => ({ ...v, isExisting: true })));
    setShowModal(true);
  };

  const autoDemi = form.prix_carton ? (Number(form.prix_carton)/2).toFixed(0) : 0;
  const autoUnite = form.prix_carton && form.unites_par_carton
    ? (Number(form.prix_carton)/Number(form.unites_par_carton)).toFixed(0) : 0;

  const f = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const addVariant = () => setVariants(prev => [...prev, { ...emptyVariant, _tempId: Date.now() }]);

  const updateVariant = (idx, key, val) => {
    setVariants(prev => prev.map((v, i) => i === idx ? { ...v, [key]: val } : v));
  };

  const removeVariant = async (idx) => {
    const v = variants[idx];
    if (v.isExisting && v.id) {
      await window.electron.dbQuery("UPDATE product_variants SET actif=0 WHERE id=?", [v.id]);
      await window.electron.dbQuery(
        "INSERT INTO historique_modifications (user_id,table_name,record_id,action,details) VALUES (?,?,?,?,?)",
        [user.id, 'product_variants', v.id, 'DELETE', `Variante removida: ${v.nom}`]
      );
    }
    setVariants(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    // ✅ Remplacé alert() natif → showAlert React
    if (!form.nom || !form.prix_carton) {
      showAlert('', t('products','productName') + ' et prix obligatoires', 'warning');
      return;
    }
    setLoading(true);
    try {
      const prixDemi = form.prix_demi_manual && form.prix_demi ? Number(form.prix_demi) : Number(autoDemi);
      const prixUnite = form.prix_unite_manual && form.prix_unite ? Number(form.prix_unite) : Number(autoUnite);
      let productId = editing;

      if (editing) {
        await window.electron.dbQuery(
          "UPDATE products SET nom=?,categorie=?,prix_carton=?,cout_carton=?,unites_par_carton=?,stock_cartons=?,prix_demi=?,prix_unite=?,prix_demi_manual=?,prix_unite_manual=?,has_variants=?,updated_at=datetime('now') WHERE id=?",
          [form.nom,form.categorie,Number(form.prix_carton),Number(form.cout_carton),
           Number(form.unites_par_carton),Number(form.stock_cartons),prixDemi,prixUnite,
           form.prix_demi_manual?1:0,form.prix_unite_manual?1:0,form.has_variants?1:0,editing]
        );
        await window.electron.dbQuery(
          "INSERT INTO historique_modifications (user_id,table_name,record_id,action,details) VALUES (?,?,?,?,?)",
          [user.id,'products',editing,'UPDATE',`Produto editado: ${form.nom}`]
        );
      } else {
        const res = await window.electron.dbQuery(
          "INSERT INTO products (nom,categorie,prix_carton,cout_carton,unites_par_carton,stock_cartons,prix_demi,prix_unite,prix_demi_manual,prix_unite_manual,has_variants) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          [form.nom,form.categorie,Number(form.prix_carton),Number(form.cout_carton),
           Number(form.unites_par_carton),Number(form.stock_cartons),prixDemi,prixUnite,0,0,form.has_variants?1:0]
        );
        productId = res.data.lastInsertRowid;
        await window.electron.dbQuery(
          "INSERT INTO historique_modifications (user_id,table_name,record_id,action,details) VALUES (?,?,?,?,?)",
          [user.id,'products',productId,'CREATE',`Produto criado: ${form.nom}`]
        );
      }

      if (form.has_variants) {
        for (const v of variants) {
          if (!v.nom) continue;
          const vPrixCarton = v.prix_carton ? Number(v.prix_carton) : Number(form.prix_carton);
          const vPrixDemi   = v.prix_demi   ? Number(v.prix_demi)   : prixDemi;
          const vPrixUnite  = v.prix_unite  ? Number(v.prix_unite)  : prixUnite;
          if (v.isExisting && v.id) {
            await window.electron.dbQuery(
              "UPDATE product_variants SET nom=?,prix_carton=?,prix_demi=?,prix_unite=?,stock_cartons=? WHERE id=?",
              [v.nom, vPrixCarton, vPrixDemi, vPrixUnite, Number(v.stock_cartons)||0, v.id]
            );
          } else {
            await window.electron.dbQuery(
              "INSERT INTO product_variants (product_id,nom,prix_carton,prix_demi,prix_unite,stock_cartons) VALUES (?,?,?,?,?,?)",
              [productId, v.nom, vPrixCarton, vPrixDemi, vPrixUnite, Number(v.stock_cartons)||0]
            );
          }
        }
      }
      setShowModal(false); loadProducts();
    } catch(e) {
      // ✅ Remplacé alert() natif → showAlert React
      showAlert('Erro', e.message, 'error');
    }
    setLoading(false);
  };

  const handleDelete = async (id, nom) => {
    // ✅ Remplacé window.confirm() natif → showConfirm React (async/await)
    const ok = await showConfirm(t('products','confirmDelete'), `"${nom}" ?`, 'warning');
    if (!ok) return;
    await window.electron.dbQuery("UPDATE products SET actif=0 WHERE id=?", [id]);
    await window.electron.dbQuery(
      "INSERT INTO historique_modifications (user_id,table_name,record_id,action,details) VALUES (?,?,?,?,?)",
      [user.id,'products',id,'DELETE',`Produto removido: ${nom}`]
    );
    loadProducts();
  };

  const toggleExpand = async (id) => {
    if (expandedProduct === id) { setExpandedProduct(null); return; }
    setExpandedProduct(id);
    await loadVariants(id);
  };

  const roundStock = (n) => Math.round(n * 100) / 100;

  return (
    <div style={{ padding:24, height:'100%', overflowY:'auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700 }}>{t('products','title')}</h1>
          <p style={{ color:'var(--text-secondary)', fontSize:14 }}>{products.length} {t('products','active')}</p>
        </div>
        <button onClick={openAdd} className="btn btn-primary"><Plus size={16}/> {t('products','newProduct')}</button>
      </div>

      <div style={{ position:'relative', marginBottom:20, maxWidth:400 }}>
        <Search size={16} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}/>
        <input type="text" className="form-input" placeholder={t('products','search')} value={search}
          onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:36 }}/>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {filtered.map(p => (
          <div key={p.id} className="card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontWeight:700 }}>{p.nom}</span>
                  {p.has_variants && <span style={{ fontSize:10, background:'var(--accent-dim)', color:'var(--accent)', padding:'2px 6px', borderRadius:4 }}>{t('products','variants').toUpperCase()}</span>}
                  {p.stock_cartons <= p.stock_alerte && <AlertTriangle size={14} color="var(--danger)"/>}
                </div>
                <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                  {p.categorie} · {p.unites_par_carton} {t('products','unitsPerBox')} · {t('products','stock')}: {roundStock(p.stock_cartons)} cx
                </div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontFamily:'monospace', color:'var(--accent)', fontWeight:700 }}>{(p.prix_carton||0).toLocaleString('fr-FR')} {currency}</span>
                {p.has_variants && (
                  <button onClick={() => toggleExpand(p.id)} className="btn btn-icon btn-secondary">
                    {expandedProduct===p.id ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                  </button>
                )}
                <button onClick={() => openEdit(p)} className="btn btn-icon btn-secondary"><Edit2 size={14}/></button>
                <button onClick={() => handleDelete(p.id, p.nom)} className="btn btn-icon btn-danger"><Trash2 size={14}/></button>
              </div>
            </div>

            {expandedProduct === p.id && productVariants[p.id] && (
              <div style={{ borderTop:'1px solid var(--border)', background:'var(--bg-hover)', padding:'10px 16px' }}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)', marginBottom:8 }}>{t('products','variants').toUpperCase()}:</div>
                {productVariants[p.id].map(v => (
                  <div key={v.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                    <span style={{ fontWeight:500 }}>{v.nom}</span>
                    <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                      <span style={{ color:'var(--text-muted)', fontSize:11 }}>{t('products','stock')}: {roundStock(v.stock_cartons)} cx</span>
                      <span style={{ fontFamily:'monospace', color:'var(--accent)' }}>{(v.prix_carton||p.prix_carton).toLocaleString('fr-FR')} {currency}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-muted)' }}>
            <Package size={32} style={{ opacity:0.3, marginBottom:8 }}/><br/>{t('products','noProducts')}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:600, maxHeight:'90vh', overflowY:'auto' }}>
            <div className="modal-header">
              <h2 className="modal-title">{editing ? t('products','editProductTitle') : t('products','newProductTitle')}</h2>
              <button onClick={() => setShowModal(false)} className="btn btn-icon btn-secondary"><X size={16}/></button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">{t('products','productName')}</label>
                  <input type="text" className="form-input" value={form.nom}
                    onChange={e=>f('nom',e.target.value)} placeholder={t('products','productNamePlaceholder')}/>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('products','categoryLabel')}</label>
                  <input type="text" className="form-input" value={form.categorie}
                    onChange={e=>f('categorie',e.target.value)} placeholder={t('products','categoryPlaceholder')}/>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('products','unitsPerBoxLabel')}</label>
                  <input type="number" className="form-input" value={form.unites_par_carton}
                    onChange={e=>f('unites_par_carton',e.target.value)} min="1"/>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('products','boxPriceLabel')} ({currency})</label>
                  <input type="number" className="form-input" value={form.prix_carton}
                    onChange={e=>f('prix_carton',e.target.value)} placeholder="0"/>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('products','costLabel')} ({currency})</label>
                  <input type="number" className="form-input" value={form.cout_carton}
                    onChange={e=>f('cout_carton',e.target.value)} placeholder="0"/>
                </div>

                {/* Prix demi */}
                <div className="form-group">
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                    <label className="form-label">{t('products','halfPriceLabel')} ({currency})</label>
                    <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, cursor:'pointer' }}>
                      <input type="checkbox" checked={form.prix_demi_manual} onChange={e=>f('prix_demi_manual',e.target.checked)}/>
                      {t('products','manualPrice')}
                    </label>
                  </div>
                  <input type="number" className="form-input"
                    value={form.prix_demi_manual ? form.prix_demi : autoDemi}
                    onChange={e=>f('prix_demi',e.target.value)}
                    disabled={!form.prix_demi_manual}
                    style={{ opacity:form.prix_demi_manual?1:0.5 }}/>
                </div>

                {/* Prix unite */}
                <div className="form-group">
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                    <label className="form-label">{t('products','unitPriceLabel')} ({currency})</label>
                    <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, cursor:'pointer' }}>
                      <input type="checkbox" checked={form.prix_unite_manual} onChange={e=>f('prix_unite_manual',e.target.checked)}/>
                      {t('products','manualPrice')}
                    </label>
                  </div>
                  <input type="number" className="form-input"
                    value={form.prix_unite_manual ? form.prix_unite : autoUnite}
                    onChange={e=>f('prix_unite',e.target.value)}
                    disabled={!form.prix_unite_manual}
                    style={{ opacity:form.prix_unite_manual?1:0.5 }}/>
                </div>

                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">{t('products','stockLabel')}</label>
                  <input type="number" className="form-input" value={form.stock_cartons}
                    onChange={e=>f('stock_cartons',e.target.value)} min="0" step="0.5"/>
                </div>
              </div>

              {/* Variants toggle */}
              <div style={{ background:'var(--bg-hover)', borderRadius:10, padding:14 }}>
                <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontWeight:600 }}>
                  <input type="checkbox" checked={form.has_variants} onChange={e=>f('has_variants',e.target.checked)}/>
                  {t('products','hasVariants')}
                </label>
                <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:4, marginLeft:24 }}>
                  {t('products','variantsExample')}
                </p>
              </div>

              {/* Variants list */}
              {form.has_variants && (
                <div style={{ border:'1px solid var(--border)', borderRadius:10, padding:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <span style={{ fontWeight:600, fontSize:14 }}>{t('products','variants')}</span>
                    <button onClick={addVariant} className="btn btn-sm btn-primary" style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <Plus size={12}/> {t('products','addVariant')}
                    </button>
                  </div>
                  {variants.length === 0 && (
                    <p style={{ fontSize:13, color:'var(--text-muted)', textAlign:'center', padding:'10px 0' }}>
                      {t('products','addVariant')}
                    </p>
                  )}
                  {variants.map((v, idx) => (
                    <div key={v.id||v._tempId} style={{ background:'var(--bg-secondary)', borderRadius:8, padding:12, marginBottom:8 }}>
                      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr auto', gap:8, alignItems:'end' }}>
                        <div className="form-group">
                          <label className="form-label">{t('products','variantName')} *</label>
                          <input type="text" className="form-input" value={v.nom}
                            onChange={e=>updateVariant(idx,'nom',e.target.value)}
                            placeholder={t('products','variantNamePlaceholder')}/>
                        </div>
                        <div className="form-group">
                          <label className="form-label">{t('products','variantStock')}</label>
                          <input type="number" className="form-input" value={v.stock_cartons}
                            onChange={e=>updateVariant(idx,'stock_cartons',e.target.value)} min="0" step="0.5"/>
                        </div>
                        <div className="form-group">
                          <label className="form-label">{t('products','boxPrice')}</label>
                          <input type="number" className="form-input" value={v.prix_carton}
                            onChange={e=>updateVariant(idx,'prix_carton',e.target.value)}
                            placeholder={form.prix_carton||'='}/>
                        </div>
                        <div className="form-group">
                          <label className="form-label">{t('products','unitPrice')}</label>
                          <input type="number" className="form-input" value={v.prix_unite}
                            onChange={e=>updateVariant(idx,'prix_unite',e.target.value)}
                            placeholder={autoUnite||'='}/>
                        </div>
                        <button onClick={()=>removeVariant(idx)} className="btn btn-icon btn-danger" style={{ marginBottom:2 }}>
                          <X size={14}/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Price preview */}
              {form.prix_carton > 0 && (
                <div style={{ background:'var(--bg-hover)', borderRadius:10, padding:14, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                  {[
                    { label: t('cashier','box'),  value: Number(form.prix_carton).toLocaleString('fr-FR') },
                    { label: t('cashier','half'), value: (form.prix_demi_manual&&form.prix_demi?Number(form.prix_demi):Number(autoDemi)).toLocaleString('fr-FR') },
                    { label: t('cashier','unit'), value: (form.prix_unite_manual&&form.prix_unite?Number(form.prix_unite):Number(autoUnite)).toLocaleString('fr-FR') },
                  ].map(({label,value}) => (
                    <div key={label} style={{ textAlign:'center' }}>
                      <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>{label}</div>
                      <div style={{ fontFamily:'monospace', fontWeight:700, color:'var(--accent)' }}>{value} {currency}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display:'flex', gap:10 }}>
                <button onClick={()=>setShowModal(false)} className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}>{t('products','cancel')}</button>
                <button onClick={handleSave} className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} disabled={loading}>
                  {loading ? t('products','saving') : t('products','save')}
                </button>
              </div>
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
