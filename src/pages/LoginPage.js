import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { Eye, EyeOff, Lock, Mail, Hash, AlertTriangle, KeyRound } from 'lucide-react';
import bcrypt from 'bcryptjs';
import { useLang } from '../utils/useLang';

export default function LoginPage() {
  const { t } = useLang();
  // Déconnexion auto quand la fenêtre/app se ferme
  React.useEffect(() => {
    const handleBeforeUnload = async () => {
      try { await window.electron.storeDelete('current_user'); } catch(e) {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [lastDigit, setLastDigit] = useState(null); // jamais affiché
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tentativas, setTentativas] = useState(0);
  // Reset password flow
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetQuestion, setResetQuestion] = useState('');
  const [resetAnswer, setResetAnswer] = useState('');
  const [resetStep, setResetStep] = useState(1); // 1=email, 2=question, 3=new password
  const [newPassword, setNewPassword] = useState('');
  const [resetUser, setResetUser] = useState(null);
  const [resetMsg, setResetMsg] = useState('');

  const handleLogin = async (e) => {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await window.electron.dbGet(
        "SELECT * FROM users WHERE email=? AND actif=1", [email]
      );
      if (!res.success || !res.data) {
        setError(t('login','wrongCredentials2'));
        setLoading(false);
        return;
      }
      const user = res.data;
      const valid = bcrypt.compareSync(password, user.password_hash);
      if (!valid) {
        const newTentativas = (user.tentativas_login || 0) + 1;
        await window.electron.dbQuery(
          "UPDATE users SET tentativas_login=? WHERE id=?", [newTentativas, user.id]
        );
        setTentativas(newTentativas);
        if (newTentativas >= 3 && user.role === 'admin') {
          setError(`3 ${t('login','attempts')}`);
        } else {
          setError(`${t('login','attemptsPrefix')} ${newTentativas}/3`);
        }
        setLoading(false);
        return;
      }
      await window.electron.dbQuery(
        "UPDATE users SET last_login=datetime('now'), tentativas_login=0 WHERE id=?", [user.id]
      );
      await login({ id:user.id, nom:user.nom, email:user.email, role:user.role, peut_modifier_factures:user.peut_modifier_factures });
      navigate('/');
    } catch(err) { setError(t('login','connectionError2')); }
    setLoading(false);
  };

  const handlePinLogin = async (pinValue) => {
    setError(''); setLoading(true);
    try {
      const res = await window.electron.dbGet(
        "SELECT * FROM users WHERE pin=? AND actif=1", [pinValue]
      );
      if (!res.success || !res.data) {
        setError(t('login','wrongPin2')); setPin(''); setLoading(false); return;
      }
      const user = res.data;
      await window.electron.dbQuery("UPDATE users SET last_login=datetime('now') WHERE id=?", [user.id]);
      await login({ id:user.id, nom:user.nom, email:user.email, role:user.role, peut_modifier_factures:user.peut_modifier_factures });
      navigate('/');
    } catch(err) { setError('Erro'); setPin(''); }
    setLoading(false);
  };

  const handlePinInput = (digitOrFull) => {
    // Accept either single digit or full 4-digit string from physical keyboard
    const newPin = digitOrFull.length === 4 ? digitOrFull : (pin.length < 4 ? pin + digitOrFull : pin);
    setLastDigit(digitOrFull.slice(-1));
    setPin(newPin);
    if (newPin.length === 4) setTimeout(() => handlePinLogin(newPin), 100);
  };

  // Reset password steps
  const handleResetStep1 = async () => {
    const res = await window.electron.dbGet(
      "SELECT * FROM users WHERE email=? AND role='admin'", [resetEmail]
    );
    if (!res.data) { setResetMsg('Email admin não encontrado'); return; }
    if (!res.data.question_secreta) { setResetMsg('Nenhuma pergunta de segurança configurada para este admin. Contate suporte.'); return; }
    setResetUser(res.data);
    setResetQuestion(res.data.question_secreta);
    setResetStep(2);
    setResetMsg('');
  };

  const handleResetStep2 = async () => {
    const correct = resetUser.resposta_secreta?.toLowerCase().trim();
    if (resetAnswer.toLowerCase().trim() !== correct) {
      setResetMsg(t('login','wrongAnswer')); return;
    }
    setResetStep(3); setResetMsg('');
  };

  const handleResetStep3 = async () => {
    if (newPassword.length < 6) { setResetMsg(t('login','passwordTooShort')); return; }
    const hash = bcrypt.hashSync(newPassword, 10);
    await window.electron.dbQuery(
      "UPDATE users SET password_hash=?, tentativas_login=0 WHERE id=?", [hash, resetUser.id]
    );
    setResetMsg(t('login','resetSuccess'));
    setTimeout(() => { setShowReset(false); setResetStep(1); setResetEmail(''); setResetAnswer(''); setNewPassword(''); setResetMsg(''); }, 2000);
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-primary)', backgroundImage:'radial-gradient(ellipse at 50% 0%, rgba(232,197,71,0.06) 0%, transparent 60%)' }}>
      {/* Titlebar */}
      <div style={{ position:'fixed', top:0, left:0, right:0, height:38, WebkitAppRegion:'drag', display:'flex', alignItems:'center', justifyContent:'flex-end', padding:'0 8px' }}>
        <div style={{ WebkitAppRegion:'no-drag', display:'flex', gap:6 }}>
          {[{l:'–',a:()=>window.electron.minimize(),h:'var(--bg-hover)'},{l:'□',a:()=>window.electron.maximize(),h:'var(--bg-hover)'},{l:'✕',a:()=>window.electron.close(),h:'var(--danger)'}].map((b,i)=>(
            <button key={i} onClick={b.a} style={{ width:28,height:28,borderRadius:6,border:'none',background:'transparent',cursor:'pointer',color:'var(--text-muted)',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center' }}
              onMouseEnter={e=>{e.currentTarget.style.background=b.h;e.currentTarget.style.color='white';}}
              onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-muted)';}}>
              {b.l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width:'100%', maxWidth:400, padding:'0 24px' }}>
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ fontSize:48, fontWeight:800, letterSpacing:6, color:'var(--accent)', fontFamily:'JetBrains Mono,monospace', textShadow:'0 0 40px rgba(232,197,71,0.3)', marginBottom:8 }}>
            CKB<span style={{ color:'var(--text-secondary)', fontSize:36 }}>POS</span>
          </div>
          <div style={{ color:'var(--text-muted)', fontSize:13 }}>{t('login','title')}</div>
        </div>

        {/* Mode tabs */}
        <div style={{ display:'flex', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:4, marginBottom:24, gap:4 }}>
          {[{key:'password',label:'📧 Email / Senha'},{key:'pin',label:'🔢 PIN Rápido'}].map(m=>(
            <button key={m.key} onClick={()=>{setMode(m.key);setError('');setPin('');}}
              style={{ flex:1, padding:'8px', borderRadius:8, border:'none', cursor:'pointer', background:mode===m.key?'var(--accent)':'transparent', color:mode===m.key?'#000':'var(--text-secondary)', fontWeight:600, fontSize:13, fontFamily:'inherit', transition:'all 0.15s ease' }}>
              {m.label}
            </button>
          ))}
        </div>

        <div className="card" style={{ padding:28 }}>
          {mode === 'password' ? (
            <form onSubmit={handleLogin} style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <div style={{ position:'relative' }}>
                  <Mail size={16} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}/>
                  <input type="email" className="form-input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@ckbpos.com" style={{ paddingLeft:36 }} required autoFocus/>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('login','passwordLabel2')}</label>
                <div style={{ position:'relative' }}>
                  <Lock size={16} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}/>
                  <input type={showPass?'text':'password'} className="form-input" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" style={{ paddingLeft:36, paddingRight:40 }} required/>
                  <button type="button" onClick={()=>setShowPass(!showPass)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)' }}>
                    {showPass?<EyeOff size={16}/>:<Eye size={16}/>}
                  </button>
                </div>
              </div>
              {error && (
                <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, padding:'10px 14px', color:'var(--danger)', fontSize:13 }}>
                  <AlertTriangle size={14} style={{ display:'inline', marginRight:6 }}/>{error}
                </div>
              )}
              {tentativas >= 3 && (
                <button type="button" onClick={()=>setShowReset(true)}
                  style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontSize:13, textDecoration:'underline', fontFamily:'inherit' }}>
                  <KeyRound size={14} style={{ display:'inline', marginRight:4 }}/>Esqueci minha senha
                </button>
              )}
              <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading} style={{ justifyContent:'center' }}>
                {loading ? t('login','enteringButton') : t('login','enterButton')}
              </button>
            </form>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:20 }}>
              <div style={{ color:'var(--text-secondary)', fontSize:13, textAlign:'center' }}>
                <Hash size={14} style={{ display:'inline', marginRight:4 }}/>{t('login','enterPin')}
              </div>
              {/* 4 dots indicator */}
              <div style={{ display:'flex', gap:16, justifyContent:'center', margin:'8px 0' }}>
                {[0,1,2,3].map(i=>(
                  <div key={i} style={{ width:18, height:18, borderRadius:'50%', background:i<pin.length?'var(--accent)':'var(--border)', transition:'background 0.15s ease', boxShadow:i<pin.length?'0 0 10px var(--accent)':'none' }}/>
                ))}
              </div>
              {/* Hidden input captures physical keyboard */}
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                autoFocus
                onChange={e=>{
                  const val = e.target.value.replace(/\D/g,'').slice(0,4);
                  setPin(val);
                  if(val.length===4) setTimeout(()=>handlePinInput(val),50);
                }}
                style={{ position:'absolute', opacity:0, width:1, height:1, pointerEvents:'none' }}
              />
              {/* Keyboard hint */}
              <div style={{ background:'var(--bg-hover)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', textAlign:'center', marginTop:4 }}>
                <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:8 }}>{t('login','physicalKeyboard')}</div>
                <div style={{ display:'flex', gap:4, justifyContent:'center', flexWrap:'wrap' }}>
                  {[1,2,3,4,5,6,7,8,9,0].map(n=>(
                    <div key={n} style={{ width:24, height:24, background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'var(--text-muted)', fontFamily:'monospace' }}>{n}</div>
                  ))}
                  <div style={{ width:28, height:24, background:'var(--bg-secondary)', border:'1px solid var(--accent)', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'var(--accent)', fontFamily:'monospace' }}>⌫</div>
                </div>
              </div>
              {error && <div style={{ color:'var(--danger)', fontSize:13, textAlign:'center', marginTop:4 }}>{error}</div>}
            </div>
          )}
        </div>
        <div style={{ textAlign:'center', marginTop:16, color:'var(--text-muted)', fontSize:12 }}>
          {t('login','defaultAccount')} <span style={{ color:'var(--accent)', fontFamily:'monospace' }}>admin@ckbpos.com / admin123</span>
        </div>
      </div>

      {/* Reset Password Modal */}
      {showReset && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:420 }}>
            <div className="modal-header">
              <h2 className="modal-title"><KeyRound size={18} style={{ display:'inline', marginRight:8 }}/>{t('login','resetPassword')}</h2>
              <button onClick={()=>{setShowReset(false);setResetStep(1);setResetMsg('');}} className="btn btn-icon btn-secondary">✕</button>
            </div>

            {resetStep === 1 && (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <p style={{ fontSize:13, color:'var(--text-secondary)' }}>{t('login','resetStep1Desc')}</p>
                <div className="form-group">
                  <label className="form-label">{t('login','adminEmail')}</label>
                  <input type="email" className="form-input" value={resetEmail} onChange={e=>setResetEmail(e.target.value)} placeholder="admin@ckbpos.com" autoFocus/>
                </div>
                {resetMsg && <div style={{ color:'var(--danger)', fontSize:13 }}>{resetMsg}</div>}
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={()=>setShowReset(false)} className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}>{t('login','cancelBtn2')}</button>
                  <button onClick={handleResetStep1} className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}>{t('login','next')}</button>
                </div>
              </div>
            )}

            {resetStep === 2 && (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div style={{ background:'var(--bg-hover)', borderRadius:10, padding:14 }}>
                  <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:4 }}>{t('login','secQuestion')}</div>
                  <div style={{ fontWeight:600 }}>{resetQuestion}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('login','answer')}</label>
                  <input type="text" className="form-input" value={resetAnswer} onChange={e=>setResetAnswer(e.target.value)} placeholder="Digite sua resposta..." autoFocus/>
                </div>
                {resetMsg && <div style={{ color:'var(--danger)', fontSize:13 }}>{resetMsg}</div>}
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={()=>setResetStep(1)} className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}>{t('login','back')}</button>
                  <button onClick={handleResetStep2} className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}>{t('login','verify')}</button>
                </div>
              </div>
            )}

            {resetStep === 3 && (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <p style={{ fontSize:13, color:'var(--success)' }}>✅ Identidade verificada! Digite sua nova senha.</p>
                <div className="form-group">
                  <label className="form-label">{t('login','newPasswordLabel')}</label>
                  <input type="password" className="form-input" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="••••••••" autoFocus/>
                </div>
                {resetMsg && <div style={{ color:resetMsg.includes('✅')?'var(--success)':'var(--danger)', fontSize:13 }}>{resetMsg}</div>}
                <button onClick={handleResetStep3} className="btn btn-primary" style={{ justifyContent:'center' }}>
                  Redefinir Senha
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
