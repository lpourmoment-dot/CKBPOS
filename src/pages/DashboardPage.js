import React, { useState, useEffect } from 'react';
import { useAuth } from '../App';
import { useLang } from '../utils/useLang';
import { TrendingUp, BarChart2, Clock, Monitor, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function DashboardPage() {
  const { user } = useAuth();
  const { t, fmt } = useLang();
  const isAdmin = user?.role === 'admin';
  const [stats, setStats] = useState({});
  const [topProducts, setTopProducts] = useState([]);
  const [weekData, setWeekData] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [networkPeers, setNetworkPeers] = useState([]);
  const [machineLabel, setMachineLabel] = useState('Esta m\u00e1quina');
  const [machinesData, setMachinesData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    loadNetworkPeers();
    loadMachinesData();
    const removePeers = window.electron.onNetworkPeersUpdate((peers) => {
      setNetworkPeers(peers || []);
      // Refresh machines stats quand un pair se connecte/déconnecte
      loadMachinesData();
    });
    const removeSync = window.electron.onSyncUpdate(() => {
      // Refresh quand un delta est appliqué (nouvelles ventes d'une autre machine)
      loadMachinesData();
      loadData();
    });
    return () => {
      if (typeof removePeers === 'function') removePeers();
      if (typeof removeSync  === 'function') removeSync();
    };
  }, []);

  const loadNetworkPeers = async () => {
    try {
      const [peersRes, labelRes] = await Promise.all([
        window.electron.networkPeersList(),
        window.electron.dbGet("SELECT value FROM settings WHERE key='machine_label'"),
      ]);
      if (peersRes?.success) setNetworkPeers(peersRes.data || []);
      if (labelRes?.data?.value) setMachineLabel(labelRes.data.value);
    } catch(_e) {}
  };

  const loadMachinesData = async () => {
    try {
      const res = await window.electron.machinesStats();
      if (res?.success) setMachinesData(res.data || []);
    } catch(_e) {}
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const todayRes = await window.electron.dbGet(
        `SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count
         FROM ventes WHERE date(date_vente) = date('now')
         ${!isAdmin ? `AND user_id = ${user.id}` : ''}`
      );

      if (isAdmin) {
        const totalRes = await window.electron.dbGet("SELECT COALESCE(SUM(total),0) as total FROM ventes");
        const profitRes = await window.electron.dbGet(
          `SELECT COALESCE(SUM((vi.prix_unitaire - p.cout_carton/p.unites_par_carton) * vi.quantite),0) as profit
           FROM vente_items vi JOIN products p ON vi.product_id = p.id`
        );
        const prodRes = await window.electron.dbGet("SELECT COUNT(*) as count FROM products WHERE actif = 1");
        const userRes = await window.electron.dbGet("SELECT COUNT(*) as count FROM users WHERE actif = 1");
        const lowStockRes = await window.electron.dbQuery(
          "SELECT COUNT(*) as count FROM products WHERE stock_cartons < 1 AND actif = 1", []
        );

        // Stats Caderno du jour (admin)
        const cadernoRes = await window.electron.dbQuery(
          `SELECT
            COALESCE(SUM(CASE WHEN direction='entree' THEN montant ELSE 0 END),0) as total_plus,
            COALESCE(SUM(CASE WHEN direction!='entree' THEN montant ELSE 0 END),0) as total_moins,
            COALESCE(SUM(CASE WHEN est_dette=1 AND (statut_dette IS NULL OR statut_dette!='pago') THEN montant ELSE 0 END),0) as dettes
           FROM caderno_entries WHERE date_jour=date('now')`, []
        );
        const cPlus  = cadernoRes.data?.[0]?.total_plus  || 0;
        const cMoins = cadernoRes.data?.[0]?.total_moins || 0;
        const cDett  = cadernoRes.data?.[0]?.dettes      || 0;

        setStats({
          today: todayRes.data?.total || 0,
          todayCount: todayRes.data?.count || 0,
          total: totalRes.data?.total || 0,
          profit: profitRes.data?.profit || 0,
          products: prodRes.data?.count || 0,
          users: userRes.data?.count || 0,
          lowStock: lowStockRes.data?.[0]?.count || 0,
          caderno_plus: cPlus, caderno_moins: cMoins, caderno_dettes: cDett, caderno_net: cPlus - cMoins,
        });

        const topRes = await window.electron.dbQuery(
          `SELECT p.nom, SUM(vi.quantite) as qty, SUM(vi.sous_total) as revenue
           FROM vente_items vi JOIN products p ON vi.product_id = p.id
           GROUP BY p.id ORDER BY revenue DESC LIMIT 5`, []
        );
        setTopProducts(topRes.data || []);

        const weekRes = await window.electron.dbQuery(
          `SELECT date(date_vente) as day, SUM(total) as total, COUNT(*) as count
           FROM ventes WHERE date_vente >= date('now', '-6 days')
           GROUP BY date(date_vente) ORDER BY day`, []
        );
        setWeekData((weekRes.data || []).map(d => ({
          day: new Date(d.day).toLocaleDateString('fr-FR', { weekday: 'short' }),
          total: d.total,
          count: d.count
        })));
      } else {
        // Stats Caderno du jour (non-admin)
        const cadernoRes = await window.electron.dbQuery(
          `SELECT
            COALESCE(SUM(CASE WHEN direction='entree' THEN montant ELSE 0 END),0) as total_plus,
            COALESCE(SUM(CASE WHEN direction!='entree' THEN montant ELSE 0 END),0) as total_moins,
            COALESCE(SUM(CASE WHEN est_dette=1 AND (statut_dette IS NULL OR statut_dette!='pago') THEN montant ELSE 0 END),0) as dettes
           FROM caderno_entries WHERE date_jour=date('now') AND user_id=${user.id}`, []
        );
        const cPlus  = cadernoRes.data?.[0]?.total_plus  || 0;
        const cMoins = cadernoRes.data?.[0]?.total_moins || 0;
        const cDett  = cadernoRes.data?.[0]?.dettes      || 0;
        setStats({
          today: todayRes.data?.total || 0,
          todayCount: todayRes.data?.count || 0,
          caderno_plus: cPlus, caderno_moins: cMoins, caderno_dettes: cDett, caderno_net: cPlus - cMoins,
        });
      }

      const recentRes = await window.electron.dbQuery(
        `SELECT v.id, v.total, v.date_vente, u.nom as vendeur
         FROM ventes v JOIN users u ON v.user_id = u.id
         ${!isAdmin ? `WHERE v.user_id = ${user.id}` : ''}
         ORDER BY v.date_vente DESC LIMIT 8`, []
      );
      setRecentSales(recentRes.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text-muted)' }}>
      {t('dashboard','loading')}
    </div>
  );

  return (
    <div style={{ padding:24, height:'100%', overflowY:'auto' }}>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>
          {t('dashboard','greeting')}, {user?.nom} 👋
        </h1>
        <p style={{ color:'var(--text-secondary)', fontSize:14 }}>
          {new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:isAdmin?'repeat(4, 1fr)':'repeat(2, 1fr)', gap:16, marginBottom:24 }}>
        <div className="stat-card">
          <div className="stat-label">{t('dashboard','todaySales')}</div>
          <div className="stat-value">{fmt(stats.today)}</div>
          <div className="stat-sub">{stats.todayCount} {t('dashboard','transactions')}</div>
        </div>
        {isAdmin && (
          <>
            <div className="stat-card">
              <div className="stat-label">{t('dashboard','totalRevenue')}</div>
              <div className="stat-value">{fmt(stats.total)}</div>
              <div className="stat-sub">{t('dashboard','allPeriods')}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t('dashboard','totalProfit')}</div>
              <div className="stat-value" style={{ color:'var(--success)' }}>{fmt(stats.profit)}</div>
              <div className="stat-sub">{t('dashboard','totalMargin')}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t('dashboard','lowStock')}</div>
              <div className="stat-value" style={{ color:stats.lowStock>0?'var(--danger)':'var(--success)' }}>
                {stats.lowStock}
              </div>
              <div className="stat-sub">{t('dashboard','toRestock')}</div>
            </div>
          </>
        )}
      </div>

      {isAdmin && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
          <div className="card">
            <div style={{ fontWeight:600, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
              <BarChart2 size={16} color="var(--accent)"/> {t('dashboard','weekChart')}
            </div>
            {weekData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={weekData}>
                  <XAxis dataKey="day" tick={{ fontSize:11, fill:'var(--text-secondary)' }} axisLine={false} tickLine={false}/>
                  <YAxis hide/>
                  <Tooltip
                    contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, fontSize:12 }}
                    formatter={(v) => [fmt(v), t('dashboard','total')]}
                  />
                  <Bar dataKey="total" fill="var(--accent)" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height:160, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>
                {t('dashboard','noData')}
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ fontWeight:600, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
              <TrendingUp size={16} color="var(--accent)"/> {t('dashboard','topProducts')}
            </div>
            {topProducts.length > 0 ? (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {topProducts.map((p, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:24, height:24, borderRadius:'50%', background:i===0?'var(--accent)':'var(--bg-hover)', color:i===0?'#000':'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>
                      {i+1}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.nom}</div>
                      <div style={{ fontSize:11, color:'var(--text-muted)' }}>{fmt(p.revenue)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color:'var(--text-muted)', fontSize:13, textAlign:'center', paddingTop:40 }}>
                {t('dashboard','noSales')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Caderno du jour */}
      {(stats.caderno_plus > 0 || stats.caderno_moins > 0) && (
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:10 }}>
            📓 Caderno de Caixa — Hoje
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12 }}>
            <div className="stat-card" style={{ borderLeft:'3px solid var(--success)' }}>
              <div className="stat-label">TOTAL +</div>
              <div className="stat-value" style={{ color:'var(--success)', fontSize:16 }}>+{fmt(stats.caderno_plus)}</div>
              <div className="stat-sub">Entradas hoje</div>
            </div>
            <div className="stat-card" style={{ borderLeft:'3px solid var(--danger)' }}>
              <div className="stat-label">TOTAL −</div>
              <div className="stat-value" style={{ color:'var(--danger)', fontSize:16 }}>−{fmt(stats.caderno_moins)}</div>
              <div className="stat-sub">Saídas hoje</div>
            </div>
            <div className="stat-card" style={{ borderLeft:'3px solid var(--warning)' }}>
              <div className="stat-label">Dívidas</div>
              <div className="stat-value" style={{ color:stats.caderno_dettes>0?'var(--danger)':'var(--text-muted)', fontSize:16 }}>
                {stats.caderno_dettes > 0 ? `\u2212${fmt(stats.caderno_dettes)}` : '\u2014'}
              </div>
              <div className="stat-sub">Pendentes</div>
            </div>
            <div className="stat-card" style={{ borderLeft:'3px solid var(--accent)' }}>
              <div className="stat-label">Net caderno</div>
              <div className="stat-value" style={{ color:(stats.caderno_net||0)>=0?'var(--success)':'var(--danger)', fontSize:16 }}>
                {(stats.caderno_net||0)>=0?'+':'\u2212'}{fmt(Math.abs(stats.caderno_net||0))}
              </div>
              <div className="stat-sub">Balanço do dia</div>
            </div>
          </div>
        </div>
      )}

      {/* ── v1.6.0 Dashboard Multi-Machines — admin only ── */}
      {isAdmin && machinesData.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
            <Activity size={13} color="var(--text-muted)"/>
            Painel Multi-Máquinas
            <span style={{ fontSize:10, color:'var(--text-muted)', fontWeight:400, letterSpacing:0, background:'var(--bg-hover)', padding:'1px 7px', borderRadius:10 }}>
              {machinesData.filter(m => m.status==='online').length}/{machinesData.length} online
            </span>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:14 }}>
            {machinesData.map(m => {
              const isOnline = m.status === 'online';
              const borderC  = m.isLocal ? 'var(--accent)' : isOnline ? 'var(--success)' : 'var(--border)';
              const dotC     = m.isLocal ? '#e8c547' : isOnline ? '#22c55e' : '#555';
              // Barre de progression relative au max
              const maxToday = Math.max(...machinesData.map(x => x.today_total), 1);
              const pct = Math.round((m.today_total / maxToday) * 100);

              return (
                <div key={m.machine_id} className="card" style={{ borderLeft:`3px solid ${borderC}`, padding:16, position:'relative' }}>
                  {/* Header machine */}
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:10 }}>
                    <span style={{ width:7, height:7, borderRadius:'50%', background:dotC, flexShrink:0, animation:isOnline?'pulse 2s infinite':'none' }}/>
                    <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.6px', color:dotC }}>
                      {m.isLocal ? 'LOCAL' : isOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                    {m.isLocal && (
                      <span style={{ fontSize:9, background:'var(--accent)22', color:'var(--accent)', border:'1px solid var(--accent)44', borderRadius:3, padding:'1px 5px', fontWeight:700 }}>
                        ESTA
                      </span>
                    )}
                  </div>

                  {/* Nom + IP */}
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {m.machine_label || 'CKBPOS'}
                  </div>
                  <div style={{ fontSize:10, fontFamily:'monospace', color:'var(--text-muted)', marginBottom:12 }}>
                    {m.isLocal ? 'Esta m\u00e1quina' : m.ip || '\u2014'}
                  </div>

                  {/* Stats hoje */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:2 }}>HOJE</div>
                      <div style={{ fontSize:16, fontWeight:700, color:'var(--accent)', fontFamily:'monospace' }}>{fmt(m.today_total)}</div>
                      <div style={{ fontSize:10, color:'var(--text-secondary)' }}>{m.today_count} venda{m.today_count!==1?'s':''}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:2 }}>7 DIAS</div>
                      <div style={{ fontSize:13, fontWeight:600, fontFamily:'monospace' }}>{fmt(m.week_total)}</div>
                      <div style={{ fontSize:9, color:'var(--text-muted)' }}>este mês: {fmt(m.month_total)}</div>
                    </div>
                  </div>

                  {/* Barra de progresso relativa */}
                  <div style={{ height:3, background:'var(--bg-hover)', borderRadius:2, marginBottom:6, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background: m.isLocal ? 'var(--accent)' : isOnline ? 'var(--success)' : 'var(--text-muted)', borderRadius:2, transition:'width 0.6s ease' }}/>
                  </div>

                  {/* Top produto do dia */}
                  {m.top_product && (
                    <div style={{ fontSize:10, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      📈 {m.top_product}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ fontWeight:600, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
          <Clock size={16} color="var(--accent)"/> {t('dashboard','recentSales')}
        </div>
        {recentSales.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                {isAdmin && <th>{t('dashboard','seller')}</th>}
                <th>{t('dashboard','total')}</th>
                <th>{t('dashboard','date')}</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.map(s => (
                <tr key={s.id}>
                  <td style={{ color:'var(--text-muted)', fontFamily:'monospace' }}>#{s.id}</td>
                  {isAdmin && <td>{s.vendeur}</td>}
                  <td style={{ color:'var(--accent)', fontWeight:600, fontFamily:'monospace' }}>{fmt(s.total)}</td>
                  <td style={{ color:'var(--text-secondary)', fontSize:12 }}>{new Date(s.date_vente).toLocaleString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign:'center', padding:'32px 0', color:'var(--text-muted)' }}>
            {t('dashboard','noSales')}
          </div>
        )}
      </div>
    </div>
  );
}
