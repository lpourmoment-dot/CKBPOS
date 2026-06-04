// ============================================================
// PATCH LoginPage — v3.4
// Ajouter dans LoginPage.js :
//
// 1. Importer ce composant :
//    import { SyncLanPanel, RememberSession } from './LoginPagePatch';
//
// 2. Ajouter dans le JSX sous le bouton "Entrar" :
//    <RememberSession/>
//    <SyncLanPanel onSynced={() => window.location.reload()}/>
//
// ============================================================

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Signal, Monitor, Wifi, Star, AlertTriangle, Check, Loader, ChevronRight, RefreshCw, X } from 'lucide-react';

const Gold   = '#e8c547';
const Dim    = 'rgba(232,197,71,0.12)';
const Border = 'rgba(232,197,71,0.25)';

// ── Remember session ─────────────────────────────────────────
export function RememberSession() {
  const [remember, setRemember] = useState(false);
  const [loaded, setLoaded]     = useState(false);

  useEffect(() => {
    window.electron.getRememberSession().then(r => {
      if (r?.success) setRemember(r.remember);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const toggle = async () => {
    const next = !remember;
    setRemember(next);
    await window.electron.setRememberSession(next);
  };

  if (!loaded) return null;

  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, margin:'12px 0', cursor:'pointer' }} onClick={toggle}>
      <div style={{
        width:18, height:18, borderRadius:4, border: remember ? 'none' : '1.5px solid rgba(255,255,255,0.2)',
        background: remember ? Gold : 'transparent',
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s',
      }}>
        {remember && <Check size={11} color='#0a0a0a'/>}
      </div>
      <span style={{ fontSize:12, color:'rgba(255,255,255,0.45)', userSelect:'none' }}>
        Lembrar esta sessão (não pedir senha ao reiniciar)
      </span>
    </div>
  );
}

// ── Panneau sync LAN ─────────────────────────────────────────
export function SyncLanPanel({ onSynced }) {
  const [open, setOpen]         = useState(false);
  const [phase, setPhase]       = useState('scan'); // scan | auth | syncing
  const [peers, setPeers]       = useState([]);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState(null);
  const [authMode, setAuthMode] = useState('invite');
  const [inviteCode, setInviteCode] = useState('');
  const [networkKey, setNetworkKey] = useState('');
  const [progress, setProgress] = useState(0);
  const [err, setErr]           = useState('');
  const [machLabel, setMachLabel] = useState('');

  useEffect(() => {
    if (!open) return;
    const c1 = window.electron.onSnapshotProgress(({ received, total }) => setProgress(Math.round((received/total)*90)));
    const c2 = window.electron.onSnapshotDone(() => { setProgress(100); setTimeout(() => onSynced?.(), 1200); });
    const c3 = window.electron.onSnapshotDenied(() => { setErr('Autenticação recusada — verifique o código ou a chave.'); setPhase('auth'); });
    return () => { c1(); c2(); c3(); };
  }, [open]);

  const scan = async () => {
    setScanning(true); setErr('');
    try {
      const res = await window.electron.lanScanForSnapshot();
      setPeers(res?.data?.filter(p => p.online) || []);
    } catch(e) { setErr(e.message); }
    setScanning(false);
  };

  const openPanel = () => { setOpen(true); setPhase('scan'); setErr(''); setPeers([]); scan(); };

  const requestSync = async () => {
    if (!selected) { setErr('Selecione uma máquina'); return; }
    const code = authMode === 'invite' ? inviteCode.trim() : '';
    const key  = authMode === 'key'    ? networkKey.trim() : '';
    if (authMode === 'invite' && code.length !== 6) { setErr('Código deve ter 6 dígitos'); return; }
    if (authMode === 'key' && !key) { setErr('Insira a chave de rede'); return; }
    setErr(''); setPhase('syncing'); setProgress(5);
    try {
      const res = await window.electron.requestSnapshot({ machine_id: selected, invite_code: code, network_key: key });
      if (!res.success) { setErr(res.error || 'Erro'); setPhase('auth'); }
    } catch(e) { setErr(e.message); setPhase('auth'); }
  };

  const inputStyle = {
    width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
    borderRadius:8, padding:'9px 12px', color:'#fff', fontSize:12, outline:'none',
    boxSizing:'border-box', fontFamily:'inherit', marginBottom:12,
  };

  const chipStyle = (active) => ({
    flex:1, padding:'9px 8px', borderRadius:7, cursor:'pointer',
    border: active ? `1.5px solid ${Gold}` : '1px solid rgba(255,255,255,0.1)',
    background: active ? Dim : 'transparent',
    color: active ? Gold : 'rgba(255,255,255,0.4)',
    fontSize:11, textAlign:'center', display:'flex', alignItems:'center',
    justifyContent:'center', gap:5, fontFamily:'inherit', letterSpacing:1,
  });

  return (
    <>
      {/* Bouton déclencheur */}
      <button onClick={openPanel} style={{
        background:'transparent', border:`1px solid rgba(255,255,255,0.1)`,
        borderRadius:8, padding:'9px 14px', color:'rgba(255,255,255,0.4)',
        fontSize:12, cursor:'pointer', width:'100%', display:'flex',
        alignItems:'center', justifyContent:'center', gap:8,
        fontFamily:'inherit', marginTop:8, transition:'all 0.15s',
      }}
        onMouseEnter={e => { e.target.style.borderColor = Border; e.target.style.color = Gold; }}
        onMouseLeave={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.color = 'rgba(255,255,255,0.4)'; }}
      >
        <Signal size={13}/> Sincronizar com máquina ativa
      </button>

      {/* Panneau modal */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
          >
            <motion.div initial={{ scale:0.95, y:16 }} animate={{ scale:1, y:0 }} exit={{ scale:0.95, y:8 }}
              style={{ width:'100%', maxWidth:460, background:'#0f0f0f', border:`1px solid ${Border}`, borderRadius:14, overflow:'hidden', margin:'0 16px' }}
            >
              {/* Header */}
              <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:14, color:'#fff', fontWeight:700, letterSpacing:1 }}>Sincronizar com máquina ativa</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginTop:2 }}>Importa dados de uma máquina online no LAN</div>
                </div>
                <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)', padding:4 }}>
                  <X size={16}/>
                </button>
              </div>

              <div style={{ padding:'20px 24px 24px' }}>
                {err && (
                  <div style={{ background:'rgba(245,101,101,0.08)', border:'1px solid rgba(245,101,101,0.2)', borderRadius:8, padding:'9px 12px', color:'#fc8181', fontSize:12, marginBottom:14, display:'flex', gap:8, alignItems:'center' }}>
                    <AlertTriangle size={13}/>{err}
                  </div>
                )}

                {/* SCAN */}
                {phase === 'scan' && (
                  <>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', letterSpacing:2 }}>MÁQUINAS ONLINE</div>
                      <button onClick={scan} disabled={scanning} style={{ background:'transparent', border:`1px solid ${Border}`, borderRadius:6, padding:'5px 10px', color:Gold, fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontFamily:'inherit' }}>
                        <RefreshCw size={11} style={{ animation: scanning ? 'spin 1s linear infinite' : 'none' }}/>
                        {scanning ? 'A pesquisar...' : 'Atualizar'}
                      </button>
                    </div>
                    {scanning && !peers.length
                      ? <div style={{ textAlign:'center', padding:'20px 0', color:'rgba(255,255,255,0.3)', fontSize:12 }}>
                          <Loader size={20} style={{ animation:'spin 1s linear infinite', display:'block', margin:'0 auto 10px' }}/>
                          A pesquisar na rede LAN...
                        </div>
                      : peers.length === 0
                        ? <div style={{ textAlign:'center', padding:'20px 0', color:'rgba(255,255,255,0.3)', fontSize:12 }}>
                            <Signal size={28} style={{ display:'block', margin:'0 auto 10px', opacity:0.3 }}/>
                            Nenhuma máquina encontrada
                          </div>
                        : peers.map(p => (
                            <div key={p.machine_id} onClick={() => { setSelected(p.machine_id); setMachLabel(p.machine_label||p.machine_id.slice(0,8)); }}
                              style={{
                                padding:'12px 14px', borderRadius:9, cursor:'pointer', marginBottom:8,
                                border: selected===p.machine_id ? `1.5px solid ${Gold}` : '1px solid rgba(255,255,255,0.08)',
                                background: selected===p.machine_id ? Dim : 'rgba(255,255,255,0.02)',
                                display:'flex', alignItems:'center', gap:12, transition:'all 0.15s',
                              }}
                            >
                              <Monitor size={16} color={selected===p.machine_id ? Gold : 'rgba(255,255,255,0.35)'}/>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:13, color: selected===p.machine_id ? Gold : '#fff', fontWeight:600 }}>{p.machine_label||p.machine_id.slice(0,8)}</div>
                                <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)' }}>{p.ip}</div>
                              </div>
                              <div style={{ width:7, height:7, borderRadius:'50%', background:'#68d391' }}/>
                            </div>
                          ))
                    }
                    <div style={{ display:'flex', justifyContent:'flex-end', marginTop:14 }}>
                      <button onClick={() => { if (!selected) { setErr('Selecione uma máquina'); return; } setErr(''); setPhase('auth'); }}
                        style={{ background:Gold, color:'#0a0a0a', border:'none', borderRadius:8, padding:'9px 20px', fontWeight:700, fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}>
                        Continuar <ChevronRight size={13}/>
                      </button>
                    </div>
                  </>
                )}

                {/* AUTH */}
                {phase === 'auth' && (
                  <>
                    <div style={{ marginBottom:14, fontSize:12, color:'rgba(255,255,255,0.4)' }}>
                      Máquina: <span style={{ color:Gold }}>{machLabel}</span>
                    </div>
                    <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                      <button onClick={() => setAuthMode('invite')} style={chipStyle(authMode==='invite')}><Star size={12}/>Código convite</button>
                      <button onClick={() => setAuthMode('key')} style={chipStyle(authMode==='key')}><Wifi size={12}/>Chave de rede</button>
                    </div>
                    {authMode === 'invite'
                      ? <>
                          <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginBottom:10, lineHeight:1.7 }}>
                            Na máquina origem: <span style={{ color:Gold }}>Configurações → Rede → Gerar código convite</span>
                          </div>
                          <input value={inviteCode} onChange={e=>setInviteCode(e.target.value)} placeholder="Código de 6 dígitos" maxLength={6} style={{ ...inputStyle, fontSize:20, textAlign:'center', letterSpacing:8 }}/>
                        </>
                      : <input value={networkKey} onChange={e=>setNetworkKey(e.target.value)} placeholder="Chave de rede LAN" style={inputStyle}/>
                    }
                    <div style={{ display:'flex', gap:10, justifyContent:'space-between' }}>
                      <button onClick={() => { setErr(''); setPhase('scan'); }} style={{ background:'transparent', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'9px 16px', color:'rgba(255,255,255,0.4)', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                        Voltar
                      </button>
                      <button onClick={requestSync} style={{ background:Gold, color:'#0a0a0a', border:'none', borderRadius:8, padding:'9px 20px', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:6 }}>
                        Importar <ChevronRight size={13}/>
                      </button>
                    </div>
                  </>
                )}

                {/* SYNCING */}
                {phase === 'syncing' && (
                  <div style={{ textAlign:'center', padding:'16px 0' }}>
                    <div style={{ width:56, height:56, borderRadius:'50%', background:Dim, border:`2px solid ${Gold}`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
                      {progress < 100
                        ? <Loader size={24} color={Gold} style={{ animation:'spin 1s linear infinite' }}/>
                        : <Check size={24} color={Gold}/>
                      }
                    </div>
                    <div style={{ fontSize:14, color:'#fff', fontWeight:600, marginBottom:4 }}>
                      {progress < 100 ? 'A importar dados...' : 'Concluído!'}
                    </div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginBottom:16 }}>
                      Produtos · Ventes · Utilizadores · Configurações
                    </div>
                    <div style={{ height:4, background:'rgba(255,255,255,0.08)', borderRadius:2, overflow:'hidden', marginBottom:8 }}>
                      <motion.div animate={{ width:progress+'%' }} style={{ height:'100%', background:Gold, borderRadius:2 }} transition={{ duration:0.4 }}/>
                    </div>
                    <div style={{ fontSize:18, color:Gold, fontWeight:700 }}>{progress}%</div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }`}</style>
    </>
  );
}
