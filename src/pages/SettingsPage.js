import React, { useState, useEffect } from 'react';
import { useTheme } from '../App';
import { useLang } from '../utils/useLang';
import { useAuth } from '../App';
import { Settings, Cloud, CloudOff, Save, ExternalLink, KeyRound, Download, Trash2, AlertTriangle, MapPin, Phone, Hash, Printer, Plus, Minus } from 'lucide-react';
import { useAlert } from '../components/AlertModal'; // ✅ AJOUT

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { t, lang, currency, changeLang, changeCurrency } = useLang();
  const { user } = useAuth();

  // ✅ Hook modal React (remplace alert() natif)
  const { showAlert, AlertModalComponent } = useAlert();

  // Loja
  const [shopName, setShopName]       = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone]     = useState('');
  const [shopNif, setShopNif]         = useState('');

  // Drive
  const [driveConnected, setDriveConnected] = useState(false);
  const [authUrl, setAuthUrl]   = useState('');
  const [authCode, setAuthCode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [lastSync, setLastSync] = useState('');

  // UI
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');

  // Security
  const [question, setQuestion] = useState('');
  const [resposta, setResposta] = useState('');
  const [secMsg, setSecMsg]     = useState('');

  // Reset
  const [showReset, setShowReset]       = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [migrating, setMigrating]       = useState(false);
  const [migrateMsg, setMigrateMsg]     = useState('');
  const [machineInfo, setMachineInfo]   = useState(null);
  const [machineLabel, setMachineLabel] = useState('');
  const [savingLabel, setSavingLabel]   = useState(false);

  // Impressora v1.0.9
  const [printers, setPrinters]               = useState([]);
  const [printerName, setPrinterName]         = useState('');
  const [copiesTicket, setCopiesTicket]       = useState(2);
  const [copiesShift, setCopiesShift]         = useState(1);
  const [printerSaved, setPrinterSaved]       = useState(false);

  useEffect(() => { loadSettings(); checkDrive(); loadSecurity(); loadPrinters(); loadMachineId(); }, []);

  const loadPrinters = async () => {
    const res = await window.electron.getPrinters();
    if (res.success) setPrinters(res.data || []);
    const pName = await window.electron.dbGet("SELECT value FROM settings WHERE key='printer_name'");
    const pCopT = await window.electron.dbGet("SELECT value FROM settings WHERE key='printer_copies_ticket'");
    const pCopS = await window.electron.dbGet("SELECT value FROM settings WHERE key='printer_copies_shift'");
    if (pName.data?.value !== undefined) setPrinterName(pName.data.value);
    if (pCopT.data?.value !== undefined) setCopiesTicket(parseInt(pCopT.data.value) || 2);
    if (pCopS.data?.value !== undefined) setCopiesShift(parseInt(pCopS.data.value) || 1);
  };

  const savePrinterSettings = async () => {
    await window.electron.dbQuery("UPDATE settings SET value=? WHERE key='printer_name'", [printerName]);
    await window.electron.dbQuery("UPDATE settings SET value=? WHERE key='printer_copies_ticket'", [String(copiesTicket)]);
    await window.electron.dbQuery("UPDATE settings SET value=? WHERE key='printer_copies_shift'", [String(copiesShift)]);
    setPrinterSaved(true);
    setTimeout(() => setPrinterSaved(false), 2000);
  };

  const loadSettings = async () => {
    const keys = ['shop_name','shop_address','shop_phone','shop_nif'];
    for (const key of keys) {
      const res = await window.electron.dbGet(`SELECT value FROM settings WHERE key='${key}'`);
      if (res.data?.value !== undefined) {
        if (key === 'shop_name')    setShopName(res.data.value);
        if (key === 'shop_address') setShopAddress(res.data.value);
        if (key === 'shop_phone')   setShopPhone(res.data.value);
        if (key === 'shop_nif')     setShopNif(res.data.value);
      }
    }
    const syncRes = await window.electron.storeGet('last_sync');
    if (syncRes) setLastSync(syncRes);
  };

  const loadSecurity = async () => {
    const res = await window.electron.dbGet("SELECT question_secreta FROM users WHERE id=?", [user.id]);
    if (res.data?.question_secreta) setQuestion(res.data.question_secreta);
  };

  const checkDrive = async () => {
    const res = await window.electron.driveStatus();
    setDriveConnected(res.connected);
  };

  const saveSettings = async () => {
    setSaving(true);
    const fields = [
      ['shop_name',    shopName],
      ['shop_address', shopAddress],
      ['shop_phone',   shopPhone],
      ['shop_nif',     shopNif],
    ];
    for (const [key, value] of fields) {
      await window.electron.dbQuery(
        "INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)",
        [key, value]
      );
    }
    setMsg(t('settings','saved2'));
    setTimeout(() => setMsg(''), 3000);
    setSaving(false);
  };

  const saveSecurity = async () => {
    if (!question || !resposta) { setSecMsg('❌ Preencha a pergunta e a resposta'); return; }
    await window.electron.dbQuery(
      "UPDATE users SET question_secreta=?, resposta_secreta=? WHERE id=?",
      [question, resposta.toLowerCase().trim(), user.id]
    );
    setSecMsg(t('settings','saved2'));
    setResposta('');
    setTimeout(() => setSecMsg(''), 3000);
  };

  const loadMachineId = async () => {
    const res = await window.electron.getMachineId();
    if (res.success) {
      setMachineInfo(res);
      setMachineLabel(res.machine_label || 'Caixa Principal');
    }
  };

  const handleSaveMachineLabel = async () => {
    setSavingLabel(true);
    await window.electron.setMachineLabel(machineLabel);
    setSavingLabel(false);
    setMigrateMsg('✅ Nome da máquina salvo!');
    setTimeout(() => setMigrateMsg(''), 2000);
  };

  const handleForceMigration = async () => {
    setMigrating(true);
    setMigrateMsg('');
    try {
      const res = await window.electron.forceMigration();
      if (res.success) {
        setMigrateMsg('✅ ' + res.message);
      } else {
        setMigrateMsg('❌ Erro: ' + res.error);
      }
    } catch(e) {
      setMigrateMsg('❌ Erro: ' + e.message);
    } finally {
      setMigrating(false);
    }
  };

  const handleBackupLocal = async () => {
    const res = await window.electron.backupLocal();
    if (res.success) setMsg(`✅ Backup salvo em: ${res.path}`);
    else setMsg('❌ Erro no backup: ' + res.error);
    setTimeout(() => setMsg(''), 5000);
  };

  const handleBackupDrive = async () => {
    setConnecting(true);
    const res = await window.electron.driveSync();
    if (res.success) {
      setMsg('✅ Backup enviado ao Google Drive!');
      const syncRes = await window.electron.storeGet('last_sync');
      if (syncRes) setLastSync(syncRes);
    } else {
      setMsg('❌ Erro: ' + res.error);
    }
    setTimeout(() => setMsg(''), 4000);
    setConnecting(false);
  };

  const handleReset = async () => {
    // ✅ Guard inutile ici car le bouton est déjà disabled si resetConfirm !== 'RESETAR'
    // mais on garde la sécurité sans alert() natif
    if (resetConfirm !== 'RESETAR') return;
    const res = await window.electron.resetApp();
    // ✅ Remplacé alert() natif → showAlert React
    if (!res.success) showAlert('Erro ao resetar', res.error, 'error');
  };

  const startDriveAuth = async () => {
    setConnecting(true);
    const res = await window.electron.driveAuth();
    if (res.success) {
      setAuthUrl(res.url);
    } else {
      setMsg('❌ Erreur: ' + res.error);
      setTimeout(() => setMsg(''), 4000);
    }
    setConnecting(false);
  };

  const submitCode = async () => {
    if (!authCode.trim()) return;
    setConnecting(true);
    const res = await window.electron.driveToken(authCode.trim());
    if (res.success) {
      setDriveConnected(true);
      setAuthUrl(''); setAuthCode('');
      setMsg('✅ Google Drive conectado!');
    } else {
      setMsg('❌ Código inválido: ' + res.error);
    }
    setTimeout(() => setMsg(''), 4000);
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    await window.electron.storeDelete('google_token');
    await window.electron.storeDelete('drive_connected');
    setDriveConnected(false);
    setAuthUrl(''); setAuthCode('');
    setMsg('✅ Google Drive déconnecté.');
    setTimeout(() => setMsg(''), 3000);
  };

  const currencies = ['AOA','CDF','XAF','XOF','MZN','NGN','GHS','KES','ZAR','TZS','UGX','RWF','ETB','USD','EUR','GBP'];
  const languages  = ['pt-BR','fr','en'];
  const langLabels = { 'pt-BR':'🇧🇷 Português', 'fr':'🇫🇷 Français', 'en':'🇬🇧 English' };

  const predefinedQuestions = [
    'Qual é o nome do seu primeiro animal de estimação?',
    'Qual é o nome da cidade onde você nasceu?',
    'Qual é o nome da sua escola primária?',
    'Qual é o nome do seu melhor amigo de infância?',
    'Qual é o apelido da sua mãe?',
    'Qual era o modelo do seu primeiro carro?',
  ];

  return (
    <div style={{ padding:24, height:'100%', overflowY:'auto', maxWidth:700 }}>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, display:'flex', alignItems:'center', gap:10 }}>
          <Settings size={22} color="var(--accent)"/> Configurações
        </h1>
      </div>

      {msg && (
        <div style={{ padding:'12px 16px', borderRadius:10, marginBottom:16, fontSize:14,
          background:msg.includes('✅')?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',
          border:`1px solid ${msg.includes('✅')?'rgba(34,197,94,0.3)':'rgba(239,68,68,0.3)'}`,
          color:msg.includes('✅')?'var(--success)':'var(--danger)' }}>
          {msg}
        </div>
      )}

      {/* ===== APPARENCE ===== */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          {t('settings','appearance')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Tema da interface</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {theme === 'dark' ? t('settings','darkModeActive') : t('settings','lightModeActive')}
            </div>
          </div>
          <button onClick={toggleTheme} className="theme-toggle-btn" style={{ minWidth: 120 }}>
            {theme === 'dark' ? t('settings','switchToLight') : t('settings','switchToDark')}
          </button>
        </div>
      </div>

      {/* ===== LOJA ===== */}
      <div className="card" style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700, marginBottom:16 }}>🏪 Informações da Loja</h2>
        <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:14 }}>
          Ces informations apparaissent sur chaque ticket imprimé.
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:14, marginBottom:16 }}>
          <div className="form-group">
            <label className="form-label">Nome da loja *</label>
            <input type="text" className="form-input" value={shopName}
              onChange={e=>setShopName(e.target.value)} placeholder="Ex: KUZULU NLANDU"/>
          </div>
          <div className="form-group">
            <label className="form-label"><MapPin size={12} style={{ display:'inline', marginRight:4 }}/>Endereço</label>
            <input type="text" className="form-input" value={shopAddress}
              onChange={e=>setShopAddress(e.target.value)}
              placeholder="Ex: Rua Kilamba Kiaxi, Bairro Golf1, Luanda"/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div className="form-group">
              <label className="form-label"><Phone size={12} style={{ display:'inline', marginRight:4 }}/>Telefone</label>
              <input type="text" className="form-input" value={shopPhone}
                onChange={e=>setShopPhone(e.target.value)} placeholder="Ex: 934450120"/>
            </div>
            <div className="form-group">
              <label className="form-label"><Hash size={12} style={{ display:'inline', marginRight:4 }}/>NIF / Contribuinte</label>
              <input type="text" className="form-input" value={shopNif}
                onChange={e=>setShopNif(e.target.value)} placeholder="Ex: 5000184200"/>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div className="form-group">
              <label className="form-label">Idioma</label>
              <select className="form-input" value={lang} onChange={e=>changeLang(e.target.value)}>
                {languages.map(l=><option key={l} value={l}>{langLabels[l]||l}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Moeda</label>
              <select className="form-input" value={currency} onChange={e=>changeCurrency(e.target.value)}>
                {currencies.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>
        <button onClick={saveSettings} className="btn btn-primary" disabled={saving}>
          <Save size={16}/> {saving ? t('settings','saving2') : t('settings','save')}
        </button>
      </div>

      {/* ===== SECURITE ===== */}
      <div className="card" style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700, marginBottom:16 }}>
          <KeyRound size={16} style={{ display:'inline', marginRight:8 }}/>Segurança — Pergunta Secreta
        </h2>
        <p style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:14 }}>
          Configure uma pergunta secreta para recuperar sua senha caso esqueça.
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="form-group">
            <label className="form-label">Pergunta de segurança</label>
            <select className="form-input" value={question} onChange={e=>setQuestion(e.target.value)}>
              <option value="">Selecione uma pergunta...</option>
              {predefinedQuestions.map(q=><option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Sua resposta</label>
            <input type="text" className="form-input" value={resposta}
              onChange={e=>setResposta(e.target.value)} placeholder="Sua resposta..."/>
          </div>
          {secMsg && <div style={{ fontSize:13, color:secMsg.includes('✅')?'var(--success)':'var(--danger)' }}>{secMsg}</div>}
          <button onClick={saveSecurity} className="btn btn-primary" style={{ alignSelf:'flex-start' }}>
            <Save size={16}/> Salvar Pergunta
          </button>
        </div>
      </div>

      {/* ===== BACKUP ===== */}
      <div className="card" style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700, marginBottom:16 }}>
          <Download size={16} style={{ display:'inline', marginRight:8 }}/>Backup de Dados
        </h2>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <button onClick={handleBackupLocal} className="btn btn-secondary" style={{ justifyContent:'flex-start', gap:10 }}>
            <Download size={16}/> 💾 Salvar backup local (escolher pasta)
          </button>
          <button onClick={handleBackupDrive} disabled={connecting||!driveConnected} className="btn btn-secondary" style={{ justifyContent:'flex-start', gap:10 }}>
            <Cloud size={16}/> ☁️ Enviar backup para Google Drive
          </button>
          {!driveConnected && <p style={{ fontSize:12, color:'var(--text-muted)' }}>⚠️ Conecte o Google Drive primeiro</p>}
          {lastSync && driveConnected && <p style={{ fontSize:11, color:'var(--text-muted)' }}>🕐 Último sync: {new Date(lastSync).toLocaleString('fr-FR')}</p>}
        </div>
      </div>

      {/* ===== GOOGLE DRIVE ===== */}
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <h2 style={{ fontSize:16, fontWeight:700, display:'flex', alignItems:'center', gap:8 }}>
            {driveConnected ? <Cloud size={18} color="var(--success)"/> : <CloudOff size={18} color="var(--text-muted)"/>}
            Google Drive
          </h2>
          <span className={`badge ${driveConnected?'badge-success':'badge-danger'}`}>
            {driveConnected ? t('settings','connected') : t('settings','notConnected2')}
          </span>
        </div>
        {driveConnected ? (
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={handleBackupDrive} className="btn btn-primary" disabled={connecting}>
              <Cloud size={16}/> {connecting ? t('settings','syncingNow') : t('settings','syncNow2')}
            </button>
            <button onClick={handleDisconnect} className="btn btn-danger">Desconectar</button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {!authUrl ? (
              <button onClick={startDriveAuth} className="btn btn-primary" disabled={connecting}>
                <Cloud size={16}/> {connecting ? '...' : t('settings','connectDrive')}
              </button>
            ) : (
              <>
                <div style={{ padding:'10px 14px', borderRadius:8, background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.3)', fontSize:13, color:'var(--success)' }}>
                  ✅ Page Google ouverte. Autorisez puis copiez le code ici.
                </div>
                <button onClick={()=>window.open(authUrl,'_blank')} className="btn btn-secondary" style={{ fontSize:12 }}>
                  <ExternalLink size={14}/> Rouvrir la page Google
                </button>
                <div className="form-group">
                  <label className="form-label">Code d'autorisation</label>
                  <input type="text" className="form-input" value={authCode}
                    onChange={e=>setAuthCode(e.target.value)}
                    placeholder="Collez le code ici..." autoFocus/>
                </div>
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={()=>{setAuthUrl('');setAuthCode('');}} className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}>Annuler</button>
                  <button onClick={submitCode} className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} disabled={!authCode||connecting}>
                    {connecting ? t('settings','validating2') : t('settings','validateCode')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ===== IMPRESSORA v1.0.9 ===== */}
      <div className="card" style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
          <Printer size={16} color="var(--accent)"/> Impressora
        </h2>
        <div className="form-group" style={{ marginBottom:14 }}>
          <label className="form-label">Impressora padrão</label>
          <select className="form-input" value={printerName} onChange={e=>setPrinterName(e.target.value)}
            style={{ borderColor: printerName ? 'var(--accent)' : 'var(--border)' }}>
            <option value="">— Selecionar impressora —</option>
            {printers.map(p => (
              <option key={p.name} value={p.name}>
                {p.isDefault ? '⭐ ' : '🖨️ '}{p.name}
              </option>
            ))}
          </select>
          {printerName && <div style={{ fontSize:11, color:'var(--success)', marginTop:4 }}>✅ Impressão silenciosa ativada — sem diálogo Windows</div>}
          {!printerName && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>⚠️ Sem impressora selecionada — diálogo Windows será exibido</div>}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
          <div>
            <label className="form-label" style={{ display:'block', marginBottom:6 }}>🎫 Cópias — Ticket venda</label>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <button onClick={()=>setCopiesTicket(Math.max(1,copiesTicket-1))} style={{ width:32, height:32, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-hover)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-primary)', fontSize:16 }}>−</button>
              <span style={{ fontSize:22, fontWeight:900, color:'var(--accent)', fontFamily:'monospace', minWidth:32, textAlign:'center' }}>{copiesTicket}</span>
              <button onClick={()=>setCopiesTicket(Math.min(5,copiesTicket+1))} style={{ width:32, height:32, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-hover)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-primary)', fontSize:16 }}>+</button>
            </div>
            <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:4 }}>Par défaut : 2</div>
          </div>
          <div>
            <label className="form-label" style={{ display:'block', marginBottom:6 }}>📊 Cópias — Relatório do dia</label>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <button onClick={()=>setCopiesShift(Math.max(1,copiesShift-1))} style={{ width:32, height:32, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-hover)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-primary)', fontSize:16 }}>−</button>
              <span style={{ fontSize:22, fontWeight:900, color:'var(--accent)', fontFamily:'monospace', minWidth:32, textAlign:'center' }}>{copiesShift}</span>
              <button onClick={()=>setCopiesShift(Math.min(5,copiesShift+1))} style={{ width:32, height:32, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-hover)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-primary)', fontSize:16 }}>+</button>
            </div>
            <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:4 }}>Par défaut : 1</div>
          </div>
        </div>
        <button onClick={savePrinterSettings} className="btn btn-primary" style={{ alignSelf:'flex-start' }}>
          <Save size={16}/> {printerSaved ? t('settings','printerSaved') : t('settings','savePrinter')}
        </button>
      </div>

      {/* ===== MIGRATION DB ===== */}
      <div className="card" style={{ border:'1px solid rgba(59,130,246,0.3)' }}>
        <h2 style={{ fontSize:16, fontWeight:700, marginBottom:8, color:'#60a5fa', display:'flex', alignItems:'center', gap:8 }}>
          🔧 Manutenção do Banco de Dados
        </h2>
        <p style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:14 }}>
          Se o aplicativo apresentar erros como <strong>"no such table"</strong> ou <strong>"no column named"</strong>,
          clique aqui para aplicar todas as atualizações do banco de dados sem perder dados existentes.
        </p>
        <button onClick={handleForceMigration} disabled={migrating} className="btn btn-secondary" style={{ justifyContent:'flex-start', gap:10, borderColor:'#3b82f6' }}>
          {migrating ? t('settings','migrating') : t('settings','forceMigration')}
        </button>
        {migrateMsg && (
          <div style={{ marginTop:10, padding:'8px 12px', borderRadius:8, background: migrateMsg.includes('✅') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: migrateMsg.includes('✅') ? 'var(--success)' : 'var(--danger)', fontSize:13, fontWeight:600 }}>
            {migrateMsg}
          </div>
        )}
      </div>

      {/* ===== RESET ===== */}
      <div className="card" style={{ border:'1px solid rgba(239,68,68,0.3)', marginTop:16 }}>
        <h2 style={{ fontSize:16, fontWeight:700, marginBottom:8, color:'var(--danger)', display:'flex', alignItems:'center', gap:8 }}>
          <AlertTriangle size={16}/> Zona de Perigo
        </h2>
        <p style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:14 }}>
          {t('settings','dangerZoneWarning')}
        </p>
        {!showReset ? (
          <button onClick={()=>setShowReset(true)} className="btn btn-danger">
            <Trash2 size={16}/> Resetar Aplicativo
          </button>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <p style={{ fontSize:13, color:'var(--danger)', fontWeight:600 }}>⚠️ Digite "RESETAR" para confirmar:</p>
            <input type="text" className="form-input" value={resetConfirm}
              onChange={e=>setResetConfirm(e.target.value)}
              placeholder="RESETAR" style={{ borderColor:'var(--danger)' }}/>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>{setShowReset(false);setResetConfirm('');}} className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}>Cancelar</button>
              <button onClick={handleReset} className="btn btn-danger" style={{ flex:1, justifyContent:'center' }} disabled={resetConfirm!=='RESETAR'}>
                <Trash2 size={16}/> Confirmar Reset
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop:16, padding:14, borderRadius:10, background:'var(--bg-card)', border:'1px solid var(--border)', fontSize:12, color:'var(--text-muted)' }}>
        <div style={{ fontWeight:600, marginBottom:8, color:'var(--text-secondary)', fontSize:13 }}>ℹ️ Informações do sistema</div>
        <div style={{ marginBottom:4 }}>Versão: <strong style={{color:'var(--accent)'}}>CKBPOS v1.1.5</strong></div>
        <div style={{ marginBottom:4 }}>Banco de dados: SQLite (local)</div>
        <div style={{ marginBottom:10 }}>Língua: {lang} · Moeda: {currency}</div>
        {machineInfo && (
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:10, marginTop:4 }}>
            <div style={{ fontWeight:600, marginBottom:6, color:'var(--text-secondary)', fontSize:12 }}>
              🖥️ Identificação desta Máquina
              <span style={{ marginLeft:8, padding:'2px 8px', borderRadius:10, background:'rgba(240,192,64,0.15)', color:'var(--accent)', fontSize:10, fontWeight:700 }}>
                ID: {machineInfo.short_id}
              </span>
            </div>
            <div style={{ marginBottom:8, fontFamily:'monospace', fontSize:11, color:'var(--text-muted)', wordBreak:'break-all' }}>
              UUID: {machineInfo.machine_id}
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input type="text" value={machineLabel} onChange={e => setMachineLabel(e.target.value)}
                placeholder="Nome desta máquina (ex: Caixa 1)"
                style={{ flex:1, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-hover)', color:'var(--text-primary)', fontSize:12, fontFamily:'inherit', outline:'none' }}/>
              <button onClick={handleSaveMachineLabel} disabled={savingLabel}
                style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--accent)', background:'rgba(240,192,64,0.1)', color:'var(--accent)', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                {savingLabel ? t('settings','savingLabel') : t('settings','saveMachineLabel')}
              </button>
            </div>
            <div style={{ marginTop:6, fontSize:11, color:'var(--text-muted)' }}>
              ℹ️ Este ID é único e permanente. Será usado para sincronização LAN na v2.0.0.
            </div>
          </div>
        )}
      </div>

      {/* ✅ Modal React pur — zéro focus trap */}
      {AlertModalComponent}
    </div>
  );
}
