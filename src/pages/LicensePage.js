import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLang } from '../utils/useLang';

// Respect du pattern anti-TDZ du projet :
// declarer les refs avant tout useEffect qui les reference,
// puis mettre a jour ref.current apres declaration.

export default function LicensePage({ onActivated }) {
  const { t } = useLang();
  const [tab, setTab] = useState('manual');
  const [ckbInput, setCkbInput] = useState('');
  const [email, setEmail] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);

  const onActivatedRef = useRef(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    onActivatedRef.current = onActivated;
  }, [onActivated]);

  useEffect(() => {
    loadStatus();
    const unsub = window.electron.onLicenseReceived((payload) => {
      setListening(false);
      setStatus({ valid: true, payload });
      if (onActivatedRef.current) onActivatedRef.current(payload);
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
    } catch (e) {
      setError(t('licensing', 'invalidLicense'));
    }
  }, [ckbInput, t]);

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
