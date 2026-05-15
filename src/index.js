import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// ── Fix Electron Windows : bug freeze input ──────────────────────
// Sur Windows avec frame:false, un clic peut faire perdre le focus
// au renderer Electron. Ce listener le restaure automatiquement.
if (window.electron) {
  // Quand la fenêtre reprend le focus depuis l'OS
  window.addEventListener('focus', () => {
    // Redonner le focus à l'élément actif si c'est un input
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      active.blur();
      setTimeout(() => active.focus(), 50);
    }
  });

  // Intercepter les clics sur le document pour s'assurer
  // que les inputs reçoivent bien le focus
  document.addEventListener('mousedown', (e) => {
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      // Petit délai pour laisser Electron traiter l'événement natif
      setTimeout(() => {
        if (document.activeElement !== target) {
          target.focus();
        }
      }, 10);
    }
  }, true);
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
