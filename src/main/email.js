/**
 * CKBPOS Email Reports Module
 * ===========================
 * Gmail SMTP via nodemailer.
 * Extracted from main.js during v5.1 refactor.
 */

'use strict';

let _db, _APP_VERSION;

function init(ctx) {
  _db = ctx.db;
  _APP_VERSION = ctx.APP_VERSION || '5.0.0';
}

function registerIPC(ipcMain) {
  ipcMain.handle('email-report-send', async (_, { to, subject, html }) => {
    try {
      let nodemailer;
      try { nodemailer = require('nodemailer'); } catch (_e) {
        return { success: false, error: 'nodemailer non installé — npm install nodemailer' };
      }
      const gmailUser = _db.prepare("SELECT value FROM settings WHERE key='email_gmail_user'").get()?.value;
      const gmailPass = _db.prepare("SELECT value FROM settings WHERE key='email_gmail_pass'").get()?.value;
      if (!gmailUser || !gmailPass) return { success: false, error: 'Gmail SMTP non configuré' };
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPass },
      });
      await transporter.sendMail({
        from: `"CKBPOS" <${gmailUser}>`,
        to: to || gmailUser,
        subject: subject || 'Rapport journalier CKBPOS',
        html: html || '<p>Rapport CKBPOS</p>',
      });
      console.log('[EMAIL] Rapport envoyé à', to);
      return { success: true };
    } catch (e) { console.error('[EMAIL]', e.message); return { success: false, error: e.message }; }
  });

  ipcMain.handle('email-config-get', () => {
    try {
      const user = _db.prepare("SELECT value FROM settings WHERE key='email_gmail_user'").get()?.value || '';
      const configured = !!user && !!_db.prepare("SELECT value FROM settings WHERE key='email_gmail_pass'").get()?.value;
      return { success: true, email: user, configured };
    } catch (e) { return { success: false, email: '', configured: false }; }
  });

  ipcMain.handle('email-config-set', (_, { gmailUser, gmailPass }) => {
    try {
      _db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('email_gmail_user',?)").run(gmailUser || '');
      _db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('email_gmail_pass',?)").run(gmailPass || '');
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('email-report-build', (_, { date }) => {
    try {
      const d = date || new Date().toISOString().slice(0, 10);
      const shop = _db.prepare("SELECT value FROM settings WHERE key='shop_name'").get()?.value || 'CKBPOS';
      const currency = _db.prepare("SELECT value FROM settings WHERE key='currency'").get()?.value || 'Kz';
      const ventes = _db.prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as tot FROM ventes WHERE date(date_vente)=? AND statut!='annule'").get(d) || { cnt: 0, tot: 0 };
      const annule = _db.prepare("SELECT COUNT(*) as cnt FROM ventes WHERE date(date_vente)=? AND statut='annule'").get(d)?.cnt || 0;
      const topProds = _db.prepare(`
        SELECT p.nom, SUM(vi.quantite) as qte, SUM(vi.sous_total) as total
        FROM vente_items vi JOIN ventes v ON vi.vente_id=v.id JOIN products p ON vi.product_id=p.id
        WHERE date(v.date_vente)=? AND v.statut!='annule'
        GROUP BY p.id ORDER BY total DESC LIMIT 5`).all(d);
      const stockAlerte = _db.prepare("SELECT nom, stock_cartons FROM products WHERE actif=1 AND stock_cartons<=COALESCE(stock_alerte,2) ORDER BY stock_cartons ASC LIMIT 10").all();
      const rows = topProds.map(p => `<tr><td>${p.nom}</td><td>${Math.round(p.qte * 100) / 100}</td><td><strong>${Number(p.total).toLocaleString('fr-FR')} ${currency}</strong></td></tr>`).join('');
      const alertRows = stockAlerte.map(p => `<tr style="color:#cc0000"><td>${p.nom}</td><td>${Math.round(p.stock_cartons * 100) / 100} cx</td></tr>`).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
<h1 style="color:#e8c547;border-bottom:2px solid #e8c547;padding-bottom:8px">${shop}</h1>
<h2 style="color:#555">Rapport journalier — ${d}</h2>
<div style="display:flex;gap:20px;margin:20px 0">
  <div style="flex:1;background:#f5f5f5;padding:16px;border-radius:8px;text-align:center">
    <div style="font-size:28px;font-weight:bold;color:#22c55e">${ventes.cnt}</div>
    <div style="font-size:12px;color:#666">Ventes confirmées</div>
  </div>
  <div style="flex:1;background:#f5f5f5;padding:16px;border-radius:8px;text-align:center">
    <div style="font-size:28px;font-weight:bold;color:#e8c547">${Number(ventes.tot).toLocaleString('fr-FR')} ${currency}</div>
    <div style="font-size:12px;color:#666">Chiffre d'affaires</div>
  </div>
  <div style="flex:1;background:#f5f5f5;padding:16px;border-radius:8px;text-align:center">
    <div style="font-size:28px;font-weight:bold;color:#ef4444">${annule}</div>
    <div style="font-size:12px;color:#666">Annulées</div>
  </div>
</div>
${topProds.length ? `<h3>Top Produits</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#333;color:#fff"><th style="padding:8px;text-align:left">Produit</th><th style="padding:8px;text-align:left">Qté</th><th style="padding:8px;text-align:left">Total</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
${stockAlerte.length ? `<h3 style="color:#cc0000">\u26A0\uFE0F Stock en alerte</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#cc0000;color:#fff"><th style="padding:8px;text-align:left">Produit</th><th style="padding:8px;text-align:left">Stock</th></tr></thead><tbody>${alertRows}</tbody></table>` : ''}
<p style="color:#999;font-size:11px;margin-top:30px;border-top:1px solid #eee;padding-top:10px">CKBPOS v${_APP_VERSION} — Rapport généré automatiquement</p>
</body></html>`;
      return { success: true, html, subject: `Rapport CKBPOS — ${shop} — ${d}` };
    } catch (e) { return { success: false, error: e.message }; }
  });
}

module.exports = { init, registerIPC };
