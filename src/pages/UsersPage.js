import React, { useState, useEffect } from 'react';
import { useLang } from '../utils/useLang';
import { Plus, Edit2, Trash2, UserCheck, UserX, X, Eye, EyeOff, FileEdit, Clock } from 'lucide-react';
import bcrypt from 'bcryptjs';
import { useAlert, useConfirm } from '../components/AlertModal'; // \u2705 AJOUT

const emptyForm = { nom:'', email:'', role:'vendeur', password:'', pin:'', actif:1, peut_modifier_factures:0, photo_base64:'' };

export default function UsersPage() {
  const { t, lang } = useLang();
  const intlLocale = lang === 'fr' ? 'fr-FR' : lang === 'en' ? 'en-US' : 'pt-BR';

  // \u2705 Hooks modals React (remplacent alert() et confirm() natifs)
  const { showAlert, AlertModalComponent } = useAlert();
  const { showConfirm, ConfirmModalComponent } = useConfirm();

  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  // v3.7.0 — Historique connexions
  const [showSessions, setShowSessions] = useState(null); // user object
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  useEffect(() => { loadUsers(); }, []);


  const loadSessions = async (userId) => {
    setSessionsLoading(true);
    try {
      const res = await window.electron.getUserSessions(userId);
      setSessions(res?.data || []);
    } catch(e) { setSessions([]); }
    setSessionsLoading(false);
  };

  const loadUsers = async () => {
    const res = await window.electron.dbQuery("SELECT * FROM users ORDER BY role, nom", []);
    setUsers(res.data || []);
  };

  const openAdd  = () => { setForm(emptyForm); setEditing(null); setShowModal(true); };
  const openEdit = (u) => {
    setForm({ nom:u.nom, email:u.email, role:u.role, password:'', pin:u.pin||'', actif:u.actif, peut_modifier_factures:u.peut_modifier_factures||0, photo_base64:u.photo_base64||'' });
    setEditing(u.id); setShowModal(true);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { showAlert('', 'Photo trop grande (max 50 MB)', 'warning'); return; }
    const reader = new FileReader();
    reader.onloadend = () => f('photo_base64', reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    // \u2705 Remplacé alert() natifs \u2192 showAlert React
    if (!form.nom || !form.email) { showAlert('', t('users','nameRequired'), 'warning'); return; }
    if (!editing && !form.password) { showAlert('', t('users','passwordRequired'), 'warning'); return; }
    setLoading(true);
    try {
      if (editing) {
        const updates = ['nom=?','email=?','role=?','pin=?','actif=?','peut_modifier_factures=?','photo_base64=?'];
        const vals    = [form.nom,form.email,form.role,form.pin||null,form.actif,form.peut_modifier_factures,form.photo_base64||null];
        if (form.password) { updates.push('password_hash=?'); vals.push(bcrypt.hashSync(form.password,10)); }
        vals.push(editing);
        await window.electron.dbQuery(`UPDATE users SET ${updates.join(',')} WHERE id=?`, vals);
      } else {
        const hash = bcrypt.hashSync(form.password, 10);
        await window.electron.dbQuery(
          "INSERT INTO users (nom,email,role,password_hash,pin,actif,peut_modifier_factures,photo_base64) VALUES (?,?,?,?,?,?,?,?)",
          [form.nom,form.email,form.role,hash,form.pin||null,1,form.peut_modifier_factures,form.photo_base64||null]
        );
      }
      setShowModal(false); loadUsers();
    } catch(e) {
      // \u2705 Remplacé alert() natif \u2192 showAlert React
      showAlert('Erro', e.message, 'error');
    }
    setLoading(false);
  };

  const toggleActive = async (u) => {
    await window.electron.dbQuery("UPDATE users SET actif=? WHERE id=?", [u.actif?0:1, u.id]);
    loadUsers();
  };

  const toggleEditFactures = async (u) => {
    await window.electron.dbQuery("UPDATE users SET peut_modifier_factures=? WHERE id=?", [u.peut_modifier_factures?0:1, u.id]);
    loadUsers();
  };

  const handleDelete = async (u) => {
    if (u.role === 'admin') {
      const adminCount = users.filter(x => x.role === 'admin').length;
      if (adminCount <= 1) {
        // \u2705 Remplacé alert() natif \u2192 showAlert React
        showAlert('', t('users','lastAdminError'), 'warning');
        return;
      }
    }
    // \u2705 Remplacé window.confirm() natif \u2192 showConfirm React (async/await)
    const ok = await showConfirm(
      t('users','deleteConfirmMsg'),
      `"${u.nom}" ? ${t('users','deleteConfirmMsg2')}`,
      'warning'
    );
    if (!ok) return;
    try {
      await window.electron.dbQuery("DELETE FROM shifts WHERE user_id=?", [u.id]);
      await window.electron.dbQuery("DELETE FROM stock_mouvements WHERE user_id=?", [u.id]);
      const res = await window.electron.dbQuery("DELETE FROM users WHERE id=?", [u.id]);
      if (res.success) {
        loadUsers();
      } else {
        showAlert('Erreur suppression', res.error, 'error');
      }
    } catch(e) {
      showAlert('Erro', e.message, 'error');
    }
  };

  const f = (key, val) => setForm(p => ({ ...p, [key]: val }));

  return (
    <div className="users-scroll" style={{ padding:24, height:'100%', overflowY:'auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700 }}>{t('users','title')}</h1>
          <p style={{ color:'var(--text-secondary)', fontSize:14 }}>{users.length} {t('users','count')}</p>
        </div>
        <button onClick={openAdd} className="btn btn-primary"><Plus size={16}/> {t('users','newUser')}</button>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>{t('users','name')}</th>
              <th>{t('users','role')}</th>
              <th>{t('users','pin')}</th>
              <th>{t('users','editFacturas')}</th>
              <th>{t('users','status')}</th>
              <th>{t('users','lastLogin')}</th>
              <th>{t('users','actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, rIdx) => (
              <tr key={u.id} className="users-row"
                style={{ cursor:'pointer' }}>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    {u.photo_base64 ? (
                      <img src={u.photo_base64} alt="" style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover', border:'2px solid var(--border)', flexShrink:0 }}/>
                    ) : (
                      <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--bg-hover)', border:'2px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'var(--text-muted)', flexShrink:0 }}>
                        {u.nom?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight:600 }}>{u.nom}</div>
                      <div style={{ fontSize:11, color:'var(--text-muted)' }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                <td style={{ fontFamily:'monospace', color:'var(--text-muted)' }}>{u.pin?'••••':'—'}</td>
                <td>
                  {u.role === 'vendeur' ? (
                    <button onClick={() => toggleEditFactures(u)}
                      style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontSize:12, fontFamily:'inherit',
                        color: u.peut_modifier_factures ? 'var(--success)' : 'var(--text-muted)' }}>
                      <FileEdit size={14}/>
                      {u.peut_modifier_factures ? t('users','editFacturasYes') : t('users','editFacturasNo')}
                    </button>
                  ) : (
                    <span style={{ fontSize:12, color:'var(--accent)' }}>{'\u2713'} Admin</span>
                  )}
                </td>
                <td><span className={`badge ${u.actif?'badge-success':'badge-danger'}`}>{u.actif?t('users','active'):t('users','inactive')}</span></td>
                <td style={{ fontSize:12, color:'var(--text-muted)' }}>
                  {u.last_login ? new Date(u.last_login).toLocaleString(intlLocale) : t('users','never')}
                </td>
                <td>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => openEdit(u)} className="btn btn-icon btn-secondary"><Edit2 size={14}/></button>
                    <button onClick={() => toggleActive(u)} className="btn btn-icon btn-secondary">
                      {u.actif?<UserX size={14}/>:<UserCheck size={14}/>}
                    </button>
                    <button onClick={() => { setShowSessions(u); loadSessions(u.id); }} className="btn btn-icon btn-secondary" title="Histórico de acessos"><Clock size={14}/></button>
                    <button onClick={() => handleDelete(u)} className="btn btn-icon btn-danger"><Trash2 size={14}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editing?t('users','editUserTitle'):t('users','newUserTitle')}</h2>
              <button onClick={() => setShowModal(false)} className="btn btn-icon btn-secondary"><X size={16}/></button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* Photo profil */}
              <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ position:'relative', flexShrink:0 }}>
                  {form.photo_base64 ? (
                    <img src={form.photo_base64} alt="" style={{ width:72, height:72, borderRadius:'50%', objectFit:'cover', border:'3px solid var(--border)' }}/>
                  ) : (
                    <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--bg-hover)', border:'3px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, fontWeight:700, color:'var(--text-muted)' }}>
                      {form.nom?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  <label style={{ fontSize:12, color:'var(--text-muted)', fontWeight:600 }}>{t('users','profilePhotoLabel')}</label>
                  <label style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-hover)', cursor:'pointer', fontSize:12, display:'inline-block', color:'var(--text-primary)' }}>
                    {'\u{1F4F7}'} Choisir une photo
                    <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display:'none' }}/>
                  </label>
                  {form.photo_base64 && (
                    <button type="button" onClick={() => f('photo_base64','')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--danger)', fontSize:12, textAlign:'left', padding:0 }}>
                      {'\u{1F5D1}'} Supprimer
                    </button>
                  )}
                  <span style={{ fontSize:10, color:'var(--text-muted)' }}>{t('users','photoHint')}</span>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div className="form-group">
                  <label className="form-label">{t('users','nameLabel')}</label>
                  <input type="text" className="form-input" value={form.nom}
                    onChange={e=>f('nom',e.target.value)} placeholder={t('users','namePlaceholder')}/>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('users','roleLabel')}</label>
                  <select className="form-input" value={form.role} onChange={e=>f('role',e.target.value)}>
                    <option value="vendeur">{t('users','seller')}</option>
                    <option value="admin">{t('users','admin')}</option>
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">{t('users','emailLabel')}</label>
                  <input type="email" className="form-input" value={form.email}
                    onChange={e=>f('email',e.target.value)} placeholder={t('users','emailPlaceholder')}/>
                </div>
                <div className="form-group">
                  <label className="form-label">{editing?t('users','editPasswordLabel'):t('users','passwordLabel')}</label>
                  <div style={{ position:'relative' }}>
                    <input type={showPass?'text':'password'} className="form-input" value={form.password}
                      onChange={e=>f('password',e.target.value)} placeholder={t('users','passwordPlaceholder')}
                      style={{ paddingRight:40 }}/>
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)' }}>
                      {showPass?<EyeOff size={15}/>:<Eye size={15}/>}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('users','pinLabel')}</label>
                  <input type="text" className="form-input" value={form.pin}
                    onChange={e=>f('pin',e.target.value.slice(0,4))} placeholder={t('users','pinPlaceholder')} maxLength={4}/>
                </div>
                {form.role === 'vendeur' && (
                  <div className="form-group" style={{ gridColumn:'1/-1' }}>
                    <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                      <input type="checkbox" checked={!!form.peut_modifier_factures}
                        onChange={e=>f('peut_modifier_factures',e.target.checked?1:0)}/>
                      <span style={{ fontSize:13 }}>
                        <FileEdit size={14} style={{ display:'inline', marginRight:4 }}/>
                        {t('users','allowEditFacturasLabel')}
                      </span>
                    </label>
                  </div>
                )}
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}>{t('users','cancel')}</button>
                <button onClick={handleSave} className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} disabled={loading}>
                  {loading?t('users','saving'):t('users','save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* v3.7.0 — Modal Histórico de Acessos */}
      {showSessions && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 className="modal-title"><Clock size={16} style={{ display:'inline', marginRight:6 }}/>{t('users','activityTitlePrefix')} — {showSessions.nom}</h2>
              <button onClick={() => { setShowSessions(null); setSessions([]); }} className="btn btn-icon btn-secondary"><X size={16}/></button>
            </div>
            {sessionsLoading ? (
              <div style={{ textAlign:'center', padding:24, color:'var(--text-muted)' }}>{t('users','loadingSessions')}</div>
            ) : sessions.length === 0 ? (
              <div style={{ textAlign:'center', padding:24, color:'var(--text-muted)', fontSize:13 }}>{t('users','noAccessLogged')}</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {sessions.map((s, i) => (
                  <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', borderRadius:8, background:'var(--bg-hover)', fontSize:12, border:'1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight:600 }}>{s.machine_label || s.machine_id?.slice(0,8) || '?'}</div>
                      <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'monospace' }}>{s.machine_id?.slice(0,8) || ''}</div>
                    </div>
                    <span style={{ fontFamily:'monospace', color:'var(--text-muted)', fontSize:11 }}>
                      {s.login_at ? new Date(s.login_at + 'Z').toLocaleString(intlLocale) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* {'\u2705'} Modals React purs — zéro focus trap */}
      {AlertModalComponent}
      {ConfirmModalComponent}
    </div>
  );
}
