/**
 * CKBPOS Excel Export Module
 * ==========================
 * xlsx export for sales and stock.
 * Extracted from main.js during v5.1 refactor.
 */

'use strict';

let _db, _app;

function init(ctx) {
  _db = ctx.db;
  _app = ctx.app;
}

function registerIPC(ipcMain) {
  ipcMain.handle('excel-export-sales', async (_, { date_from, date_to, user_id }) => {
    try {
      let XLSX;
      try { XLSX = require('xlsx'); } catch (_e) {
        return { success: false, error: 'xlsx non installé — npm install xlsx' };
      }
      let sql = `SELECT v.id, v.date_vente, u.nom as vendeur, v.client_nom, v.client_nif,
        v.total, v.mode_paiement, v.montant_dinheiro, v.montant_express, v.statut, v.facture_num, v.machine_id
        FROM ventes v LEFT JOIN users u ON v.user_id=u.id WHERE 1=1`;
      const params = [];
      if (date_from) { sql += ' AND date(v.date_vente)>=?'; params.push(date_from); }
      if (date_to) { sql += ' AND date(v.date_vente)<=?'; params.push(date_to); }
      if (user_id) { sql += ' AND v.user_id=?'; params.push(user_id); }
      sql += ' ORDER BY v.id DESC LIMIT 10000';
      const rows = _db.prepare(sql).all(...params);
      const wsData = [
        ['#', 'Data', 'Vendedor', 'Cliente', 'NIF', 'Total', 'Pagamento', 'Numerário', 'Express', 'Status', 'Factura', 'Máquina'],
        ...rows.map(r => [r.id, r.date_vente, r.vendeur || '', r.client_nom || '', r.client_nif || '', r.total, r.mode_paiement || '', r.montant_dinheiro || 0, r.montant_express || 0, r.statut || '', r.facture_num || '', r.machine_id || ''])
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [5, 16, 14, 20, 16, 10, 12, 10, 10, 10, 20, 14].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, 'Vendas');
      const fileName = `ckbpos_vendas_${date_from || 'all'}_${Date.now()}.xlsx`;
      const path = require('path');
      const savePath = path.join(_app.getPath('downloads'), fileName);
      XLSX.writeFile(wb, savePath);
      try { require('electron').shell.openPath(path.dirname(savePath)); } catch (_e) {}
      return { success: true, path: savePath, count: rows.length };
    } catch (e) { console.error('[EXCEL]', e.message); return { success: false, error: e.message }; }
  });

  ipcMain.handle('excel-export-stock', async () => {
    try {
      let XLSX;
      try { XLSX = require('xlsx'); } catch (_e) {
        return { success: false, error: 'xlsx non installé — npm install xlsx' };
      }
      const products = _db.prepare(`
        SELECT p.nom, p.stock_cartons, COALESCE(p.unites,1) as unites,
          p.prix_vente, p.prix_demi, p.prix_unite,
          p.stock_alerte, p.actif,
          COALESCE((SELECT SUM(r.qty_reserved) FROM stock_reservations r WHERE r.product_id=p.id AND r.status='active'),0) as reserved
        FROM products p WHERE p.actif=1 ORDER BY p.nom`).all();
      const wsData = [
        ['Produto', 'Stock (cartons)', 'Unidades/Caixa', 'Reservado', 'Disponível', 'Preço venda', 'Preço demi', 'Preço unitário', 'Alerta'],
        ...products.map(p => {
          const dispo = (p.stock_cartons || 0) - (p.reserved || 0);
          return [p.nom, p.stock_cartons || 0, p.unites || 1, p.reserved || 0, Math.max(0, dispo), p.prix_vente || 0, p.prix_demi || 0, p.prix_unite || 0, p.stock_alerte || 2];
        })
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [22, 14, 14, 10, 10, 12, 12, 12, 8].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, 'Stock');
      const fileName = `ckbpos_stock_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const path = require('path');
      const savePath = path.join(_app.getPath('downloads'), fileName);
      XLSX.writeFile(wb, savePath);
      try { require('electron').shell.openPath(path.dirname(savePath)); } catch (_e) {}
      return { success: true, path: savePath, count: products.length };
    } catch (e) { console.error('[EXCEL]', e.message); return { success: false, error: e.message }; }
  });
}

module.exports = { init, registerIPC };
