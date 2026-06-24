import React, { useState, useEffect } from 'react';
import { useAuth } from '../App';
import { useLang } from '../utils/useLang';
import { Printer, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const overlayVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit:    { opacity: 0, transition: { duration: 0.18 } },
};

const modalVariants = {
  initial: { opacity: 0, scale: 0.93, y: 24 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:    { opacity: 0, scale: 0.95, y: 12, transition: { duration: 0.18, ease: 'easeIn' } },
};

const rowVariants = {
  initial: { opacity: 0, x: -14 },
  animate: (i) => ({ opacity: 1, x: 0, transition: { delay: i * 0.055, duration: 0.2 } }),
};

const sectionVariants = {
  initial: { opacity: 0, y: 10 },
  animate: (i) => ({ opacity: 1, y: 0, transition: { delay: 0.1 + i * 0.07, duration: 0.22 } }),
};

export default function ShiftModal({ onConfirm, onCancel, isAdmin }) {
  const { user } = useAuth();
  const { currency, lang, t } = useLang();
  const intlLocale = lang === 'fr' ? 'fr-FR' : lang === 'en' ? 'en-US' : 'pt-BR';
  const [shiftData, setShiftData] = useState(null);
  const [argentEnMain, setArgentEnMain] = useState('');
  const [argentEnvoye, setArgentEnvoye] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [fundoCaixa, setFundoCaixa] = useState(0);

  useEffect(() => { loadShiftData(); }, []);

  const loadShiftData = async () => {
    const today = new Date().toISOString().slice(0, 10);

    const totalRes = await window.electron.dbGet(
      `SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count,
       COALESCE(SUM(montant_dinheiro),0) as total_dinheiro,
       COALESCE(SUM(montant_express),0) as total_express
       FROM ventes
       WHERE user_id=${user.id} AND statut!='annule'
       AND date(date_vente)=date('now')`
    );

    const itemsRes = await window.electron.dbQuery(
      `SELECT p.nom, SUM(vi.quantite) as qty, vi.type_vente, SUM(vi.sous_total) as subtotal
       FROM vente_items vi
       JOIN products p ON vi.product_id=p.id
       JOIN ventes v ON vi.vente_id=v.id
       WHERE v.user_id=${user.id} AND vi.statut='normal'
       AND v.statut!='annule' AND date(v.date_vente)=date('now')
       GROUP BY p.id, vi.type_vente ORDER BY subtotal DESC`, []
    );

    // Charger infos loja pour le rapport
    const shopNameRes = await window.electron.dbGet("SELECT value FROM settings WHERE key='shop_name'");
    const shopAddrRes = await window.electron.dbGet("SELECT value FROM settings WHERE key='shop_address'");
    const shopPhoneRes = await window.electron.dbGet("SELECT value FROM settings WHERE key='shop_phone'");
    const shopNifRes = await window.electron.dbGet("SELECT value FROM settings WHERE key='shop_nif'");
    // v3.6.0 — Fundo de caixa
    const fundoRes = await window.electron.dbGet("SELECT value FROM settings WHERE key='fundo_caixa_hoje'");
    const fundo = Number(fundoRes?.data?.value || 0);
    setFundoCaixa(fundo);

    setShiftData({
      total: totalRes.data?.total || 0,
      count: totalRes.data?.count || 0,
      totalDinheiro: totalRes.data?.total_dinheiro || 0,
      totalExpress: totalRes.data?.total_express || 0,
      items: itemsRes.data || [],
      date: new Date().toLocaleString(intlLocale),       // heure de fermeture (fin)
      dateDebut: new Date().toLocaleString(intlLocale),  // \u2705 heure d'ouverture du fecho (début)
      today: today,
      shopName: shopNameRes.data?.value || 'CKBPOS',
      shopAddress: shopAddrRes.data?.value || '',
      shopPhone: shopPhoneRes.data?.value || '',
      shopNif: shopNifRes.data?.value || '',
    });
  };

  const handlePrintAndLogout = async () => {
    if (!isAdmin && !argentEnMain && !argentEnvoye) {
      alert('Preencha pelo menos um valor!'); return;
    }
    setLoading(true);
    try {
      await window.electron.dbQuery(
        "INSERT INTO shifts (user_id,debut,fin,total_ventes,total_dinheiro,total_express,argent_en_main,argent_envoye,note,actif) VALUES (?,datetime('now'),datetime('now'),?,?,?,?,?,?,0)",
        [user.id, shiftData.total, shiftData.totalDinheiro, shiftData.totalExpress,
         Number(argentEnMain) || 0, Number(argentEnvoye) || 0, note]
      );

      await window.electron.printShiftReport({
        vendeur: user.nom,
        dateDebut: shiftData.dateDebut, // \u2705 heure réelle d'ouverture de session
        dateFin: shiftData.date,
        items: shiftData.items,
        totalVentes: shiftData.total,
        totalDinheiro: shiftData.totalDinheiro,
        totalExpress: shiftData.totalExpress,
        argentEnMain: Number(argentEnMain) || 0,
        argentEnvoye: Number(argentEnvoye) || 0,
        note,
        fundoCaixa,
        currency,
        shopName: shiftData.shopName,
        shopAddress: shiftData.shopAddress,
        shopPhone: shiftData.shopPhone,
        shopNif: shiftData.shopNif,
      });

      onConfirm();
    } catch (e) { alert('Erro: ' + e.message); }
    setLoading(false);
  };

  const diffMain    = (Number(argentEnMain)  || 0) - (shiftData?.totalDinheiro || 0);
  const diffExpress = (Number(argentEnvoye)  || 0) - (shiftData?.totalExpress  || 0);
  // v3.6.0 — Écart caisse (argent_en_main - fundo - total_dinheiro)
  const ecartCaixa  = (Number(argentEnMain) || 0) - fundoCaixa - (shiftData?.totalDinheiro || 0);

  // Loading state
  if (!shiftData) return (
    <motion.div
      className="modal-overlay"
      variants={overlayVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <motion.div
        className="modal"
        variants={modalVariants}
        initial="initial"
        animate="animate"
        style={{ textAlign: 'center', padding: 32 }}
      >
        {/* Spinner */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '3px solid var(--border)',
            borderTopColor: 'var(--accent)',
            margin: '0 auto 14px',
          }}
        />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('shift','loading')}</span>
      </motion.div>
    </motion.div>
  );

  // Group items by product for display
  const grouped = {};
  shiftData.items.forEach(i => {
    if (!grouped[i.nom]) grouped[i.nom] = { carton: 0, demi: 0, unite: 0, subtotal: 0 };
    grouped[i.nom][i.type_vente] += Math.round(i.qty * 100) / 100;
    grouped[i.nom].subtotal += i.subtotal;
  });

  return (
    <motion.div
      className="modal-overlay"
      variants={overlayVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <motion.div
        className="modal"
        variants={modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{ maxWidth: 540 }}
      >
        {/* Header */}
        <motion.div
          className="modal-header"
          custom={0}
          variants={sectionVariants}
          initial="initial"
          animate="animate"
        >
          <h2 className="modal-title">{'\u{1F4CA}'} Relatório do Dia</h2>
          {isAdmin && (
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.15 }}
              onClick={onConfirm}
              title="Sair sem relatório"
              className="btn btn-icon btn-secondary"
            >
              <X size={16} />
            </motion.button>
          )}
        </motion.div>

        {/* Meta */}
        <motion.div
          custom={0}
          variants={sectionVariants}
          initial="initial"
          animate="animate"
          style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}
        >
          <span>{t('shift','seller')} <strong style={{ color: 'var(--text-primary)' }}>{user.nom}</strong></span>
          <span>{'\u{1F4C5}'} {new Date().toLocaleDateString(intlLocale)}</span>
        </motion.div>

        {/* v3.6.0 — Fundo de Caixa */}
        {fundoCaixa > 0 && (
          <motion.div
            custom={0}
            variants={sectionVariants}
            initial="initial"
            animate="animate"
            style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, padding: '6px 10px', background: 'var(--bg-hover)', borderRadius: 8 }}
          >
            <span>{'\u{1F4B0}'} Fundo de Caixa (abertura)</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)' }}>{fundoCaixa.toLocaleString(intlLocale)} {currency}</span>
          </motion.div>
        )}

        {/* Total card */}
        <motion.div
          custom={1}
          variants={sectionVariants}
          initial="initial"
          animate="animate"
          style={{ background: 'var(--bg-hover)', borderRadius: 10, padding: 14, marginBottom: 12 }}
        >
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>TOTAL VENDAS HOJE</div>
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.3, type: 'spring', stiffness: 260, damping: 18 }}
              style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)', fontFamily: 'monospace' }}
            >
              {shiftData.total.toLocaleString(intlLocale)} {currency}
            </motion.div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{shiftData.count} transação(ões)</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: '\u{1F4B5} Dinheiro (sistema)', value: shiftData.totalDinheiro, color: 'var(--success)' },
              { label: '\u{1F4F1} App Express (sistema)', value: shiftData.totalExpress, color: 'var(--info)' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + i * 0.07, duration: 0.2 }}
                style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.label}</div>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, color: item.color }}>
                  {item.value.toLocaleString(intlLocale)} {currency}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Products list */}
        <motion.div
          custom={2}
          variants={sectionVariants}
          initial="initial"
          animate="animate"
          style={{ background: 'var(--bg-hover)', borderRadius: 10, padding: 12, marginBottom: 12, maxHeight: 150, overflowY: 'auto' }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>PRODUTOS VENDIDOS HOJE</div>
          {Object.keys(grouped).length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}
            >
              Nenhuma venda hoje
            </motion.div>
          ) : Object.entries(grouped).map(([nom, v], i) => {
            const parts = [];
            if (v.carton > 0) parts.push(`${Math.round(v.carton * 100) / 100} cx`);
            if (v.demi   > 0) parts.push(`${Math.round(v.demi   * 100) / 100} demi`);
            if (v.unite  > 0) parts.push(`${Math.round(v.unite  * 100) / 100} un`);
            return (
              <motion.div
                key={nom}
                custom={i}
                variants={rowVariants}
                initial="initial"
                animate="animate"
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid var(--border)' }}
              >
                <span><strong>{nom}</strong>: {parts.join(' + ')}</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{v.subtotal.toLocaleString(intlLocale)} {currency}</span>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Confirmation inputs */}
        <motion.div
          custom={3}
          variants={sectionVariants}
          initial="initial"
          animate="animate"
          style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12 }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
            {'\u2705'} CONFIRMAÇÃO DO VENDEDOR
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">{'\u{1F4B5}'} Dinheiro real em mãos ({currency})</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="number" className="form-input" value={argentEnMain}
                  onChange={e => setArgentEnMain(e.target.value)} placeholder="0"
                  style={{ fontFamily: 'monospace', flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setArgentEnMain(String(shiftData?.totalDinheiro || 0));
                    setArgentEnvoye(String(shiftData?.totalExpress || 0));
                  }}
                  style={{ padding: '0 14px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent-dim)', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}
                  title="Preencher Dinheiro + Express com valores exatos do sistema"
                >
                  Exato
                </button>
              </div>
              <AnimatePresence>
                {argentEnMain && (
                  <motion.span
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    style={{ fontSize: 10, color: diffMain >= 0 ? 'var(--success)' : 'var(--danger)' }}
                  >
                    {diffMain >= 0 ? `+${diffMain.toLocaleString(intlLocale)}` : diffMain.toLocaleString(intlLocale)} {currency}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <div className="form-group">
              <label className="form-label">{'\u{1F4F1}'} App Express real ({currency})</label>
              <input
                type="number" className="form-input" value={argentEnvoye}
                onChange={e => setArgentEnvoye(e.target.value)} placeholder="0"
                style={{ fontFamily: 'monospace' }}
              />
              <AnimatePresence>
                {argentEnvoye && (
                  <motion.span
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    style={{ fontSize: 10, color: diffExpress >= 0 ? 'var(--success)' : 'var(--danger)' }}
                  >
                    {diffExpress >= 0 ? `+${diffExpress.toLocaleString(intlLocale)}` : diffExpress.toLocaleString(intlLocale)} {currency}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 10 }}>
            <label className="form-label">{'\u{1F4DD}'} Observação (opcional)</label>
            <input
              type="text" className="form-input" value={note}
              onChange={e => setNote(e.target.value)} placeholder="Ex: Faltaram 500 AOA..."
            />
          </div>
        </motion.div>

        {/* v3.6.0 — Récapitulatif écart */}
        {(argentEnMain || argentEnvoye) && (
          <motion.div
            custom={3}
            variants={sectionVariants}
            initial="initial"
            animate="animate"
            style={{ background: ecartCaixa >= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${ecartCaixa >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
              <span>{t('shift','cashInHand')}</span>
              <span style={{ fontFamily: 'monospace' }}>{(Number(argentEnMain)||0).toLocaleString(intlLocale)} {currency}</span>
            </div>
            {fundoCaixa > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                <span>{t('shift','cashFund')}</span>
                <span style={{ fontFamily: 'monospace' }}>-{fundoCaixa.toLocaleString(intlLocale)} {currency}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              <span>{t('shift','totalCashSystem')}</span>
              <span style={{ fontFamily: 'monospace' }}>-{(shiftData?.totalDinheiro||0).toLocaleString(intlLocale)} {currency}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', color: ecartCaixa >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              <span>{t('shift','gapTitle')}</span>
              <span style={{ fontFamily: 'monospace' }}>{ecartCaixa >= 0 ? '+' : ''}{ecartCaixa.toLocaleString(intlLocale)} {currency}</span>
            </div>
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          custom={4}
          variants={sectionVariants}
          initial="initial"
          animate="animate"
          style={{ display: 'flex', gap: 10 }}
        >
          {isAdmin && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onCancel}
              className="btn btn-secondary"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Cancelar
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handlePrintAndLogout}
            disabled={loading}
            className="btn btn-primary"
            style={{ flex: 2, justifyContent: 'center', background: 'var(--accent)', color: '#000' }}
          >
            {loading ? (
              <>
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                  style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', marginRight: 8 }}
                />
                {t('shift','printing')}
              </>
            ) : (
              <><Printer size={16} style={{ marginRight: 6 }} />{t('shift','printAndExit')}</>
            )}
          </motion.button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
