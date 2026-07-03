import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../utils/useLang';
import { useLicense } from '../App';
import { WHATSAPP_1, WHATSAPP_2, whatsappLink } from '../config/contacts';
import './LicensePage.css';

// Respect du pattern anti-TDZ du projet :
// declarer les refs avant tout useEffect qui les reference,
// puis mettre a jour ref.current apres declaration.

export default function LicensePage({ onActivated }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const { refreshLicense } = useLicense();
  const [tab, setTab] = useState('manual');
  const [ckbInput, setCkbInput] = useState('');
  const [email, setEmail] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);

  // ── v5 — Achat de licenca en self-service ──
  const [purchaseTiers, setPurchaseTiers] = useState([]);
  const [purchaseTier, setPurchaseTier] = useState('');
  const [purchaseName, setPurchaseName] = useState('');
  const [purchaseEmail, setPurchaseEmail] = useState('');
  const [purchaseWhatsapp, setPurchaseWhatsapp] = useState('');
  const [comprovativo, setComprovativo] = useState(null); // { base64, name, mime }
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);

  const onActivatedRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const fileInputRef = useRef(null);
  const comprovativoInputRef = useRef(null);

  useEffect(() => {
    onActivatedRef.current = onActivated;
  }, [onActivated]);

  useEffect(() => {
    loadStatus();
    const unsub = window.electron.onLicenseReceived((payload) => {
      setListening(false);
      setStatus({ valid: true, payload });
      if (onActivatedRef.current) onActivatedRef.current(payload);
      refreshLicense().then(() => navigate('/'));
    });
    unsubscribeRef.current = unsub;
    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const res = await window.electron.licenseStatus();
      if (res?.data) setStatus(res.data);
    } catch (e) {
      console.error('licenseStatus error:', e);
    }
  }, []);

  const handleActivateManual = useCallback(async () => {
    setError('');
    if (!ckbInput.trim()) return;
    try {
      const res = await window.electron.licenseActivateManual(ckbInput.trim());
      if (res?.ok === false || !res?.data) {
        setError(t('licensing', 'invalidLicense'));
        return;
      }
      setStatus({ valid: true, payload: res.data });
      if (onActivatedRef.current) onActivatedRef.current(res.data);
      await refreshLicense();
      navigate('/');
    } catch (e) {
      setError(t('licensing', 'invalidLicense'));
    }
  }, [ckbInput, t, refreshLicense, navigate]);

  const handleFileImport = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCkbInput(String(reader.result || '').trim());
    reader.onerror = () => setError(t('licensing', 'invalidLicense'));
    reader.readAsText(file);
    e.target.value = '';
  }, [t]);

  // ── v5 — Achat de licenca en self-service ──
  useEffect(() => {
    if (tab !== 'purchase' || purchaseTiers.length > 0) return;
    window.electron.purchaseTiersList().then((res) => {
      if (res?.ok && res.data) setPurchaseTiers(res.data.filter((t) => t.tier !== 'FREE'));
    });
  }, [tab, purchaseTiers.length]);

  const handleComprovativoSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.split(',')[1] || '';
      setComprovativo({ base64, name: file.name, mime: file.type });
    };
    reader.onerror = () => setError(t('licensing', 'invalidLicense'));
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [t]);

  const handlePurchaseSubmit = useCallback(async () => {
    setError('');
    if (!purchaseEmail.trim() || !purchaseTier || !comprovativo) {
      setError(t('licensing', 'purchaseMissingFields'));
      return;
    }
    setPurchaseSubmitting(true);
    try {
      const res = await window.electron.purchaseRequestSubmit({
        email: purchaseEmail.trim(),
        client_name: purchaseName.trim() || null,
        whatsapp: purchaseWhatsapp.trim() || null,
        tier: purchaseTier,
        comprovativoBase64: comprovativo.base64,
        comprovativoName: comprovativo.name,
        comprovativoMime: comprovativo.mime,
      });
      if (res?.ok === false) {
        setError(res.error || t('licensing', 'purchaseError'));
        return;
      }
      setPurchaseSuccess(true);
      // Demarre automatiquement l'ecoute realtime pour cet email : sans ca,
      // le client n'est abonne a aucun canal et ne recevra jamais la licence
      // au moment ou l'admin confirme la demande.
      try {
        await window.electron.licenseListenRealtime(purchaseEmail.trim());
        setListening(true);
      } catch (_e) {
        // non bloquant — le check au prochain "Receber automaticamente" recuperera quand meme la livraison persistee
      }
    } catch (err) {
      setError(t('licensing', 'purchaseError'));
    } finally {
      setPurchaseSubmitting(false);
    }
  }, [purchaseEmail, purchaseName, purchaseWhatsapp, purchaseTier, comprovativo, t]);

  const handleListen = useCallback(async () => {
    setError('');
    if (!email.trim()) {
      setError(t('licensing', 'emailRequired'));
      return;
    }
    try {
      await window.electron.licenseListenRealtime(email.trim());
      setListening(true);
    } catch (e) {
      setError(e.message);
    }
  }, [email, t]);

  const handleStopListen = useCallback(async () => {
    await window.electron.licenseStopListen();
    setListening(false);
  }, []);

  const statusLabel = useCallback(() => {
    if (!status) return '';
    if (status.valid) return t('licensing', 'statusActive');
    if (status.reason === 'expired') return t('licensing', 'statusExpired');
    if (status.reason === 'wrong_machine') return t('licensing', 'statusWrongMachine');
    if (status.reason === 'sales_limit_reached') return t('licensing', 'statusSalesLimitReached');
    return t('licensing', 'statusNoLicense');
  }, [status, t]);

  // ── Decoratif uniquement : variante visuelle du tampon ────────────
  // Derive de l'etat `status`/`listening` deja existant, aucune nouvelle logique metier.
  const stampVariant = listening
    ? 'listening'
    : !status
    ? 'pending'
    : status.valid
    ? 'valid'
    : (status.reason === 'expired' || status.reason === 'wrong_machine' || status.reason === 'sales_limit_reached')
    ? 'danger'
    : 'trial';

  return (
    <div className="license-page">
      <div className="ticket">
        <div className="ticket-perf ticket-perf--top" aria-hidden="true" />

        <div className="ticket-body">
          {(status?.valid || purchaseSuccess) && (
            <button
              className="btn-secondary"
              style={{ marginBottom: 16, width: 'auto', padding: '6px 14px', fontSize: 12 }}
              onClick={() => navigate('/')}
            >
              {t('licensing', 'backBtn')}
            </button>
          )}
          <div className="ticket-eyebrow">CKBPOS &middot; {t('licensing', 'title')}</div>
          <p className="ticket-subtitle">{t('licensing', 'subtitle')}</p>

          <div className="ticket-divider" aria-hidden="true" />

          <div className="stamp-wrap">
            <div className={`stamp stamp--${stampVariant}`}>
              <span className="stamp-word">{listening ? t('licensing', 'listening') : (statusLabel() || '\u2014')}</span>
            </div>
            {status && !status.valid && status.reason === 'no_license' && status.salesUsed != null && (
              <div className="stamp-meta">{status.salesUsed} / 30</div>
            )}
            {status?.payload?.tier && (
              <div className="stamp-meta">{t('licensing', 'tier')}: {status.payload.tier}</div>
            )}
            {status?.payload?.expires_at ? (
              <div className="stamp-meta">{t('licensing', 'expiresOn')}: {new Date(status.payload.expires_at).toLocaleDateString()}</div>
            ) : status?.payload ? (
              <div className="stamp-meta">{t('licensing', 'never')}</div>
            ) : null}
          </div>

          <div className="ticket-divider" aria-hidden="true" />

          {stampVariant === 'danger' && (
            <div className="license-renew">
              <p className="ticket-subtitle">{t('licensing', 'renewSubtitle')}</p>
              <a
                className="btn-primary"
                style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginBottom: 8 }}
                href={whatsappLink(WHATSAPP_1)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('licensing', 'renewWhatsapp1')}
              </a>
              <a
                className="btn-secondary"
                style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginBottom: 14 }}
                href={whatsappLink(WHATSAPP_2)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('licensing', 'renewWhatsapp2')}
              </a>
              <div className="ticket-divider" aria-hidden="true" />
            </div>
          )}

          <div className="license-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'manual'}
              className={tab === 'manual' ? 'active' : ''}
              onClick={() => setTab('manual')}
            >
              {t('licensing', 'tabManual')}
            </button>
            <button
              role="tab"
              aria-selected={tab === 'realtime'}
              className={tab === 'realtime' ? 'active' : ''}
              onClick={() => setTab('realtime')}
            >
              {t('licensing', 'tabRealtime')}
            </button>
            <button
              role="tab"
              aria-selected={tab === 'purchase'}
              className={tab === 'purchase' ? 'active' : ''}
              onClick={() => setTab('purchase')}
            >
              {t('licensing', 'tabPurchase')}
            </button>
          </div>

          {tab === 'manual' && (
            <div className="license-tab-content">
              <label>{t('licensing', 'manualLabel')}</label>
              <textarea
                rows={5}
                value={ckbInput}
                onChange={(e) => setCkbInput(e.target.value)}
                placeholder={t('licensing', 'manualPlaceholder')}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".ckb,.txt"
                style={{ display: 'none' }}
                onChange={handleFileImport}
              />
              <button className="btn-secondary" style={{ marginBottom: 10 }} onClick={() => fileInputRef.current?.click()}>
                {t('licensing', 'importFileBtn')}
              </button>
              <button className="btn-primary" onClick={handleActivateManual}>
                {t('licensing', 'activateBtn')}
              </button>
            </div>
          )}

          {tab === 'realtime' && (
            <div className="license-tab-content">
              <label>{t('licensing', 'emailLabel')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('licensing', 'emailPlaceholder')}
                disabled={listening}
              />
              {!listening ? (
                <button className="btn-primary" onClick={handleListen}>
                  {t('licensing', 'listenBtn')}
                </button>
              ) : (
                <>
                  <p className="license-listening">{t('licensing', 'listening')}</p>
                  <button className="btn-secondary" onClick={handleStopListen}>
                    {t('licensing', 'stopListen')}
                  </button>
                </>
              )}
            </div>
          )}

          {tab === 'purchase' && (
            <div className="license-tab-content">
              {purchaseSuccess ? (
                <p className="license-listening">{t('licensing', 'purchaseSubmitted')}</p>
              ) : (
                <>
                  <label>{t('licensing', 'purchaseTierLabel')}</label>
                  <select
                    value={purchaseTier}
                    onChange={(e) => setPurchaseTier(e.target.value)}
                    style={{ width: '100%', marginBottom: 14 }}
                  >
                    <option value="">{t('licensing', 'purchaseTierPlaceholder')}</option>
                    {purchaseTiers.map((tc) => (
                      <option key={tc.tier} value={tc.tier}>
                        {tc.tier} — {tc.price?.toLocaleString('pt-PT')} Kz
                      </option>
                    ))}
                  </select>

                  <label>{t('licensing', 'purchaseNameLabel')}</label>
                  <input
                    type="text"
                    value={purchaseName}
                    onChange={(e) => setPurchaseName(e.target.value)}
                    placeholder={t('licensing', 'purchaseNamePlaceholder')}
                  />

                  <label>{t('licensing', 'emailLabel')}</label>
                  <input
                    type="email"
                    value={purchaseEmail}
                    onChange={(e) => setPurchaseEmail(e.target.value)}
                    placeholder={t('licensing', 'emailPlaceholder')}
                  />

                  <label>{t('licensing', 'purchaseWhatsappLabel')}</label>
                  <input
                    type="text"
                    value={purchaseWhatsapp}
                    onChange={(e) => setPurchaseWhatsapp(e.target.value)}
                    placeholder={t('licensing', 'purchaseWhatsappPlaceholder')}
                  />

                  <input
                    ref={comprovativoInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    style={{ display: 'none' }}
                    onChange={handleComprovativoSelect}
                  />
                  <button
                    className="btn-secondary"
                    style={{ marginBottom: 10 }}
                    onClick={() => comprovativoInputRef.current?.click()}
                  >
                    {comprovativo ? comprovativo.name : t('licensing', 'purchaseUploadBtn')}
                  </button>

                  <button
                    className="btn-primary"
                    onClick={handlePurchaseSubmit}
                    disabled={purchaseSubmitting}
                  >
                    {purchaseSubmitting ? t('licensing', 'purchaseSubmitting') : t('licensing', 'purchaseSubmitBtn')}
                  </button>
                </>
              )}
            </div>
          )}

          {error && <p className="license-error">{error}</p>}
        </div>

        <div className="ticket-barcode" aria-hidden="true" />
        <div className="ticket-perf ticket-perf--bottom" aria-hidden="true" />
      </div>
    </div>
  );
}
