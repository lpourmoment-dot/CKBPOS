import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, Monitor, Wifi, ShieldCheck, User, ChevronRight, ChevronLeft,
  Check, Loader, RefreshCw, Eye, EyeOff, Globe, Palette,
  Printer, Database, AlertTriangle, Signal, Star, Copy
} from 'lucide-react';

// ── Constantes ───────────────────────────────────────────────
const CURRENCIES = ['AOA','USD','EUR','BRL'];
const LANGUAGES  = [{ code:'pt', label:'Português' }, { code:'fr', label:'Français' }];
const TICKET_SIZES = [52, 60, 72, 80];
const THEMES = ['dark','light'];

// ── Helpers visuels ──────────────────────────────────────────
const Gold   = '#e8c547';
const Dim    = 'rgba(232,197,71,0.15)';
const Border = 'rgba(232,197,71,0.25)';
const BgCard = 'rgba(255,255,255,0.03)';

const s = {
  page: {
    minHeight:'100vh', background:'#0a0a0a',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontFamily:"'Courier New', Courier, monospace",
    overflow:'hidden', position:'relative',
  },
  grid: {
    position:'absolute', inset:0, pointerEvents:'none',
    backgroundImage:`linear-gradient(rgba(232,197,71,0.04) 1px, transparent 1px),
                     linear-gradient(90deg, rgba(232,197,71,0.04) 1px, transparent 1px)`,
    backgroundSize:'40px 40px',
  },
  card: {
    width:'100%', maxWidth:560, margin:'0 20px',
    background:'rgba(10,10,10,0.95)',
    border:`1px solid ${Border}`,
    borderRadius:16,
    boxShadow:'0 0 60px rgba(232,197,71,0.08)',
    overflow:'hidden',
    position:'relative', zIndex:1,
  },
  header: {
    padding:'32px 40px 24px',
    borderBottom:`1px solid rgba(232,197,71,0.1)`,
  },
  logo: {
    fontSize:28, fontWeight:700, letterSpacing:6, color:Gold,
    marginBottom:4,
  },
  subtitle: { fontSize:11, color:'rgba(232,197,71,0.5)', letterSpacing:3 },
  body: { padding:'32px 40px' },
  footer: {
    padding:'20px 40px 28px',
    borderTop:`1px solid rgba(255,255,255,0.06)`,
    display:'flex', gap:12, justifyContent:'flex-end',
  },
  label: {
    display:'block', fontSize:11, color:'rgba(232,197,71,0.7)',
    letterSpacing:2, marginBottom:8, textTransform:'uppercase',
  },
  input: {
    width:'100%', background:'rgba(255,255,255,0.04)',
    border:`1px solid rgba(255,255,255,0.1)`,
    borderRadius:8, padding:'10px 14px',
    color:'#fff', fontSize:13, outline:'none',
    transition:'border 0.2s',
    boxSizing:'border-box',
    fontFamily:'inherit',
  },
  btnPrimary: {
    background:Gold, color:'#0a0a0a',
    border:'none', borderRadius:8,
    padding:'11px 24px', fontWeight:700,
    fontSize:13, cursor:'pointer',
    letterSpacing:1, fontFamily:'inherit',
    display:'flex', alignItems:'center', gap:8,
    transition:'opacity 0.15s',
  },
  btnSecondary: {
    background:'transparent', color:'rgba(255,255,255,0.5)',
    border:`1px solid rgba(255,255,255,0.12)`,
    borderRadius:8, padding:'11px 24px',
    fontSize:13, cursor:'pointer',
    fontFamily:'inherit',
    display:'flex', alignItems:'center', gap:8,
    transition:'all 0.15s',
  },
  btnGhost: {
    background:'transparent', color:Gold,
    border:`1px solid ${Border}`,
    borderRadius:8, padding:'10px 20px',
    fontSize:12, cursor:'pointer',
    fontFamily:'inherit', letterSpacing:1,
    transition:'all 0.15s',
  },
  row: { display:'flex', gap:14, marginBottom:18 },
  col: { flex:1 },
  error: {
    background:'rgba(245,101,101,0.08)', border:'1px solid rgba(245,101,101,0.25)',
    borderRadius:8, padding:'10px 14px', color:'#fc8181',
    fontSize:12, marginBottom:16, display:'flex', alignItems:'center', gap:8,
  },
  success: {
    background:'rgba(72,187,120,0.08)', border:'1px solid rgba(72,187,120,0.25)',
    borderRadius:8, padding:'10px 14px', color:'#68d391',
    fontSize:12, marginBottom:16, display:'flex', alignItems:'center', gap:8,
  },
  chip: (active) => ({
    flex:1, padding:'12px 10px', borderRadius:8, cursor:'pointer',
    border: active ? `1.5px solid ${Gold}` : '1px solid rgba(255,255,255,0.1)',
    background: active ? Dim : 'transparent',
    color: active ? Gold : 'rgba(255,255,255,0.45)',
    fontSize:12, textAlign:'center', transition:'all 0.15s',
    fontFamily:'inherit', letterSpacing:1,
    display:'flex', flexDirection:'column', alignItems:'center', gap:6,
  }),
  peerCard: (sel) => ({
    padding:'14px 16px', borderRadius:10, cursor:'pointer',
    border: sel ? `1.5px solid ${Gold}` : '1px solid rgba(255,255,255,0.1)',
    background: sel ? Dim : BgCard,
    marginBottom:10, display:'flex', alignItems:'center', gap:12,
    transition:'all 0.15s',
  }),
};

// ── Composants atomiques ─────────────────────────────────────
function Input({ label, value, onChange, type='text', placeholder='', disabled=false, icon:Icon }) {
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
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
        />
        {isPass && (
          <button onClick={() => setShow(!show)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)', padding:0 }}>
            {show ? <EyeOff size={14}/> : <Eye size={14}/>}
          </button>
        )}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom:18 }}>
      {label && <label style={s.label}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ ...s.input, cursor:'pointer' }}
        onFocus={e => e.target.style.borderColor = Gold}
        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
      >
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    </div>
  );
}

function StepDots({ total, current }) {
  return (
    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? 20 : 6, height:6, borderRadius:3,
          background: i < current ? Gold : i === current ? Gold : 'rgba(255,255,255,0.12)',
          transition:'all 0.3s',
        }}/>
      ))}
    </div>
  );
}

function ProgressBar({ value }) {
  return (
    <div style={{ height:3, background:'rgba(255,255,255,0.08)', borderRadius:2, marginBottom:24, overflow:'hidden' }}>
      <motion.div animate={{ width: value + '%' }} style={{ height:'100%', background:Gold, borderRadius:2 }} transition={{ duration:0.4 }}/>
    </div>
  );
}

// ── Choix initial ─────────────────────────────────────────────
function ChoiceScreen({ onChoice }) {
  return (
    <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-16 }}>
      <div style={{ textAlign:'center', marginBottom:32 }}>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)', marginBottom:6, letterSpacing:2 }}>BEM-VINDO</div>
        <div style={{ fontSize:22, color:'#fff', fontWeight:700, letterSpacing:2 }}>Como deseja começar?</div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <motion.button whileHover={{ scale:1.01 }} whileTap={{ scale:0.99 }}
          onClick={() => onChoice('new')}
          style={{ background:BgCard, border:`1.5px solid ${Border}`, borderRadius:12, padding:'20px 24px', cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:16 }}
        >
          <div style={{ width:44, height:44, borderRadius:10, background:Dim, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Store size={20} color={Gold}/>
          </div>
          <div>
            <div style={{ color:'#fff', fontSize:14, fontWeight:700, marginBottom:3, letterSpacing:1 }}>Nova Boutique</div>
            <div style={{ color:'rgba(255,255,255,0.4)', fontSize:12 }}>Configurar do zero — nome, máquina, admin</div>
          </div>
          <ChevronRight size={16} color={Gold} style={{ marginLeft:'auto' }}/>
        </motion.button>

        <motion.button whileHover={{ scale:1.01 }} whileTap={{ scale:0.99 }}
          onClick={() => onChoice('join')}
          style={{ background:BgCard, border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, padding:'20px 24px', cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:16 }}
        >
          <div style={{ width:44, height:44, borderRadius:10, background:'rgba(99,179,237,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Signal size={20} color='#63b3ed'/>
          </div>
          <div>
            <div style={{ color:'#fff', fontSize:14, fontWeight:700, marginBottom:3, letterSpacing:1 }}>Juntar-me a uma rede</div>
            <div style={{ color:'rgba(255,255,255,0.4)', fontSize:12 }}>Importar dados de uma máquina ativa no LAN</div>
          </div>
          <ChevronRight size={16} color='rgba(255,255,255,0.3)' style={{ marginLeft:'auto' }}/>
        </motion.button>

        <motion.button whileHover={{ scale:1.01 }} whileTap={{ scale:0.99 }}
          onClick={() => onChoice('importdb')}
          style={{ background:BgCard, border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, padding:'20px 24px', cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:16 }}
        >
          <div style={{ width:44, height:44, borderRadius:10, background:'rgba(34,197,94,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Database size={20} color='#22c55e'/>
          </div>
          <div>
            <div style={{ color:'#fff', fontSize:14, fontWeight:700, marginBottom:3, letterSpacing:1 }}>Restaurar base de dados</div>
            <div style={{ color:'rgba(255,255,255,0.4)', fontSize:12 }}>Importar um ficheiro .db existente do CKBPOS</div>
          </div>
          <ChevronRight size={16} color='rgba(255,255,255,0.3)' style={{ marginLeft:'auto' }}/>
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── WIZARD Importar DB ────────────────────────────────────────
function WizardImportDb({ onDone, onBack }) {
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
        <div style={{ fontSize:18, color:'#fff', fontWeight:700, marginBottom:8 }}>Restaurar base de dados</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)', lineHeight:1.6 }}>
          Selecione um ficheiro <strong style={{ color:'rgba(255,255,255,0.7)' }}>.db</strong> exportado anteriormente do CKBPOS.<br/>
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

        <button onClick={onBack} style={{ background:'transparent', border:'none', color:'rgba(255,255,255,0.35)', fontSize:13, cursor:'pointer', padding:'8px 0', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          <ChevronLeft size={14}/> Voltar
        </button>
      </div>
    </motion.div>
  );
}

// ── WIZARD Nova Boutique ──────────────────────────────────────
function WizardNova({ onDone, onBack }) {
  const [step, setStep]     = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const [shop, setShop]     = useState({ name:'', address:'', phone:'', currency:'AOA', language:'pt', theme:'dark' });
  const [machine, setMachine] = useState({ label:'Caixa Principal', networkKey:'', ticketSize:'72' });
  const [sync, setSync]     = useState({ supabaseUrl:'', supabaseKey:'', skipSync:false });
  const [admin, setAdmin]   = useState({ name:'', email:'', password:'', confirm:'' });

  const STEPS = [
    { icon:Store,      label:'Loja' },
    { icon:Monitor,    label:'Máquina' },
    { icon:Database,   label:'Sync' },
    { icon:ShieldCheck,label:'Admin' },
  ];

  const setS = (key) => (val) => setShop(p => ({ ...p, [key]: val }));
  const setM = (key) => (val) => setMachine(p => ({ ...p, [key]: val }));
  const setSy = (key) => (val) => setSync(p => ({ ...p, [key]: val }));
  const setA = (key) => (val) => setAdmin(p => ({ ...p, [key]: val }));

  const validateStep = () => {
    setErr('');
    if (step === 0 && !shop.name.trim()) { setErr('Nome da loja obrigatório'); return false; }
    if (step === 1 && !machine.label.trim()) { setErr('Nome da máquina obrigatório'); return false; }
    if (step === 3) {
      if (!admin.name.trim() || !admin.email.trim() || !admin.password) { setErr('Todos os campos são obrigatórios'); return false; }
      if (!admin.email.includes('@')) { setErr('Email inválido'); return false; }
      if (admin.password.length < 6) { setErr('Senha mínimo 6 caracteres'); return false; }
      if (admin.password !== admin.confirm) { setErr('Senhas não coincidem'); return false; }
    }
    return true;
  };

  const next = () => { if (validateStep()) setStep(s => Math.min(s + 1, 3)); };
  const prev = () => { setErr(''); setStep(s => Math.max(s - 1, 0)); };

  const finish = async () => {
    if (!validateStep()) return;
    setSaving(true);
    try {
      const res = await window.electron.setupComplete({ shop, machine, admin, sync: sync.skipSync ? {} : sync });
      if (res.success) onDone({ name: admin.name, email: admin.email, role: 'admin', id: 1 });
      else setErr(res.error || 'Erro ao guardar configuração');
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  const progress = ((step + 1) / 4) * 100;

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
              {i > 0 && <div style={{ position:'absolute', left:0, top:16, width:'50%', height:1, background: done || active ? Gold : 'rgba(255,255,255,0.1)' }}/>}
              {i < STEPS.length-1 && <div style={{ position:'absolute', right:0, top:16, width:'50%', height:1, background: done ? Gold : 'rgba(255,255,255,0.1)' }}/>}
              <div style={{
                width:32, height:32, borderRadius:'50%', zIndex:1,
                background: done ? Gold : active ? Dim : 'rgba(255,255,255,0.05)',
                border: active ? `2px solid ${Gold}` : done ? 'none' : '1px solid rgba(255,255,255,0.12)',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                {done ? <Check size={14} color='#0a0a0a'/> : <Icon size={13} color={active ? Gold : 'rgba(255,255,255,0.3)'}/>}
              </div>
              <div style={{ fontSize:10, color: active ? Gold : done ? 'rgba(232,197,71,0.5)' : 'rgba(255,255,255,0.25)', letterSpacing:1 }}>{st.label}</div>
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
              <Input label="Nome da Loja *" value={shop.name} onChange={setS('name')} placeholder="Ex: CKB Store" icon={Store}/>
              <div style={s.row}>
                <div style={s.col}><Input label="Endereço" value={shop.address} onChange={setS('address')} placeholder="Luanda, Angola"/></div>
                <div style={s.col}><Input label="Telefone" value={shop.phone} onChange={setS('phone')} placeholder="+244 9xx xxx xxx"/></div>
              </div>
              <div style={s.row}>
                <div style={s.col}><Select label="Moeda" value={shop.currency} onChange={setS('currency')} options={CURRENCIES}/></div>
                <div style={s.col}><Select label="Idioma" value={shop.language} onChange={setS('language')} options={LANGUAGES.map(l=>({ value:l.code, label:l.label }))}/></div>
              </div>
              <div style={{ marginBottom:4 }}>
                <label style={s.label}>Tema</label>
                <div style={{ display:'flex', gap:10 }}>
                  {THEMES.map(t => (
                    <button key={t} onClick={() => setS('theme')(t)} style={s.chip(shop.theme===t)}>
                      <Palette size={16}/>
                      {t === 'dark' ? 'Escuro' : 'Claro'}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <Input label="Nome desta máquina *" value={machine.label} onChange={setM('label')} placeholder="Ex: Caixa Principal" icon={Monitor}/>
              <Input label="Chave de rede LAN" value={machine.networkKey} onChange={setM('networkKey')} placeholder="Ex: CKB-XXXX-XXXX" icon={Wifi}/>
              <div style={{ marginBottom:4 }}>
                <label style={s.label}>Largura do ticket</label>
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
                <div style={{ fontSize:12, color:'#63b3ed', marginBottom:4, letterSpacing:1 }}>OPCIONAL</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>A sincronização cloud pode ser configurada mais tarde em Configurações.</div>
              </div>
              <Input label="Supabase URL" value={sync.supabaseUrl} onChange={setSy('supabaseUrl')} placeholder="https://xxx.supabase.co" icon={Database} disabled={sync.skipSync}/>
              <Input label="Supabase Key" value={sync.supabaseKey} onChange={setSy('supabaseKey')} placeholder="eyJhbGciO..." icon={Database} disabled={sync.skipSync}/>
              <button onClick={() => setSy('skipSync')(!sync.skipSync)} style={{ ...s.btnGhost, width:'100%', justifyContent:'center', marginTop:4 }}>
                {sync.skipSync ? <><Check size={13}/> Ignorado — configurar mais tarde</> : 'Ignorar por agora'}
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <div style={{ marginBottom:20, padding:'14px 16px', borderRadius:10, background:Dim, border:`1px solid ${Border}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, color:Gold, fontSize:12, letterSpacing:1 }}>
                  <Star size={13}/> Este será o administrador principal
                </div>
              </div>
              <Input label="Nome completo *" value={admin.name} onChange={setA('name')} placeholder="Ex: Christ Black" icon={User}/>
              <Input label="Email *" value={admin.email} onChange={setA('email')} placeholder="admin@ckbpos.com" type="email" icon={User}/>
              <div style={s.row}>
                <div style={s.col}><Input label="Senha *" value={admin.password} onChange={setA('password')} type="password" placeholder="Mínimo 6 caracteres"/></div>
                <div style={s.col}><Input label="Confirmar *" value={admin.confirm} onChange={setA('confirm')} type="password" placeholder="Repetir senha"/></div>
              </div>
            </>
          )}

        </motion.div>
      </AnimatePresence>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
        <button onClick={step === 0 ? onBack : prev} style={s.btnSecondary}>
          <ChevronLeft size={14}/> {step === 0 ? 'Voltar' : 'Anterior'}
        </button>
        {step < 3
          ? <button onClick={next} style={s.btnPrimary}>Próximo <ChevronRight size={14}/></button>
          : <button onClick={finish} disabled={saving} style={{ ...s.btnPrimary, opacity: saving ? 0.7 : 1 }}>
              {saving ? <><Loader size={14} style={{ animation:'spin 1s linear infinite' }}/> A guardar...</> : <><Check size={14}/> Concluir Setup</>}
            </button>
        }
      </div>
    </motion.div>
  );
}

// ── WIZARD Juntar-me à rede existante ────────────────────────
function WizardJoin({ onDone, onBack }) {
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
      if (!res?.data?.length) setErr('Nenhuma máquina CKBPOS encontrada no LAN. Certifique-se que as outras máquinas estão ligadas.');
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
    if (!selected) { setErr('Selecione uma máquina'); return; }
    const code = authMode === 'invite' ? inviteCode.trim() : '';
    const key  = authMode === 'key'    ? networkKey.trim() : '';
    if (authMode === 'invite' && code.length !== 6) { setErr('Código deve ter 6 dígitos'); return; }
    if (authMode === 'key' && !key) { setErr('Insira a chave de rede'); return; }
    setErr('');
    setPhase('syncing');
    setProgress(5);
    try {
      const res = await window.electron.requestSnapshot({ machine_id: selected, invite_code: code, network_key: key });
      if (!res.success) { setErr(res.error || 'Erro ao contactar a máquina'); setPhase('auth'); }
    } catch(e) { setErr(e.message); setPhase('auth'); }
  };

  const doLogin = async () => {
    setLoginErr(''); setLogging(true);
    try {
      const res = await window.electron.dbGet(
        'SELECT id,nom,email,role FROM users WHERE email=? AND actif=1', [loginData.email]
      );
      if (!res.data) { setLoginErr('Utilizador não encontrado'); setLogging(false); return; }
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
        setLoginErr('Credenciais inválidas');
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
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)', letterSpacing:1 }}>MÁQUINAS DETECTADAS</div>
            <button onClick={scan} disabled={scanning} style={{ ...s.btnGhost, padding:'6px 14px', fontSize:11 }}>
              <RefreshCw size={12} style={{ animation: scanning ? 'spin 1s linear infinite' : 'none' }}/> {scanning ? 'A pesquisar...' : 'Atualizar'}
            </button>
          </div>

          {err && <div style={s.error}><AlertTriangle size={14}/>{err}</div>}

          {scanning && !peers.length
            ? <div style={{ textAlign:'center', padding:'32px 0', color:'rgba(255,255,255,0.3)', fontSize:12 }}>
                <Loader size={24} style={{ animation:'spin 1s linear infinite', marginBottom:12, display:'block', margin:'0 auto 12px' }}/>
                A pesquisar na rede LAN...
              </div>
            : peers.length === 0
              ? <div style={{ textAlign:'center', padding:'32px 0', color:'rgba(255,255,255,0.3)', fontSize:12 }}>
                  <Signal size={32} style={{ marginBottom:12, display:'block', margin:'0 auto 12px', opacity:0.3 }}/>
                  Nenhuma máquina encontrada
                </div>
              : peers.map(p => (
                  <div key={p.machine_id} onClick={() => setSelected(p.machine_id)} style={s.peerCard(selected===p.machine_id)}>
                    <div style={{ width:36, height:36, borderRadius:8, background: selected===p.machine_id ? Dim : 'rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <Monitor size={16} color={selected===p.machine_id ? Gold : 'rgba(255,255,255,0.4)'}/>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, color: selected===p.machine_id ? Gold : '#fff', fontWeight:600 }}>{p.machine_label || p.machine_id.slice(0,8)}</div>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>{p.ip} · {p.machine_id.slice(0,8)}</div>
                    </div>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:'#68d391' }}/>
                  </div>
                ))
          }

          <div style={{ display:'flex', justifyContent:'space-between', marginTop:20 }}>
            <button onClick={onBack} style={s.btnSecondary}><ChevronLeft size={14}/> Voltar</button>
            <button onClick={() => { if (!selected) { setErr('Selecione uma máquina'); return; } setErr(''); setPhase('auth'); }} style={s.btnPrimary} disabled={!selected}>
              Continuar <ChevronRight size={14}/>
            </button>
          </div>
        </>
      )}

      {/* PHASE: AUTH */}
      {phase === 'auth' && (
        <>
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:4 }}>Máquina selecionada</div>
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
                <div style={{ marginBottom:8, fontSize:12, color:'rgba(255,255,255,0.45)', lineHeight:1.6 }}>
                  Na máquina origem, vá a <span style={{ color:Gold }}>Configurações → Rede → Gerar código</span> e introduza os 6 dígitos aqui.
                </div>
                <Input label="Código de convite (6 dígitos)" value={inviteCode} onChange={setInviteCode} placeholder="123456" type="text"/>
              </>
            : <Input label="Chave de rede LAN" value={networkKey} onChange={setNetworkKey} placeholder="CKB-XXXX-XXXX" icon={Wifi}/>
          }

          <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
            <button onClick={() => { setErr(''); setPhase('scan'); }} style={s.btnSecondary}><ChevronLeft size={14}/> Voltar</button>
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
            <div style={{ fontSize:14, color:'#fff', fontWeight:600, marginBottom:6 }}>
              {progress < 100 ? 'A importar dados...' : 'Importação concluída!'}
            </div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>
              {progress < 100 ? 'Produtos, ventes, utilizadores, configurações' : 'Pronto para entrar'}
            </div>
          </div>
          <ProgressBar value={progress}/>
          <div style={{ fontSize:22, color:Gold, fontWeight:700 }}>{progress}%</div>
        </div>
      )}

      {/* PHASE: LOGIN após snapshot */}
      {phase === 'login' && (
        <>
          <div style={{ ...s.success, marginBottom:20 }}><Check size={14}/> Dados importados com sucesso!</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:20, letterSpacing:1 }}>ENTRAR COM CONTA EXISTENTE</div>
          {loginErr && <div style={s.error}><AlertTriangle size={14}/>{loginErr}</div>}
          <Input label="Email" value={loginData.email} onChange={v => setLoginData(p=>({...p,email:v}))} placeholder="admin@ckbpos.com" type="email" icon={User}/>
          <Input label="Senha" value={loginData.password} onChange={v => setLoginData(p=>({...p,password:v}))} type="password" placeholder="••••••••"/>
          <button onClick={doLogin} disabled={logging} style={{ ...s.btnPrimary, width:'100%', justifyContent:'center', marginTop:4 }}>
            {logging ? <><Loader size={14} style={{ animation:'spin 1s linear infinite' }}/> A entrar...</> : <><Check size={14}/> Entrar</>}
          </button>
        </>
      )}
    </motion.div>
  );
}

// ── Page principale SetupPage ────────────────────────────────
export default function SetupPage({ onDone }) {
  const [view, setView] = useState('choice'); // choice | new | join

  return (
    <div style={s.page}>
      <div style={s.grid}/>

      {/* Glow décoratif */}
      <div style={{ position:'absolute', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle, rgba(232,197,71,0.06) 0%, transparent 70%)', top:'10%', left:'50%', transform:'translateX(-50%)', pointerEvents:'none' }}/>

      <style>{`
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
        input::placeholder { color: rgba(255,255,255,0.2); }
        select option { background:#1a1a1a; color:#fff; }
      `}</style>

      <motion.div style={s.card} initial={{ opacity:0, scale:0.97 }} animate={{ opacity:1, scale:1 }} transition={{ duration:0.3 }}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={s.logo}>CKB<span style={{ color:'rgba(255,255,255,0.6)', fontWeight:400 }}>POS</span></div>
              <div style={s.subtitle}>CONFIGURAÇÃO INICIAL</div>
            </div>
            {view !== 'choice' && (
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', letterSpacing:2, paddingTop:6 }}>
              {view === 'new'      ? 'NOVA BOUTIQUE' : view === 'join' ? 'REDE EXISTENTE' : 'RESTAURAR DB'}
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
