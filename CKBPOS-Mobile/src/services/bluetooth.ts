/**
 * Bluetooth Thermal Printer Service for CKBPOS Mobile
 * Uses react-native-bluetooth-escpos-printer for ESC/POS over Bluetooth.
 *
 * LIMITATIONS (fragmentation Android) :
 * - Android 12+ : requires BLUETOOTH_CONNECT permission (runtime)
 * - Android < 12 : requires BLUETOOTH + BLUETOOTH_ADMIN + ACCESS_FINE_LOCATION
 * - iOS : uses MFi or BLE — limited thermal printer support
 * - Some printers need specific pairing (PIN 0000 or 1234)
 * - Print buffer size varies by printer model
 *
 * Fallback : if BT unavailable, use expo-print (system print dialog).
 */

import { Platform, PermissionsAndroid, Alert } from 'react-native';
import { ESCPOS, TicketData, createTicketBuilder } from '../utils/escpos';

// Lazy load bluetooth module — may not be installed
let BTModule: any = null;
try {
  BTModule = require('react-native-bluetooth-escpos-printer');
} catch {
  console.warn('[BT] react-native-bluetooth-escpos-printer non installé');
}

export interface PrinterDevice {
  name: string;
  address: string;
  type?: string;
}

export interface PrintResult {
  success: boolean;
  method: 'bluetooth' | 'system';
  error?: string;
}

/**
 * Check if Bluetooth is available and permissions granted.
 */
export async function isBluetoothAvailable(): Promise<boolean> {
  if (!BTModule) return false;
  try {
    const enabled = await BTModule.BluetoothManager.isBluetoothEnabled();
    return !!enabled;
  } catch {
    return false;
  }
}

/**
 * Request Bluetooth permissions (Android 12+).
 */
export async function requestBluetoothPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') return true; // iOS handles via MFi/BLE

  if ((Platform.Version as number) >= 31) {
    // Android 12+
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return Object.values(granted).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
  } else {
    // Android < 12
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
}

/**
 * Scan for paired/available Bluetooth thermal printers.
 */
export async function scanPrinters(): Promise<PrinterDevice[]> {
  if (!BTModule) return [];
  try {
    await requestBluetoothPermission();
    const devices = await BTModule.BluetoothManager.scanDevices();
    return (devices || []).map((d: any) => ({
      name: d.name || 'Unknown',
      address: d.address,
      type: d.type || 'classic',
    }));
  } catch (e: any) {
    console.error('[BT] Scan error:', e);
    return [];
  }
}

/**
 * Get list of already paired devices.
 */
export async function getPairedDevices(): Promise<PrinterDevice[]> {
  if (!BTModule) return [];
  try {
    await requestBluetoothPermission();
    const devices = await BTModule.BluetoothManager.getpairedDevices();
    return (devices || []).map((d: any) => ({
      name: d.name || 'Unknown',
      address: d.address,
    }));
  } catch {
    return [];
  }
}

/**
 * Connect to a Bluetooth printer by address.
 */
export async function connectPrinter(address: string): Promise<boolean> {
  if (!BTModule) return false;
  try {
    await requestBluetoothPermission();
    await BTModule.BluetoothManager.connect(address);
    return true;
  } catch (e: any) {
    console.error('[BT] Connect error:', e);
    return false;
  }
}

/**
 * Disconnect from current printer.
 */
export async function disconnectPrinter(): Promise<void> {
  if (!BTModule) return;
  try {
    await BTModule.BluetoothManager.disconnect();
  } catch {}
}

/**
 * Send raw ESC/POS bytes to the connected printer.
 */
export async function sendRaw(data: Uint8Array): Promise<boolean> {
  if (!BTModule) return false;
  try {
    // Convert Uint8Array to base64 for the module
    const base64 = uint8ArrayToBase64(data);
    await BTModule.RawPrint.print(base64);
    return true;
  } catch (e: any) {
    console.error('[BT] Print error:', e);
    return false;
  }
}

/**
 * Print a ticket using ESC/POS commands.
 * Falls back to system print dialog if BT unavailable.
 */
export async function printTicket(data: TicketData, paperWidth: number = 72): Promise<PrintResult> {
  // Try Bluetooth first
  const btAvailable = await isBluetoothAvailable();
  if (btAvailable) {
    try {
      const escpos = createTicketBuilder(paperWidth);
      escpos.buildTicket(data);
      const bytes = escpos.getData();
      const sent = await sendRaw(bytes);
      if (sent) return { success: true, method: 'bluetooth' };
    } catch (e: any) {
      console.warn('[BT] Bluetooth print failed, falling back:', e.message);
    }
  }

  // Fallback: system print dialog via expo-print
  try {
    const { printAsync } = require('expo-print');
    const html = generateTicketHTML(data);
    await printAsync({ html, printerUrl: undefined });
    return { success: true, method: 'system' };
  } catch (e: any) {
    return { success: false, method: 'system', error: e.message };
  }
}

/**
 * Generate ticket HTML for system print fallback.
 */
function generateTicketHTML(data: TicketData): string {
  const {
    shopName = '', shopAddress = '', shopPhone = '', shopNif = '',
    clientNom = '', clientNif = '', items = [], total = '0',
    cashGiven = '', change = '', seller = '', date = '',
    currency = 'Kz', payMode = 'dinheiro', montantDinheiro = '',
    montantExpress = '', numeroFacture = '', flags = {},
  } = data;

  const itemsRows = (items || []).map(i => `
    <tr>
      <td style="width:50%;word-break:break-word;"><strong>${i.name}</strong><br><small>(${i.type || ''})</small></td>
      <td style="width:8%;text-align:center;"><strong>${i.qty}</strong></td>
      <td style="width:20%;text-align:right;">${i.price}</td>
      <td style="width:22%;text-align:right;"><strong>${i.subtotal || i.price}</strong></td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: 72mm auto; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; font-weight:700; }
    body { font-family:'Courier New',monospace; font-size:12px; width:72mm; padding:2mm 3mm; }
    .center { text-align:center; }
    .sep { border-top:2px solid #000; margin:4px 0; }
    .sep-d { border-top:1px dashed #000; margin:3px 0; }
    .shop-name { font-size:15px; font-weight:900; text-transform:uppercase; text-align:center; }
    .total { display:flex; justify-content:space-between; font-size:16px; font-weight:900; border-top:2px solid #000; padding:4px 0; }
    table { width:100%; border-collapse:collapse; font-size:11px; margin:2px 0; }
    th { font-size:10px; border-top:2px solid #000; border-bottom:1px dashed #000; padding:3px 1px; }
    td { padding:3px 1px; font-size:11px; }
    .row { display:flex; justify-content:space-between; font-size:12px; font-weight:900; padding:2px 0; }
  </style></head><body>
  <div class="center shop-name">${shopName}</div>
  <div class="center" style="font-size:11px;">${shopNif ? `NIF: ${shopNif}<br>` : ''}${shopPhone ? `Tel: ${shopPhone}<br>` : ''}${shopAddress || ''}</div>
  <div class="sep"></div>
  <div class="center" style="font-weight:900;">FACTURA RECIBO</div>
  ${numeroFacture ? `<div class="center" style="font-size:11px;">${numeroFacture}</div>` : ''}
  <div class="sep-d"></div>
  <div style="font-size:11px;">
    <div>Cliente: ${clientNom || 'CONSUMIDOR FINAL'}</div>
    <div>Data: ${date}</div>
    <div>Vendedor: ${(seller || '').toUpperCase()}</div>
  </div>
  <div class="sep"></div>
  <table><thead><tr><th>Descricao</th><th>Qtd</th><th style="text-align:right;">Preco</th><th style="text-align:right;">Total</th></tr></thead>
  <tbody>${itemsRows}</tbody></table>
  <div class="total"><span>TOTAL</span><span>${total} ${currency}</span></div>
  <div class="sep-d"></div>
  <div class="center" style="margin-top:7px;">OBRIGADO PELA SUA COMPRA!</div>
  <div class="center" style="font-size:9px;">CKBPOS v1.0.0</div>
  </body></html>`;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── Saved printer address ──────────────────────────────
import { getSetting, setSetting } from '../db/sqlite';

export async function getSavedPrinterAddress(): Promise<string | null> {
  return await getSetting('bt_printer_address');
}

export async function savePrinterAddress(address: string): Promise<void> {
  await setSetting('bt_printer_address', address);
}

export async function connectSavedPrinter(): Promise<boolean> {
  const address = await getSavedPrinterAddress();
  if (!address) return false;
  return await connectPrinter(address);
}
