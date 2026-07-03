/**
 * CKBPOS HTML Templates
 * =====================
 * Pure functions that generate HTML for tickets, reports, and receipts.
 * No side effects, no database access, no IPC — only accepts data objects.
 *
 * Extracted from main.js (lines 1396-2085) during v5.1 refactor.
 */

'use strict';

let APP_VERSION = '5.0.0';
try { APP_VERSION = require('../../package.json').version; } catch (_) {}

// ── Utilities ──────────────────────────────────────────────────

function fmtNum(n) {
  const num = Number(n) || 0;
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function fmtDate(str) {
  try {
    const d = new Date(str);
    if (isNaN(d)) return str || '-';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mn = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mn}`;
  } catch (e) { return str || '-'; }
}

// ── Ticket HTML (58mm thermal receipt) ─────────────────────────

function generateTicketHTML(data) {
  const {
    shopName, shopAddress, shopPhone, shopNif,
    clientNom, clientNif, items, total, cashGiven, change,
    seller, date, currency, statut,
    payMode, montantDinheiro, montantExpress,
    qrDataUrl, numeroFacture,
    segundaVia,
    flags: rawFlags,
    ticketSizeMm: _tMm,
  } = data;
  const ticketW = `${_tMm || 72}mm`;

  const flags = rawFlags || {
    showQr: true, showAddress: true, showPhone: true, showNif: true,
    showFactureNum: true, showClientNom: true, showClientNif: true,
    showSeller: true, showObrigado: true, showVersion: true, showSecondaVia: true,
  };

  const payLabel = payMode === 'dinheiro' ? 'Numerário' : payMode === 'express' ? 'App Express' : 'Misto';
  const clientDisplay = clientNom || 'CONSUMIDOR FINAL';
  const nifDisplay = clientNif || 'CONSUMIDOR FINAL';
  const frNum = numeroFacture || '';

  const itemsRows = (items || []).map(i => `
    <tr>
      <td style="width:50%;word-break:break-word;"><strong>${i.name}</strong><br><small style="font-size:9px;">(${i.type})</small></td>
      <td style="width:8%;text-align:center;"><strong>${i.qty}</strong></td>
      <td style="width:20%;text-align:right;white-space:nowrap;">${i.price}</td>
      <td style="width:22%;text-align:right;white-space:nowrap;"><strong>${i.subtotal || i.price}</strong></td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: ${ticketW} auto; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; font-weight:700; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      width: ${ticketW};
      padding: 2mm 3mm;
      color: #000000 !important;
      background: #ffffff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .sep-solid { border-top: 2px solid #000; margin: 4px 0; }
    .sep-dash  { border-top: 1px dashed #000; margin: 3px 0; }
    .shop-name { font-size: 15px; font-weight: 900; text-transform: uppercase; text-align: center; line-height: 1.4; word-break: break-word; }
    .shop-info { font-size: 11px; text-align: center; line-height: 1.7; }
    .factura-title { font-size: 13px; font-weight: 900; text-align: center; letter-spacing: 1px; margin: 3px 0; text-transform: uppercase; }
    .fr-num { font-size: 11px; font-weight: 900; text-align: center; margin-bottom: 2px; word-break: break-all; }
    .original { font-size: 9px; text-align: center; margin-bottom: 3px; }
    .meta-line { font-size: 11px; line-height: 1.8; }
    .mention-legal { font-size: 9px; font-style: italic; line-height: 1.4; text-align: justify; margin: 3px 0; }
    .cancelled { font-size: 13px; text-align: center; font-weight: 900; border: 2px dashed #000; padding: 3px; margin: 5px 0; letter-spacing: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 2px 0; table-layout: fixed; }
    th { font-size: 10px; font-weight: 900; text-transform: uppercase; padding: 3px 1px; border-top: 2px solid #000; border-bottom: 1px dashed #000; }
    td { padding: 3px 1px; font-size: 11px; vertical-align: top; word-break: break-word; }
    tbody tr:last-child td { border-bottom: 2px solid #000; }
    .total-grand { display: flex; justify-content: space-between; font-size: 16px; font-weight: 900; padding: 4px 0; border-bottom: 2px solid #000; margin: 3px 0 5px; }
    .pay-title { font-size: 12px; font-weight: 900; margin: 4px 0 2px; text-decoration: underline; }
    .pay-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: 900; padding: 2px 0; }
    .footer { text-align: center; font-size: 12px; font-weight: 900; margin-top: 7px; line-height: 1.9; }
    @media print { * { color: #000 !important; background: transparent !important; } body { background: #fff !important; } }
  </style></head><body>

  <div class="shop-name">${shopName}</div>
  <div class="shop-info">
    ${flags.showNif && shopNif ? `Contribuinte Nº ${shopNif}<br>` : ''}
    ${flags.showPhone && shopPhone ? `Tel: ${shopPhone}<br>` : ''}
    ${flags.showAddress && shopAddress ? `${shopAddress}` : ''}
  </div>

  <div class="sep-solid"></div>

  <div class="factura-title">FACTURA RECIBO</div>
  ${flags.showFactureNum && frNum ? `<div class="fr-num">${frNum}</div>` : ''}
  ${flags.showSecondaVia ? `<div class="original">${segundaVia ? '2ème exemplaire — Segunda via' : 'Original'}</div>` : ''}

  <div class="sep-dash"></div>

  <div class="meta-line">
    ${flags.showClientNom ? `<div>Cliente: ${clientDisplay}</div>` : ''}
    ${flags.showClientNif ? `<div>NIF: ${nifDisplay}</div>` : ''}
    <div>Data e Hora: ${date}</div>
    ${flags.showSeller ? `<div>Vendedor: ${seller.toUpperCase()}</div>` : ''}
  </div>

  ${flags.showMentionLegal && shopAddress ? `<div class="mention-legal">Os bens/Serviços foram colocados à disposição do adquirente na data do documento: ${shopAddress}.</div>` : ''}

  ${statut === 'annule' ? '<div class="cancelled">*** ANULADO ***</div>' : ''}

  <div class="sep-solid"></div>

  <table>
    <thead>
      <tr>
        <th style="width:50%;text-align:left;">Descrição</th>
        <th style="width:8%;text-align:center;">Qtd</th>
        <th style="width:20%;text-align:right;">Preço</th>
        <th style="width:22%;text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>${itemsRows}</tbody>
  </table>

  <div class="total-grand">
    <span>TOTAL</span>
    <span>${total} ${currency}</span>
  </div>

  <div class="pay-title">Forma de Pagamento</div>
  <div class="sep-dash"></div>
  <div class="pay-row">
    <span>${payLabel.toUpperCase()}</span>
    <span>${payMode === 'misto' ? `${total} ${currency}` : payMode === 'dinheiro' ? `${montantDinheiro} ${currency}` : `${montantExpress} ${currency}`}</span>
  </div>
  ${payMode === 'misto' ? `
  <div class="pay-row" style="font-size:9px;"><span>└ Numerário</span><span>${montantDinheiro} ${currency}</span></div>
  <div class="pay-row" style="font-size:9px;"><span>└ App Express</span><span>${montantExpress} ${currency}</span></div>` : ''}
  <div class="sep-dash"></div>
  ${payMode === 'dinheiro' ? `<div class="pay-row"><span>Recebido</span><span>${cashGiven} ${currency}</span></div>` : ''}
  ${(change && change !== '0' && change !== '0,00') ? `<div class="pay-row"><span>Troco</span><span>${change} ${currency}</span></div>` : ''}

  <div class="sep-solid"></div>

  <div class="footer">
    ${flags.showObrigado ? 'OBRIGADO PELA SUA COMPRA!<br>' : ''}
    ${flags.showVersion ? `CKBPOS v${APP_VERSION}` : ''}
  </div>

  ${flags.showQr && qrDataUrl ? `
  <div style="text-align:center;margin-top:10px;padding-top:6px;border-top:1px dashed #000;">
    <img src="${qrDataUrl}" width="120" height="120" style="display:inline-block;"/>
    <div style="font-size:8px;color:#666;margin-top:3px;font-family:'Courier New',monospace;">Escaneie para verificar</div>
  </div>` : ''}

  </body></html>`;
}

// ── Historique Ticket HTML (58mm thermal) ──────────────────────

function generateHistoriqueTicketHTML(data) {
  const { shopName, ventes, total, currency, filterUser, filterDateFrom, filterDateTo, printedAt, ticketSizeMm: _tMm } = data;
  const ticketW = `${_tMm || 72}mm`;

  const statutLabel = { annule: 'ANUL', modifie: 'MOD', normal: 'OK', pago_retirar: 'RES' };
  const payLabel = { dinheiro: 'NUM', express: 'EXP', misto: 'MIS' };

  const countOk = (ventes || []).filter(v => v.statut !== 'annule').length;
  const countAnul = (ventes || []).filter(v => v.statut === 'annule').length;
  const isFiltered = filterDateFrom || (filterUser && filterUser !== 'Todos' && filterUser !== 'all');

  const rows = (ventes || []).map(v => {
    const statut = statutLabel[v.statut] || 'OK';
    const pay = payLabel[v.mode_paiement] || 'NUM';
    const date = fmtDate(v.date_vente).slice(0, 16);
    return `
  <div class="row-vente">
    <span class="vid">#${v.id}</span>
    <span class="vdate">${date}</span>
    <span class="vpay">${pay}</span>
    <span class="vstat ${v.statut}">${statut}</span>
    <span class="vtotal">${fmtNum(v.total)}</span>
  </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: ${ticketW} auto; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; font-weight:700; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      width: ${ticketW};
      padding: 4mm 2mm;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .center  { text-align:center; }
    .right   { text-align:right; }
    .sep     { border-top:2px solid #000; margin:4px 0; }
    .sep-d   { border-top:1px dashed #000; margin:3px 0; }
    .title   { font-size:13px; font-weight:900; text-align:center; text-transform:uppercase; }
    .sub     { font-size:9px; text-align:center; margin-bottom:2px; }
    .meta    { font-size:9px; line-height:1.7; }
    .stats   { display:flex; justify-content:space-between; font-size:9px; margin:3px 0; }
    .col-hdr { display:flex; justify-content:space-between; font-size:8px; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:2px; margin-bottom:2px; }
    .row-vente { display:flex; justify-content:space-between; align-items:center; font-size:9px; padding:2px 0; border-bottom:1px dashed #eee; }
    .vid    { width:24px; flex-shrink:0; font-size:8px; }
    .vdate  { width:82px; flex-shrink:0; font-size:8px; }
    .vpay   { width:20px; flex-shrink:0; font-size:8px; text-align:center; }
    .vstat  { width:20px; flex-shrink:0; font-size:8px; text-align:center; font-weight:900; }
    .vstat.annule { color:#000; text-decoration:line-through; }
    .vtotal { flex:1; text-align:right; font-size:9px; }
    .total-line { display:flex; justify-content:space-between; font-size:12px; font-weight:900; margin-top:4px; }
    .footer { text-align:center; font-size:8px; margin-top:6px; }
    @media print { * { color:#000 !important; background:#fff !important; } }
  </style>
  </head><body>

  <div class="title">${shopName || 'CKBPOS'}</div>
  <div class="sub">Histórico de Vendas${isFiltered ? ' — FILTRADO' : ''}</div>
  <div class="sep"></div>

  <div class="meta">
    <div>Impresso: ${printedAt || '-'}</div>
    ${filterUser && filterUser !== 'all' && filterUser !== 'Todos' ? `<div>Vendedor: ${filterUser}</div>` : ''}
    ${filterDateFrom ? `<div>De: ${filterDateFrom}</div><div>Até: ${filterDateTo || 'hoje'}</div>` : ''}
  </div>

  <div class="sep-d"></div>

  <div class="stats">
    <span>Total: ${(ventes || []).length} venda(s)</span>
    <span>OK: ${countOk} | ANUL: ${countAnul}</span>
  </div>

  <div class="sep"></div>

  <div class="col-hdr">
    <span style="width:24px">#</span>
    <span style="width:82px">Data/Hora</span>
    <span style="width:20px;text-align:center">Pag</span>
    <span style="width:20px;text-align:center">Stat</span>
    <span style="flex:1;text-align:right">${currency}</span>
  </div>

  ${rows || '<div class="center" style="padding:8px 0;">Nenhuma venda</div>'}

  <div class="sep"></div>

  <div class="total-line">
    <span>TOTAL GERAL</span>
    <span>${fmtNum(total)} ${currency}</span>
  </div>

  <div class="sep-d"></div>
  <div class="footer">CKBPOS — ${printedAt || '-'}</div>

  </body></html>`;
}

// ── Shift Report HTML (58mm thermal) ──────────────────────────

function generateShiftHTML(data) {
  const { vendeur, dateDebut, dateFin, items, totalVentes, totalDinheiro, totalExpress, argentEnMain, argentEnvoye, note, currency, shopName, shopAddress, shopPhone, shopNif, cadernoResume, fundoCaixa, ticketSizeMm: _tMm } = data;
  const ticketW = `${_tMm || 72}mm`;
  const diffMain = argentEnMain - totalDinheiro;
  const diffExpress = argentEnvoye - totalExpress;
  const ecartCaixa = argentEnMain - (fundoCaixa || 0) - totalDinheiro;

  const grouped = {};
  (items || []).forEach(i => {
    if (!grouped[i.nom]) grouped[i.nom] = { carton: 0, demi: 0, unite: 0, subtotal: 0 };
    grouped[i.nom][i.type_vente] += Math.round(i.qty * 100) / 100;
    grouped[i.nom].subtotal += i.subtotal;
  });

  const groupedRows = Object.entries(grouped).map(([nom, v]) => {
    const parts = [];
    if (v.carton > 0) parts.push(`${v.carton} cx`);
    if (v.demi > 0) parts.push(`${v.demi} demi`);
    if (v.unite > 0) parts.push(`${v.unite} un`);
    return `<div class="row"><span>${nom}: ${parts.join(' + ')}</span><span>${v.subtotal.toLocaleString('fr-FR')} ${currency}</span></div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: ${ticketW} auto; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; font-weight:700; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      width: ${ticketW};
      padding: 2mm 2mm;
      color: #000000 !important;
      background: #ffffff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .center { text-align: center; }
    .bold { font-weight: 900; }
    .separator { border-top: 2px solid #000; margin: 4px 0; }
    .separator-thin { border-top: 1px dashed #000; margin: 3px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; font-size:9px; }
    .shop-name { font-size:13px; font-weight:900; text-transform:uppercase; text-align:center; line-height:1.3; word-break:break-word; }
    .shop-info { font-size:8px; text-align:center; line-height:1.6; }
    @media print { * { color: #000 !important; background: transparent !important; } body { background: #fff !important; } }
  </style>
  </head><body>
  <div class="shop-name">${shopName || 'CKBPOS'}</div>
  <div class="shop-info">
    ${shopNif ? `Contribuinte Nº ${shopNif}<br>` : ''}
    ${shopPhone ? `Tel: ${shopPhone}<br>` : ''}
    ${shopAddress ? `${shopAddress}` : ''}
  </div>
  <div class="separator"></div>
  <div class="center bold" style="font-size:13px;">RELATÓRIO DE TURNO</div>
  <div class="center" style="font-size:11px;">${vendeur}</div>
  <div class="separator"></div>
  <div class="row"><span>Início:</span><span>${dateDebut}</span></div>
  <div class="row"><span>Fim:</span><span>${dateFin}</span></div>
  <div class="separator"></div>
  <div class="bold" style="margin-bottom:4px;">PRODUTOS VENDIDOS:</div>
  <div class="separator-thin"></div>
  ${groupedRows || '<div class="center">Nenhuma venda</div>'}
  <div class="separator"></div>
  <div class="row bold" style="font-size:14px;"><span>TOTAL VENDAS</span><span>${totalVentes.toLocaleString('fr-FR')} ${currency}</span></div>
  <div class="separator"></div>
  <div class="bold" style="margin-bottom:4px;">REGISTRADO NO SISTEMA:</div>
  <div class="row"><span>Numerário</span><span>${totalDinheiro.toLocaleString('fr-FR')} ${currency}</span></div>
  <div class="row"><span>App Express</span><span>${totalExpress.toLocaleString('fr-FR')} ${currency}</span></div>
  <div class="separator-thin"></div>
  <div class="bold" style="margin-bottom:4px;">CONFIRMADO PELO VENDEDOR:</div>
  <div class="row"><span>Numerário real</span><span>${argentEnMain.toLocaleString('fr-FR')} ${currency}</span></div>
  <div class="row"><span>App Express real</span><span>${argentEnvoye.toLocaleString('fr-FR')} ${currency}</span></div>
  <div class="separator"></div>
  <div class="bold" style="margin-bottom:4px;">DIFERENÇAS:</div>
  <div class="row"><span>Numerário</span><span>${diffMain >= 0 ? '+' : ''}${diffMain.toLocaleString('fr-FR')} ${currency}</span></div>
  <div class="row"><span>App Express</span><span>${diffExpress >= 0 ? '+' : ''}${diffExpress.toLocaleString('fr-FR')} ${currency}</span></div>
  ${(fundoCaixa && fundoCaixa > 0) ? `<div class="separator-thin"></div><div class="row"><span>Fundo Caixa</span><span>${Number(fundoCaixa).toLocaleString('fr-FR')} ${currency}</span></div><div class="row bold"><span>ÉCART CAIXA</span><span>${ecartCaixa >= 0 ? '+' : ''}${ecartCaixa.toLocaleString('fr-FR')} ${currency}</span></div>` : ''}
  ${note ? `<div class="separator-thin"></div><div>Obs: ${note}</div>` : ''}
  <div class="separator"></div>
  ${cadernoResume ? `
  <div class="bold" style="margin-bottom:4px;">CADERNO DE CAIXA:</div>
  <div class="row"><span>Entradas (+)</span><span>${cadernoResume.totalPlus.toLocaleString('fr-FR')} ${currency}</span></div>
  <div class="row"><span>Sa\u00eddas (-)</span><span>${cadernoResume.totalMoins.toLocaleString('fr-FR')} ${currency}</span></div>
  ${cadernoResume.dettes > 0 ? `<div class="row" style="font-size:8px;"><span>D\u00edvidas pend.</span><span>${cadernoResume.dettes.toLocaleString('fr-FR')} ${currency}</span></div>` : ''}
  <div class="row bold"><span>Net caderno</span><span>${cadernoResume.net >= 0 ? '+' : ''}${cadernoResume.net.toLocaleString('fr-FR')} ${currency}</span></div>
  <div class="separator"></div>` : ''}
  <div class="separator-thin"></div>
  <div class="center" style="margin-top:6px;font-size:10px;">Assinatura: ____________________</div>
  <div class="center" style="margin-top:6px;font-size:9px;">CKBPOS v${APP_VERSION}</div>
  </body></html>`;
}

// ── Produtos HTML (A4 report) ─────────────────────────────────

function generateProdutosHTML(data) {
  const { shopName, produtos, currency, filterUser, filterDateFrom, filterDateTo, printedAt } = data;
  const totalRevenue = (produtos || []).reduce((s, p) => s + (p.total || 0), 0);
  const totalProduits = (produtos || []).length;

  const rows = (produtos || []).map((p, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f5f5f5';
    const nom = p.variant_nom ? p.nom + ' \u2014 ' + p.variant_nom : p.nom;
    const carton = p.carton > 0 ? Math.round(p.carton * 100) / 100 + ' cx' : '';
    const demi = p.demi > 0 ? Math.round(p.demi * 100) / 100 + ' demi' : '';
    const unite = p.unite > 0 ? Math.round(p.unite * 100) / 100 + ' un' : '';
    const qtyStr = [carton, demi, unite].filter(Boolean).join(' + ') || '-';
    return `<tr style="background:${bg};">
      <td style="text-align:center;">${i + 1}</td>
      <td style="font-weight:700;">${nom}</td>
      <td style="text-align:center;">${qtyStr}</td>
      <td style="text-align:right;font-weight:700;">${fmtNum(p.total)} ${currency}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 15mm 12mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .header { border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
    .title { font-size: 18px; font-weight: 900; text-transform: uppercase; }
    .subtitle { font-size: 12px; color: #444; margin-top: 2px; }
    .meta { margin-bottom: 12px; font-size: 11px; line-height: 1.8; }
    .stats { display: flex; gap: 20px; margin-bottom: 14px; }
    .stat-box { border: 1px solid #ccc; border-radius: 4px; padding: 6px 14px; text-align: center; }
    .stat-box .val { font-size: 16px; font-weight: 900; }
    .stat-box .lbl { font-size: 9px; color: #666; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead tr { background: #000; color: #fff; }
    thead th { padding: 6px; font-weight: 900; font-size: 10px; text-transform: uppercase; }
    tbody td { padding: 5px 6px; border-bottom: 1px solid #e0e0e0; }
    tfoot td { padding: 7px 6px; border-top: 3px solid #000; font-weight: 900; font-size: 12px; }
    .footer { margin-top: 14px; font-size: 9px; color: #888; border-top: 1px solid #ccc; padding-top: 6px; text-align: center; }
    @media print { * { color:#000 !important; } thead tr { background:#000 !important; color:#fff !important; } }
  </style></head><body>
  <div class="header">
    <div class="title">${shopName || 'CKBPOS'}</div>
    <div class="subtitle">Relat\u00f3rio de Produtos Vendidos</div>
  </div>
  <div class="meta">
    <div><strong>Impresso em:</strong> ${printedAt || '-'}</div>
    ${filterUser && filterUser !== 'all' && filterUser !== 'Todos' ? `<div><strong>Vendedor:</strong> ${filterUser}</div>` : ''}
    ${filterDateFrom ? `<div><strong>Per\u00edodo:</strong> ${filterDateFrom} \u2192 ${filterDateTo || 'hoje'}</div>` : ''}
  </div>
  <div class="stats">
    <div class="stat-box"><div class="val">${totalProduits}</div><div class="lbl">Produtos</div></div>
    <div class="stat-box" style="border-color:#000;"><div class="val">${fmtNum(totalRevenue)} ${currency}</div><div class="lbl">Receita total</div></div>
  </div>
  <table>
    <thead><tr>
      <th style="width:30px;text-align:center;">#</th>
      <th style="text-align:left;">Produto</th>
      <th style="text-align:center;width:160px;">Quantidade</th>
      <th style="text-align:right;width:120px;">Total</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="4" style="text-align:center;padding:20px;">Nenhum produto</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="3" style="text-align:right;">TOTAL GERAL</td>
      <td style="text-align:right;">${fmtNum(totalRevenue)} ${currency}</td>
    </tr></tfoot>
  </table>
  <div class="footer">CKBPOS \u2014 Relat\u00f3rio gerado em ${printedAt || '-'}</div>
  </body></html>`;
}

// ── Produtos Ticket HTML (58mm thermal) ────────────────────────

function generateProdutosTicketHTML(data) {
  const { shopName, produtos, currency, filterUser, filterDateFrom, filterDateTo, printedAt, ticketSizeMm: _tMm } = data;
  const ticketW = `${_tMm || 72}mm`;
  const totalRevenue = (produtos || []).reduce((s, p) => s + (p.total || 0), 0);

  const rows = (produtos || []).map(p => {
    const nom = p.variant_nom ? p.nom + ' ' + p.variant_nom : p.nom;
    const parts = [];
    if (p.carton > 0) parts.push(Math.round(p.carton * 100) / 100 + 'cx');
    if (p.demi > 0) parts.push(Math.round(p.demi * 100) / 100 + 'dm');
    if (p.unite > 0) parts.push(Math.round(p.unite * 100) / 100 + 'un');
    const qtyStr = parts.join('+') || '-';
    return `<div class="prow">
      <div class="pnom">${nom}</div>
      <div class="pinfo"><span class="pqty">${qtyStr}</span><span class="ptot">${fmtNum(p.total)} ${currency}</span></div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: ${ticketW} auto; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; font-weight:700; }
    body { font-family: 'Courier New', Courier, monospace; font-size:10px; width:${ticketW}; padding:4mm 2mm; color:#000; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .center { text-align:center; }
    .sep    { border-top:2px solid #000; margin:4px 0; }
    .sep-d  { border-top:1px dashed #000; margin:3px 0; }
    .title  { font-size:13px; font-weight:900; text-align:center; text-transform:uppercase; }
    .sub    { font-size:9px; text-align:center; margin-bottom:2px; }
    .meta   { font-size:9px; line-height:1.7; margin-bottom:3px; }
    .col-hdr { display:flex; justify-content:space-between; font-size:8px; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:2px; margin-bottom:2px; }
    .prow   { padding:2px 0; border-bottom:1px dashed #ddd; }
    .pnom   { font-size:10px; font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:72mm; }
    .pinfo  { display:flex; justify-content:space-between; font-size:9px; margin-top:1px; }
    .pqty   { color:#333; }
    .ptot   { font-weight:900; }
    .total-line { display:flex; justify-content:space-between; font-size:12px; font-weight:900; margin-top:5px; }
    .footer { text-align:center; font-size:8px; margin-top:6px; }
    @media print { * { color:#000 !important; background:#fff !important; } }
  </style></head><body>
  <div class="title">${shopName || 'CKBPOS'}</div>
  <div class="sub">Produtos Vendidos</div>
  <div class="sep"></div>
  <div class="meta">
    <div>Impresso: ${printedAt || '-'}</div>
    ${filterUser && filterUser !== 'Todos' && filterUser !== 'all' ? `<div>Vendedor: ${filterUser}</div>` : ''}
    ${filterDateFrom ? `<div>De: ${filterDateFrom} \u2192 ${filterDateTo || 'hoje'}</div>` : ''}
  </div>
  <div class="sep-d"></div>
  <div class="col-hdr"><span>Produto</span><span>Qtd / Total</span></div>
  ${rows || '<div class="center" style="padding:8px 0;">Nenhum produto</div>'}
  <div class="sep"></div>
  <div class="total-line">
    <span>${(produtos || []).length} produto(s)</span>
    <span>${fmtNum(totalRevenue)} ${currency}</span>
  </div>
  <div class="sep-d"></div>
  <div class="footer">CKBPOS \u2014 ${printedAt || '-'}</div>
  </body></html>`;
}

// ── Historique HTML (A4 report) ────────────────────────────────

function generateHistoriqueHTML(data) {
  const { shopName, ventes, total, currency, filterUser, filterDateFrom, filterDateTo, printedAt } = data;

  const payLabel = { dinheiro: 'Numerário', express: 'App Express', misto: 'Misto' };
  const statutLabel = { annule: 'ANULADO', modifie: 'MODIF.', normal: 'OK', pago_retirar: 'RESERVADO' };

  const isFiltered = filterDateFrom || (filterUser && filterUser !== 'Todos' && filterUser !== 'all');

  const rows = (ventes || []).map((v, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f5f5f5';
    const statut = statutLabel[v.statut] || 'OK';
    const statutColor = v.statut === 'annule' ? '#cc0000' : v.statut === 'modifie' ? '#cc7700' : '#007700';
    return `<tr style="background:${bg};">
      <td style="text-align:center;">${v.id}</td>
      <td>${fmtDate(v.date_vente)}</td>
      <td>${v.vendeur || '-'}</td>
      <td>${v.client_nom || 'CONSUMIDOR FINAL'}</td>
      <td style="text-align:center;">${payLabel[v.mode_paiement] || v.mode_paiement || 'Numerário'}</td>
      <td style="text-align:center;font-weight:900;color:${statutColor};">${statut}</td>
      <td style="text-align:right;font-weight:700;">${fmtNum(v.total)} ${currency}</td>
    </tr>`;
  }).join('');

  const countOk = (ventes || []).filter(v => v.statut !== 'annule').length;
  const countAnul = (ventes || []).filter(v => v.statut === 'annule').length;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 15mm 12mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header { border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
    .title { font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
    .subtitle { font-size: 12px; color: #444; margin-top: 2px; }
    .meta { margin-bottom: 10px; font-size: 11px; line-height: 1.8; }
    .meta strong { display: inline-block; min-width: 90px; }
    .stats { display: flex; gap: 24px; margin-bottom: 12px; }
    .stat-box { border: 1px solid #ccc; border-radius: 4px; padding: 6px 14px; text-align: center; }
    .stat-box .val { font-size: 16px; font-weight: 900; }
    .stat-box .lbl { font-size: 9px; color: #666; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead tr { background: #000; color: #fff; }
    thead th { padding: 6px 6px; font-weight: 900; font-size: 10px; text-transform: uppercase; }
    tbody td { padding: 5px 6px; border-bottom: 1px solid #e0e0e0; }
    tfoot td { padding: 6px 6px; border-top: 3px solid #000; font-weight: 900; font-size: 12px; }
    .right { text-align: right; }
    .center { text-align: center; }
    .footer { margin-top: 16px; font-size: 9px; color: #888; border-top: 1px solid #ccc; padding-top: 6px; text-align: center; }
    @media print {
      * { color: #000 !important; }
      thead tr { background: #000 !important; color: #fff !important; }
      -webkit-print-color-adjust: exact;
    }
  </style>
  </head><body>

  <div class="header">
    <div class="title">${shopName || 'CKBPOS'}</div>
    <div class="subtitle">Relatório de Histórico de Vendas${isFiltered ? ' — FILTRADO' : ' — COMPLETO'}</div>
  </div>

  <div class="meta">
    <div><strong>Impresso em:</strong> ${printedAt || '-'}</div>
    ${filterUser && filterUser !== 'all' && filterUser !== 'Todos' ? `<div><strong>Vendedor:</strong> ${filterUser}</div>` : ''}
    ${filterDateFrom ? `<div><strong>Período:</strong> ${filterDateFrom} \u2192 ${filterDateTo || 'hoje'}</div>` : ''}
    <div><strong>Registros:</strong> ${(ventes || []).length} venda(s)</div>
  </div>

  <div class="stats">
    <div class="stat-box">
      <div class="val">${(ventes || []).length}</div>
      <div class="lbl">Total vendas</div>
    </div>
    <div class="stat-box">
      <div class="val">${countOk}</div>
      <div class="lbl">Confirmadas</div>
    </div>
    <div class="stat-box">
      <div class="val">${countAnul}</div>
      <div class="lbl">Anuladas</div>
    </div>
    <div class="stat-box" style="border-color:#000;">
      <div class="val">${fmtNum(total)} ${currency}</div>
      <div class="lbl">Total geral</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="center">#</th>
        <th>Data / Hora</th>
        <th>Vendedor</th>
        <th>Cliente</th>
        <th class="center">Pagamento</th>
        <th class="center">Status</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="7" style="text-align:center;padding:20px;">Nenhuma venda encontrada</td></tr>'}
    </thead>
    <tfoot>
      <tr>
        <td colspan="6" class="right">TOTAL GERAL (excl. anuladas)</td>
        <td class="right">${fmtNum(total)} ${currency}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">CKBPOS — Relatório gerado automaticamente em ${printedAt || '-'}</div>

  </body></html>`;
}

// ── Caderno Ticket HTML (58mm thermal daily summary) ───────────

function generateCadernoTicketHTML(data) {
  const { shopName, entries, date_jour, currency, printedAt, ticketSizeMm: _tMm } = data;
  const ticketW = `${_tMm || 72}mm`;

  const totalPlus = (entries || []).filter(e => e.direction === 'entree').reduce((s, e) => s + (e.montant || 0), 0);
  const totalMoins = (entries || []).filter(e => e.direction !== 'entree').reduce((s, e) => s + (e.montant || 0), 0);
  const dettes = (entries || []).filter(e => e.est_dette && e.statut_dette !== 'pago').reduce((s, e) => s + (e.montant || 0), 0);
  const net = totalPlus - totalMoins;

  const rows = (entries || []).map(e => {
    const signe = e.direction === 'entree' ? '+' : '-';
    const col = e.direction === 'entree' ? '#2d9e6b' : '#cc4444';
    const motTxt = (e.motivo || '').substring(0, 16);
    const nomTxt = (e.nom || '-').substring(0, 18);
    return `<div class="erow">
      <span class="enom">${nomTxt}</span>
      <span class="emot">${motTxt}</span>
      <span class="eamt" style="color:${col};">${signe}${fmtNum(e.montant || 0)}</span>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: ${ticketW} auto; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; font-weight:700; }
    body { font-family: 'Courier New', Courier, monospace; font-size:10px; width:${ticketW}; padding:4mm 2mm; color:#000; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .center { text-align:center; }
    .sep    { border-top:2px solid #000; margin:4px 0; }
    .sep-d  { border-top:1px dashed #000; margin:3px 0; }
    .title  { font-size:13px; font-weight:900; text-align:center; text-transform:uppercase; }
    .sub    { font-size:9px; text-align:center; margin-bottom:2px; }
    .meta   { font-size:9px; line-height:1.7; margin-bottom:3px; }
    .erow   { display:flex; justify-content:space-between; align-items:center; font-size:9px; padding:2px 0; border-bottom:1px dashed #ccc; gap:3px; }
    .enom   { flex:1; font-size:9px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .emot   { width:60px; font-size:8px; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-shrink:0; }
    .eamt   { width:50px; text-align:right; font-size:9px; flex-shrink:0; }
    .totrow { display:flex; justify-content:space-between; font-size:10px; padding:2px 0; }
    .totbig { display:flex; justify-content:space-between; font-size:12px; font-weight:900; margin-top:3px; padding:3px 0; border-top:2px solid #000; }
    .footer { text-align:center; font-size:8px; margin-top:6px; }
    @media print { * { color:#000 !important; background:#fff !important; } }
  </style></head><body>
  <div class="title">${shopName || 'CKBPOS'}</div>
  <div class="sub">Caderno de Caixa</div>
  <div class="sep"></div>
  <div class="meta">
    <div>Data: ${date_jour || '-'}</div>
    <div>Impresso: ${printedAt || '-'}</div>
  </div>
  <div class="sep-d"></div>
  ${rows || '<div class="center" style="padding:6px 0;font-size:9px;">Nenhum registo</div>'}
  <div class="sep"></div>
  <div class="totrow"><span>TOTAL +</span><span>+${fmtNum(totalPlus)} ${currency || 'Kz'}</span></div>
  <div class="totrow"><span>TOTAL -</span><span>-${fmtNum(totalMoins)} ${currency || 'Kz'}</span></div>
  ${dettes > 0 ? `<div class="totrow" style="color:#b00;"><span>D\u00edvidas pend.</span><span>-${fmtNum(dettes)} ${currency || 'Kz'}</span></div>` : ''}
  <div class="totbig"><span>NET DO DIA</span><span>${net >= 0 ? '+' : ''}${fmtNum(net)} ${currency || 'Kz'}</span></div>
  <div class="sep-d"></div>
  <div class="footer">CKBPOS \u2014 ${printedAt || '-'}</div>
  </body></html>`;
}

module.exports = {
  generateTicketHTML,
  generateHistoriqueTicketHTML,
  generateShiftHTML,
  generateProdutosHTML,
  generateProdutosTicketHTML,
  generateHistoriqueHTML,
  generateCadernoTicketHTML,
  fmtNum,
  fmtDate,
};
