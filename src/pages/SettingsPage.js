import React, { useState, useEffect } from 'react';
import { useTheme } from '../App';
import { useLang } from '../utils/useLang';
import { useAuth } from '../App';
import { Settings, Cloud, CloudOff, Save, ExternalLink, KeyRound, Download, Trash2, AlertTriangle, MapPin, Phone, Hash, Printer, Plus, Minus, ChevronDown, ChevronRight, Ticket } from 'lucide-react';
import { useAlert, useConfirm } from '../components/AlertModal';

// Ã¢â€â‚¬Ã¢â€â‚¬ Composant accordÃ©on rÃ©utilisable Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function Accordion({ id, icon, title, color, openSections, toggleSection, children, defaultOpen=false }) {
  const isOpen = openSections.has(id);
  return (
    <div style={{
      marginBottom: 10,
      borderRadius: 12,
      border: `1px solid ${isOpen ? (color || 'var(--accent)') + '40' : 'var(--border)'}`,
      background: 'var(--bg-card)',
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      <button
        onClick={() => toggleSection(id)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-primary)', fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 15 }}>
          <span style={{ color: color || 'var(--accent)' }}>{icon}</span>
          {title}
        </div>
        <span style={{ color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          <ChevronDown size={16}/>
        </span>
      </button>
      {isOpen && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)' }}>
          <div style={{ paddingTop: 16 }}>{children}</div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { t, lang, currency, changeLang, changeCurrency } = useLang();
  const { user } = useAuth();

  const { showAlert, AlertModalComponent } = useAlert();
  const { showConfirm, ConfirmModalComponent } = useConfirm();

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

  // â”€â”€ v1.7.0 Supabase Cloud â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [supaUrl, setSupaUrl]           = useState('');
  const [supaKey, setSupaKey]           = useState('');
  const [supaStatus, setSupaStatus]     = useState({ status: 'disconnected' });
  const [supaConnecting, setSupaConnecting] = useState(false);
  const [supaMsg, setSupaMsg]           = useState('');

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
  const [networkKey, setNetworkKey]     = useState('');
  const [networkKeyInput, setNetworkKeyInput] = useState('');
  const [inviteCode, setInviteCode]     = useState('');  // v3.4
  const [savingNetKey, setSavingNetKey] = useState(false);
  const [netKeyMsg, setNetKeyMsg]       = useState('');
  const [savingLabel, setSavingLabel]   = useState(false);
  const [syncingNow, setSyncingNow]     = useState(false);
  const [syncMsg, setSyncMsg]           = useState('');

  // Impressora
  const [printers, setPrinters]         = useState([]);
  const [printerName, setPrinterName]   = useState('');
  const [copiesTicket, setCopiesTicket] = useState(2);
  const [copiesShift, setCopiesShift]   = useState(1);
  const [ticketSizeMm, setTicketSizeMm] = useState(72);
  const [printerSaved, setPrinterSaved] = useState(false);
  // â”€â”€ v1.9.1 Impression partagÃ©e â”€â”€
  const [printerModeVal, setPrinterModeVal]     = useState('local');
  const [printerMachines, setPrinterMachines]   = useState([]);
  const [printerTargetId, setPrinterTargetId]   = useState('');
  const [printerModeSaved, setPrinterModeSaved] = useState(false);

  // âœ… AccordÃ©ons â€” sections ouvertes par dÃ©faut : Loja + Impressora
  // â”€â”€ Caderno de Caixa v1.2.7 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [cMotivos, setCMotivos]     = useState([]);
  const [cTrabalhadores, setCTrab]  = useState([]);
  const [cProdutos, setCProdutos]   = useState([]);
  const [newMIcon, setNewMIcon]     = useState('');
  const [newMLabel, setNewMLabel]   = useState('');
  const [newMDir, setNewMDir]       = useState('sortie');
  const [newMDette, setNewMDette]   = useState(false);
  const [newMRole, setNewMRole]     = useState('Geral');
  const [newTrabNom, setNewTrabNom] = useState('');
  const [newProdNom, setNewProdNom] = useState('');
  const [newProdPrix, setNewProdPrix] = useState('');

  const [openSections, setOpenSections] = useState(new Set());
  const toggleSection = (id) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // âœ… Personnalisation ticket
  const [ticketFlags, setTicketFlags] = useState({
    showQr:        true,
    showAddress:   true,
    showPhone:     true,
    showNif:       true,
    showFactureNum: true,
    showClientNom: true,
    showClientNif: true,
    showSeller:    true,
    showObrigado:  true,
    showVersion:   true,
    showSecondaVia: true,
    showMentionLegal: true, // âœ… Mention lÃ©gale Angola â€” sÃ©parÃ©e de l'adresse
  });
  const [ticketFlagsSaved, setTicketFlagsSaved] = useState(false);

  useEffect(() => {
    loadSettings(); checkDrive(); loadSecurity(); loadPrinters(); loadMachineId(); loadTicketFlags(); loadCaderno(); loadSupabase();
    window.electron?.appVersion?.().then(v => {
      if (v) window.__CKBPOS_VERSION__ = v;
    }).catch(() => {});
    // Abonnement statut cloud en temps rÃ©el
    const cleanup = window.electron.onCloudStatus?.((data) => setSupaStatus(data));
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, []);

  const loadTicketFlags = async () => {
    const res = await window.electron.dbGet("SELECT value FROM settings WHERE key='ticket_flags'");
    if (res.data?.value) {
      try { setTicketFlags(JSON.parse(res.data.value)); } catch(e) {}
    }
  };

  const saveTicketFlags = async () => {
    await window.electron.dbQuery(
      "INSERT OR REPLACE INTO settings (key,value) VALUES ('ticket_flags',?)",
      [JSON.stringify(ticketFlags)]
    );
    setTicketFlagsSaved(true);
    setTimeout(() => setTicketFlagsSaved(false), 2000);
  };

  // â”€â”€ v1.7.0 Supabase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadSupabase = async () => {
    try {
      const [urlRes, keyRes, statusRes] = await Promise.all([
        window.electron.dbGet("SELECT value FROM settings WHERE key='supabase_url'"),
        window.electron.dbGet("SELECT value FROM settings WHERE key='supabase_key'"),
        window.electron.cloudStatus?.() || Promise.resolve(null),
      ]);
      setSupaUrl(urlRes?.data?.value || '');
      // Masquer la cl\u00e9 partiellement si elle existe
      setSupaKey(keyRes?.data?.value || '');
      if (statusRes?.success) setSupaStatus(statusRes);
    } catch(_e) {}
  };

  const handleSupabaseConnect = async () => {
    if (!supaUrl.trim() || !supaKey.trim()) {
      setSupaMsg('\u274c Preencha o Project URL e a Anon Key.'); return;
    }
    setSupaConnecting(true); setSupaMsg('');
    try {
      await window.electron.dbQuery("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)", ['supabase_url', supaUrl.trim()]);
      await window.electron.dbQuery("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)", ['supabase_key', supaKey.trim()]);
      const res = await window.electron.cloudConnect?.();
      if (res?.success) {
        const realStatus = res.status || { status: 'connected' };
        setSupaStatus(realStatus);
        if (realStatus.status === 'connected' || realStatus.status === 'synced') {
          setSupaMsg('âœ… Supabase conectado com sucesso!');
        } else if (realStatus.status === 'error') {
          setSupaMsg('âŒ Erro: ' + (realStatus.error || 'Falha na conexÃ£o â€” verifica a Anon Key (formato eyJhbGci...)'));
        } else {
          setSupaMsg('â³ Conectando em segundo plano...');
        }
      } else {
        setSupaMsg('âŒ ' + (res?.error || 'Falha na conexÃ£o'));
      }
    } catch(e) { setSupaMsg('âŒ Erro: ' + e.message); }
    setSupaConnecting(false);
  };

  const handleSupabaseDisconnect = async () => {
    try {
      await window.electron.cloudDisconnect?.();
      setSupaStatus({ status: 'disconnected' });
      setSupaMsg('\u2705 Supabase desconectado.');
    } catch(_e) {}
  };

  const handleSupaPush = async () => {
    try {
      setSupaMsg('\u23f3 Enviando dados...');
      const res = await window.electron.cloudPush?.();
      setSupaMsg(res?.success ? '\u2705 Dados enviados para a nuvem!' : '\u274c Falha no push');
    } catch(_e) { setSupaMsg('\u274c Erro no push'); }
  };

  const handleSupaPull = async () => {
    try {
      setSupaMsg('\u23f3 Recebendo dados...');
      const res = await window.electron.cloudPull?.();
      setSupaMsg(res?.success ? '\u2705 Dados recebidos da nuvem!' : '\u274c Falha no pull');
    } catch(_e) { setSupaMsg('\u274c Erro no pull'); }
  };

  const loadCaderno = async () => {
    const [rm, rt, rp] = await Promise.all([
      window.electron.cadernoMotivosList(),
      window.electron.cadernoTrabalhList(),
      window.electron.cadernoProdutosList(),
    ]);
    if (rm.success) setCMotivos(rm.data || []);
    if (rt.success) setCTrab(rt.data || []);
    if (rp.success) setCProdutos(rp.data || []);
  };

  const handleAddMotivo = async () => {
    if (!newMLabel.trim()) return;
    const r = await window.electron.cadernoMotivosAdd({
      icone: newMIcon.trim() || '\u{1F4CC}',
      label: newMLabel.trim(),
      direction: newMDir,
      est_dette: newMDette ? 1 : 0,
      role: newMRole,
    });
    if (r.success) {
      setNewMIcon(''); setNewMLabel('');
      setNewMDir('sortie'); setNewMDette(false); setNewMRole('Geral');
      loadCaderno();
    }
  };

  const handleDeleteMotivo = async (id) => {
    const ok = await showConfirm('', 'Remover este motivo?', 'warning');
    if (!ok) return;
    await window.electron.cadernoMotivosDelete(id);
    loadCaderno();
  };

  const handleAddTrab = async () => {
    if (!newTrabNom.trim()) return;
    await window.electron.cadernoTrabalhAdd(newTrabNom.trim());
    setNewTrabNom(''); loadCaderno();
  };
  const handleDeleteTrab = async (id) => {
    await window.electron.cadernoTrabalhDelete(id); loadCaderno();
  };
  const handleAddProd = async () => {
    if (!newProdNom.trim()) return;
    await window.electron.cadernoProdutosAdd(newProdNom.trim(), parseFloat(newProdPrix) || 0);
    setNewProdNom(''); setNewProdPrix(''); loadCaderno();
  };
  const handleDeleteProd = async (id) => {
    await window.electron.cadernoProdutosDelete(id); loadCaderno();
  };

  const loadPrinters = async () => {
    const res = await window.electron.getPrinters();
    if (res.success) setPrinters(res.data || []);
    const pName = await window.electron.dbGet("SELECT value FROM settings WHERE key='printer_name'");
    const pCopT = await window.electron.dbGet("SELECT value FROM settings WHERE key='printer_copies_ticket'");
    const pCopS = await window.electron.dbGet("SELECT value FROM settings WHERE key='printer_copies_shift'");
    const pSize = await window.electron.dbGet("SELECT value FROM settings WHERE key='ticket_size_mm'");
    if (pName.data?.value !== undefined) setPrinterName(pName.data.value);
    if (pCopT.data?.value !== undefined) setCopiesTicket(parseInt(pCopT.data.value) || 2);
    if (pCopS.data?.value !== undefined) setCopiesShift(parseInt(pCopS.data.value) || 1);
    if (pSize.data?.value !== undefined) setTicketSizeMm(parseInt(pSize.data.value) || 72);
    // v1.9.1 â€” charger mode impression partagÃ©e
    try {
      const modeRes = await window.electron.getPrinterMode();
      if (modeRes?.success) {
        setPrinterModeVal(modeRes.mode || 'local');
        setPrinterTargetId(modeRes.targetMachineId || '');
      }
      const machRes = await window.electron.getPrinterMachines();
      if (machRes?.success) setPrinterMachines(machRes.data || []);
    } catch(_e) {}
  };

  const savePrinterMode = async () => {
    await window.electron.setPrinterMode(printerModeVal, printerModeVal === 'shared' ? printerTargetId : '');
    setPrinterModeSaved(true);
    setTimeout(() => setPrinterModeSaved(false), 2000);
  };

  const savePrinterSettings = async () => {
    await window.electron.dbQuery("UPDATE settings SET value=? WHERE key='printer_name'", [printerName]);
    await window.electron.dbQuery("UPDATE settings SET value=? WHERE key='printer_copies_ticket'", [String(copiesTicket)]);
    await window.electron.dbQuery("UPDATE settings SET value=? WHERE key='printer_copies_shift'", [String(copiesShift)]);
    await window.electron.dbQuery("INSERT OR REPLACE INTO settings (key,value) VALUES ('ticket_size_mm',?)", [String(ticketSizeMm)]);
    setPrinterSaved(true);
    setTimeout(() => setPrinterSaved(false), 2000);
  };

  const loadSettings = async () => {
    for (const key of ['shop_name','shop_address','shop_phone','shop_nif']) {
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
    for (const [key, value] of [['shop_name',shopName],['shop_address',shopAddress],['shop_phone',shopPhone],['shop_nif',shopNif]]) {
      await window.electron.dbQuery("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)", [key, value]);
    }
    setMsg(t('settings','saved2'));
    setTimeout(() => setMsg(''), 3000);
    setSaving(false);
  };

  const saveSecurity = async () => {
    if (!question || !resposta) { setSecMsg('âŒ Preencha a pergunta e a resposta'); return; }
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
    if (res.success) { setMachineInfo(res); setMachineLabel(res.machine_label || 'Caixa Principal'); }
    // Charger la clÃ© rÃ©seau LAN
    const nkRes = await window.electron.getNetworkKey?.();
    if (nkRes?.success) { setNetworkKey(nkRes.key || ''); setNetworkKeyInput(nkRes.key || ''); }
  };

  const handleSaveMachineLabel = async () => {
    setSavingLabel(true);
    await window.electron.setMachineLabel(machineLabel);
    setSavingLabel(false);
    setMigrateMsg('âœ… Nome da mÃ¡quina salvo!');
    setTimeout(() => setMigrateMsg(''), 2000);
  };

  const handleForceMigration = async () => {
    setMigrating(true); setMigrateMsg('');
    try {
      const res = await window.electron.forceMigration();
      setMigrateMsg(res.success ? 'âœ… ' + res.message : 'âŒ Erro: ' + res.error);
    } catch(e) { setMigrateMsg('âŒ Erro: ' + e.message); }
    finally { setMigrating(false); }
  };

  const handleForceSync = async () => {
    setSyncingNow(true); setSyncMsg('');
    try {
      await window.electron.syncForce();
      await window.electron.cloudPush();
      await window.electron.cloudPull();
      setSyncMsg('âœ… SincronizaÃ§Ã£o forÃ§ada com sucesso!');
    } catch(e) { setSyncMsg('âŒ Erro: ' + e.message); }
    finally { setSyncingNow(false); setTimeout(() => setSyncMsg(''), 3000); }
  };

  const handleBackupLocal = async () => {
    const res = await window.electron.backupLocal();
    setMsg(res.success ? `âœ… Backup salvo em: ${res.path}` : 'âŒ Erro no backup: ' + res.error);
    setTimeout(() => setMsg(''), 5000);
  };

  const handleRestoreBackup = async () => {
    const ok = await showConfirm('âš ï¸ Restaurar Backup', 'Isso substituirÃ¡ TODOS os dados atuais pelo backup selecionado.\nUm backup de seguranÃ§a serÃ¡ criado automaticamente antes.\n\nDeseja continuar?', 'warning');
    if (!ok) return;
    const res = await window.electron.backupRestore();
    if (res.canceled) return;
    if (!res.success) { showAlert('Erro ao restaurar', res.error, 'error'); return; }
    showAlert('âœ… Backup restaurado!', 'O aplicativo serÃ¡ reiniciado agora...', 'success');
  };

  const handleBackupDrive = async () => {
    setConnecting(true);
    const res = await window.electron.driveSync();
    if (res.success) {
      setMsg('âœ… Backup enviado ao Google Drive!');
      const syncRes = await window.electron.storeGet('last_sync');
      if (syncRes) setLastSync(syncRes);
    } else { setMsg('âŒ Erro: ' + res.error); }
    setTimeout(() => setMsg(''), 4000);
    setConnecting(false);
  };

  const handleReset = async () => {
    if (resetConfirm !== 'RESETAR') return;
    const res = await window.electron.resetApp();
    if (!res.success) showAlert('Erro ao resetar', res.error, 'error');
  };

  const startDriveAuth = async () => {
    setConnecting(true);
    const res = await window.electron.driveAuth();
    if (res.success) { setAuthUrl(res.url); }
    else { setMsg('âŒ Erreur: ' + res.error); setTimeout(() => setMsg(''), 4000); }
    setConnecting(false);
  };

  const submitCode = async () => {
    if (!authCode.trim()) return;
    setConnecting(true);
    const res = await window.electron.driveToken(authCode.trim());
    if (res.success) { setDriveConnected(true); setAuthUrl(''); setAuthCode(''); setMsg('âœ… Google Drive conectado!'); }
    else { setMsg('âŒ CÃ³digo invÃ¡lido: ' + res.error); }
    setTimeout(() => setMsg(''), 4000);
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    await window.electron.storeDelete('google_token');
    await window.electron.storeDelete('drive_connected');
    setDriveConnected(false); setAuthUrl(''); setAuthCode('');
    setMsg('âœ… Google Drive dÃ©connectÃ©.');
    setTimeout(() => setMsg(''), 3000);
  };

  const currencies = ['AOA','CDF','XAF','XOF','MZN','NGN','GHS','KES','ZAR','TZS','UGX','RWF','ETB','USD','EUR','GBP'];
  const languages  = ['pt-BR','fr','en'];
  const langLabels = { 'pt-BR':'ðŸ‡§ðŸ‡· PortuguÃªs', 'fr':'ðŸ‡«ðŸ‡· FranÃ§ais', 'en':'ðŸ‡¬ðŸ‡§ English' };
  const predefinedQuestions = [
    'Qual Ã© o nome do seu primeiro animal de estimaÃ§Ã£o?',
    'Qual Ã© o nome da cidade onde vocÃª nasceu?',
    'Qual Ã© o nome da sua escola primÃ¡ria?',
    'Qual Ã© o nome do seu melhor amigo de infÃ¢ncia?',
    'Qual Ã© o apelido da sua mÃ£e?',
    'Qual era o modelo do seu primeiro carro?',
  ];

  // Ã¢â€â‚¬Ã¢â€â‚¬ Composant toggle ticket Ã¢â€â‚¬Ã¢â€â‚¬
  const TicketToggle = ({ flag, label, icon }) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13 }}>
        <span>{icon}</span> {label}
      </div>
      <button
        onClick={() => setTicketFlags(p => ({ ...p, [flag]: !p[flag] }))}
        style={{
          width:44, height:24, borderRadius:12, border:'none', cursor:'pointer',
          background: ticketFlags[flag] ? 'var(--accent)' : 'var(--border)',
          position:'relative', transition:'background 0.2s',
        }}
      >
        <span style={{
          position:'absolute', top:2, width:20, height:20, borderRadius:'50%',
          background:'#fff', transition:'left 0.2s',
          left: ticketFlags[flag] ? 22 : 2,
        }}/>
      </button>
    </div>
  );

  return (
    <div style={{ padding:24, height:'100%', overflowY:'auto', maxWidth:700 }}>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700, display:'flex', alignItems:'center', gap:10 }}>
          <Settings size={22} color="var(--accent)"/> {t('settings','pageTitle')}
        </h1>
      </div>

      {msg && (
        <div style={{ padding:'12px 16px', borderRadius:10, marginBottom:16, fontSize:14,
          background:msg.includes('âœ…')?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',
          border:`1px solid ${msg.includes('âœ…')?'rgba(34,197,94,0.3)':'rgba(239,68,68,0.3)'}`,
          color:msg.includes('âœ…')?'var(--success)':'var(--danger)' }}>
          {msg}
        </div>
      )}

      {/* ===== APPARENCE ===== */}
      <Accordion id="aparencia" icon={<span>ðŸŽ¨</span>} title={t('settings','accAppearance')} openSections={openSections} toggleSection={toggleSection}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontWeight:600, fontSize:14 }}>{t('settings','themeLabel')}</div>
            <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:2 }}>
              {theme === 'dark' ? t('settings','darkModeActive') : t('settings','lightModeActive')}
            </div>
          </div>
          <button onClick={toggleTheme} className="theme-toggle-btn" style={{ minWidth:120 }}>
            {theme === 'dark' ? t('settings','switchToLight') : t('settings','switchToDark')}
          </button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="form-group">
            <label className="form-label">{t('settings','language')}</label>
            <select className="form-input" value={lang} onChange={e => changeLang(e.target.value)}>
              {languages.map(l => <option key={l} value={l}>{langLabels[l]}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('settings','currency')}</label>
            <select className="form-input" value={currency} onChange={e => changeCurrency(e.target.value)}>
              {currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </Accordion>

      {/* ===== LOJA ===== */}
      <Accordion id="loja" icon={<span>ðŸª</span>} title={t('settings','accShop')} openSections={openSections} toggleSection={toggleSection}>
        <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:14 }}>
          {t('settings','ticketSubtitle')}
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:14, marginBottom:16 }}>
          <div className="form-group">
            <label className="form-label">{t('settings','shopNameLabel')}</label>
            <input type="text" className="form-input" value={shopName} onChange={e=>setShopName(e.target.value)} placeholder="Ex: Kuzulu Nlandu - Comercio Geral"/>
          </div>
          <div className="form-group">
            <label className="form-label"><MapPin size={12} style={{display:'inline',marginRight:4}}/>{t('settings','addressLabel')}</label>
            <input type="text" className="form-input" value={shopAddress} onChange={e=>setShopAddress(e.target.value)} placeholder="Rua, Bairro, Cidade"/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group">
              <label className="form-label"><Phone size={12} style={{display:'inline',marginRight:4}}/>{t('settings','phoneLabel')}</label>
              <input type="text" className="form-input" value={shopPhone} onChange={e=>setShopPhone(e.target.value)} placeholder="934 450 120"/>
            </div>
            <div className="form-group">
              <label className="form-label"><Hash size={12} style={{display:'inline',marginRight:4}}/>NIF / Contribuinte</label>
              <input type="text" className="form-input" value={shopNif} onChange={e=>setShopNif(e.target.value)} placeholder="5000181420"/>
            </div>
          </div>
        </div>
        <button onClick={saveSettings} disabled={saving} className="btn btn-primary">
          <Save size={14}/> {saving ? t('settings','saving') : t('settings','saveConfig')}
        </button>
      </Accordion>

      {/* ===== TICKET ===== */}
      <Accordion id="ticket" icon={<Ticket size={16}/>} title={t('settings','accTicket')} openSections={openSections} toggleSection={toggleSection}>
        <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:14 }}>
          Choisissez ce qui s'affiche sur chaque ticket imprimÃ©.
        </p>
        <TicketToggle flag="showQr"           {...{label: t('settings','ticketQr')}}                     icon="QR"/>
        <TicketToggle flag="showAddress"      {...{label: t('settings','ticketAddress')}}           icon="ðŸ“"/>
        <TicketToggle flag="showPhone"        {...{label: t('settings','ticketPhone')}}         icon="ðŸ“ž"/>
        <TicketToggle flag="showNif"          {...{label: t('settings','ticketNif')}}           icon="NIF"/>
        <TicketToggle flag="showFactureNum"   {...{label: t('settings','ticketFacture')}}            icon="ðŸ”¢"/>
        <TicketToggle flag="showClientNom"    {...{label: t('settings','ticketClientNom')}}                icon="ðŸ‘¤"/>
        <TicketToggle flag="showClientNif"    {...{label: t('settings','ticketClientNif')}}                icon="ID"/>
        <TicketToggle flag="showSeller"       {...{label: t('settings','ticketSeller')}}               icon="ðŸ‘¤"/>
        <TicketToggle flag="showMentionLegal" {...{label: t('settings','ticketLegal')}} icon="ðŸ“‹"/>
        <TicketToggle flag="showObrigado"     label={t('settings','ticketObrigado')}   icon="ðŸ™Œ"/>
        <TicketToggle flag="showVersion"      {...{label: t('settings','ticketVersion')}}               icon="v"/>
        <TicketToggle flag="showSecondaVia"   {...{label: t('settings','ticketSecondVia')}}      icon="ðŸ“„"/>
        <div style={{ marginTop:16 }}>
          <button onClick={saveTicketFlags} className="btn btn-primary">
            <Save size={14}/> {ticketFlagsSaved ? 'âœ… ' + t('settings','saved2') : t('settings','saveConfig')}
          </button>
        </div>
      </Accordion>

      {/* ===== SEGURANÃ‡A ===== */}
      <Accordion id="seguranca" icon={<KeyRound size={16}/>} title={t('settings','accSecurity')} openSections={openSections} toggleSection={toggleSection}>
        <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:14 }}>
          Configure uma pergunta secreta para recuperar sua senha caso esqueÃ§a.
        </p>
        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label">Pergunta de SeguranÃ§a</label>
          <select className="form-input" value={question} onChange={e=>setQuestion(e.target.value)}>
            <option value="">{t('settings','secSelect')}</option>
            {predefinedQuestions.map((q,i) => <option key={i} value={q}>{q}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label">Resposta</label>
          <input type="password" className="form-input" value={resposta} onChange={e=>setResposta(e.target.value)} {...{placeholder: t('settings','secAnswerPh')}}/>
        </div>
        {secMsg && <div style={{ fontSize:12, color:secMsg.includes('âœ…')?'var(--success)':'var(--danger)', marginBottom:8 }}>{secMsg}</div>}
        <button onClick={saveSecurity} className="btn btn-primary"><Save size={14}/> {t('settings','secSaveBtn')}</button>
      </Accordion>

      {/* ===== BACKUP ===== */}
      <Accordion id="backup" icon={<Download size={16}/>} title={t('settings','accBackup')} openSections={openSections} toggleSection={toggleSection}>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <button onClick={handleBackupLocal} className="btn btn-secondary" style={{ justifyContent:'flex-start', gap:8 }}>
            <Save size={14}/> {t('settings','backupLocal')}
          </button>
          <button onClick={handleRestoreBackup} className="btn" style={{ justifyContent:'flex-start', gap:8, background:'rgba(245,200,66,0.1)', border:'1px solid var(--accent)', color:'var(--accent)' }}>
            <Download size={14}/> ðŸ“¥ {t('settings','backupRestore')}
          </button>
        </div>
      </Accordion>

      {/* ===== GOOGLE DRIVE ===== */}
      <Accordion id="drive" icon={driveConnected ? <Cloud size={16}/> : <CloudOff size={16}/>} title={t('settings','accDrive')} openSections={openSections} toggleSection={toggleSection}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:driveConnected?'var(--success)':'var(--text-muted)', display:'inline-block'}}/>
          <span style={{ fontSize:13, fontWeight:600, color:driveConnected?'var(--success)':'var(--text-muted)' }}>
            {driveConnected ? t('settings','connected') : t('settings','notConnected')}
          </span>
          {lastSync && <span style={{ fontSize:11, color:'var(--text-muted)' }}>Â· {t('settings','lastSync')} {lastSync}</span>}
        </div>
        {driveConnected ? (
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={handleBackupDrive} className="btn btn-primary" disabled={connecting} style={{ flex:1, justifyContent:'center' }}>
              <Cloud size={14}/> {connecting ? 'Enviando...' : 'Enviar backup agora'}
            </button>
            <button onClick={handleDisconnect} className="btn btn-secondary">
              <CloudOff size={14}/> {t('settings','driveDisconnect')}
            </button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {!authUrl ? (
              <button onClick={startDriveAuth} className="btn btn-primary" disabled={connecting} style={{ justifyContent:'center' }}>
                <Cloud size={14}/> {connecting ? 'Conectando...' : 'Conectar Google Drive'}
              </button>
            ) : (
              <>
                <div style={{ fontSize:12, color:'var(--success)', padding:'8px 12px', background:'rgba(34,197,94,0.1)', borderRadius:8 }}>
                  âœ… Page Google ouverte. Autorisez puis copiez le code ici.
                </div>
                <button onClick={() => window.open(authUrl,'_blank')} className="btn btn-secondary" style={{ gap:8 }}>
                  <ExternalLink size={14}/> {t('settings','driveReopen')}
                </button>
                <div style={{ display:'flex', gap:8 }}>
                  <input type="text" className="form-input" value={authCode} onChange={e=>setAuthCode(e.target.value)} placeholder="Cole o cÃ³digo aqui..."/>
                  <button onClick={submitCode} className="btn btn-primary" disabled={connecting || !authCode.trim()}>
                    {connecting ? '...' : 'OK'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Accordion>

      {/* ===== SUPABASE CLOUD SYNC ===== */}
      <Accordion id="supabase" icon={<Cloud size={16}/>} title="Supabase Cloud Sync" color="#3ecf8e" openSections={openSections} toggleSection={toggleSection}>

        {/* Statut connexion */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background:
            supaStatus.status==='connected'    ? '#3ecf8e' :
            supaStatus.status==='syncing'      ? '#e8c547' :
            supaStatus.status==='connecting'   ? '#60a5fa' :
            supaStatus.status==='error'        ? 'var(--danger)' : '#555'
          }}/>
          <span style={{ fontSize:13, fontWeight:600, color:
            supaStatus.status==='connected'    ? '#3ecf8e' :
            supaStatus.status==='syncing'      ? '#e8c547' :
            supaStatus.status==='connecting'   ? '#60a5fa' :
            supaStatus.status==='error'        ? 'var(--danger)' : 'var(--text-muted)'
          }}>
          {supaStatus.status==='connected'  ? 'âœ… Conectado' :
             supaStatus.status==='syncing'    ? 'â³ Sincronizando...' :
             supaStatus.status==='connecting' ? 'â³ Conectando...' :
             supaStatus.status==='error'      ? ('âŒ Erro: ' + (supaStatus.error||'')) :
             'NÃ£o configurado'}
          </span>
          {supaStatus.lastSync && (
            <span style={{ fontSize:11, color:'var(--text-muted)' }}>
              Â· Ãºltimo sync: {new Date(supaStatus.lastSync).toLocaleTimeString('fr-FR')}
            </span>
          )}
        </div>

        {/* Project URL */}
        <div style={{ marginBottom:10 }}>
          <label className="form-label">Project URL</label>
          <input type="text" className="form-input" value={supaUrl}
            onChange={e => setSupaUrl(e.target.value)}
            placeholder="https://xxxxxxxxxx.supabase.co"
            style={{ fontFamily:'monospace', fontSize:12 }}
          />
        </div>

        {/* Anon Key */}
        <div style={{ marginBottom:14 }}>
          <label className="form-label">Anon Key (public)</label>
          <input type="password" className="form-input" value={supaKey}
            onChange={e => setSupaKey(e.target.value)}
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            style={{ fontFamily:'monospace', fontSize:11 }}
          />
        </div>

        {/* Boutons d'action */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
          {supaStatus.status !== 'connected' ? (
            <button onClick={handleSupabaseConnect} className="btn btn-primary"
              disabled={supaConnecting || !supaUrl.trim() || !supaKey.trim()}
              style={{ flex:1, justifyContent:'center' }}>
              <Cloud size={14}/>
              {supaConnecting ? 'Conectando...' : 'Conectar Supabase'}
            </button>
          ) : (
            <>
              <button onClick={handleSupaPush} className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}>
                {'â¬†'} Push agora
              </button>
              <button onClick={handleSupaPull} className="btn btn-secondary" style={{ justifyContent:'center' }}>
                {'â¬‡'} Pull
              </button>
              <button onClick={handleSupabaseDisconnect} className="btn btn-secondary">
                <CloudOff size={14}/> Desconectar
              </button>
            </>
          )}
        </div>

        {/* Message feedback */}
        {supaMsg && (
          <div style={{ fontSize:12, marginBottom:10,
            color: supaMsg.startsWith('\u2705') ? 'var(--success)' : supaMsg.startsWith('\u23f3') ? 'var(--accent)' : 'var(--danger)'
          }}>
            {supaMsg}
          </div>
        )}

        {/* Info migration SQL */}
        <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.8, background:'var(--bg-hover)', padding:'10px 12px', borderRadius:6, marginTop:6 }}>
          <div style={{ fontWeight:700, marginBottom:4, color:'var(--text-secondary)' }}>ðŸ“ Setup requis sur supabase.com</div>
          <div>1. CrÃ©er un projet sur <strong>supabase.com</strong></div>
          <div>2. Project Settings â†’ API â†’ copier URL + anon key</div>
          <div>3. Onglet SQL Editor â†’ exÃ©cuter :</div>
          <pre style={{ fontSize:10, background:'#111', padding:'6px 8px', borderRadius:4, marginTop:6, overflowX:'auto', color:'#22c55e' }}>{`CREATE TABLE cloud_sync_log (
  id                BIGSERIAL PRIMARY KEY,
  source_machine_id TEXT NOT NULL,
  source_seq        INTEGER,
  table_name        TEXT NOT NULL,
  record_id         INTEGER,
  operation         TEXT NOT NULL,
  row_data          JSONB,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON cloud_sync_log(source_machine_id,id);
ALTER PUBLICATION supabase_realtime ADD TABLE cloud_sync_log;`}</pre>
        </div>

      </Accordion>

      {/* ===== IMPRESSORA ===== */}
      <Accordion id="impressora" icon={<Printer size={16}/>} title={t('settings','accPrinter')} openSections={openSections} toggleSection={toggleSection}>
        <div style={{ marginBottom:14 }}>
          <label className="form-label">{t('settings','printerLabel')}</label>
          <select className="form-input" value={printerName} onChange={e=>setPrinterName(e.target.value)}>
            <option value="">{t('settings','printerSelect')}</option>
            {printers.map(p => (
              <option key={p.name} value={p.name}>
                {p.isDefault ? '\uD83D\uDDA5\uFE0F ' : '\uD83D\uDDA8\uFE0F '}{p.name}
              </option>
            ))}
          </select>
          <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
            {t('settings','printerSilent')}
          </p>
        </div>
        <div style={{ marginBottom:14 }}>
          <label className="form-label">Largeur ticket thermique</label>
          <select className="form-input" value={ticketSizeMm} onChange={e=>setTicketSizeMm(parseInt(e.target.value))}>
            <option value={52}>52mm</option>
            <option value={60}>60mm</option>
            <option value={72}>72mm â€” POS-80C (actuel)</option>
            <option value={80}>80mm</option>
          </select>
          <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
            Adapte la largeur du ticket Ã  votre imprimante thermique. Actuel : {ticketSizeMm}mm.
          </p>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <div>
            <label className="form-label" style={{ fontSize:12 }}>{t('settings','copiesTicket')}</label>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={()=>setCopiesTicket(Math.max(1,copiesTicket-1))} className="btn btn-icon btn-secondary"><Minus size={12}/></button>
              <span style={{ minWidth:24, textAlign:'center', fontWeight:700 }}>{copiesTicket}</span>
              <button onClick={()=>setCopiesTicket(Math.min(5,copiesTicket+1))} className="btn btn-icon btn-secondary"><Plus size={12}/></button>
              <span style={{ fontSize:11, color:'var(--text-muted)' }}>{t('settings','defaultVal2')}</span>
            </div>
          </div>
          <div>
            <label className="form-label" style={{ fontSize:12 }}>{t('settings','copiesShift')}</label>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={()=>setCopiesShift(Math.max(1,copiesShift-1))} className="btn btn-icon btn-secondary"><Minus size={12}/></button>
              <span style={{ minWidth:24, textAlign:'center', fontWeight:700 }}>{copiesShift}</span>
              <button onClick={()=>setCopiesShift(Math.min(5,copiesShift+1))} className="btn btn-icon btn-secondary"><Plus size={12}/></button>
              <span style={{ fontSize:11, color:'var(--text-muted)' }}>{t('settings','defaultVal1')}</span>
            </div>
          </div>
        </div>
        <button onClick={savePrinterSettings} className="btn btn-primary">
          <Save size={14}/> {printerSaved ? 'âœ… ' + t('settings','saved2') : t('settings','printerSave')}
        </button>

        {/* â”€â”€ v1.9.1 Impression partagÃ©e â”€â”€ */}
        <div style={{ marginTop:20, paddingTop:16, borderTop:'1px solid var(--border)' }}>
          <label className="form-label" style={{ fontSize:13, fontWeight:700, marginBottom:10, display:'block' }}>
            ðŸ–¨ï¸ Modo de ImpressÃ£o Partilhada
          </label>
          <div style={{ display:'flex', gap:10, marginBottom:12 }}>
            <button
              onClick={() => setPrinterModeVal('local')}
              className={'btn ' + (printerModeVal === 'local' ? 'btn-primary' : 'btn-secondary')}
              style={{ flex:1 }}
            >
              Local (esta mÃ¡quina)
            </button>
            <button
              onClick={() => { setPrinterModeVal('shared'); window.electron.getPrinterMachines().then(r => { if (r?.success) setPrinterMachines(r.data||[]); }); }}
              className={'btn ' + (printerModeVal === 'shared' ? 'btn-primary' : 'btn-secondary')}
              style={{ flex:1 }}
            >
              Partilhada (outra mÃ¡quina)
            </button>
          </div>
          {printerModeVal === 'shared' && (
            <div style={{ marginBottom:12 }}>
              <label className="form-label" style={{ fontSize:12 }}>MÃ¡quina com a impressora</label>
              <select
                className="form-input"
                value={printerTargetId}
                onChange={e => setPrinterTargetId(e.target.value)}
              >
                <option value="">Selecionar mÃ¡quina...</option>
                {printerMachines.filter(m => !m.isLocal).map(m => (
                  <option key={m.machine_id} value={m.machine_id} disabled={m.status === 'offline'}>
                    {m.status === 'online' ? 'ðŸŸ¢ ' : 'ðŸ”´ '}{m.machine_label || m.machine_id.slice(0,8)}
                    {m.status === 'offline' ? ' (offline)' : ''}
                  </option>
                ))}
              </select>
              <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
                Os jobs de impressÃ£o serÃ£o enviados via LAN para esta mÃ¡quina. Se ficar offline, o fallback Ã© local.
              </p>
            </div>
          )}
          <button onClick={savePrinterMode} className="btn btn-primary" disabled={printerModeVal === 'shared' && !printerTargetId}>
            <Save size={14}/> {printerModeSaved ? 'âœ… Guardado!' : 'Guardar modo de impressÃ£o'}
          </button>
        </div>
      </Accordion>

      {/* ===== MANUTENÃ‡ÃƒO ===== */}
      <Accordion id="manutencao" icon={<span>ðŸ”§</span>} title={t('settings','accMaint')} color="#60a5fa" openSections={openSections} toggleSection={toggleSection}>
        <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:14 }}>
          Se o aplicativo apresentar erros como <strong>"no such table"</strong> ou <strong>"no column named"</strong>, clique aqui para aplicar todas as atualizaÃ§Ãµes do banco de dados sem perder dados existentes.
        </p>
        <button onClick={handleForceMigration} disabled={migrating} className="btn btn-secondary" style={{ gap:8 }}>
          ðŸ”§ {migrating ? t('settings','saving') : t('settings','migrateBtn')}
        </button>
        {migrateMsg && (
          <div style={{ marginTop:10, fontSize:12, color:migrateMsg.includes('âœ…')?'var(--success)':'var(--danger)' }}>
            {migrateMsg}
          </div>
        )}

        {/* â”€â”€ v1.8.1 ForÃ§ar Sync LAN + Cloud â”€â”€ */}
        <button onClick={handleForceSync} disabled={syncingNow}
          style={{ marginTop:12, display:'flex', alignItems:'center', gap:8,
            padding:'8px 16px', borderRadius:8, border:'1px solid #22c55e',
            background:'rgba(34,197,94,0.1)', color:'#22c55e',
            fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
          ðŸ”„ {syncingNow ? 'Sincronizando...' : 'ForÃ§ar Sync (LAN + Cloud)'}
        </button>
        {syncMsg && (
          <div style={{ marginTop:8, fontSize:12, color:syncMsg.includes('âœ…')?'var(--success)':'var(--danger)' }}>
            {syncMsg}
          </div>
        )}
        {machineInfo && (
          <div style={{ marginTop:16, borderTop:'1px solid var(--border)', paddingTop:14 }}>
            <div style={{ fontWeight:600, fontSize:13, marginBottom:8, color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:8 }}>
              ðŸ–¥ï¸ {t('settings','machineLabel2')}
              <span style={{ padding:'2px 8px', borderRadius:10, background:'rgba(240,192,64,0.15)', color:'var(--accent)', fontSize:10, fontWeight:700 }}>
                ID: {machineInfo.short_id}
              </span>
            </div>
            <div style={{ marginBottom:8, fontFamily:'monospace', fontSize:11, color:'var(--text-muted)', wordBreak:'break-all' }}>
              UUID: {machineInfo.machine_id}
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input type="text" value={machineLabel} onChange={e=>setMachineLabel(e.target.value)}
                {...{placeholder: t('settings','machinePh')}}
                style={{ flex:1, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-hover)', color:'var(--text-primary)', fontSize:12, fontFamily:'inherit', outline:'none' }}/>
              <button onClick={handleSaveMachineLabel} disabled={savingLabel}
                style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--accent)', background:'rgba(240,192,64,0.1)', color:'var(--accent)', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                {savingLabel ? t('settings','savingLabel') : t('settings','saveMachineLabel')}
              </button>
            </div>
            <div style={{ marginTop:6, fontSize:11, color:'var(--text-muted)' }}>
              â„¹ï¸ {t('settings','machineIDNote')}
            </div>

            {/* â”€â”€ v1.8.0 ClÃ© rÃ©seau LAN â”€â”€ */}
            <div style={{ marginTop:18, paddingTop:14, borderTop:'1px solid var(--border)' }}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:8, color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:8 }}>
                ðŸ”‘ ClÃ© rÃ©seau LAN
                <span style={{ padding:'2px 8px', borderRadius:10, background:'rgba(34,197,94,0.12)', color:'#22c55e', fontSize:10, fontWeight:700 }}>
                  v1.8.0
                </span>
              </div>

              {/* ClÃ© actuelle */}
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <div style={{ flex:1, padding:'7px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-hover)', fontFamily:'monospace', fontSize:14, fontWeight:700, color:'var(--accent)', letterSpacing:2 }}>
                  {networkKey || 'â€”'}
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(networkKey); setNetKeyMsg('âœ… CopiÃ©e !'); setTimeout(() => setNetKeyMsg(''), 2000); }}
                  style={{ padding:'7px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-hover)', color:'var(--text-secondary)', fontSize:12, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                  ðŸ“‹ Copier
                </button>
              </div>

              {/* Changer la clÃ© */}
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
                <input
                  type="text"
                  value={networkKeyInput}
                  onChange={e => setNetworkKeyInput(e.target.value.toUpperCase())}
                  placeholder="CKB-XXXX-XXXX"
                  style={{ flex:1, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-hover)', color:'var(--text-primary)', fontSize:12, fontFamily:'monospace', outline:'none', letterSpacing:1 }}
                />
                <button
                  disabled={savingNetKey || !networkKeyInput.trim()}
                  onClick={async () => {
                    setSavingNetKey(true); setNetKeyMsg('');
                    const res = await window.electron.setNetworkKey?.(networkKeyInput.trim());
                    if (res?.success) {
                      setNetworkKey(networkKeyInput.trim());
                      setNetKeyMsg('âœ… ClÃ© enregistrÃ©e â€” redÃ©marre pour appliquer');
                    } else { setNetKeyMsg('âŒ Erreur'); }
                    setSavingNetKey(false);
                  }}
                  style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--accent)', background:'rgba(240,192,64,0.1)', color:'var(--accent)', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                  {savingNetKey ? 'Saving...' : 'Enregistrer'}
                </button>
              </div>

              {netKeyMsg && <div style={{ fontSize:11, color: netKeyMsg.startsWith('âœ…') ? 'var(--success)' : 'var(--danger)', marginBottom:6 }}>{netKeyMsg}</div>}

              <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.7, background:'var(--bg-hover)', padding:'8px 12px', borderRadius:6 }}>
                ðŸª <strong>Mesmo chave em todas as mÃ¡quinas do mesmo comÃ©rcio.</strong><br/>
                MÃ¡quinas com chaves diferentes ignoram-se mutuellement â€” mesmo que estejam no mesmo WiFi.
              </div>

              {/* â”€â”€ v3.4 CÃ³digo de convite â”€â”€ */}
              <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid var(--border)' }}>
                <div style={{ fontWeight:600, fontSize:13, marginBottom:6, color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:8 }}>
                  â­ CÃ³digo de Convite
                  <span style={{ padding:'2px 8px', borderRadius:10, background:'rgba(99,179,237,0.12)', color:'#63b3ed', fontSize:10, fontWeight:700 }}>v3.4</span>
                </div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:10, lineHeight:1.6 }}>
                  Gera um cÃ³digo temporÃ¡rio (5 min) para uma nova mÃ¡quina se juntar Ã  rede sem partilhar a chave LAN em voz alta.
                </div>
                {inviteCode ? (
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                      <div style={{ flex:1, padding:'12px 16px', borderRadius:8, border:'2px solid var(--accent)', background:'rgba(232,197,71,0.08)', fontFamily:'monospace', fontSize:28, fontWeight:700, color:'var(--accent)', textAlign:'center', letterSpacing:8 }}>
                        {inviteCode}
                      </div>
                      <button onClick={() => { navigator.clipboard.writeText(inviteCode); }} style={{ padding:'10px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-hover)', color:'var(--text-secondary)', cursor:'pointer', fontFamily:'inherit', fontSize:12 }}>
                        ðŸ“‹
                      </button>
                    </div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center' }}>
                      â± Expira em 5 minutos Â· Uso Ãºnico
                    </div>
                    <button onClick={() => setInviteCode('')} style={{ width:'100%', marginTop:8, padding:'7px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                      Fechar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      const res = await window.electron.generateInviteCode();
                      if (res?.success) {
                        setInviteCode(res.code);
                        setTimeout(() => setInviteCode(''), res.expiresIn * 1000);
                      }
                    }}
                    style={{ width:'100%', padding:'9px', borderRadius:8, border:'1px solid var(--accent)', background:'rgba(232,197,71,0.08)', color:'var(--accent)', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}
                  >
                    â­ Gerar cÃ³digo de convite
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Accordion>

      {/* ===== CADERNO DE CAIXA ===== */}
      <Accordion id="caderno" icon={<span>ðŸ““</span>} title={t('settings','accCaderno')} color="#e8c547" openSections={openSections} toggleSection={toggleSection}>

        {/* â”€â”€ Motivos â”€â”€ */}
        <div style={{ marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:'var(--accent)', display:'flex', alignItems:'center', gap:6 }}>
            ðŸ· Motivos
          </div>

          {/* Lista de motivos */}
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
            {cMotivos.map(m => (
              <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px' }}>
                <span style={{ fontSize:16, width:24, textAlign:'center' }}>{m.icone}</span>
                <span style={{ flex:1, fontSize:13, fontWeight:500 }}>{m.label}</span>
                <span style={{ fontSize:11, padding:'2px 8px', borderRadius:4,
                  background: m.direction==='entree'?'rgba(76,175,125,0.12)':m.direction==='perte'?'rgba(245,158,11,0.12)':'rgba(224,82,82,0.12)',
                  color: m.direction==='entree'?'var(--success)':m.direction==='perte'?'var(--warning)':'var(--danger)' }}>
                  {m.direction==='entree'?'â–² Entra':m.direction==='perte'?'âš  Perde':'â–¼ Sai'}
                </span>
                {m.est_dette ? <span style={{ fontSize:10, padding:'2px 7px', borderRadius:4, background:'rgba(224,82,82,0.1)', color:'var(--danger)', border:'1px solid rgba(224,82,82,0.2)' }}>DÃ­vida</span> : null}
                <span style={{ fontSize:10, color:'var(--text-muted)', background:'var(--bg-hover)', border:'1px solid var(--border)', borderRadius:4, padding:'2px 7px' }}>{m.role}</span>
                <button onClick={() => handleDeleteMotivo(m.id)}
                  style={{ background:'rgba(224,82,82,0.08)', color:'var(--danger)', border:'1px solid transparent', padding:'4px 8px', borderRadius:6, cursor:'pointer', fontSize:12 }}>ðŸ—‘</button>
              </div>
            ))}
          </div>

          {/* Ajouter un motivo â€” v3.4 redesign */}
          <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
            <div style={{ fontSize:12, color:'var(--accent)', marginBottom:14, fontWeight:700, textTransform:'uppercase', letterSpacing:1, display:'flex', alignItems:'center', gap:6 }}>
              + Novo Motivo
            </div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>{t('settings','cadernoIcon')}</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:4, padding:'8px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, marginBottom:8 }}>
                {['ðŸ“Œ','ðŸ’¸','ðŸ½','ðŸ¥¤','ðŸº','ðŸŽ','ðŸ“¦','ðŸ”»','âš ï¸','ðŸ’°','ðŸ ','ðŸš—','ðŸŽ®','ðŸ“±','ðŸ’Š','ðŸ›’','ðŸŽµ','ðŸ§´','ðŸ§¹','ðŸ”§','ðŸ”‘','ðŸ“','ðŸ’¡','ðŸŽ¯','ðŸš€','â­','ðŸ†','ðŸŽª','ðŸŽ¨','ðŸŒŸ'].map(em => (
                  <button key={em} type="button" onClick={() => setNewMIcon(em)}
                    style={{ fontSize:18, background:newMIcon===em?'var(--accent-dim)':'transparent', border:newMIcon===em?'1.5px solid var(--accent)':'1.5px solid transparent', borderRadius:6, width:34, height:34, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.1s' }}>
                    {em}
                  </button>
                ))}
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <div style={{ width:36, height:36, borderRadius:8, background:'var(--bg)', border:'1px solid var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                  {newMIcon || 'ðŸ“Œ'}
                </div>
                <input className="form-input" value={newMIcon} onChange={e=>setNewMIcon(e.target.value)}
                  placeholder="Ou digita emojiâ€¦" style={{ fontSize:13, flex:1 }}/>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:12 }}>
              <div>
                <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:4, textTransform:'uppercase', letterSpacing:1 }}>Nome *</div>
                <input className="form-input" value={newMLabel} onChange={e=>setNewMLabel(e.target.value)}
                  placeholder="Nome do motivo" onKeyDown={e=>e.key==='Enter'&&handleAddMotivo()} style={{ fontSize:13 }}/>
              </div>
              <div>
                <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:4, textTransform:'uppercase', letterSpacing:1 }}>{t('settings','cadernoDirection')}</div>
                <select className="form-input" value={newMDir} onChange={e=>setNewMDir(e.target.value)} style={{ fontSize:13 }}>
                  <option value="sortie">â–¼ SaÃ­da</option>
                  <option value="entree">â–² Entrada</option>
                  <option value="perte">âš  Perda</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:4, textTransform:'uppercase', letterSpacing:1 }}>{t('settings','cadernoAccess')}</div>
                <select className="form-input" value={newMRole} onChange={e=>setNewMRole(e.target.value)} style={{ fontSize:13 }}>
                  <option value="Geral">{t('settings','cadernoGeneral')}</option>
                  <option value="Admin">{t('settings','cadernoAdminOnly')}</option>
                </select>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                <input type="checkbox" checked={newMDette} onChange={e=>setNewMDette(e.target.checked)}
                  style={{ accentColor:'var(--danger)', width:15, height:15 }}/>
                <span style={{ fontSize:13, color:'var(--text-secondary)' }}>{t('settings','cadernoMotiveDead')} â€” {t('settings','cadernoMotiveSim')}</span>
              </label>
              <button onClick={handleAddMotivo} className="btn btn-primary" style={{ padding:'8px 20px', fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
                + Adicionar
              </button>
            </div>
          </div>
        </div>

        {/* â”€â”€ Trabalhadores â”€â”€ */}
        <div style={{ marginBottom:20, borderTop:'1px solid var(--border)', paddingTop:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:'var(--info)', display:'flex', alignItems:'center', gap:6 }}>
            ðŸ‘· Trabalhadores
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
            {cTrabalhadores.map(t => (
              <div key={t.id} style={{ display:'flex', alignItems:'center', gap:6, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:20, padding:'4px 10px 4px 12px', fontSize:12 }}>
                <span>{t.nom}</span>
                <button onClick={() => handleDeleteTrab(t.id)}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:13, padding:'0 2px', lineHeight:1 }}>âœ•</button>
              </div>
            ))}
            {cTrabalhadores.length === 0 && <span style={{ fontSize:12, color:'var(--text-muted)' }}>{t('settings','cadernoTrabNone')}</span>}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <input className="form-input" value={newTrabNom} onChange={e=>setNewTrabNom(e.target.value)}
              {...{placeholder: t('settings','cadernoTrabPh')}} style={{ fontSize:12, padding:'7px 10px' }}
              onKeyDown={e=>e.key==='Enter'&&handleAddTrab()}/>
            <button onClick={handleAddTrab} className="btn btn-primary" style={{ padding:'7px 14px', whiteSpace:'nowrap' }}>+ Adicionar</button>
          </div>
        </div>

        {/* â”€â”€ Produtos nÃ£o registrados â”€â”€ */}
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:'var(--success)', display:'flex', alignItems:'center', gap:6 }}>
            ðŸ“¦ Produtos nÃ£o registrados
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
            {cProdutos.map(p => (
              <div key={p.id} style={{ display:'flex', alignItems:'center', gap:6, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:20, padding:'4px 10px 4px 12px', fontSize:12 }}>
                <span>{p.nom}</span>
                {p.prix > 0 && <span style={{ color:'var(--accent)', fontFamily:'monospace', fontSize:10, marginLeft:4 }}>{Number(p.prix).toLocaleString('fr-FR')} Kz</span>}
                <button onClick={() => handleDeleteProd(p.id)}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:13, padding:'0 2px', lineHeight:1 }}>âœ•</button>
              </div>
            ))}
            {cProdutos.length === 0 && <span style={{ fontSize:12, color:'var(--text-muted)' }}>{t('settings','cadernoProdNone')}</span>}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <input className="form-input" value={newProdNom} onChange={e=>setNewProdNom(e.target.value)}
              {...{placeholder: t('settings','cadernoProdPh')}} style={{ fontSize:12, padding:'7px 10px', flex:2 }}
              onKeyDown={e=>e.key==='Enter'&&handleAddProd()}/>
            <div style={{ position:'relative', flex:1 }}>
              <input className="form-input" value={newProdPrix} onChange={e=>setNewProdPrix(e.target.value)}
                placeholder="Prix Kz" style={{ fontSize:12, padding:'7px 30px 7px 10px', width:'100%' }}
                onKeyDown={e=>e.key==='Enter'&&handleAddProd()}/>
              <span style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', fontSize:10, pointerEvents:'none' }}>Kz</span>
            </div>
            <button onClick={handleAddProd} className="btn btn-primary" style={{ padding:'7px 14px', whiteSpace:'nowrap' }}>+ Adicionar</button>
          </div>
        </div>

      </Accordion>

      {/* ===== ZONA DE PERIGO ===== */}
      <Accordion id="perigo" icon={<AlertTriangle size={16}/>} title={t('settings','accDanger')} color="var(--danger)" openSections={openSections} toggleSection={toggleSection}>
        <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:14 }}>
          Resetar o aplicativo apagarÃ¡ TODOS os dados (produtos, vendas, usuÃ¡rios). Esta aÃ§Ã£o nÃ£o pode ser desfeita!
        </p>
        {!showReset ? (
          <button onClick={()=>setShowReset(true)} className="btn btn-danger" style={{ gap:8 }}>
            <Trash2 size={14}/> {t('settings','dangerReset')}
          </button>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <p style={{ fontSize:13, color:'var(--danger)', fontWeight:600 }}>
              Digite <strong>RESETAR</strong> para confirmar:
            </p>
            <input type="text" className="form-input" value={resetConfirm} onChange={e=>setResetConfirm(e.target.value)} placeholder="RESETAR"/>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={handleReset} disabled={resetConfirm!=='RESETAR'} className="btn btn-danger" style={{ gap:8 }}>
                <Trash2 size={14}/> {t('settings','dangerConfirmBtn')}
              </button>
              <button onClick={()=>{setShowReset(false);setResetConfirm('');}} className="btn btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </Accordion>

      {/* ===== INFORMAÃ‡Ã•ES DO SISTEMA ===== */}
      <Accordion id="sistema" icon={<span>â„¹ï¸</span>} title={t('settings','accSystem')} openSections={openSections} toggleSection={toggleSection}>
        <div style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.8 }}>
          <div>VersÃ£o: <strong style={{color:'var(--accent)'}}>CKBPOS v{window.__CKBPOS_VERSION__ || '1.2.3'}</strong></div>
          <div>{t('settings','sysDb')}</div>
          <div>{t('settings','sysLang')}: {lang} Â· {t('settings','sysCurrency')}: {currency}</div>
        </div>
      </Accordion>

      {AlertModalComponent}
      {ConfirmModalComponent}
    </div>
  );
}
