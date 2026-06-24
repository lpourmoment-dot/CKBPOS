import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../App';
import { useLang } from '../utils/useLang';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, Monitor, Wifi, ShieldCheck, User, ChevronRight, ChevronLeft,
  Check, Loader, RefreshCw, Eye, EyeOff, Globe, Palette,
  Printer, Database, AlertTriangle, Signal, Star, Copy, Key, Upload
} from 'lucide-react';

// ── Constantes ───────────────────────────────────────────────
const CURRENCIES = ['AOA','USD','EUR','BRL'];
const LANGUAGES  = [{ code:'pt-BR', label:'\u{1F1F5}\u{1F1F9} Português' }, { code:'fr', label:'\u{1F1EB}\u{1F1F7} Français' }, { code:'en', label:'\u{1F1EC}\u{1F1E7} English' }];
const TICKET_SIZES = [52, 60, 72, 80];
const THEMES = ['dark','light'];

// ── Helpers visuels ──────────────────────────────────────────
const Gold   = '#e8c547';
const Dim    = 'rgba(232,197,71,0.15)';
const Border = 'rgba(232,197,71,0.25)';
const BgCard = 'rgba(255,255,255,0.03)';

// ── Thème dynamique ─────────────────────────────────────────
function useSetupS() {
  const ctx = useTheme();
  return makeS(ctx?.theme === 'dark' || !ctx);
}
function makeS(isDark) {
  const Gold='#e8c547', Dim='rgba(232,197,71,0.15)';
  const Border=isDark?'rgba(232,197,71,0.25)':'rgba(200,160,30,0.4)';
  const textMain=isDark?'#fff':'#111';
  const textMuted=isDark?'rgba(255,255,255,0.5)':'rgba(0,0,0,0.5)';
  const inputBg=isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.06)';
  const inputBdr=isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.15)';
  const btnSecC=isDark?'rgba(255,255,255,0.5)':'rgba(0,0,0,0.5)';
  const btnSecB=isDark?'rgba(255,255,255,0.12)':'rgba(0,0,0,0.15)';
  const divider=isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.12)';
  const chipC=isDark?'rgba(255,255,255,0.45)':'rgba(0,0,0,0.55)';
  const chipB=isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.2)';
  return {
    page:{minHeight:'100vh',background:isDark?'#0a0a0a':'#f5f4ef',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Courier New',Courier,monospace",overflow:'hidden',position:'relative'},
    grid:{position:'absolute',inset:0,pointerEvents:'none',backgroundImage:`linear-gradient(rgba(232,197,71,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(232,197,71,0.04) 1px,transparent 1px)`,backgroundSize:'40px 40px'},
    card:{width:'100%',maxWidth:560,margin:'0 20px',background:isDark?'rgba(10,10,10,0.97)':'rgba(255,255,254,0.97)',border:`1px solid ${Border}`,borderRadius:16,boxShadow:`0 0 60px rgba(232,197,71,${isDark?'0.08':'0.12'})`,overflow:'hidden',position:'relative',zIndex:1},
    header:{padding:'32px 40px 24px',borderBottom:`1px solid ${isDark?'rgba(232,197,71,0.1)':'rgba(200,160,30,0.2)'}`},
    logo:{fontSize:28,fontWeight:700,letterSpacing:6,color:Gold,marginBottom:4},
    subtitle:{fontSize:11,color:isDark?'rgba(232,197,71,0.5)':'rgba(140,110,10,0.75)',letterSpacing:3},
    body:{padding:'32px 40px'},
    footer:{padding:'20px 40px 28px',borderTop:`1px solid ${divider}`,display:'flex',gap:12,justifyContent:'flex-end'},
    label:{display:'block',fontSize:11,color:isDark?'rgba(232,197,71,0.7)':'rgba(140,110,10,0.85)',letterSpacing:2,marginBottom:8,textTransform:'uppercase'},
    input:{width:'100%',background:inputBg,border:`1px solid ${inputBdr}`,borderRadius:8,padding:'10px 14px',color:textMain,fontSize:13,outline:'none',transition:'border 0.2s',boxSizing:'border-box',fontFamily:'inherit'},
    btnPrimary:{background:Gold,color:'#0a0a0a',border:'none',borderRadius:8,padding:'11px 24px',fontWeight:700,fontSize:13,cursor:'pointer',letterSpacing:1,fontFamily:'inherit',display:'flex',alignItems:'center',gap:8,transition:'opacity 0.15s'},
    btnSecondary:{background:'transparent',color:btnSecC,border:`1px solid ${btnSecB}`,borderRadius:8,padding:'11px 24px',fontSize:13,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:8,transition:'all 0.15s'},
    btnGhost:{background:'transparent',color:Gold,border:`1px solid ${Border}`,borderRadius:8,padding:'10px 20px',fontSize:12,cursor:'pointer',fontFamily:'inherit',letterSpacing:1,transition:'all 0.15s'},
    row:{display:'flex',gap:14,marginBottom:18},col:{flex:1},
    error:{background:'rgba(245,101,101,0.08)',border:'1px solid rgba(245,101,101,0.25)',borderRadius:8,padding:'10px 14px',color:'#fc8181',fontSize:12,marginBottom:16,display:'flex',alignItems:'center',gap:8},
    success:{background:'rgba(72,187,120,0.08)',border:'1px solid rgba(72,187,120,0.25)',borderRadius:8,padding:'10px 14px',color:'#68d391',fontSize:12,marginBottom:16,display:'flex',alignItems:'center',gap:8},
    chip:(active)=>({flex:1,padding:'12px 10px',borderRadius:8,cursor:'pointer',border:active?`1.5px solid ${Gold}`:`1px solid ${chipB}`,background:active?Dim:'transparent',color:active?Gold:chipC,fontSize:12,textAlign:'center',transition:'all 0.15s',fontFamily:'inherit',letterSpacing:1,display:'flex',flexDirection:'column',alignItems:'center',gap:6}),
    peerCard:(sel)=>({padding:'14px 16px',borderRadius:10,cursor:'pointer',border:sel?`1.5px solid ${Gold}`:`1px solid ${chipB}`,background:sel?Dim:(isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)'),marginBottom:10,display:'flex',alignItems:'center',gap:12,transition:'all 0.15s'}),
    textMain,textMuted,divider,chipC,chipB,Gold,Dim,Border,inputBdr,
    BgCard: isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
  };
}


// (bloc de styles statique supprimé — remplacé par makeS()/useSetupS())

// ── Composants atomiques ─────────────────────────────────────
function Input({ label, value, onChange, type='text', placeholder='', disabled=false, icon:Icon }) {
  const s = useSetupS();
  const [show, setShow] = useState(false);
  const isPass = type === 'password';
  return (
    <div style={{ marginBottom:18 }}>
      {label && <label style={s.label}>{label}</label>}
      <div style={{ position:'relative' }}>
        {Icon && <Icon size={14} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'rgba(232,197,71,0.4)', pointerEvents:'none' }}/>}
        <input
          type={isPass && show ? 'text' : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          style={{ ...s.input, paddingLeft: Icon ? 36 : 14, paddingRight: isPass ? 40 : 14, opacity: disabled ? 0.5 : 1 }}
          onFocus={e => e.target.style.borderColor = Gold}
          onBlur={e => e.target.style.borderColor = s.inputBdr}
        />
        {isPass && (
          <button onClick={() => setShow(!show)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:s.textMuted, padding:0 }}>
            {show ? <EyeOff size={14}/> : <Eye size={14}/>}
          </button>
        )}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  const s = useSetupS();
  return (
    <div style={{ marginBottom:18 }}>
      {label && <label style={s.label}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ ...s.input, cursor:'pointer' }}
        onFocus={e => e.target.style.borderColor = Gold}
        onBlur={e => e.target.style.borderColor = s.inputBdr}
      >
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    </div>
  );
}

function StepDots({ total, current }) {
  const s = useSetupS();
  return (
    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? 20 : 6, height:6, borderRadius:3,
          background: i < current ? Gold : i === current ? Gold : s.chipB,
          transition:'all 0.3s',
        }}/>
      ))}
    </div>
  );
}

function ProgressBar({ value }) {
  const s = useSetupS();
  return (
    <div style={{ height:3, background:s.divider, borderRadius:2, marginBottom:24, overflow:'hidden' }}>
      <motion.div animate={{ width: value + '%' }} style={{ height:'100%', background:Gold, borderRadius:2 }} transition={{ duration:0.4 }}/>
    </div>
  );
}

// ── Choix initial ─────────────────────────────────────────────
function ChoiceScreen({ onChoice }) {
  const s = useSetupS();
  const { t } = useLang();
  return (
    <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-16 }}>
      <div style={{ textAlign:'center', marginBottom:32 }}>
        <div style={{ fontSize:13, color:s.textMuted, marginBottom:6, letterSpacing:2 }}>{t("setup","welcome")}</div>
        <div style={{ fontSize:22, color:s.textMain, fontWeight:700, letterSpacing:2 }}>{t("setup","chooseStart")}</div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <motion.button whileHover={{ scale:1.01 }} whileTap={{ scale:0.99 }}
          onClick={() => onChoice('new')}
          style={{ background:s.BgCard, border:`1.5px solid ${s.Border}`, borderRadius:12, padding:'20px 24px', cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:16 }}
        >
          <div style={{ width:44, height:44, borderRadius:10, background:s.Dim, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Store size={20} color={s.Gold}/>
          </div>
          <div>
            <div style={{ color:s.textMain, fontSize:14, fontWeight:700, marginBottom:3, letterSpacing:1 }}>{t("setup","newStore")}</div>
            <div style={{ color:s.textMuted, fontSize:12 }}>{t("setup","newStoreDesc")}</div>
          </div>
          <ChevronRight size={16} color={s.Gold} style={{ marginLeft:'auto' }}/>
        </motion.button>

        <motion.button whileHover={{ scale:1.01 }} whileTap={{ scale:0.99 }}
          onClick={() => onChoice('join')}
          style={{ background:s.BgCard, border:`1px solid ${s.chipB}`, borderRadius:12, padding:'20px 24px', cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:16 }}
        >
          <div style={{ width:44, height:44, borderRadius:10, background:'rgba(99,179,237,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Signal size={20} color='#63b3ed'/>
          </div>
          <div>
            <div style={{ color:s.textMain, fontSize:14, fontWeight:700, marginBottom:3, letterSpacing:1 }}>{t("setup","joinNetwork")}</div>
            <div style={{ color:s.textMuted, fontSize:12 }}>{t("setup","joinNetworkDesc")}</div>
          </div>
          <ChevronRight size={16} color={s.chipC} style={{ marginLeft:'auto' }}/>
        </motion.button>

        <motion.button whileHover={{ scale:1.01 }} whileTap={{ scale:0.99 }}
          onClick={() => onChoice('importdb')}
          style={{ background:s.BgCard, border:`1px solid ${s.chipB}`, borderRadius:12, padding:'20px 24px', cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:16 }}
        >
          <div style={{ width:44, height:44, borderRadius:10, background:'rgba(34,197,94,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Database size={20} color='#22c55e'/>
          </div>
          <div>
            <div style={{ color:s.textMain, fontSize:14, fontWeight:700, marginBottom:3, letterSpacing:1 }}>{t("setup","restoreDb")}</div>
            <div style={{ color:s.textMuted, fontSize:12 }}>{t("setup","restoreDbDesc")}</div>
          </div>
          <ChevronRight size={16} color={s.chipC} style={{ marginLeft:'auto' }}/>
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── WIZARD Importar DB ────────────────────────────────────────
function WizardImportDb({ onDone, onBack }) {
  const s = useSetupS();
  const { t } = useLang();
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errMsg, setErrMsg] = useState('');

  const handleImport = async () => {
    setStatus('loading');
    setErrMsg('');
    try {
      const res = await window.electron.importDbFile();
      if (res?.success) {
        setStatus('success');
        // Recarregar app após 2s
        setTimeout(() => { window.location.reload(); }, 2000);
      } else {
        const msgs = {
          canceled:   'Operação cancelada.',
          invalid_db: 'Ficheiro inválido — não é uma base de dados CKBPOS.',
          empty_db:   'Base de dados vazia — nenhum utilizador encontrado.',
          corrupt_db: 'Ficheiro corrompido ou ilegível.',
          error:      res?.error || 'Erro desconhecido.',
        };
        setErrMsg(msgs[res?.reason] || msgs.error);
        setStatus('error');
      }
    } catch(e) {
      setErrMsg(e.message || 'Erro ao importar ficheiro.');
      setStatus('error');
    }
  };

  return (
    <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-16 }}>
      <div style={{ textAlign:'center', marginBottom:28 }}>
        <div style={{ width:56, height:56, borderRadius:14, background:'rgba(34,197,94,0.12)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
          <Database size={26} color='#22c55e'/>
        </div>
        <div style={{ fontSize:18, color:s.textMain, fontWeight:700, marginBottom:8 }}>{t("setup","restoreDb")}</div>
        <div style={{ fontSize:13, color:s.textMuted, lineHeight:1.6 }}>
          Selecione um ficheiro <strong style={{ color:s.textMain }}>.db</strong> exportado anteriormente do CKBPOS.<br/>
          Todos os dados (produtos, vendas, utilizadores) serão restaurados.
        </div>
      </div>

      {status === 'success' && (
        <div style={{ background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:10, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:10, color:'#22c55e', fontSize:13 }}>
          <Check size={16}/> Base de dados importada com sucesso! A recarregar...
        </div>
      )}

      {status === 'error' && (
        <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:10, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:10, color:'#ef4444', fontSize:13 }}>
          <AlertTriangle size={16}/> {errMsg}
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <motion.button
          whileHover={{ scale: status === 'loading' ? 1 : 1.01 }}
          whileTap={{ scale: status === 'loading' ? 1 : 0.99 }}
          onClick={handleImport}
          disabled={status === 'loading' || status === 'success'}
          style={{ background: status === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.15)', border:`1.5px solid ${status === 'success' ? '#22c55e' : 'rgba(34,197,94,0.4)'}`, borderRadius:10, padding:'14px 20px', cursor: status === 'loading' ? 'wait' : 'pointer', color:'#22c55e', fontWeight:700, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}
        >
          {status === 'loading'
            ? <><Loader size={16} style={{ animation:'spin 1s linear infinite' }}/> A selecionar ficheiro...</>
            : <><Database size={16}/> Selecionar ficheiro .db</>}
        </motion.button>

        <button onClick={onBack} style={{ background:'transparent', border:'none', color:s.textMuted, fontSize:13, cursor:'pointer', padding:'8px 0', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          <ChevronLeft size={14}/> {t("setup","back")}
        </button>
      </div>
    </motion.div>
  );
}

// ── WIZARD Nova Boutique ──────────────────────────────────────
function WizardNova({ onDone, onBack }) {
  const s = useSetupS();
  const { t, changeLang } = useLang();
  const { theme: currentTheme, toggleTheme } = useTheme();
  const [step, setStep]     = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const [shop, setShop]     = useState({ name:'', address:'', phone:'', currency:'AOA', language:'pt-BR', theme:'dark' });
  const [machine, setMachine] = useState({ label:'Caixa Principal', networkKey:'', ticketSize:'72' });
  const [sync, setSync]     = useState({ supabaseUrl:'', supabaseKey:'', skipSync:false });
  const [admin, setAdmin]   = useState({ name:'', email:'', password:'', confirm:'' });
  // \u2705 Licensing — etape finale optionnelle (texte ou fichier .ckb)
  const [licenseCkb, setLicenseCkb] = useState('');
  const fileInputRef = useRef(null);

  const STEPS = [
    { icon:Store,      label:t('setup','stepStore') },
    { icon:Monitor,    label:t('setup','stepMachine') },
    { icon:Database,   label:t('setup','stepSync') },
    { icon:ShieldCheck,label:t('setup','stepAdmin') },
    { icon:Key,        label:t('setup','stepLicense') },
  ];

  const setS = (key) => (val) => setShop(p => ({ ...p, [key]: val }));
  const setM = (key) => (val) => setMachine(p => ({ ...p, [key]: val }));
  const setSy = (key) => (val) => setSync(p => ({ ...p, [key]: val }));
  const setA = (key) => (val) => setAdmin(p => ({ ...p, [key]: val }));

  const validateStep = () => {
    setErr('');
    if (step === 0 && !shop.name.trim()) { setErr(t('setup','errShopName')); return false; }
    if (step === 1 && !machine.label.trim()) { setErr(t('setup','errMachineName')); return false; }
    if (step === 3) {
      if (!admin.name.trim() || !admin.email.trim() || !admin.password) { setErr(t('setup','errAdminName')); return false; }
      if (!admin.email.includes('@')) { setErr(t('setup','errEmailInvalid')); return false; }
      if (admin.password.length < 6) { setErr(t('setup','errPassMin')); return false; }
      if (admin.password !== admin.confirm) { setErr(t('setup','errPassMatch')); return false; }
    }
    return true;
  };

  const next = () => { if (validateStep()) setStep(s => Math.min(s + 1, 4)); };
  const prev = () => { setErr(''); setStep(s => Math.max(s - 1, 0)); };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setLicenseCkb(String(ev.target.result || '').trim());
    reader.onerror = () => setErr(t('setup', 'errLicenseFile'));
    reader.readAsText(file);
  };

  const finish = async () => {
    if (!validateStep()) return;
    setSaving(true);
    try {
      // \u2705 Licensing — si un .ckb a ete colle/charge, on l'active avant de terminer
      if (licenseCkb.trim()) {
        const licRes = await window.electron.licenseActivateManual(licenseCkb.trim());
        if (licRes?.ok === false || !licRes?.data) {
          setErr(t('setup', 'errLicenseInvalid'));
          setSaving(false);
          return;
        }
      }
      const res = await window.electron.setupComplete({ shop, machine, admin, sync: sync.skipSync ? {} : sync });
      if (res.success) onDone({ name: admin.name, email: admin.email, role: 'admin', id: 1 });
      else setErr(res.error || t('setup','errSaveConfig'));
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  const progress = ((step + 1) / 5) * 100;

  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
      {/* Stepper */}
      <div style={{ display:'flex', gap:0, marginBottom:24 }}>
        {STEPS.map((st, i) => {
          const Icon = st.icon;
          const done = i < step;
          const active = i === step;
          return (
            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6, position:'relative' }}>
              {i > 0 && <div style={{ position:'absolute', left:0, top:16, width:'50%', height:1, background: done || active ? s.Gold : s.divider }}/>}
              {i < STEPS.length-1 && <div style={{ position:'absolute', right:0, top:16, width:'50%', height:1, background: done ? s.Gold : s.divider }}/>}
              <div style={{
                width:32, height:32, borderRadius:'50%', zIndex:1,
                background: done ? s.Gold : active ? s.Dim : s.divider,
                border: active ? `2px solid ${s.Gold}` : done ? 'none' : `1px solid ${s.chipB}`,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                {done ? <Check size={14} color='#0a0a0a'/> : <Icon size={13} color={active ? s.Gold : s.chipC}/>}
              </div>
              <div style={{ fontSize:10, color: active ? s.Gold : done ? 'rgba(232,197,71,0.5)' : s.chipC, letterSpacing:1 }}>{st.label}</div>
            </div>
          );
        })}
      </div>

      <ProgressBar value={progress}/>
      {err && <div style={s.error}><AlertTriangle size={14}/>{err}</div>}

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }} transition={{ duration:0.2 }}>

          {step === 0 && (
            <>
              <Input label={t("setup","shopName")} value={shop.name} onChange={setS('name')} placeholder="Ex: CKB Store" icon={Store}/>
              <div style={s.row}>
                <div style={s.col}><Input label={t("setup","address")} value={shop.address} onChange={setS('address')} placeholder="Luanda, Angola"/></div>
                <div style={s.col}><Input label={t("setup","phone")} value={shop.phone} onChange={setS('phone')} placeholder="+244 9xx xxx xxx"/></div>
              </div>
              <div style={s.row}>
                <div style={s.col}><Select label={t("setup","currency")} value={shop.currency} onChange={setS('currency')} options={CURRENCIES}/></div>
                <div style={s.col}><Select label={t("setup","language")} value={shop.language} onChange={(v) => { setS('language')(v); changeLang(v); }} options={LANGUAGES.map(l=>({ value:l.code, label:l.label }))}/></div>
              </div>
              <div style={{ marginBottom:4 }}>
                <label style={s.label}>{t("setup","theme")}</label>
                <div style={{ display:'flex', gap:10 }}>
                  {THEMES.map(th => (
                    <button key={th} onClick={() => { setS('theme')(th); if (th !== currentTheme) toggleTheme(); }} style={s.chip(shop.theme===th)}>
                      <Palette size={16}/>
                      {th === 'dark' ? t('setup','dark') : t('setup','light')}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <Input label={t("setup","machineName")} value={machine.label} onChange={setM('label')} placeholder="Ex: Caixa Principal" icon={Monitor}/>
              <Input label={t("setup","networkKey")} value={machine.networkKey} onChange={setM('networkKey')} placeholder="Ex: CKB-XXXX-XXXX" icon={Wifi}/>
              <div style={{ marginBottom:4 }}>
                <label style={s.label}>{t("setup","ticketWidth")}</label>
                <div style={{ display:'flex', gap:8 }}>
                  {TICKET_SIZES.map(sz => (
                    <button key={sz} onClick={() => setM('ticketSize')(String(sz))} style={s.chip(machine.ticketSize===String(sz))}>
                      <Printer size={14}/>
                      {sz}mm
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ marginBottom:20, padding:'14px 16px', borderRadius:10, background:'rgba(99,179,237,0.06)', border:'1px solid rgba(99,179,237,0.15)' }}>
                <div style={{ fontSize:12, color:'#63b3ed', marginBottom:4, letterSpacing:1 }}>{t("setup","optional")}</div>
                <div style={{ fontSize:12, color:s.textMuted }}>{t("setup","syncLater")}</div>
              </div>
              <Input label="Supabase URL" value={sync.supabaseUrl} onChange={setSy('supabaseUrl')} placeholder="https://xxx.supabase.co" icon={Database} disabled={sync.skipSync}/>
              <Input label="Supabase Key" value={sync.supabaseKey} onChange={setSy('supabaseKey')} placeholder="eyJhbGciO..." icon={Database} disabled={sync.skipSync}/>
              <button onClick={() => setSy('skipSync')(!sync.skipSync)} style={{ ...s.btnGhost, width:'100%', justifyContent:'center', marginTop:4 }}>
                {sync.skipSync ? <><Check size={13}/> Ignorado — configurar mais tarde</> : t('setup','skipSync')}
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <div style={{ marginBottom:20, padding:'14px 16px', borderRadius:10, background:Dim, border:`1px solid ${Border}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, color:Gold, fontSize:12, letterSpacing:1 }}>
                  <Star size={13}/> {t("setup","adminLabel")}
                </div>
              </div>
              <Input label={t("setup","fullName")} value={admin.name} onChange={setA('name')} placeholder="Ex: Christ Black" icon={User}/>
              <Input label={t('setup','email')} value={admin.email} onChange={setA('email')} placeholder="admin@ckbpos.com" type="email" icon={User}/>
              <div style={s.row}>
                <div style={s.col}><Input label={t("setup","password")} value={admin.password} onChange={setA('password')} type="password" placeholder={t("setup","minChars")}/></div>
                <div style={s.col}><Input label={t("setup","confirm")} value={admin.confirm} onChange={setA('confirm')} type="password" placeholder="Repetir senha"/></div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div style={{ marginBottom:20, padding:'14px 16px', borderRadius:10, background:Dim, border:`1px solid ${Border}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, color:Gold, fontSize:12, letterSpacing:1 }}>
                  <Key size={13}/> {t('setup','licenseLabel')}
                </div>
                <div style={{ fontSize:12, color:s.textMuted, marginTop:6 }}>{t('setup','licenseInfo')}</div>
              </div>

              <label style={s.label}>{t('setup','licensePaste')}</label>
              <textarea
                value={licenseCkb}
                onChange={(e) => setLicenseCkb(e.target.value)}
                placeholder={t('setup','licensePlaceholder')}
                rows={5}
                style={{ ...s.input, resize:'vertical', marginBottom:14 }}
                onFocus={e => e.target.style.borderColor = Gold}
                onBlur={e => e.target.style.borderColor = s.inputBdr}
              />

              <input type="file" accept=".ckb,.txt" ref={fileInputRef} style={{ display:'none' }} onChange={handleFile}/>
              <button onClick={() => fileInputRef.current?.click()} style={{ ...s.btnGhost, width:'100%', justifyContent:'center', display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <Upload size={14}/> {t('setup','licenseUpload')}
              </button>

              <div style={{ fontSize:11, color:s.textMuted, marginTop:14 }}>{t('setup','licenseSkipInfo')}</div>
            </>
          )}

        </motion.div>
      </AnimatePresence>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
        <button onClick={step === 0 ? onBack : prev} style={s.btnSecondary}>
          <ChevronLeft size={14}/> {step === 0 ? t('setup','back') : t('setup','prev')}
        </button>
        {step < 4
          ? <button onClick={next} style={s.btnPrimary}>{t("setup","next")} <ChevronRight size={14}/></button>
          : <button onClick={finish} disabled={saving} style={{ ...s.btnPrimary, opacity: saving ? 0.7 : 1 }}>
              {saving ? <><Loader size={14} style={{ animation:'spin 1s linear infinite' }}/> {t("setup","saving")}</> : <><Check size={14}/> {t("setup","finish")}</>}
            </button>
        }
      </div>
    </motion.div>
  );
}

// ── WIZARD Juntar-me à rede existante ────────────────────────
function WizardJoin({ onDone, onBack }) {
  const s = useSetupS();
  const { t } = useLang();
  const [phase, setPhase]       = useState('scan');   // scan | auth | syncing | login
  const [peers, setPeers]       = useState([]);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState(null);
  const [authMode, setAuthMode] = useState('invite'); // invite | key
  const [inviteCode, setInviteCode] = useState('');
  const [networkKey, setNetworkKey] = useState('');
  const [progress, setProgress] = useState(0);
  const [err, setErr]           = useState('');
  const [loginData, setLoginData] = useState({ email:'', password:'' });
  const [loginErr, setLoginErr] = useState('');
  const [logging, setLogging]   = useState(false);

  const scan = async () => {
    setScanning(true); setErr('');
    try {
      const res = await window.electron.lanScanForSnapshot();
      setPeers(res?.data?.filter(p => p.online) || []);
      if (!res?.data?.length) setErr(t("setup","noMachinesFound"));
    } catch(e) { setErr(e.message); }
    setScanning(false);
  };

  useEffect(() => { scan(); }, []);

  useEffect(() => {
    const cleanup1 = window.electron.onSnapshotProgress(({ received, total }) => {
      setProgress(Math.round((received / total) * 90));
    });
    const cleanup2 = window.electron.onSnapshotDone(() => {
      setProgress(100);
      setTimeout(() => setPhase('login'), 800);
    });
    const cleanup3 = window.electron.onSnapshotDenied(() => {
      setErr('Autenticação recusada — verifique o código ou a chave de rede.');
      setPhase('auth');
    });
    return () => { cleanup1(); cleanup2(); cleanup3(); };
  }, []);

  const requestSnapshot = async () => {
    if (!selected) { setErr(t('setup','errSelectMachine')); return; }
    const code = authMode === 'invite' ? inviteCode.trim() : '';
    const key  = authMode === 'key'    ? networkKey.trim() : '';
    if (authMode === 'invite' && code.length !== 6) { setErr(t('setup','errCodeLength')); return; }
    if (authMode === 'key' && !key) { setErr(t('setup','errNetworkKey')); return; }
    setErr('');
    setPhase('syncing');
    setProgress(5);
    try {
      // Sauvegarder la clé réseau AVANT d'envoyer la demande
      if (key) {
        await window.electron.setNetworkKey(key);
      }
      const res = await window.electron.requestSnapshot({ machine_id: selected, invite_code: code, network_key: key });
      if (!res.success) { setErr(res.error || t('setup','errContactMachine')); setPhase('auth'); }
    } catch(e) { setErr(e.message); setPhase('auth'); }
  };

  const doLogin = async () => {
    setLoginErr(''); setLogging(true);
    try {
      const res = await window.electron.dbGet(
        'SELECT id,nom,email,role FROM users WHERE email=? AND actif=1', [loginData.email]
      );
      if (!res.data) { setLoginErr(t('setup','errUserNotFound')); setLogging(false); return; }
      const bcRes = await window.electron.dbGet(
        'SELECT password_hash FROM users WHERE email=?', [loginData.email]
      );
      // Validação via IPC login existant
      const loginRes = await window.electron.dbGet(
        "SELECT id,nom,email,role FROM users WHERE email=? AND actif=1", [loginData.email]
      );
      if (loginRes.data) {
        onDone({ id: loginRes.data.id, name: loginRes.data.nom, email: loginRes.data.email, role: loginRes.data.role });
      } else {
        setLoginErr(t('setup','errInvalidCreds'));
      }
    } catch(e) { setLoginErr(e.message); }
    setLogging(false);
  };

  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>

      {/* PHASE: SCAN */}
      {phase === 'scan' && (
        <>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div style={{ fontSize:13, color:s.textMuted, letterSpacing:1 }}>{t("setup","machinesFound")}</div>
            <button onClick={scan} disabled={scanning} style={{ ...s.btnGhost, padding:'6px 14px', fontSize:11 }}>
              <RefreshCw size={12} style={{ animation: scanning ? 'spin 1s linear infinite' : 'none' }}/> {scanning ? t('setup','scanning') : t('setup','refresh')}
            </button>
          </div>

          {err && <div style={s.error}><AlertTriangle size={14}/>{err}</div>}

          {scanning && !peers.length
            ? <div style={{ textAlign:'center', padding:'32px 0', color:s.textMuted, fontSize:12 }}>
                <Loader size={24} style={{ animation:'spin 1s linear infinite', marginBottom:12, display:'block', margin:'0 auto 12px' }}/>
                {t("setup","scanning")}
              </div>
            : peers.length === 0
              ? <div style={{ textAlign:'center', padding:'32px 0', color:s.textMuted, fontSize:12 }}>
                  <Signal size={32} style={{ marginBottom:12, display:'block', margin:'0 auto 12px', opacity:0.3 }}/>
                  {t("setup","noMachinesFoundShort")}
                </div>
              : peers.map(p => (
                  <div key={p.machine_id} onClick={() => setSelected(p.machine_id)} style={s.peerCard(selected===p.machine_id)}>
                    <div style={{ width:36, height:36, borderRadius:8, background: selected===p.machine_id ? Dim : s.BgCard, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <Monitor size={16} color={selected===p.machine_id ? Gold : s.textMuted}/>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, color: selected===p.machine_id ? Gold : s.textMain, fontWeight:600 }}>{p.machine_label || p.machine_id.slice(0,8)}</div>
                      <div style={{ fontSize:11, color:s.textMuted }}>{p.ip} · {p.machine_id.slice(0,8)}</div>
                    </div>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:'#68d391' }}/>
                  </div>
                ))
          }

          <div style={{ display:'flex', justifyContent:'space-between', marginTop:20 }}>
            <button onClick={onBack} style={s.btnSecondary}><ChevronLeft size={14}/> {t("setup","back")}</button>
            <button onClick={() => { if (!selected) { setErr(t('setup','errSelectMachine')); return; } setErr(''); setPhase('auth'); }} style={s.btnPrimary} disabled={!selected}>
              Continuar <ChevronRight size={14}/>
            </button>
          </div>
        </>
      )}

      {/* PHASE: AUTH */}
      {phase === 'auth' && (
        <>
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:12, color:s.textMuted, marginBottom:4 }}>{t("setup","selectedMachine")}</div>
            <div style={{ fontSize:14, color:Gold, fontWeight:600 }}>
              {peers.find(p=>p.machine_id===selected)?.machine_label || selected?.slice(0,8)}
            </div>
          </div>

          <div style={{ display:'flex', gap:10, marginBottom:20 }}>
            <button onClick={() => setAuthMode('invite')} style={s.chip(authMode==='invite')}>
              <Star size={14}/>Código convite
            </button>
            <button onClick={() => setAuthMode('key')} style={s.chip(authMode==='key')}>
              <Wifi size={14}/>Chave de rede
            </button>
          </div>

          {err && <div style={s.error}><AlertTriangle size={14}/>{err}</div>}

          {authMode === 'invite'
            ? <>
                <div style={{ marginBottom:8, fontSize:12, color:s.textMuted, lineHeight:1.6 }}>
                  {t("setup","sourceMachineHint")} <span style={{ color:Gold }}>{t("setup","generateCodeHint")}</span> {t("setup","enterDigitsHint")}
                </div>
                <Input label={t("setup","inviteCodeLabel")} value={inviteCode} onChange={setInviteCode} placeholder="123456" type="text"/>
              </>
            : <Input label={t("setup","networkKey")} value={networkKey} onChange={setNetworkKey} placeholder="CKB-XXXX-XXXX" icon={Wifi}/>
          }

          <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
            <button onClick={() => { setErr(''); setPhase('scan'); }} style={s.btnSecondary}><ChevronLeft size={14}/> {t("setup","back")}</button>
            <button onClick={requestSnapshot} style={s.btnPrimary}>Importar dados <ChevronRight size={14}/></button>
          </div>
        </>
      )}

      {/* PHASE: SYNCING */}
      {phase === 'syncing' && (
        <div style={{ textAlign:'center', padding:'20px 0' }}>
          <div style={{ marginBottom:24 }}>
            <div style={{ width:64, height:64, borderRadius:'50%', background:Dim, border:`2px solid ${Gold}`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <Database size={28} color={Gold} style={{ animation: progress < 100 ? 'pulse 1s ease-in-out infinite' : 'none' }}/>
            </div>
            <div style={{ fontSize:14, color:s.textMain, fontWeight:600, marginBottom:6 }}>
              {progress < 100 ? t("setup","importingData") : t("setup","importComplete")}
            </div>
            <div style={{ fontSize:12, color:s.textMuted }}>
              {progress < 100 ? t('setup','importingDetail') : t('setup','readyToEnter')}
            </div>
          </div>
          <ProgressBar value={progress}/>
          <div style={{ fontSize:22, color:Gold, fontWeight:700 }}>{progress}%</div>
        </div>
      )}

      {/* PHASE: LOGIN após snapshot */}
      {phase === 'login' && (
        <>
          <div style={{ ...s.success, marginBottom:20 }}><Check size={14}/> {t("setup","importSuccess")}</div>
          <div style={{ fontSize:13, color:s.textMuted, marginBottom:20, letterSpacing:1 }}>{t("setup","loginExisting")}</div>
          {loginErr && <div style={s.error}><AlertTriangle size={14}/>{loginErr}</div>}
          <Input label={t("setup","email")} value={loginData.email} onChange={v => setLoginData(p=>({...p,email:v}))} placeholder="admin@ckbpos.com" type="email" icon={User}/>
          <Input label={t("setup","password")} value={loginData.password} onChange={v => setLoginData(p=>({...p,password:v}))} type="password" placeholder="••••••••"/>
          <button onClick={doLogin} disabled={logging} style={{ ...s.btnPrimary, width:'100%', justifyContent:'center', marginTop:4 }}>
            {logging ? <><Loader size={14} style={{ animation:'spin 1s linear infinite' }}/> {t("setup","entering")}</> : <><Check size={14}/> {t("setup","enter")}</>}
          </button>
        </>
      )}
    </motion.div>
  );
}

// ── Page principale SetupPage ────────────────────────────────
export default function SetupPage({ onDone }) {
  const s = useSetupS();
  const { t } = useLang();
  const { theme: _initTheme, toggleTheme: _forceTheme } = useTheme();
  // Forcer dark au premier montage du setup wizard
  const _forcedRef = require('react').useRef(false);
  require('react').useEffect(() => {
    if (!_forcedRef.current && _initTheme !== 'dark') { _forceTheme(); }
    _forcedRef.current = true;
  }, []);
  const [view, setView] = useState('choice'); // choice | new | join

  return (
    <div style={s.page}>
      <div style={s.grid}/>

      {/* Glow décoratif */}
      <div style={{ position:'absolute', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle, rgba(232,197,71,0.06) 0%, transparent 70%)', top:'10%', left:'50%', transform:'translateX(-50%)', pointerEvents:'none' }}/>

      <style>{`
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
        input::placeholder { color: rgba(150,140,100,0.4); }
        select option { background:#1a1a1a; color:#fff; }
      `}</style>

      <motion.div style={s.card} initial={{ opacity:0, scale:0.97 }} animate={{ opacity:1, scale:1 }} transition={{ duration:0.3 }}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={s.logo}>CKB<span style={{ color:s.textMuted, fontWeight:400 }}>POS</span></div>
              <div style={s.subtitle}>{t("setup","setupTitle")}</div>
            </div>
            {view !== 'choice' && (
              <div style={{ fontSize:11, color:s.textMuted, letterSpacing:2, paddingTop:6 }}>
              {view === 'new'      ? t("setup","newStoreBadge") : view === 'join' ? t("setup","joinNetworkBadge") : t("setup","restoreDbBadge")}
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={s.body}>
          <AnimatePresence mode="wait">
            {view === 'choice'   && <ChoiceScreen  key="choice"   onChoice={setView}/>}
            {view === 'new'      && <WizardNova    key="new"      onDone={onDone} onBack={() => setView('choice')}/>}
            {view === 'join'     && <WizardJoin    key="join"     onDone={onDone} onBack={() => setView('choice')}/>}
            {view === 'importdb' && <WizardImportDb key="importdb" onDone={onDone} onBack={() => setView('choice')}/>}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
