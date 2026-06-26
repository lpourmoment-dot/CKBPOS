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

  const onActivatedRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const fileInputRef = useRef(null);

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
          {status?.valid && (
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

          {error && <p className="license-error">{error}</p>}
        </div>

        <div className="ticket-barcode" aria-hidden="true" />
        <div className="ticket-perf ticket-perf--bottom" aria-hidden="true" />
      </div>
    </div>
  );
}
