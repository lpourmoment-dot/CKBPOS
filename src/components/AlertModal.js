// src/components/AlertModal.js
// ✅ Remplace TOUS les dialog natifs Electron : alert() et window.confirm()
// ✅ Corrige le bug focus trap : inputs bloqués après fermeture d'une popup native

import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════
   ALERT MODAL — remplace window.alert()
═══════════════════════════════════════════════════════ */

export function AlertModal({ isOpen, title, message, type = 'info', onClose }) {
  const btnRef = useRef(null);

  // Remet le focus sur OK dès ouverture
  useEffect(() => {
    if (isOpen && btnRef.current) btnRef.current.focus();
  }, [isOpen]);

  // Ferme avec Escape ou Enter
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const icons = { info: 'ℹ️', error: '❌', success: '✅', warning: '⚠️' };

  return (
    <>
      <div style={styles.overlay} onClick={e => e.stopPropagation()} />
      <div style={styles.box} role="alertdialog" aria-modal="true">
        <div style={styles.header}>
          <span style={styles.appName}>ckbpos</span>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div style={styles.body}>
          <span style={styles.icon}>{icons[type]}</span>
          <div style={styles.textBlock}>
            {title && <p style={styles.title}>{title}</p>}
            <p style={styles.message}>{message}</p>
          </div>
        </div>
        <div style={styles.footer}>
          <button ref={btnRef} style={styles.okBtn} onClick={onClose}>OK</button>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   CONFIRM MODAL — remplace window.confirm()
   Retourne une Promise<boolean> via showConfirm()
═══════════════════════════════════════════════════════ */

export function ConfirmModal({ isOpen, title, message, type = 'warning', onConfirm, onCancel }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (isOpen && cancelRef.current) cancelRef.current.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      if (e.key === 'Enter')  { e.preventDefault(); onConfirm(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  const icons = { info: 'ℹ️', error: '❌', success: '✅', warning: '⚠️' };

  return (
    <>
      <div style={styles.overlay} onClick={e => e.stopPropagation()} />
      <div style={styles.box} role="alertdialog" aria-modal="true">
        <div style={styles.header}>
          <span style={styles.appName}>ckbpos</span>
          <button style={styles.closeBtn} onClick={onCancel} aria-label="Fermer">✕</button>
        </div>
        <div style={styles.body}>
          <span style={styles.icon}>{icons[type]}</span>
          <div style={styles.textBlock}>
            {title && <p style={styles.title}>{title}</p>}
            <p style={styles.message}>{message}</p>
          </div>
        </div>
        <div style={styles.footer}>
          <button ref={cancelRef} style={styles.cancelBtn} onClick={onCancel}>Cancelar</button>
          <button style={{...styles.okBtn, marginLeft: 8, background:'rgba(239,68,68,0.15)', borderColor:'#ef4444', color:'#ef4444'}} onClick={onConfirm}>Confirmar</button>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   HOOK useAlert
   const { showAlert, AlertModalComponent } = useAlert();
   showAlert('Titre', 'Message', 'warning'|'error'|'success'|'info');
═══════════════════════════════════════════════════════ */

export function useAlert() {
  const [state, setState] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  const showAlert = useCallback((title, message = '', type = 'info') => {
    setState({ isOpen: true, title, message, type });
  }, []);

  const closeAlert = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const AlertModalComponent = (
    <AlertModal
      isOpen={state.isOpen}
      title={state.title}
      message={state.message}
      type={state.type}
      onClose={closeAlert}
    />
  );

  return { showAlert, AlertModalComponent };
}

/* ═══════════════════════════════════════════════════════
   HOOK useConfirm
   const { showConfirm, ConfirmModalComponent } = useConfirm();
   const ok = await showConfirm('Titre', 'Message', 'warning');
   if (!ok) return; // utilisateur a annulé
═══════════════════════════════════════════════════════ */

export function useConfirm() {
  const [state, setState] = useState({ isOpen: false, title: '', message: '', type: 'warning' });
  const resolveRef = useRef(null);

  // showConfirm retourne une Promise<boolean>
  const showConfirm = useCallback((title, message = '', type = 'warning') => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ isOpen: true, title, message, type });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }));
    resolveRef.current?.(true);
  }, []);

  const handleCancel = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }));
    resolveRef.current?.(false);
  }, []);

  const ConfirmModalComponent = (
    <ConfirmModal
      isOpen={state.isOpen}
      title={state.title}
      message={state.message}
      type={state.type}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { showConfirm, ConfirmModalComponent };
}

/* ═══════════════════════════════════════════════════════
   STYLES — cohérents avec le thème dark CKBPOS
═══════════════════════════════════════════════════════ */
const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.55)',
    zIndex: 9998,
  },
  box: {
    position: 'fixed', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 9999,
    background: '#1e1e1e',
    border: '1px solid #3a3a3a',
    borderRadius: 8,
    minWidth: 360, maxWidth: 480,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    fontFamily: 'inherit',
    color: '#e0e0e0',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid #2e2e2e',
    background: '#252525',
    borderRadius: '8px 8px 0 0',
  },
  appName: { fontSize: 13, fontWeight: 600, color: '#aaa', letterSpacing: '0.05em' },
  closeBtn: {
    background: 'none', border: 'none', color: '#888',
    fontSize: 14, cursor: 'pointer', padding: '2px 6px', borderRadius: 4, lineHeight: 1,
  },
  body: {
    display: 'flex', alignItems: 'flex-start', gap: 14,
    padding: '20px 20px 12px',
  },
  icon: { fontSize: 22, flexShrink: 0, marginTop: 2 },
  textBlock: { flex: 1 },
  title: { margin: '0 0 6px', fontWeight: 600, fontSize: 15, color: '#f0f0f0' },
  message: { margin: 0, fontSize: 14, color: '#b0b0b0', lineHeight: 1.5, whiteSpace: 'pre-line' },
  footer: {
    display: 'flex', justifyContent: 'flex-end',
    padding: '10px 20px 16px',
  },
  okBtn: {
    background: 'transparent',
    border: '1px solid #555',
    color: '#e0e0e0',
    padding: '6px 28px',
    borderRadius: 5,
    fontSize: 14,
    cursor: 'pointer',
    fontWeight: 500,
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid #555',
    color: '#888',
    padding: '6px 20px',
    borderRadius: 5,
    fontSize: 14,
    cursor: 'pointer',
    fontWeight: 500,
  },
};
