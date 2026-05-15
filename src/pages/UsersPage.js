import React, { useState, useEffect } from 'react';
import { useLang } from '../utils/useLang';
import { Plus, Edit2, Trash2, UserCheck, UserX, X, Eye, EyeOff, FileEdit } from 'lucide-react';
import bcrypt from 'bcryptjs';

const emptyForm = { nom:'', email:'', role:'vendeur', password:'', pin:'', actif:1, peut_modifier_factures:0 };

export default function UsersPage() {
  const { t } = useLang();
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    const res = await window.electron.dbQuery("SELECT * FROM users ORDER BY role, nom", []);
    setUsers(res.data || []);
  };

  const openAdd = () => { setForm(emptyForm); setEditing(null); setShowModal(true); };
  const openEdit = (u) => {
    setForm({ nom:u.nom, email:u.email, role:u.role, password:'', pin:u.pin||'', actif:u.actif, peut_modifier_factures:u.peut_modifier_factures||0 });
    setEditing(u.id); setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nom || !form.email) { alert(t('users','nameRequired')); return; }
    if (!editing && !form.password) { alert(t('users','passwordRequired')); return; }
    setLoading(true);
    try {
      if (editing) {
        const updates = ['nom=?','email=?','role=?','pin=?','actif=?','peut_modifier_factures=?'];
        const vals = [form.nom,form.email,form.role,form.pin||null,form.actif,form.peut_modifier_factures];
        if (form.password) { updates.push('password_hash=?'); vals.push(bcrypt.hashSync(form.password,10)); }
        vals.push(editing);
        await window.electron.dbQuery(`UPDATE users SET ${updates.join(',')} WHERE id=?`, vals);
      } else {
        const hash = bcrypt.hashSync(form.password, 10);
        await window.electron.dbQuery(
          "INSERT INTO users (nom,email,role,password_hash,pin,actif,peut_modifier_factures) VALUES (?,?,?,?,?,?,?)",
          [form.nom,form.email,form.role,hash,form.pin||null,1,form.peut_modifier_factures]
        );
      }
      setShowModal(false); loadUsers();
    } catch(e) { alert('Erro: '+e.message); }
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

  // FIX: suppression avec vérification admin protégé
  const handleDelete = async (u) => {
    if (u.role === 'admin') {
      const adminCount = users.filter(x => x.role === 'admin').length;
      if (adminCount <= 1) {
        alert(t('users','lastAdminError'));
        return;
      }
    }
    if (!window.confirm(`${t('users','deleteConfirmMsg')} "${u.nom}" ? ${t('users','deleteConfirmMsg2')}`)) return;
    try {
      // Supprimer d'abord les données liées (shifts, mouvements)
      await window.electron.dbQuery("DELETE FROM shifts WHERE user_id=?", [u.id]);
      await window.electron.dbQuery("DELETE FROM stock_mouvements WHERE user_id=?", [u.id]);
      // Supprimer l'utilisateur
      const res = await window.electron.dbQuery("DELETE FROM users WHERE id=?", [u.id]);
      if (res.success) {
        loadUsers();
      } else {
        alert('Erreur suppression: ' + res.error);
      }
    } catch(e) {
      alert('Erro: ' + e.message);
    }
  };

  const f = (key, val) => setForm(p => ({ ...p, [key]: val }));

  return (
    <div style={{ padding:24, height:'100%', overflowY:'auto' }}>
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
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ fontWeight:600 }}>{u.nom}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{u.email}</div>
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
                    <span style={{ fontSize:12, color:'var(--accent)' }}>✓ Admin</span>
                  )}
                </td>
                <td><span className={`badge ${u.actif?'badge-success':'badge-danger'}`}>{u.actif?t('users','active'):t('users','inactive')}</span></td>
                <td style={{ fontSize:12, color:'var(--text-muted)' }}>{u.last_login?new Date(u.last_login).toLocaleString('fr-FR'):t('users','never')}</td>
                <td>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => openEdit(u)} className="btn btn-icon btn-secondary"><Edit2 size={14}/></button>
                    <button onClick={() => toggleActive(u)} className="btn btn-icon btn-secondary">
                      {u.actif?<UserX size={14}/>:<UserCheck size={14}/>}
                    </button>
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
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div className="form-group">
                  <label className="form-label">{t('users','nameLabel')}</label>
                  <input type="text" className="form-input" value={form.nom} onChange={e=>f('nom',e.target.value)} placeholder={t('users','namePlaceholder')}/>
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
                  <input type="email" className="form-input" value={form.email} onChange={e=>f('email',e.target.value)} placeholder={t('users','emailPlaceholder')}/>
                </div>
                <div className="form-group">
                  <label className="form-label">{editing?t('users','editPasswordLabel'):t('users','passwordLabel')}</label>
                  <div style={{ position:'relative' }}>
                    <input type={showPass?'text':'password'} className="form-input" value={form.password} onChange={e=>f('password',e.target.value)} placeholder={t('users','passwordPlaceholder')} style={{ paddingRight:40 }}/>
                    <button type="button" onClick={() => setShowPass(!showPass)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)' }}>
                      {showPass?<EyeOff size={15}/>:<Eye size={15}/>}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('users','pinLabel')}</label>
                  <input type="text" className="form-input" value={form.pin} onChange={e=>f('pin',e.target.value.slice(0,4))} placeholder={t('users','pinPlaceholder')} maxLength={4}/>
                </div>
                {form.role === 'vendeur' && (
                  <div className="form-group" style={{ gridColumn:'1/-1' }}>
                    <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                      <input type="checkbox" checked={!!form.peut_modifier_factures} onChange={e=>f('peut_modifier_factures',e.target.checked?1:0)}/>
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
    </div>
  );
}
