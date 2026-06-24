import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, RefreshCw, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useLang } from '../utils/useLang';

// Formate un débit en octets/s vers une unité lisible (Ko/s, Mo/s)
function formatSpeed(bytesPerSecond) {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '';
  const kb = bytesPerSecond / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB/s`;
  return `${(kb / 1024).toFixed(1)} MB/s`;
}

// Formate un nombre de secondes vers mm:ss ou h:mm:ss
function formatRemaining(seconds) {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function UpdateBanner() {
  const { t } = useLang();
  const [status, setStatus] = useState(null); // null | checking | available | downloading | downloaded | error
  const [info, setInfo] = useState({});
  const [dismissed, setDismissed] = useState(false);
  const [smoothPercent, setSmoothPercent] = useState(0);

  // Lissage du ETA — moyenne glissante sur les dernières valeurs de bytesPerSecond
  const speedSamplesRef = useRef([]);

  const computeEta = useCallback((bytesPerSecond, transferred, total) => {
    if (!bytesPerSecond || !total) return null;
    const samples = speedSamplesRef.current;
    samples.push(bytesPerSecond);
    if (samples.length > 6) samples.shift();
    const avgSpeed = samples.reduce((a, b) => a + b, 0) / samples.length;
    if (avgSpeed <= 0) return null;
    const remainingBytes = total - transferred;
    return remainingBytes / avgSpeed;
  }, []);

  useEffect(() => {
    if (!window.electron?.onUpdateStatus) return;
    const cleanup = window.electron.onUpdateStatus((data) => {
      if (!data || !data.status) return;
      setStatus(data.status);
      setDismissed(false);

      if (data.status === 'available') {
        setInfo({ version: data.version });
      } else if (data.status === 'downloading') {
        const eta = computeEta(data.bytesPerSecond, data.transferred, data.total);
        setInfo({
          percent: data.percent || 0,
          bytesPerSecond: data.bytesPerSecond,
          etaSeconds: eta,
        });
        setSmoothPercent(data.percent || 0);
      } else if (data.status === 'downloaded') {
        setInfo({ version: data.version });
        speedSamplesRef.current = [];
      } else if (data.status === 'error') {
        setInfo({ error: data.error });
      } else if (data.status === 'not-available' || data.status === 'checking') {
        speedSamplesRef.current = [];
      }
    });
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, [computeEta]);

  const handleDownload = () => {
    setStatus('downloading');
    setInfo((prev) => ({ ...prev, percent: 0 }));
    window.electron.updateDownload().catch(() => {});
  };

  const handleInstall = () => {
    window.electron.updateInstall().catch(() => {});
  };

  const handleDismiss = () => setDismissed(true);

  // Rien à afficher : pas de statut pertinent, ou rejeté par l'utilisateur,
  // ou simple check silencieux sans rien trouvé
  const visibleStatuses = ['available', 'downloading', 'downloaded', 'error'];
  if (!status || !visibleStatuses.includes(status) || dismissed) return null;

  const CFG = {
    available:  { accent: '#e8c547', Icon: Download },
    downloading:{ accent: '#60a5fa', Icon: RefreshCw },
    downloaded: { accent: '#22c55e', Icon: CheckCircle2 },
    error:      { accent: '#ef4444', Icon: AlertTriangle },
  };
  const { accent, Icon } = CFG[status];
  const etaLabel = status === 'downloading' ? formatRemaining(info.etaSeconds) : null;
  const speedLabel = status === 'downloading' ? formatSpeed(info.bytesPerSecond) : null;

  return (
    <AnimatePresence>
      <motion.div
        key={status}
        initial={{ opacity: 0, y: -16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.97 }}
        transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{
          position: 'fixed', top: 38, right: 16, zIndex: 9998,
          width: 320, background: 'var(--bg-card)', border: `1px solid ${accent}55`,
          borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow)',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <motion.div
            animate={status === 'downloading' ? { rotate: 360 } : { rotate: 0 }}
            transition={status === 'downloading' ? { duration: 1.4, repeat: Infinity, ease: 'linear' } : {}}
            style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: accent + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon size={16} color={accent} />
          </motion.div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {status === 'available' && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t('updates', 'available')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {t('updates', 'versionLabel')} {info.version}
                </div>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleDownload}
                  style={{
                    marginTop: 10, background: accent, color: '#000', border: 'none',
                    borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Download size={13} /> {t('updates', 'downloadBtn')}
                </motion.button>
              </>
            )}

            {status === 'downloading' && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t('updates', 'downloading')}
                </div>

                {/* Barre de progression */}
                <div style={{ marginTop: 8, height: 6, borderRadius: 4, background: 'var(--bg-secondary)', overflow: 'hidden', position: 'relative' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${smoothPercent}%` }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    style={{
                      height: '100%', borderRadius: 4,
                      background: `linear-gradient(90deg, ${accent}, #93c5fd)`,
                    }}
                  />
                  {/* Reflet animé "shimmer" */}
                  <motion.div
                    animate={{ x: ['-100%', '320%'] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                    style={{
                      position: 'absolute', top: 0, left: 0, height: '100%', width: '30%',
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {Math.round(smoothPercent)}%
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {speedLabel}
                  </span>
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {etaLabel
                    ? `${etaLabel} ${t('updates', 'remaining')}`
                    : t('updates', 'remainingCalculating')}
                </div>
              </>
            )}

            {status === 'downloaded' && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t('updates', 'downloaded')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {t('updates', 'versionLabel')} {info.version}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleInstall}
                    style={{
                      background: accent, color: '#000', border: 'none',
                      borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <RefreshCw size={13} /> {t('updates', 'installBtn')}
                  </motion.button>
                  <button
                    onClick={handleDismiss}
                    style={{
                      background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)',
                      borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    {t('updates', 'installLater')}
                  </button>
                </div>
              </>
            )}

            {status === 'error' && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t('updates', 'error')}
                </div>
                {info.error && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, wordBreak: 'break-all' }}>
                    {info.error}
                  </div>
                )}
              </>
            )}
          </div>

          {status !== 'downloading' && (
            <button
              onClick={handleDismiss}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
