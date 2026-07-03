import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../App';
import { useLang } from '../utils/useLang';
import { TrendingUp, BarChart2, Clock, Monitor, Activity, Trash2, CreditCard, Users, Package, Wallet, PieChart as PieChartIcon, Filter, Calendar, ShoppingCart, Percent, ArrowUpRight, ArrowDownRight, FileText, Star } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, CartesianGrid, Legend } from 'recharts';

const PIE_COLORS = ['#e8c547', '#60a5fa', '#22c55e', '#f97316', '#a78bfa', '#ef4444'];
const PERIOD_OPTIONS = [
  { key: 'today', labelKey: 'periodToday' },
  { key: 'week', labelKey: 'periodWeek' },
  { key: 'month', labelKey: 'periodMonth' },
  { key: 'year', labelKey: 'periodYear' },
];

function dateFilterSQL(period) {
  switch (period) {
    case 'today': return "date(v.date_vente) = date('now')";
    case 'week': return "v.date_vente >= date('now', '-6 days')";
    case 'month': return "v.date_vente >= date('now', 'start of month')";
    case 'year': return "v.date_vente >= date('now', 'start of year')";
    default: return '1=1';
  }
}

function SectionTitle({ icon: Icon, title, accent }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
      <Icon size={16} color={accent || 'var(--accent)'}/>
      <span style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', textTransform:'uppercase', letterSpacing:'0.8px' }}>{title}</span>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="stat-card" style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px' }}>
      <div style={{ width:40, height:40, borderRadius:10, flexShrink:0, background:(color||'var(--accent)')+'1a', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Icon size={18} color={color||'var(--accent)'}/>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:22, fontWeight:800, color:'var(--text-primary)', lineHeight:1 }}>{value}</div>
        <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:3 }}>{label}</div>
        {sub && <div style={{ fontSize:10, color, marginTop:2, fontWeight:600 }}>{sub}</div>}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#1e1e1e', border:'1px solid #333', borderRadius:8, padding:'8px 12px', fontSize:12 }}>
      <div style={{ color:'var(--text-muted)', marginBottom:4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color:p.color, fontWeight:600 }}>{p.name}: {fmt ? fmt(p.value) : p.value}</div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { t, fmt, lang } = useLang();
  const intlLocale = lang === 'fr' ? 'fr-FR' : lang === 'en' ? 'en-US' : 'pt-BR';
  const isAdmin = user?.role === 'admin';

  const [period, setPeriod] = useState('today');
  const [stats, setStats] = useState({});
  const [topProducts, setTopProducts] = useState([]);
  const [weekData, setWeekData] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [networkPeers, setNetworkPeers] = useState([]);
  const [machineLabel, setMachineLabel] = useState(t('dashboard','thisMachine'));
  const [machinesData, setMachinesData] = useState([]);
  const [loading, setLoading] = useState(true);

  // New dashboard data
  const [paymentStats, setPaymentStats] = useState([]);
  const [categoryStats, setCategoryStats] = useState([]);
  const [employeeStats, setEmployeeStats] = useState([]);
  const [stockValue, setStockValue] = useState({});
  const [profitPeriod, setProfitPeriod] = useState(0);
  const [salesCountPeriod, setSalesCountPeriod] = useState(0);
  const [prevPeriodTotal, setPrevPeriodTotal] = useState(0);
  const [monthlyCompare, setMonthlyCompare] = useState([]);
  const [cadernoStats, setCadernoStats] = useState({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const df = dateFilterSQL(period);
      const userFilter = !isAdmin ? `AND v.user_id = ${user.id}` : '';

      // Sales in current period
      const todayRes = await window.electron.dbGet(
        `SELECT COALESCE(SUM(v.total),0) as total, COUNT(*) as count
         FROM ventes v WHERE ${df} AND v.statut != 'annule' ${userFilter}`
      );

      if (isAdmin) {
        // All-time total (exclude annule)
        const totalRes = await window.electron.dbGet(
          "SELECT COALESCE(SUM(total),0) as total FROM ventes WHERE statut != 'annule'"
        );

        // Profit for current period (FIX: exclude annule sales)
        const profitRes = await window.electron.dbGet(
          `SELECT COALESCE(SUM((vi.prix_unitaire - CASE vi.type_vente
              WHEN 'carton' THEN p.cout_carton
              WHEN 'demi'   THEN p.cout_carton/2.0
              ELSE p.cout_carton/p.unites_par_carton
            END) * vi.quantite),0) as profit
           FROM vente_items vi
           JOIN products p ON vi.product_id = p.id
           JOIN ventes v ON vi.vente_id = v.id
           WHERE ${df} AND v.statut != 'annule'`
        );

        // Previous period profit for comparison
        const prevProfitRes = await window.electron.dbGet(
          `SELECT COALESCE(SUM((vi.prix_unitaire - CASE vi.type_vente
              WHEN 'carton' THEN p.cout_carton
              WHEN 'demi'   THEN p.cout_carton/2.0
              ELSE p.cout_carton/p.unites_par_carton
            END) * vi.quantite),0) as profit
           FROM vente_items vi
           JOIN products p ON vi.product_id = p.id
           JOIN ventes v ON vi.vente_id = v.id
           WHERE v.statut != 'annule'`
        );

        // Previous period total for comparison
        const prevTotalRes = await window.electron.dbGet(
          "SELECT COALESCE(SUM(total),0) as total FROM ventes WHERE statut != 'annule'"
        );

        // Products & users count
        const prodRes = await window.electron.dbGet("SELECT COUNT(*) as count FROM products WHERE actif = 1");
        const userRes = await window.electron.dbGet("SELECT COUNT(*) as count FROM users WHERE actif = 1");
        const lowStockRes = await window.electron.dbQuery(
          "SELECT COUNT(*) as count FROM products WHERE stock_cartons <= stock_alerte AND actif = 1", []
        );

        // Ticket average
        const avgTicket = todayRes.data?.count > 0 ? (todayRes.data.total / todayRes.data.count) : 0;

        // Margin %
        const marginPct = todayRes.data?.total > 0 ? ((profitRes.data?.profit || 0) / todayRes.data.total * 100) : 0;

        // Payment stats for period
        const payRes = await window.electron.dbQuery(
          `SELECT v.mode_paiement as mode, COUNT(*) as count, SUM(v.total) as total
           FROM ventes v WHERE ${df} AND v.statut != 'annule'
           GROUP BY v.mode_paiement ORDER BY total DESC`, []
        );

        // Category stats for period
        const catRes = await window.electron.dbQuery(
          `SELECT p.categorie, SUM(vi.sous_total) as total, SUM(vi.quantite) as qty
           FROM vente_items vi
           JOIN products p ON vi.product_id = p.id
           JOIN ventes v ON vi.vente_id = v.id
           WHERE ${df} AND v.statut != 'annule'
           GROUP BY p.categorie ORDER BY total DESC`, []
        );

        // Employee stats for period
        const empRes = await window.electron.dbQuery(
          `SELECT u.nom, COUNT(*) as tickets, SUM(v.total) as total
           FROM ventes v JOIN users u ON v.user_id = u.id
           WHERE ${df} AND v.statut != 'annule'
           GROUP BY v.user_id ORDER BY total DESC`, []
        );

        // Stock value
        const stockRes = await window.electron.dbGet(
          `SELECT COALESCE(SUM(p.stock_cartons * p.cout_carton),0) as total_value,
                  COUNT(CASE WHEN p.stock_cartons <= 0 THEN 1 END) as out_of_stock,
                  COUNT(CASE WHEN p.stock_cartons > 0 AND p.stock_cartons <= p.stock_alerte THEN 1 END) as low_stock
           FROM products p WHERE p.actif = 1`
        );

        // Monthly comparison (last 6 months)
        const monthlyRes = await window.electron.dbQuery(
          `SELECT strftime('%Y-%m', v.date_vente) as month, SUM(v.total) as total, COUNT(*) as count
           FROM ventes v WHERE v.date_vente >= date('now', '-6 months') AND v.statut != 'annule'
           GROUP BY strftime('%Y-%m', v.date_vente) ORDER BY month`, []
        );

        // Caderno stats for period
        const cadernoRes = await window.electron.dbQuery(
          `SELECT
            COALESCE(SUM(CASE WHEN direction='entree' THEN montant ELSE 0 END),0) as total_entree,
            COALESCE(SUM(CASE WHEN direction!='entree' THEN montant ELSE 0 END),0) as total_sortie,
            COALESCE(SUM(CASE WHEN est_dette=1 AND (statut_dette IS NULL OR statut_dette!='pago') THEN montant ELSE 0 END),0) as dettes,
            COUNT(*) as count
           FROM caderno_entries WHERE date_jour >= date('now', 'start of month')`, []
        );

        setStats({
          today: todayRes.data?.total || 0,
          todayCount: todayRes.data?.count || 0,
          total: totalRes.data?.total || 0,
          profit: profitRes.data?.profit || 0,
          products: prodRes.data?.count || 0,
          users: userRes.data?.count || 0,
          lowStock: lowStockRes.data?.[0]?.count || 0,
          avgTicket,
          marginPct,
        });
        setProfitPeriod(profitRes.data?.profit || 0);
        setSalesCountPeriod(todayRes.data?.count || 0);
        setPrevPeriodTotal(prevTotalRes.data?.total || 0);
        setPaymentStats(payRes.data || []);
        setCategoryStats(catRes.data || []);
        setEmployeeStats(empRes.data || []);
        setStockValue(stockRes.data || {});
        setMonthlyCompare(monthlyRes.data || []);
        setCadernoStats(cadernoRes.data?.[0] || {});

        // Top products for period
        const topRes = await window.electron.dbQuery(
          `SELECT p.nom, SUM(vi.quantite) as qty, SUM(vi.sous_total) as revenue
           FROM vente_items vi JOIN products p ON vi.product_id = p.id
           JOIN ventes v ON vi.vente_id = v.id
           WHERE ${df} AND v.statut != 'annule'
           GROUP BY p.id ORDER BY revenue DESC LIMIT 5`, []
        );
        setTopProducts(topRes.data || []);

        // Week data (always last 7 days for chart)
        const weekRes = await window.electron.dbQuery(
          `SELECT date(v.date_vente) as day, SUM(v.total) as total, COUNT(*) as count
           FROM ventes v WHERE v.date_vente >= date('now', '-6 days') AND v.statut != 'annule'
           GROUP BY date(v.date_vente) ORDER BY day`, []
        );
        setWeekData((weekRes.data || []).map(d => ({
          day: new Date(d.day).toLocaleDateString(intlLocale, { weekday:'short' }),
          total: d.total,
          count: d.count,
        })));

        // Caderno du jour
        const cadernoDayRes = await window.electron.dbQuery(
          `SELECT
            COALESCE(SUM(CASE WHEN direction='entree' THEN montant ELSE 0 END),0) as total_plus,
            COALESCE(SUM(CASE WHEN direction!='entree' THEN montant ELSE 0 END),0) as total_moins,
            COALESCE(SUM(CASE WHEN est_dette=1 AND (statut_dette IS NULL OR statut_dette!='pago') THEN montant ELSE 0 END),0) as dettes
           FROM caderno_entries WHERE date_jour=date('now')`, []
        );
        const cPlus  = cadernoDayRes.data?.[0]?.total_plus  || 0;
        const cMoins = cadernoDayRes.data?.[0]?.total_moins || 0;
        const cDett  = cadernoDayRes.data?.[0]?.dettes      || 0;
        setStats(prev => ({
          ...prev,
          caderno_plus: cPlus, caderno_moins: cMoins, caderno_dettes: cDett, caderno_net: cPlus - cMoins,
        }));
      } else {
        setStats({
          today: todayRes.data?.total || 0,
          todayCount: todayRes.data?.count || 0,
        });
        const cadernoDayRes2 = await window.electron.dbQuery(
          `SELECT
            COALESCE(SUM(CASE WHEN direction='entree' THEN montant ELSE 0 END),0) as total_plus,
            COALESCE(SUM(CASE WHEN direction!='entree' THEN montant ELSE 0 END),0) as total_moins,
            COALESCE(SUM(CASE WHEN est_dette=1 AND (statut_dette IS NULL OR statut_dette!='pago') THEN montant ELSE 0 END),0) as dettes
           FROM caderno_entries WHERE date_jour=date('now') AND user_id=${user.id}`, []
        );
        const cPlus  = cadernoDayRes2.data?.[0]?.total_plus  || 0;
        const cMoins = cadernoDayRes2.data?.[0]?.total_moins || 0;
        const cDett  = cadernoDayRes2.data?.[0]?.dettes      || 0;
        setStats(prev => ({
          ...prev,
          today: todayRes.data?.total || 0,
          todayCount: todayRes.data?.count || 0,
          caderno_plus: cPlus, caderno_moins: cMoins, caderno_dettes: cDett, caderno_net: cPlus - cMoins,
        }));
      }

      // Recent sales
      const recentRes = await window.electron.dbQuery(
        `SELECT v.id, v.total, v.date_vente, v.mode_paiement, u.nom as vendeur
         FROM ventes v JOIN users u ON v.user_id = u.id
         WHERE v.statut != 'annule' ${!isAdmin ? `AND v.user_id = ${user.id}` : ''}
         ORDER BY v.date_vente DESC LIMIT 8`, []
      );
      setRecentSales(recentRes.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [period, isAdmin, user?.id, lang]);

  useEffect(() => {
    loadData();
    loadNetworkPeers();
    loadMachinesData();
    const removePeers = window.electron.onNetworkPeersUpdate((peers) => {
      setNetworkPeers(peers || []);
      loadMachinesData();
    });
    const removeSync = window.electron.onSyncUpdate(() => {
      loadMachinesData();
      loadData();
    });
    return () => {
      if (typeof removePeers === 'function') removePeers();
      if (typeof removeSync  === 'function') removeSync();
    };
  }, [loadData]);

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

  const handleRemoveMachine = async (machineId, label) => {
    const msg = (t('dashboard','removeMachineConfirm') || '').replace('{label}', label || '');
    if (!window.confirm(msg)) return;
    try {
      const res = await window.electron.networkPeerRemove(machineId);
      if (res?.success) { loadMachinesData(); loadNetworkPeers(); }
    } catch(_e) {}
  };

  const payModeLabel = { dinheiro: t('cashier','dinheiro') || 'Dinheiro', express: t('cashier','express') || 'Express', misto: t('cashier','misto') || 'Misto' };
  const prevTotal = prevPeriodTotal || 1;
  const salesGrowth = prevTotal > 0 ? ((stats.today - prevTotal) / prevTotal * 100) : 0;

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text-muted)' }}>
      {t('dashboard','loading')}
    </div>
  );

  return (
    <div style={{ padding:24, height:'100%', overflowY:'auto' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>
            {t('dashboard','greeting')}, {user?.nom} {'\u{1F44B}'}
          </h1>
          <p style={{ color:'var(--text-secondary)', fontSize:14 }}>
            {new Date().toLocaleDateString(intlLocale, { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </p>
        </div>
        {/* Period filter */}
        <div style={{ display:'flex', alignItems:'center', gap:6, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:4 }}>
          <Filter size={14} color="var(--text-muted)" style={{ marginLeft:8 }}/>
          {PERIOD_OPTIONS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              style={{
                padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                background: period===p.key ? 'var(--accent)' : 'transparent',
                color: period===p.key ? '#000' : 'var(--text-secondary)',
                transition:'all 0.15s',
              }}>
              {t('dashboard', p.labelKey) || p.key}
            </button>
          ))}
        </div>
      </div>

      {/* ══════ KPI CARDS ══════ */}
      {isAdmin ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:16, marginBottom:24 }}>
          <KpiCard icon={BarChart2} label={t('dashboard','todaySales')} value={fmt(stats.today)} color="var(--accent)"
            sub={`${stats.todayCount} ${t('dashboard','transactions')}`} />
          <KpiCard icon={TrendingUp} label={t('dashboard','totalProfit')} value={fmt(stats.profit)} color="var(--success)"
            sub={`${stats.marginPct?.toFixed(1) || 0}% ${t('dashboard','totalMargin')}`} />
          <KpiCard icon={ShoppingCart} label={t('dashboard','avgTicket')} value={fmt(stats.avgTicket)} color="#60a5fa"
            sub={`${t('dashboard','ticketPerSale')}`} />
          <KpiCard icon={Percent} label={t('dashboard','marginPct')} value={`${stats.marginPct?.toFixed(1) || 0}%`} color={stats.marginPct > 20 ? 'var(--success)' : stats.marginPct > 0 ? 'var(--warning)' : 'var(--danger)'}
            sub={`${fmt(stats.today)} / ${fmt(stats.today || 1)}`} />
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:16, marginBottom:24 }}>
          <KpiCard icon={BarChart2} label={t('dashboard','todaySales')} value={fmt(stats.today)} color="var(--accent)"
            sub={`${stats.todayCount} ${t('dashboard','transactions')}`} />
          <KpiCard icon={CreditCard} label={t('dashboard','cadernoNet')} value={`${(stats.caderno_net||0)>=0?'+':''}${fmt(Math.abs(stats.caderno_net||0))}`}
            color={(stats.caderno_net||0)>=0?'var(--success)':'var(--danger)'} />
        </div>
      )}

      {/* ══════ CHARTS ROW: Week + Top Products ══════ */}
      {isAdmin && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
          <div className="card" style={{ padding:16 }}>
            <SectionTitle icon={BarChart2} title={t('dashboard','weekChart')}/>
            {weekData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={weekData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                  <XAxis dataKey="day" tick={{ fontSize:11, fill:'var(--text-secondary)' }} axisLine={false} tickLine={false}/>
                  <YAxis hide/>
                  <Tooltip content={<CustomTooltip fmt={v => fmt(v)}/>}
                    contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, fontSize:12 }}/>
                  <Bar dataKey="total" name={t('dashboard','total')} fill="var(--accent)" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>{t('dashboard','noData')}</div>
            )}
          </div>
          <div className="card" style={{ padding:16 }}>
            <SectionTitle icon={TrendingUp} title={t('dashboard','topProducts')}/>
            {topProducts.length > 0 ? (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {topProducts.map((p, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:24, height:24, borderRadius:'50%', background:i===0?'var(--accent)':'var(--bg-hover)', color:i===0?'#000':'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{i+1}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.nom}</div>
                      <div style={{ fontSize:11, color:'var(--text-muted)' }}>{fmt(p.revenue)} &middot; {Math.round(p.qty)} un.</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color:'var(--text-muted)', fontSize:13, textAlign:'center', paddingTop:40 }}>{t('dashboard','noSales')}</div>
            )}
          </div>
        </div>
      )}

      {/* ══════ PAYMENT + CATEGORY + EMPLOYEE ══════ */}
      {isAdmin && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, marginBottom:24 }}>
          {/* Payment breakdown */}
          <div className="card" style={{ padding:16 }}>
            <SectionTitle icon={CreditCard} title={t('dashboard','paymentBreakdown')}/>
            {paymentStats.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={paymentStats.map(p => ({ ...p, name: payModeLabel[p.mode] || p.mode }))}
                      dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={55} innerRadius={30} paddingAngle={3}>
                      {paymentStats.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(v)}
                      contentStyle={{ background:'#1e1e1e', border:'1px solid #333', borderRadius:8, fontSize:12 }}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:8 }}>
                  {paymentStats.map((p, i) => {
                    const pct = stats.today > 0 ? (p.total / stats.today * 100).toFixed(1) : 0;
                    return (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
                        <span style={{ width:8, height:8, borderRadius:'50%', background:PIE_COLORS[i % PIE_COLORS.length], flexShrink:0 }}/>
                        <span style={{ flex:1, color:'var(--text-secondary)' }}>{payModeLabel[p.mode] || p.mode}</span>
                        <span style={{ fontFamily:'monospace', fontWeight:600 }}>{fmt(p.total)}</span>
                        <span style={{ fontSize:10, color:'var(--text-muted)', width:40, textAlign:'right' }}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:13, paddingTop:40 }}>{t('dashboard','noData')}</div>}
          </div>

          {/* Category breakdown */}
          <div className="card" style={{ padding:16 }}>
            <SectionTitle icon={Package} title={t('dashboard','categoryBreakdown')}/>
            {categoryStats.length > 0 ? (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {categoryStats.map((c, i) => {
                  const maxCat = categoryStats[0]?.total || 1;
                  const pct = (c.total / maxCat * 100);
                  return (
                    <div key={i}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{ fontSize:12, color:'var(--text-secondary)', fontWeight:600 }}>{c.categorie}</span>
                        <span style={{ fontSize:12, fontFamily:'monospace', fontWeight:700, color:'var(--accent)' }}>{fmt(c.total)}</span>
                      </div>
                      <div style={{ height:5, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background:PIE_COLORS[i % PIE_COLORS.length], borderRadius:3, transition:'width 0.8s ease' }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:13, paddingTop:40 }}>{t('dashboard','noData')}</div>}
          </div>

          {/* Employee ranking */}
          <div className="card" style={{ padding:16 }}>
            <SectionTitle icon={Users} title={t('dashboard','employeeRanking')}/>
            {employeeStats.length > 0 ? (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {employeeStats.map((e, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:24, height:24, borderRadius:'50%', background:i===0?'#e8c547':i===1?'#94a3b8':i===2?'#cd7f32':'var(--bg-hover)', color:i<3?'#000':'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{i+1}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500 }}>{e.nom}</div>
                      <div style={{ fontSize:11, color:'var(--text-muted)' }}>{e.tickets} {t('dashboard','transactions')}</div>
                    </div>
                    <div style={{ fontSize:13, fontWeight:700, fontFamily:'monospace', color:'var(--accent)' }}>{fmt(e.total)}</div>
                  </div>
                ))}
              </div>
            ) : <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:13, paddingTop:40 }}>{t('dashboard','noData')}</div>}
          </div>
        </div>
      )}

      {/* ══════ STOCK + MONTHLY COMPARE ══════ */}
      {isAdmin && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
          {/* Caderno du mois */}
          <div className="card" style={{ padding:16 }}>
            <SectionTitle icon={Wallet} title={t('dashboard','cadernoToday')}/>
            <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:8 }}>
              <div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>{t('dashboard','cadernoTotalPlus')}</div>
                <div style={{ fontSize:18, fontWeight:700, fontFamily:'monospace', color:'var(--success)' }}>+{fmt(cadernoStats.total_entree || 0)}</div>
              </div>
              <div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>{t('dashboard','cadernoTotalMinus')}</div>
                <div style={{ fontSize:18, fontWeight:700, fontFamily:'monospace', color:'var(--danger)' }}>-{fmt(cadernoStats.total_sortie || 0)}</div>
              </div>
              <div style={{ borderTop:'1px solid var(--border)', paddingTop:8 }}>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>{t('dashboard','cadernoNet')}</div>
                <div style={{ fontSize:14, fontWeight:700, fontFamily:'monospace', color:((cadernoStats.total_entree||0)-(cadernoStats.total_sortie||0))>=0?'var(--success)':'var(--danger)' }}>
                  {((cadernoStats.total_entree||0)-(cadernoStats.total_sortie||0))>=0?'+':''}{fmt((cadernoStats.total_entree||0)-(cadernoStats.total_sortie||0))}
                </div>
              </div>
            </div>
          </div>

          {/* Stock Value */}
          <div className="card" style={{ padding:16 }}>
            <SectionTitle icon={Package} title={t('dashboard','stockValue')}/>
            <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:8 }}>
              <div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>{t('dashboard','totalStockValue')}</div>
                <div style={{ fontSize:18, fontWeight:700, fontFamily:'monospace', color:'var(--accent)' }}>{fmt(stockValue.total_value || 0)}</div>
              </div>
              <div style={{ display:'flex', gap:16 }}>
                <div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>{t('dashboard','outOfStock')}</div>
                  <div style={{ fontSize:16, fontWeight:700, color:'var(--danger)' }}>{stockValue.out_of_stock || 0}</div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>{t('dashboard','lowStock')}</div>
                  <div style={{ fontSize:16, fontWeight:700, color:'var(--warning)' }}>{stockValue.low_stock || 0}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Monthly comparison chart */}
          <div className="card" style={{ padding:16 }}>
            <SectionTitle icon={Calendar} title={t('dashboard','monthlyComparison')}/>
            {monthlyCompare.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={monthlyCompare.map(m => ({ ...m, month: m.month.slice(5) }))}>
                  <defs>
                    <linearGradient id="gMonthly" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e8c547" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#e8c547" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                  <XAxis dataKey="month" tick={{ fontSize:10, fill:'#6b7280' }}/>
                  <YAxis hide/>
                  <Tooltip content={<CustomTooltip fmt={v => fmt(v)}/>}
                    contentStyle={{ background:'#1e1e1e', border:'1px solid #333', borderRadius:8, fontSize:12 }}/>
                  <Area type="monotone" dataKey="total" name={t('dashboard','total')} stroke="#e8c547" fill="url(#gMonthly)" strokeWidth={2} dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            ) : <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:13, paddingTop:40 }}>{t('dashboard','noData')}</div>}
          </div>
        </div>
      )}

      {/* ══════ CADERNO DU JOUR ══════ */}
      {(stats.caderno_plus > 0 || stats.caderno_moins > 0) && (
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:10 }}>
            {'\u{1F4D3}'} {t('dashboard','cadernoToday')}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12 }}>
            <div className="stat-card" style={{ borderLeft:'3px solid var(--success)' }}>
              <div className="stat-label">{t('dashboard','cadernoTotalPlus')}</div>
              <div className="stat-value" style={{ color:'var(--success)', fontSize:16 }}>+{fmt(stats.caderno_plus)}</div>
              <div className="stat-sub">{t('dashboard','cadernoEntriesToday')}</div>
            </div>
            <div className="stat-card" style={{ borderLeft:'3px solid var(--danger)' }}>
              <div className="stat-label">{t('dashboard','cadernoTotalMinus')}</div>
              <div className="stat-value" style={{ color:'var(--danger)', fontSize:16 }}>&#8722;{fmt(stats.caderno_moins)}</div>
              <div className="stat-sub">{t('dashboard','cadernoExitsToday')}</div>
            </div>
            <div className="stat-card" style={{ borderLeft:'3px solid var(--warning)' }}>
              <div className="stat-label">{t('dashboard','cadernoDebts')}</div>
              <div className="stat-value" style={{ color:stats.caderno_dettes>0?'var(--danger)':'var(--text-muted)', fontSize:16 }}>
                {stats.caderno_dettes > 0 ? `\u2212${fmt(stats.caderno_dettes)}` : '\u2014'}
              </div>
              <div className="stat-sub">{t('dashboard','cadernoPending')}</div>
            </div>
            <div className="stat-card" style={{ borderLeft:'3px solid var(--accent)' }}>
              <div className="stat-label">{t('dashboard','cadernoNet')}</div>
              <div className="stat-value" style={{ color:(stats.caderno_net||0)>=0?'var(--success)':'var(--danger)', fontSize:16 }}>
                {(stats.caderno_net||0)>=0?'+':'\u2212'}{fmt(Math.abs(stats.caderno_net||0))}
              </div>
              <div className="stat-sub">{t('dashboard','cadernoDayBalance')}</div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MULTI-MACHINES ══════ */}
      {isAdmin && machinesData.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
            <Activity size={13} color="var(--text-muted)"/>
            {t('dashboard','multiMachinePanel')}
            <span style={{ fontSize:10, color:'var(--text-muted)', fontWeight:400, letterSpacing:0, background:'var(--bg-hover)', padding:'1px 7px', borderRadius:10 }}>
              {machinesData.filter(m => m.status==='online').length}/{machinesData.length} {t('dashboard','online')}
            </span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:14 }}>
            {machinesData.map(m => {
              const isOnline = m.status === 'online';
              const borderC  = m.isLocal ? 'var(--accent)' : isOnline ? 'var(--success)' : 'var(--border)';
              const dotC     = m.isLocal ? '#e8c547' : isOnline ? '#22c55e' : '#555';
              const maxToday = Math.max(...machinesData.map(x => x.today_total), 1);
              const pct = Math.round((m.today_total / maxToday) * 100);
              return (
                <div key={m.machine_id} className="card" style={{ borderLeft:`3px solid ${borderC}`, padding:16, position:'relative' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:10 }}>
                    <span style={{ width:7, height:7, borderRadius:'50%', background:dotC, flexShrink:0, animation:isOnline?'pulse 2s infinite':'none' }}/>
                    <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.6px', color:dotC }}>
                      {m.isLocal ? t('dashboard','local') : isOnline ? t('dashboard','onlineBadge') : t('dashboard','offline')}
                    </span>
                    {m.isLocal && <span style={{ fontSize:9, background:'var(--accent)22', color:'var(--accent)', border:'1px solid var(--accent)44', borderRadius:3, padding:'1px 5px', fontWeight:700 }}>{t('dashboard','thisOne')}</span>}
                    {!m.isLocal && (
                      <button onClick={() => handleRemoveMachine(m.machine_id, m.machine_label)} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:2, display:'flex', alignItems:'center' }}>
                        <Trash2 size={13}/>
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.machine_label || 'CKBPOS'}</div>
                  <div style={{ fontSize:10, fontFamily:'monospace', color:'var(--text-muted)', marginBottom:12 }}>{m.isLocal ? t('dashboard','thisMachine') : m.ip || '\u2014'}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:2 }}>{t('dashboard','todayCaps')}</div>
                      <div style={{ fontSize:16, fontWeight:700, color:'var(--accent)', fontFamily:'monospace' }}>{fmt(m.today_total)}</div>
                      <div style={{ fontSize:10, color:'var(--text-secondary)' }}>{m.today_count} {m.today_count!==1?t('dashboard','salesPlural'):t('dashboard','salesSingular')}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:2 }}>{t('dashboard','last7Days')}</div>
                      <div style={{ fontSize:13, fontWeight:600, fontFamily:'monospace' }}>{fmt(m.week_total)}</div>
                      <div style={{ fontSize:9, color:'var(--text-muted)' }}>{t('dashboard','thisMonth')}: {fmt(m.month_total)}</div>
                    </div>
                  </div>
                  <div style={{ height:3, background:'var(--bg-hover)', borderRadius:2, marginBottom:6, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background: m.isLocal ? 'var(--accent)' : isOnline ? 'var(--success)' : 'var(--text-muted)', borderRadius:2, transition:'width 0.6s ease' }}/>
                  </div>
                  {m.top_product && <div style={{ fontSize:10, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{'\u{1F4C8}'} {m.top_product}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════ COMPTE DE RÉSULTAT ══════ */}
      {isAdmin && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
          {/* Compte de résultat */}
          <div className="card" style={{ padding:16 }}>
            <SectionTitle icon={FileText} title={t('dashboard','incomeStatement')}/>
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {/* CA */}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:13, fontWeight:500 }}>{t('dashboard','revenueLabel')}</span>
                <span style={{ fontSize:13, fontWeight:700, fontFamily:'monospace' }}>{fmt(stats.today || 0)}</span>
              </div>
              {/* CMV */}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:13, color:'var(--text-secondary)' }}>- {t('dashboard','cogsLabel')}</span>
                <span style={{ fontSize:13, fontFamily:'monospace', color:'var(--danger)' }}>-{fmt((stats.today || 0) - (stats.profit || 0))}</span>
              </div>
              {/* Bénéfice brut */}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'2px solid var(--border)' }}>
                <span style={{ fontSize:13, fontWeight:700 }}>{t('dashboard','grossProfit')}</span>
                <span style={{ fontSize:14, fontWeight:700, fontFamily:'monospace', color:'var(--success)' }}>{fmt(stats.profit || 0)}</span>
              </div>
              {/* Dépenses caderno */}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:13, color:'var(--text-secondary)' }}>- {t('dashboard','operatingExpenses')}</span>
                <span style={{ fontSize:13, fontFamily:'monospace', color:'var(--danger)' }}>-{fmt(stats.caderno_moins || 0)}</span>
              </div>
              {/* Résultat net */}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', background:((stats.profit||0) - (stats.caderno_moins||0)) >= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', borderRadius:6, marginTop:4, paddingLeft:8, paddingRight:8 }}>
                <span style={{ fontSize:14, fontWeight:800 }}>{t('dashboard','netResult')}</span>
                <span style={{ fontSize:16, fontWeight:800, fontFamily:'monospace', color:((stats.profit||0) - (stats.caderno_moins||0)) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {((stats.profit||0) - (stats.caderno_moins||0)) >= 0 ? '+' : ''}{fmt((stats.profit || 0) - (stats.caderno_moins || 0))}
                </span>
              </div>
            </div>
          </div>

          {/* Flux de trésorerie */}
          <div className="card" style={{ padding:16 }}>
            <SectionTitle icon={Wallet} title={t('dashboard','cashFlow')}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              {/* Entrées */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--success)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>{t('dashboard','inflowsLabel')}</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                    <span style={{ color:'var(--text-secondary)' }}>{t('dashboard','salesLabel')}</span>
                    <span style={{ fontFamily:'monospace', fontWeight:600 }}>{fmt(stats.today || 0)}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                    <span style={{ color:'var(--text-secondary)' }}>{t('dashboard','cadernoInLabel')}</span>
                    <span style={{ fontFamily:'monospace', fontWeight:600 }}>{fmt(stats.caderno_plus || 0)}</span>
                  </div>
                  <div style={{ borderTop:'1px solid var(--border)', paddingTop:6, display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:700 }}>
                    <span>{t('dashboard','totalInflows')}</span>
                    <span style={{ fontFamily:'monospace', color:'var(--success)' }}>{fmt((stats.today || 0) + (stats.caderno_plus || 0))}</span>
                  </div>
                </div>
              </div>
              {/* Sorties */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--danger)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>{t('dashboard','outflowsLabel')}</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                    <span style={{ color:'var(--text-secondary)' }}>{t('dashboard','expensesLabel')}</span>
                    <span style={{ fontFamily:'monospace', fontWeight:600 }}>{fmt(stats.caderno_moins || 0)}</span>
                  </div>
                  <div style={{ borderTop:'1px solid var(--border)', paddingTop:6, display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:700 }}>
                    <span>{t('dashboard','totalOutflows')}</span>
                    <span style={{ fontFamily:'monospace', color:'var(--danger)' }}>{fmt(stats.caderno_moins || 0)}</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Solde net */}
            <div style={{ marginTop:12, borderTop:'2px solid var(--border)', paddingTop:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:14, fontWeight:800 }}>{t('dashboard','netCashFlow')}</span>
              <span style={{ fontSize:18, fontWeight:800, fontFamily:'monospace', color:((stats.today||0)+(stats.caderno_plus||0)-(stats.caderno_moins||0)) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {((stats.today||0)+(stats.caderno_plus||0)-(stats.caderno_moins||0)) >= 0 ? '+' : ''}{fmt((stats.today || 0) + (stats.caderno_plus || 0) - (stats.caderno_moins || 0))}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ══════ RECENT SALES ══════ */}
      <div className="card" style={{ padding:16 }}>
        <SectionTitle icon={Clock} title={t('dashboard','recentSales')}/>
        {recentSales.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                {isAdmin && <th>{t('dashboard','seller')}</th>}
                <th>{t('dashboard','payment')}</th>
                <th>{t('dashboard','total')}</th>
                <th>{t('dashboard','date')}</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.map(s => (
                <tr key={s.id}>
                  <td style={{ color:'var(--text-muted)', fontFamily:'monospace' }}>#{s.id}</td>
                  {isAdmin && <td>{s.vendeur}</td>}
                  <td style={{ fontSize:12, color:'var(--text-secondary)' }}>{payModeLabel[s.mode_paiement] || s.mode_paiement}</td>
                  <td style={{ color:'var(--accent)', fontWeight:600, fontFamily:'monospace' }}>{fmt(s.total)}</td>
                  <td style={{ color:'var(--text-secondary)', fontSize:12 }}>{new Date(s.date_vente).toLocaleString(intlLocale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign:'center', padding:'32px 0', color:'var(--text-muted)' }}>{t('dashboard','noSales')}</div>
        )}
      </div>
    </div>
  );
}
