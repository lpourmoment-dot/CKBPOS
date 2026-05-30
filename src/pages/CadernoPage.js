import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../App';
import { useLang } from '../utils/useLang';
import { useAlert, useConfirm } from '../components/AlertModal';

// ── Traductions embarquées directement (indépendant de translations.js) ──
const CADERNO_T = {
  'pt-BR': {
    title:'Caderno de Caixa', clearHistory:'Limpar histórico', printDay:'Imprimir dia',
    today:'Hoje', yesterday:'Ontem',
    nameLabel:'Nome', namePlaceholder:'Ex: Cristo, Elisa…',
    motivoLabel:'Motivo', motivoSelect:'— Selecionar —',
    dinheiroLabel:'Dinheiro', notaLabel:'Nota (opcional)', notaPlaceholder:'Observação…',
    addBtn:'+ Adicionar', calcHint:'Dinheiro aceita cálculos:',
    dirIn:'▲ Entra', dirOut:'▼ Sai', dirLost:'⚠ Perde',
    debts:'Dívidas', dayTotal:'Total do dia',
    colName:'Nome', colMotivo:'Motivo', colUser:'Utilizador',
    colDateHour:'Data / Hora', colNota:'Nota', colAmount:'Dinheiro', colDebit:'Débito',
    loading:'Carregando…', noEntries:'📓 Nenhum registo para este dia',
    paid:'✓ Pago', pending:'⏳ Pendente',
    clearTitle:'🗑 Limpar Histórico', clearToday:'Limpar dia de hoje',
    clearWeek:'Limpar esta semana', clearAll:'Limpar todo o histórico',
    clearWeekSub:'Remove os registos dos últimos 7 dias',
    clearAllSub:'Remove todos os registos permanentemente',
    cancel:'Cancelar', alertFillName:'Preencha o nome',
    alertSelMotivo:'Selecione um motivo', confirmDelete:'Remover este registo?',
    confirmPago:'Marcar como pago?',
    confirmClear:'Tem a certeza? Esta ação não pode ser desfeita.',
    flowHint:'Nome → ↑↓ Motivo → Valor → Nota → Enter',
  },
  'fr': {
    title:'Caderno de Caixa', clearHistory:'Effacer historique', printDay:'Imprimer le jour',
    title:'Cahier de Caisse', clearHistory:'Effacer historique', printDay:'Imprimer le jour',
    nameLabel:'Nom', namePlaceholder:'Ex: Pierre, Marie…',
    motivoLabel:'Motif', motivoSelect:'— Sélectionner —',
    dinheiroLabel:'Montant', notaLabel:'Note (optionnel)', notaPlaceholder:'Observation…',
    addBtn:'+ Ajouter', calcHint:'Montant accepte des calculs:',
    dirIn:'▲ Rentre', dirOut:'▼ Sort', dirLost:'⚠ Perd',
    debts:'Dettes', dayTotal:'Total du jour',
    colName:'Nom', colMotivo:'Motif', colUser:'Utilisateur',
    colDateHour:'Date / Heure', colNota:'Note', colAmount:'Montant', colDebit:'Débit',
    loading:'Chargement…', noEntries:'📓 Aucune saisie pour ce jour',
    paid:'✓ Payé', pending:'⏳ En attente',
    clearTitle:'🗑 Effacer Historique', clearToday:"Effacer aujourd'hui",
    clearWeek:'Effacer cette semaine', clearAll:'Effacer tout',
    clearWeekSub:'Supprime les 7 derniers jours',
    clearAllSub:'Supprime tout définitivement',
    cancel:'Annuler', alertFillName:'Saisissez le nom',
    alertSelMotivo:'Sélectionnez un motif', confirmDelete:'Supprimer cette saisie?',
    confirmPago:'Marquer comme payé?',
    confirmClear:'Êtes-vous sûr? Cette action est irréversible.',
    flowHint:'Nom → ↑↓ Motif → Valeur → Note → Entrée',
  },
  'en': {
    title:'Caderno de Caixa', clearHistory:'Clear history', printDay:'Print day',
    title:'Cash Journal', clearHistory:'Clear history', printDay:'Print day',
    nameLabel:'Name', namePlaceholder:'Ex: John, Mary…',
    motivoLabel:'Reason', motivoSelect:'— Select —',
    dinheiroLabel:'Amount', notaLabel:'Note (optional)', notaPlaceholder:'Observation…',
    addBtn:'+ Add', calcHint:'Amount accepts calculations:',
    dirIn:'▲ In', dirOut:'▼ Out', dirLost:'⚠ Lost',
    debts:'Debts', dayTotal:'Day total',
    colName:'Name', colMotivo:'Reason', colUser:'User',
    colDateHour:'Date / Time', colNota:'Note', colAmount:'Amount', colDebit:'Debit',
    loading:'Loading…', noEntries:'📓 No entries for this day',
    paid:'✓ Paid', pending:'⏳ Pending',
    clearTitle:'🗑 Clear History', clearToday:'Clear today',
    clearWeek:'Clear this week', clearAll:'Clear all history',
    clearWeekSub:'Removes last 7 days', clearAllSub:'Removes all permanently',
    cancel:'Cancel', alertFillName:'Enter a name',
    alertSelMotivo:'Select a reason', confirmDelete:'Delete this entry?',
    confirmPago:'Mark as paid?',
    confirmClear:'Are you sure? This cannot be undone.',
    flowHint:'Name → ↑↓ Reason → Value → Note → Enter',
  },
};

// ── Locale pour les dates ──
const LOCALE_MAP = { 'pt-BR':'pt-BR', 'fr':'fr-FR', 'en':'en-GB' };

// ── Directions par motivo ──
const DIRECTION_SIGN = { entree: '+', sortie: '-', perte: '-' };

// ── Calculer un montant depuis une expression (ex: 1000+500) ──
function calcMontant(str) {
  try {
    const clean = String(str).replace(/[^0-9+\-*/.]/g, '');
    if (!clean) return 0;
    return Math.max(0, Function('"use strict";return(' + clean + ')')());
  } catch { return 0; }
}

function fmt(n) {
  return Math.round(n || 0).toLocaleString('fr-FR');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function CadernoPage() {
  const { user } = useAuth();
  const { lang, fmt: fmtCurrency } = useLang();
  const isAdmin = user?.role === 'admin';
  const { showAlert, AlertModalComponent } = useAlert();
  const { showConfirm, ConfirmModalComponent } = useConfirm();

  // Traduction locale — utilise CADERNO_T directement
  const tc = useCallback((key) => {
    return CADERNO_T[lang]?.[key] || CADERNO_T['pt-BR']?.[key] || key;
  }, [lang]);

  // Locale pour les dates
  const locale = LOCALE_MAP[lang] || 'pt-BR';

  // ── États ────────────────────────────────────────────────
  const [shopName, setShopName]         = useState('CKBPOS');
  const [motivos, setMotivos]       = useState([]);
  const [trabalhadores, setTrab]    = useState([]);
  const [produtos, setProdutos]     = useState([]);
  const [entries, setEntries]       = useState([]);
  const [days, setDays]             = useState([]);
  const [selectedDay, setSelectedDay] = useState(todayISO());
  const [loading, setLoading]       = useState(false);

  // Formulaire saisie
  const [fNom, setFNom]             = useState('');
  const [fMotivo, setFMotivo]       = useState(null);
  const [fValor, setFValor]         = useState('');
  const [fNota, setFNota]           = useState('');
  const [fPrix, setFPrix]           = useState('');  // prix unitaire du produit
  const [fQtd, setFQtd]             = useState('');   // quantité
  const [isProdutoSel, setIsProdutoSel] = useState(false); // produit caderno sélectionné

  // Autocomplete
  const [suggestions, setSuggestions] = useState([]);
  const [suggIdx, setSuggIdx]         = useState(-1);
  const [showSugg, setShowSugg]       = useState(false);

  // Navigation motivo dropdown
  const [showMotivoDrop, setShowMotivoDrop] = useState(false);
  const [motivoIdx, setMotivoIdx]           = useState(0);

  // Focus zone
  const [focusZone, setFocusZone] = useState('nom');

  // Modal
  const [showLimpar, setShowLimpar] = useState(false);

  // Refs
  const nomRef   = useRef(null);
  const valorRef = useRef(null);
  const notaRef  = useRef(null);

  // ── Chargement initial ───────────────────────────────────
  useEffect(() => {
    // Charger le nom de la boutique pour l'impression
    window.electron.dbGet("SELECT value FROM settings WHERE key='shop_name'")
      .then(r => { if (r.data?.value) setShopName(r.data.value); })
      .catch(() => {});
    loadMotivos();
    loadTrabalhadores();
    loadProdutos();
    loadDays();
  }, []);

  useEffect(() => { loadEntries(); }, [selectedDay]);

  const loadMotivos = async () => {
    const r = await window.electron.cadernoMotivosList();
    if (r.success) setMotivos(r.data || []);
  };

  const loadTrabalhadores = async () => {
    const r = await window.electron.cadernoTrabalhList();
    if (r.success) setTrab(r.data || []);
  };

  const loadProdutos = async () => {
    const r = await window.electron.cadernoProdutosList();
    if (r.success) setProdutos(r.data || []);
  };

  const loadDays = async () => {
    const r = await window.electron.cadernoDaysList({ user_id: user.id, is_admin: isAdmin });
    if (r.success) {
      const today = todayISO();
      const list = r.data || [];
      if (!list.find(d => d.date_jour === today)) list.unshift({ date_jour: today });
      setDays(list.slice(0, 7));
    }
  };

  const loadEntries = async () => {
    setLoading(true);
    const r = await window.electron.cadernoEntriesList({
      date_jour: selectedDay, user_id: user.id, is_admin: isAdmin
    });
    if (r.success) setEntries(r.data || []);
    setLoading(false);
  };

  // ── Totaux ───────────────────────────────────────────────
  const totaux = entries.reduce((acc, e) => {
    if (e.direction === 'entree') {
      acc.entree += e.montant;
    } else {
      acc.sortie += e.montant;
      if (e.est_dette && e.statut_dette !== 'pago') acc.dette += e.montant;
    }
    return acc;
  }, { entree: 0, sortie: 0, dette: 0 });
  const totalNet = totaux.entree - totaux.sortie;

  // ── Autocomplete ─────────────────────────────────────────
  const getSuggestions = useCallback((val) => {
    if (!val || val.length < 1) return [];
    const v = val.toLowerCase();
    // Si motivo sélectionné: filtrer selon direction
    if (fMotivo) {
      const isProduto = fMotivo.direction === 'entree';
      const source = isProduto ? produtos : trabalhadores;
      return source.filter(s => s.nom.toLowerCase().startsWith(v)).slice(0, 6);
    }
    // Pas de motivo: chercher dans les deux listes
    const fromTrab = trabalhadores.filter(s => s.nom.toLowerCase().startsWith(v));
    const fromProd = produtos.filter(s => s.nom.toLowerCase().startsWith(v));
    // Combiner, marquer la source pour affichage
    return [
      ...fromTrab.map(s => ({ ...s, _src: 'trab' })),
      ...fromProd.map(s => ({ ...s, _src: 'prod' })),
    ].slice(0, 8);
  }, [fMotivo, trabalhadores, produtos]);

  const handleNomChange = (val) => {
    setFNom(val);
    // Vérifier si le texte correspond exactement à un produit enregistré
    const exactProd = produtos.find(p => p.nom.toUpperCase() === val.toUpperCase());
    if (exactProd) {
      setIsProdutoSel(true);
      if (exactProd.prix) setFPrix(String(exactProd.prix));
    } else {
      setIsProdutoSel(false);
      setFPrix('');
    }
    const sugg = getSuggestions(val);
    setSuggestions(sugg);
    setSuggIdx(-1);
    setShowSugg(sugg.length > 0);
  };

  // ── Flux clavier rapide ──────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const modalOpen = document.querySelector('.modal-overlay');
      if (modalOpen) return;

      if (focusZone === 'nom') {
        if (e.key === 'ArrowDown' && showSugg) { e.preventDefault(); setSuggIdx(p => Math.min(p+1, suggestions.length-1)); return; }
        if (e.key === 'ArrowUp' && showSugg)   { e.preventDefault(); setSuggIdx(p => Math.max(p-1, 0)); return; }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (showSugg && suggIdx >= 0) { setFNom(suggestions[suggIdx].nom); setShowSugg(false); }
          setFocusZone('motivo'); setShowMotivoDrop(true); setMotivoIdx(0); return;
        }
        if (e.key === 'Escape') { setShowSugg(false); return; }
      }

      if (focusZone === 'motivo' && showMotivoDrop) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setMotivoIdx(p => Math.min(p+1, motivos.length-1)); return; }
        if (e.key === 'ArrowUp')   { e.preventDefault(); setMotivoIdx(p => Math.max(p-1, 0)); return; }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (motivos[motivoIdx]) { setFMotivo(motivos[motivoIdx]); setShowMotivoDrop(false); setFocusZone('valor'); setTimeout(()=>valorRef.current?.focus(),50); }
          return;
        }
        if (e.key === 'Escape') { setShowMotivoDrop(false); setFocusZone('nom'); nomRef.current?.focus(); return; }
      }

      if (focusZone === 'valor' && e.key === 'Enter') { e.preventDefault(); setFocusZone('nota'); setTimeout(()=>notaRef.current?.focus(),50); return; }
      if (focusZone === 'nota'  && e.key === 'Enter') { e.preventDefault(); handleAdd(); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusZone, showSugg, suggIdx, suggestions, showMotivoDrop, motivoIdx, motivos, fNom, fMotivo, fValor, fNota]);

  // ── Ajouter une entrée ───────────────────────────────────
  const handleAdd = async () => {
    if (!fNom.trim()) { showAlert('', tc('alertFillName'), 'warning'); nomRef.current?.focus(); return; }
    if (!fMotivo)     { showAlert('', tc('alertSelMotivo'), 'warning'); setFocusZone('motivo'); setShowMotivoDrop(true); return; }

    // Si produit avec prix+quantité: calculer automatiquement
    const montant = (isProdutoSel && fPrix && fQtd)
      ? Math.round(parseFloat(fPrix) * parseFloat(fQtd))
      : calcMontant(fValor);
    const entry = {
      nom: fNom.trim().toUpperCase(), motivo: fMotivo.label, montant,
      montant_raw: (isProdutoSel && fPrix && fQtd) ? `${fQtd} x ${fPrix}` : (fValor || String(montant)), note: fNota.trim(),
      direction: fMotivo.direction, est_dette: fMotivo.est_dette ? 1 : 0,
      user_id: user.id, machine_id: 'LOCAL', date_jour: selectedDay,
    };

    const r = await window.electron.cadernoEntriesAdd(entry);
    if (r.success) {
      setFNom(''); setFMotivo(null); setFValor(''); setFNota(''); setFPrix(''); setFQtd(''); setIsProdutoSel(false);
      setFocusZone('nom'); setShowSugg(false);
      loadEntries(); loadDays();
      setTimeout(() => nomRef.current?.focus(), 50);
    } else {
      showAlert('Erro', r.error, 'error');
    }
  };

  // ── Supprimer ────────────────────────────────────────────
  const handleDelete = async (id) => {
    const ok = await showConfirm('', tc('confirmDelete'), 'warning');
    if (!ok) return;
    await window.electron.cadernoEntriesDelete(id);
    loadEntries(); loadDays();
  };

  // ── Marquer pago ─────────────────────────────────────────
  const handlePago = async (id) => {
    const ok = await showConfirm('', tc('confirmPago'), 'warning');
    if (!ok) return;
    await window.electron.cadernoEntriesPago(id);
    loadEntries();
  };

  // ── Limpar histórico ─────────────────────────────────────
  const handleLimpar = async (mode) => {
    const ok = await showConfirm('', tc('confirmClear'), 'warning');
    if (!ok) return;
    await window.electron.cadernoEntriesClear({ mode, date_jour: selectedDay, user_id: user.id, is_admin: isAdmin });
    setShowLimpar(false); loadEntries(); loadDays();
  };

  // ── Imprimer le jour ─────────────────────────────────────
  const handlePrintCaderno = async () => {
    const r = await window.electron.printCaderno({
      shopName,
      entries,
      date_jour: selectedDay,
      currency: 'Kz',
      printedAt: new Date().toLocaleString(locale),
    });
    if (r && !r.success && r.error) {
      showAlert('Erro ao imprimir', r.error, 'error');
    }
  };

  // ── Formater la date des onglets ─────────────────────────
  const fmtTabDate = (iso) => {
    const today = todayISO();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
    const yestISO = yesterday.toISOString().slice(0,10);
    if (iso === today)    return tc('today');
    if (iso === yestISO)  return tc('yesterday');
    return new Date(iso+'T12:00:00').toLocaleDateString(locale, { day:'2-digit', month:'2-digit' });
  };

  // ── Couleur direction ────────────────────────────────────
  const dirColor = { entree:'var(--success)', sortie:'var(--danger)', perte:'var(--warning)' };

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{ padding:24, height:'100%', overflowY:'auto', display:'flex', flexDirection:'column', gap:16 }}>

      {/* HEADER */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <h1 style={{ fontSize:21, fontWeight:700, display:'flex', alignItems:'center', gap:8 }}>
            {tc('title')}
          </h1>
          <p style={{ color:'var(--text-secondary)', fontSize:12, marginTop:3 }}>
            {new Date().toLocaleDateString(locale, { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setShowLimpar(true)}
            style={{ background:'rgba(224,82,82,0.08)', color:'var(--danger)', border:'1px solid transparent', borderRadius:8, padding:'8px 14px', cursor:'pointer', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}>
            {tc('clearHistory')}
          </button>
          <button onClick={handlePrintCaderno}
            style={{ background:'var(--bg-card)', color:'var(--text)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 14px', cursor:'pointer', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}>
            \uD83D\uDDA8 {tc('printDay')}
          </button>
        </div>
      </div>

      {/* DATE TABS */}
      <div style={{ display:'flex', gap:5, flexShrink:0, flexWrap:'wrap' }}>
        {days.map(d => (
          <button key={d.date_jour} onClick={() => setSelectedDay(d.date_jour)}
            style={{ padding:'5px 13px', borderRadius:20,
              border: d.date_jour===selectedDay ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: d.date_jour===selectedDay ? 'rgba(232,197,71,0.15)' : 'none',
              color: d.date_jour===selectedDay ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: d.date_jour===selectedDay ? 600 : 400,
              fontSize:12, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}>
            {fmtTabDate(d.date_jour)}
          </button>
        ))}
      </div>

      {/* FORMULAIRE SAISIE */}
      <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px', flexShrink:0 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1.4fr 160px 1fr auto', gap:8, alignItems:'end' }}>

          {/* NOM */}
          <div style={{ position:'relative' }}>
            <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.7px', fontWeight:600, marginBottom:5 }}>{tc('nameLabel')}</div>
            <input ref={nomRef} value={fNom}
              onChange={e => handleNomChange(e.target.value)}
              onFocus={() => { setFocusZone('nom'); handleNomChange(fNom); }}
              placeholder={tc('namePlaceholder')}
              style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 11px', color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none', width:'100%' }}/>
            {showSugg && suggestions.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, zIndex:50, marginTop:4, overflow:'hidden', boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}>
                {suggestions.map((s,i) => (
                  <div key={s.id || s.nom} onMouseDown={() => {
                    setFNom(s.nom);
                    setShowSugg(false);
                    // Si c'est un produit, activer le mode prix+quantité
                    if (s._src === 'prod' || produtos.find(p => p.nom.toUpperCase() === s.nom.toUpperCase())) {
                      setIsProdutoSel(true);
                      const prod = produtos.find(p => p.nom.toUpperCase() === s.nom.toUpperCase());
                      if (prod?.prix) setFPrix(String(prod.prix));
                      // Auto-sélectionner motivo entree
                      if (!fMotivo) {
                        const m = motivos.find(m2 => m2.direction === 'entree');
                        if (m) setFMotivo(m);
                      }
                    }
                    setFocusZone('motivo'); setShowMotivoDrop(true);
                  }}
                    style={{ padding:'9px 12px', cursor:'pointer', fontSize:13, fontWeight:i===suggIdx?600:400,
                      background:i===suggIdx?'var(--accent-dim)':'transparent',
                      color:i===suggIdx?'var(--accent)':'var(--text)', borderBottom:'1px solid var(--border)',
                      display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span>{s.nom}</span>
                    {s._src && <span style={{ fontSize:10, color:'var(--text-muted)', background:'var(--bg-hover)', borderRadius:4, padding:'1px 6px' }}>{s._src === 'prod' ? '📦' : '👤'}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MOTIVO */}
          <div style={{ position:'relative' }}>
            <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.7px', fontWeight:600, marginBottom:5 }}>{tc('motivoLabel')}</div>
            <div onClick={() => { setFocusZone('motivo'); setShowMotivoDrop(true); setMotivoIdx(0); }}
              style={{ background:'var(--bg)', border:`1px solid ${focusZone==='motivo'?'var(--accent)':'var(--border)'}`, borderRadius:8, padding:'9px 11px', cursor:'pointer', fontSize:13,
                color:fMotivo?'var(--text)':'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'space-between', userSelect:'none' }}>
              <span>{fMotivo ? `${fMotivo.icone} ${fMotivo.label}` : tc('motivoSelect')}</span>
              <span style={{ color:'var(--text-muted)', fontSize:10 }}>▼</span>
            </div>
            {showMotivoDrop && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, zIndex:50, marginTop:4, overflow:'hidden', boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}>
                {motivos.filter(m => isAdmin || m.role==='Geral').map((m,i) => (
                  <div key={m.id} onMouseDown={() => { setFMotivo(m); setShowMotivoDrop(false); setFocusZone('valor'); setTimeout(()=>valorRef.current?.focus(),50); }}
                    style={{ padding:'10px 12px', cursor:'pointer', fontSize:13,
                      background:i===motivoIdx?'var(--accent-dim)':'transparent',
                      color:i===motivoIdx?'var(--accent)':'var(--text)',
                      borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
                    <span>{m.icone}</span>
                    <span style={{ flex:1 }}>{m.label}</span>
                    <span style={{ fontSize:10, color:dirColor[m.direction] }}>
                      {m.direction==='entree' ? tc('dirIn') : m.direction==='sortie' ? tc('dirOut') : tc('dirLost')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* DINHEIRO / PRIX + QTÉ */}
          {isProdutoSel ? (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              <div>
                <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.7px', fontWeight:600, marginBottom:5 }}>PRIX Kz</div>
                <div style={{ position:'relative' }}>
                  <input value={fPrix} onChange={e => setFPrix(e.target.value)}
                    onFocus={() => setFocusZone('valor')} placeholder="0"
                    style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 30px 9px 11px', color:'var(--text)', fontSize:13, fontFamily:'monospace', fontWeight:600, outline:'none', width:'100%' }}/>
                  <span style={{ position:'absolute', right:9, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', fontSize:10, pointerEvents:'none' }}>Kz</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.7px', fontWeight:600, marginBottom:5 }}>QTÉ</div>
                <div style={{ position:'relative' }}>
                  <input ref={valorRef} value={fQtd} onChange={e => setFQtd(e.target.value)}
                    onFocus={() => setFocusZone('valor')} placeholder="1"
                    style={{ background:'var(--bg)', border:'1px solid var(--accent)', borderRadius:8, padding:'9px 11px', color:'var(--accent)', fontSize:13, fontFamily:'monospace', fontWeight:700, outline:'none', width:'100%' }}/>
                </div>
                {fPrix && fQtd && <div style={{ fontSize:10, color:'var(--success)', marginTop:3, fontFamily:'monospace' }}>= {Math.round(parseFloat(fPrix||0)*parseFloat(fQtd||0)).toLocaleString('fr-FR')} Kz</div>}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.7px', fontWeight:600, marginBottom:5 }}>{tc('dinheiroLabel')}</div>
              <div style={{ position:'relative' }}>
                <input ref={valorRef} value={fValor} onChange={e => setFValor(e.target.value)}
                  onFocus={() => setFocusZone('valor')}
                  placeholder="0 ou 1000+500"
                  style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 30px 9px 11px', color:'var(--text)', fontSize:13, fontFamily:'monospace', fontWeight:600, outline:'none', width:'100%' }}/>
                <span style={{ position:'absolute', right:9, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', fontSize:10, pointerEvents:'none' }}>Kz</span>
              </div>
            </div>
          )}

          {/* NOTA */}
          <div>
            <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.7px', fontWeight:600, marginBottom:5 }}>{tc('notaLabel')}</div>
            <input ref={notaRef} value={fNota} onChange={e => setFNota(e.target.value)}
              onFocus={() => setFocusZone('nota')}
              placeholder={tc('notaPlaceholder')}
              style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 11px', color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none', width:'100%' }}/>
          </div>

          {/* BOUTON AJOUTER */}
          <div>
            <div style={{ fontSize:10, marginBottom:5 }}>&nbsp;</div>
            <button onClick={handleAdd}
              style={{ background:'var(--accent)', color:'#000', border:'none', borderRadius:8, padding:'9px 16px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }}>
              {tc('addBtn')}
            </button>
          </div>
        </div>

        {/* Hints */}
        <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:11, color:'var(--text-muted)' }}>{tc('calcHint')}</span>
          {['1000+500','2000-300','500*3'].map(h => (
            <span key={h} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:20, padding:'2px 10px', fontSize:11, color:'var(--text-muted)', fontFamily:'monospace' }}>{h}</span>
          ))}
          <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:8 }}>· <strong style={{color:'var(--accent)'}}>{tc('flowHint')}</strong></span>
        </div>
      </div>

      {/* TOTAUX */}
      <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0, flexWrap:'wrap' }}>
        <div style={{ flex:1 }}/>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{tc('debts')}</div>
            <div style={{ fontFamily:'monospace', fontSize:13, fontWeight:700, color:'var(--danger)' }}>− {fmt(totaux.dette)} Kz</div>
          </div>
          <div style={{ width:1, height:30, background:'var(--border)' }}/>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px' }}>TOTAL +</div>
            <div style={{ fontFamily:'monospace', fontSize:15, fontWeight:700, color:'var(--success)' }}>+ {fmt(totaux.entree)} Kz</div>
          </div>
          <div style={{ width:1, height:30, background:'var(--border)' }}/>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px' }}>TOTAL −</div>
            <div style={{ fontFamily:'monospace', fontSize:15, fontWeight:700, color:'var(--danger)' }}>− {fmt(totaux.sortie)} Kz</div>
          </div>
          <div style={{ width:1, height:30, background:'var(--border)' }}/>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{tc('dayTotal')}</div>
            <div style={{ fontFamily:'monospace', fontSize:15, fontWeight:700, color:totalNet>=0?'var(--accent)':'var(--danger)' }}>
              {totalNet>=0?'+':''}{fmt(totalNet)} Kz
            </div>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div style={{ flex:1, border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:0 }}>
        <div style={{ flex:1, overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead style={{ position:'sticky', top:0, zIndex:10, background:'#0f0f0f' }}>
              <tr>
                {['#',tc('colName'),tc('colMotivo'),tc('colUser'),tc('colDateHour'),tc('colNota'),tc('colAmount'),tc('colDebit'),''].map((h,i) => (
                  <th key={i} style={{ padding:'10px 14px', textAlign:i>=6?'right':'left', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.8px', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap', ...(i===8?{width:80,textAlign:'center'}:{}) }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>{tc('loading')}</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:50, color:'var(--text-muted)', fontSize:14 }}>
                  {tc('noEntries')}
                </td></tr>
              ) : entries.map((e,i) => {
                const rowBg = e.est_dette ? 'rgba(224,82,82,0.04)' : 'transparent';
                return (
                  <tr key={e.id} style={{ borderBottom:'1px solid var(--border)', background:rowBg, transition:'background 0.1s' }}
                    onMouseEnter={el => el.currentTarget.style.background = e.est_dette?'rgba(224,82,82,0.08)':'var(--bg-hover)'}
                    onMouseLeave={el => el.currentTarget.style.background = rowBg}>
                    <td style={{ padding:'11px 14px', fontFamily:'monospace', fontSize:11, color:'var(--text-muted)', textAlign:'right', width:36 }}>{i+1}</td>
                    <td style={{ padding:'11px 14px', fontWeight:600 }}>{e.nom}</td>
                    <td style={{ padding:'11px 14px' }}>
                      <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:600,
                        background:e.direction==='entree'?'rgba(76,175,125,0.12)':e.direction==='perte'?'rgba(245,158,11,0.12)':'rgba(224,82,82,0.12)',
                        color:e.direction==='entree'?'var(--success)':e.direction==='perte'?'var(--warning)':'var(--danger)',
                        border:`1px solid ${e.direction==='entree'?'rgba(76,175,125,0.2)':e.direction==='perte'?'rgba(245,158,11,0.2)':'rgba(224,82,82,0.2)'}` }}>
                        {e.motivo}
                      </span>
                    </td>
                    <td style={{ padding:'11px 14px' }}>
                      <span style={{ fontSize:11, color:'var(--text-muted)', background:'var(--bg-hover)', border:'1px solid var(--border)', borderRadius:4, padding:'2px 8px' }}>
                        {e.user_nom || '—'}
                      </span>
                    </td>
                    <td style={{ padding:'11px 14px', fontSize:12, color:'var(--text-secondary)', whiteSpace:'nowrap' }}>
                      {new Date(e.created_at).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})}
                      <span style={{ display:'block', fontSize:11, color:'var(--text-muted)' }}>{e.date_jour}</span>
                    </td>
                    <td style={{ padding:'11px 14px', fontSize:12, color:'var(--text-muted)', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {e.note || '—'}
                    </td>
                    <td style={{ padding:'11px 14px', fontFamily:'monospace', fontSize:14, fontWeight:700, textAlign:'right', whiteSpace:'nowrap',
                      color:e.direction==='entree'?'var(--success)':'var(--danger)' }}>
                      {e.direction==='entree'?'+':'−'} {fmt(e.montant)} Kz
                    </td>
                    <td style={{ padding:'11px 14px', textAlign:'right' }}>
                      {e.est_dette ? (
                        e.statut_dette==='pago'
                          ? <span style={{ fontSize:11, fontWeight:700, color:'var(--success)', background:'rgba(76,175,125,0.12)', border:'1px solid rgba(76,175,125,0.3)', borderRadius:20, padding:'2px 10px' }}>{tc('paid')}</span>
                          : <button onClick={() => handlePago(e.id)}
                              style={{ fontSize:11, fontWeight:700, color:'var(--danger)', background:'rgba(224,82,82,0.1)', border:'1px solid rgba(224,82,82,0.3)', borderRadius:20, padding:'3px 10px', cursor:'pointer', fontFamily:'inherit' }}>
                              {tc('pending')}
                            </button>
                      ) : <span style={{ color:'var(--text-muted)', fontSize:12 }}>—</span>}
                    </td>
                    <td style={{ padding:'11px 14px', textAlign:'center' }}>
                      <button onClick={() => handleDelete(e.id)}
                        style={{ background:'rgba(224,82,82,0.08)', color:'var(--danger)', border:'1px solid transparent', padding:'5px 9px', borderRadius:6, cursor:'pointer', fontSize:13, lineHeight:1 }}>
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL LIMPAR */}
      {showLimpar && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{tc('clearTitle')}</h2>
              <button onClick={() => setShowLimpar(false)} className="btn btn-icon btn-secondary" style={{ fontSize:16 }}>✕</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[
                { mode:'today', icon:'📅', title:tc('clearToday'), sub:`${tc('clearToday')} — ${fmtTabDate(selectedDay)}` },
                { mode:'week',  icon:'📆', title:tc('clearWeek'),  sub:tc('clearWeekSub') },
                { mode:'all',   icon:'⚠️', title:tc('clearAll'),   sub:tc('clearAllSub') },
              ].map(opt => (
                <div key={opt.mode} onClick={() => handleLimpar(opt.mode)}
                  style={{ display:'flex', alignItems:'center', gap:12, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:14, cursor:'pointer', transition:'all 0.15s' }}
                  onMouseEnter={el => { el.currentTarget.style.borderColor='var(--danger)'; el.currentTarget.style.background='rgba(224,82,82,0.06)'; }}
                  onMouseLeave={el => { el.currentTarget.style.borderColor='var(--border)'; el.currentTarget.style.background='var(--bg)'; }}>
                  <span style={{ fontSize:20 }}>{opt.icon}</span>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{opt.title}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{opt.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowLimpar(false)} className="btn btn-secondary" style={{ justifyContent:'center' }}>{tc('cancel')}</button>
          </div>
        </div>
      )}

      {AlertModalComponent}
      {ConfirmModalComponent}
    </div>
  );
}
