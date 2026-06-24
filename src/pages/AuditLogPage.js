import React, { useState, useEffect, useCallback } from 'react';
import { useLang } from '../utils/useLang';
import { ClipboardList, Search, Download, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

const ACTION_COLORS = {
  LOGIN:         '#22c55e',
  LOGOUT:        '#6b7280',
  VENTE:         '#60a5fa',
  ANNULATION:    '#ef4444',
  RETORNO:       '#f97316',
  CREATE:        '#22c55e',
  UPDATE:        '#facc15',
  DELETE:        '#ef4444',
  ENTRADA:       '#22c55e',
  'SAIDA':       '#ef4444',
  CANCELAMENTO:  '#ef4444',
  SETTING:       '#a78bfa',
  SYNC:          '#38bdf8',
  PRINT:         '#fb923c',
};

function actionColor(action) {
  if (!action) return 'var(--text-muted)';
  for (const [k,v] of Object.entries(ACTION_COLORS)) {
    if (action.toUpperCase().includes(k)) return v;
  }
  return '#6b7280';
}

function fmtTs(ts, locale = 'fr-FR') {
  if (!ts) return '—';
  try {
    const d = new Date(ts.replace(' ','T')+'Z');
    return d.toLocaleString(locale, { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });
  } catch(_e) { return ts; }
}

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const { t, lang } = useLang();
  const intlLocale = lang === 'fr' ? 'fr-FR' : lang === 'en' ? 'en-US' : 'pt-BR';

  const [logs, setLogs]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterUser, setFilterUser]   = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo]     = useState('');
  const [users, setUsers]         = useState([]);
  const [actions, setActions]     = useState([]);
  const [exporting, setExporting] = useState(false);

  // Charger listes filtres
  useEffect(() => {
    window.electron.dbQuery('SELECT id, nom FROM users ORDER BY nom', [])
      .then(r => setUsers(r.data || [])).catch(()=>{});
    window.electron.auditActions()
      .then(r => { if (r?.success) setActions(r.data || []); }).catch(()=>{});
  }, []);

  const load = useCallback(async (p = 0) => {
    setLoading(true);
    try {
      const res = await window.electron.auditList({
        limit: PAGE_SIZE,
        offset: p * PAGE_SIZE,
        user_id: filterUser || undefined,
        action: filterAction || undefined,
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
      });
      if (res?.success) {
        let data = res.data || [];
        // Filtrage search local (details/user_nom/machine_label)
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          data = data.filter(r =>
            r.user_nom?.toLowerCase().includes(q) ||
            r.action?.toLowerCase().includes(q) ||
            r.details?.toLowerCase().includes(q) ||
            r.machine_label?.toLowerCase().includes(q)
          );
        }
        setLogs(data);
        setTotal(res.total || 0);
      }
    } catch(_e) {}
    setLoading(false);
  }, [filterUser, filterAction, filterDateFrom, filterDateTo, search]);

  useEffect(() => { setPage(0); load(0); }, [filterUser, filterAction, filterDateFrom, filterDateTo]);
  useEffect(() => { load(page); }, [page]); // eslint-disable-line

  const handleSearch = (e) => {
    if (e.key === 'Enter') { setPage(0); load(0); }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Export PDF
  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const res = await window.electron.auditList({
        limit: 2000, offset: 0,
        user_id: filterUser || undefined,
        action: filterAction || undefined,
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
      });
      const data = res?.data || [];
      const rows = data.map(r =>
        `<tr>
          <td style="color:${actionColor(r.action)};font-weight:700">${r.action||'—'}</td>
          <td>${r.user_nom||'—'}</td>
          <td style="max-width:300px;word-break:break-all">${r.details||'—'}</td>
          <td>${r.machine_label||r.machine_id?.slice(0,8)||'—'}</td>
          <td style="white-space:nowrap">${fmtTs(r.ts, intlLocale)}</td>
        </tr>`
      ).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;font-size:11px;color:#333;padding:20px}
h1{color:#e8c547;font-size:16px;margin-bottom:4px}
p{color:#666;font-size:11px;margin:0 0 16px}
table{width:100%;border-collapse:collapse}
th{background:#333;color:#fff;padding:6px 8px;text-align:left;font-size:10px}
td{padding:5px 8px;border-bottom:1px solid #eee;vertical-align:top}
tr:nth-child(even){background:#f9f9f9}
</style></head><body>
<h1>${t('audit','pdfTitle')}</h1>
<p>${data.length} ${t('audit','entries')} — ${t('audit','pdfExportedOn')} ${new Date().toLocaleString(intlLocale)}</p>
<table>
<thead><tr><th>${t('audit','action')}</th><th>${t('audit','user')}</th><th>${t('audit','details')}</th><th>${t('audit','machine')}</th><th>${t('audit','date')}</th></tr></thead>
<tbody>${rows}</tbody>
</table></body></html>`;
      const filename = `ckbpos_audit_${new Date().toISOString().slice(0,10)}.pdf`;
      await window.electron.printAuditPdf({ html, filename });
    } catch(_e) {}
    setExporting(false);
  };

  return (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <ClipboardList size={20} color="var(--accent)" />
            {t('audit','title')}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {total} {t('audit','entries')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => load(page)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12 }}>
            <RefreshCw size={13} />
          </button>
          <button onClick={handleExportPdf} disabled={exporting} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12 }}>
            <Download size={13} /> {exporting ? (t('audit','exporting')) : (t('audit','exportPdf'))}
          </button>
        </div>
      </div>

      {/* Barre recherche + filtres — design cohérent avec HistoriquePage */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        {/* Ligne 1 : filtres principaux toujours visibles */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {/* Filtre utilisateur */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>
              {t('audit','filterUser')}
            </span>
            <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className="form-input" style={{ fontSize: 13, height: 36 }}>
              <option value="">{t('audit','allUsers')}</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.nom}</option>)}
            </select>
          </div>

          {/* Filtre action */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>
              {t('audit','filterType')}
            </span>
            <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="form-input" style={{ fontSize: 13, height: 36 }}>
              <option value="">{t('audit','allTypes')}</option>
              {actions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Date début */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>
              {t('audit','dateFrom')}
            </span>
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="form-input" style={{ fontSize: 13, height: 36 }} />
          </div>

          {/* Date fin */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>
              {t('audit','dateTo')}
            </span>
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="form-input" style={{ fontSize: 13, height: 36 }} />
          </div>

          {/* Réinitialiser */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'transparent', letterSpacing: 0.8 }}>_</span>
            <button onClick={() => { setFilterUser(''); setFilterAction(''); setFilterDateFrom(''); setFilterDateTo(''); setSearch(''); setPage(0); }} className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 14px', height: 36 }}>
              {t('audit','reset')}
            </button>
          </div>
        </div>

        {/* Ligne 2 : recherche texte */}
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleSearch}
            placeholder={t('audit','search')}
            className="form-input"
            style={{ paddingLeft: 32, fontSize: 13, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header table */}
        <div style={{
          display: 'grid', gridTemplateColumns: '140px 120px 1fr 130px 160px',
          gap: 0, padding: '8px 16px', background: 'var(--bg-hover)',
          borderBottom: '1px solid var(--border)',
          fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8,
        }}>
          <span>{t('audit','action')}</span>
          <span>{t('audit','user')}</span>
          <span>{t('audit','details')}</span>
          <span>{t('audit','machine')}</span>
          <span>{t('audit','date')}</span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
            {t('audit','loading')}
          </div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
            {t('audit','noLogs')}
          </div>
        ) : (
          logs.map((row, i) => (
            <div key={row.id || i} style={{
              display: 'grid', gridTemplateColumns: '140px 120px 1fr 130px 160px',
              padding: '9px 16px', borderBottom: '1px solid var(--border)',
              background: i % 2 === 0 ? 'transparent' : 'var(--bg-hover)',
              fontSize: 12, alignItems: 'center',
              transition: 'background 0.1s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-dim)'}
              onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--bg-hover)'}
            >
              {/* Action */}
              <span style={{
                fontWeight: 700, color: actionColor(row.action),
                fontSize: 11, letterSpacing: 0.5,
                background: actionColor(row.action) + '18',
                padding: '2px 8px', borderRadius: 6, display: 'inline-block',
              }}>
                {row.action || '—'}
              </span>

              {/* Utilisateur */}
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {row.user_nom || '—'}
              </span>

              {/* Détails */}
              <span style={{ color: 'var(--text-secondary)', fontSize: 11, wordBreak: 'break-word', lineHeight: 1.4 }}>
                {row.details || '—'}
              </span>

              {/* Machine */}
              <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>
                {row.machine_label || row.machine_id?.slice(0,8) || '—'}
              </span>

              {/* Date */}
              <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>
                {fmtTs(row.ts, intlLocale)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} className="btn btn-secondary" style={{ padding: '5px 10px' }}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            {page + 1} / {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page >= totalPages-1} className="btn btn-secondary" style={{ padding: '5px 10px' }}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
