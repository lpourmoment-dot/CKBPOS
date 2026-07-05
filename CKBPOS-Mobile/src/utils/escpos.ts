/**
 * ESC/POS Command Generator for CKBPOS Mobile
 * TypeScript port — pure JS, no npm dependencies.
 * Generates raw ESC/POS byte sequences for thermal printers.
 * Compatible with react-native-bluetooth-escpos-printer.
 */

const ESC = 0x1B;
const GS = 0x1D;
const FS = 0x1C;
const DLE = 0x10;
const FF = 0x0C;

export const CODEPAGE: Record<string, number> = {
  cp437: 0x00, cp850: 0x02, cp860: 0x03, cp863: 0x04,
  cp865: 0x05, cp1252: 0x10, cp858: 0x13, utf8: 0x49,
};

export const BARCODE: Record<string, number> = {
  UPC_A: 0x00, UPC_E: 0x01, EAN13: 0x02, EAN8: 0x03,
  CODE39: 0x04, ITF: 0x05, CODABAR: 0x06, CODE93: 0x07, CODE128: 0x08,
};

export interface ESCPOSOptions {
  codepage?: string;
  paperWidth?: number;
  dpi?: number;
}

export interface TicketData {
  shopName?: string;
  shopAddress?: string;
  shopPhone?: string;
  shopNif?: string;
  clientNom?: string;
  clientNif?: string;
  items?: Array<{ name: string; qty: number; price: string; subtotal: string; type?: string }>;
  total?: string;
  cashGiven?: string;
  change?: string;
  seller?: string;
  date?: string;
  currency?: string;
  payMode?: string;
  montantDinheiro?: string;
  montantExpress?: string;
  numeroFacture?: string;
  segundaVia?: boolean;
  statut?: string;
  flags?: Record<string, boolean>;
  appVersion?: string;
}

export class ESCPOS {
  private buffer: number[] = [];
  public paperWidth: number;

  constructor(options: ESCPOSOptions = {}) {
    this.paperWidth = options.paperWidth || 80;
  }

  reset(): this {
    this.buffer = [];
    return this;
  }

  /** Get raw bytes as Uint8Array for Bluetooth transmission */
  getData(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  /** Get hex string representation */
  getHex(): string {
    return Array.from(this.buffer).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private _push(...bytes: (number | number[])[]): this {
    for (const b of bytes) {
      if (Array.isArray(b)) {
        this.buffer.push(...b.map(v => v & 0xFF));
      } else {
        this.buffer.push(b & 0xFF);
      }
    }
    return this;
  }

  private _pushStr(str: string): this {
    // UTF-8 encode
    const encoder = new TextEncoder();
    const encoded = encoder.encode(str);
    for (let i = 0; i < encoded.length; i++) {
      this.buffer.push(encoded[i]);
    }
    return this;
  }

  initialize(): this {
    this._push(ESC, 0x40);
    return this;
  }

  setBold(enabled: boolean): this {
    this._push(ESC, 0x45, enabled ? 1 : 0);
    return this;
  }

  setDoubleHeight(enabled: boolean): this {
    this._push(ESC, 0x21, enabled ? 0x10 : 0x00);
    return this;
  }

  setDoubleWidth(enabled: boolean): this {
    this._push(ESC, 0x21, enabled ? 0x20 : 0x00);
    return this;
  }

  setDoubleSize(enabled: boolean): this {
    this._push(ESC, 0x21, enabled ? 0x30 : 0x00);
    return this;
  }

  setUnderline(mode: number = 1): this {
    this._push(ESC, 0x2D, mode);
    return this;
  }

  setFontMode(bold = false, doubleHeight = false, doubleWidth = false, underline = false): this {
    let n = 0;
    if (bold) n |= 0x08;
    if (doubleHeight) n |= 0x10;
    if (doubleWidth) n |= 0x20;
    if (underline) n |= 0x80;
    this._push(ESC, 0x21, n);
    return this;
  }

  setCharacterSize(widthMultiplier = 0, heightMultiplier = 0): this {
    const n = ((heightMultiplier & 0x07) << 4) | (widthMultiplier & 0x07);
    this._push(GS, 0x21, n);
    return this;
  }

  setSizeNormal(): this { return this.setCharacterSize(0, 0); }
  setSizeLarge(): this { return this.setCharacterSize(1, 1); }
  setSizeExtraLarge(): this { return this.setCharacterSize(2, 2); }

  setAlignment(align: number): this {
    this._push(ESC, 0x61, align);
    return this;
  }

  alignLeft(): this { return this.setAlignment(0); }
  alignCenter(): this { return this.setAlignment(1); }
  alignRight(): this { return this.setAlignment(2); }

  setLineSpacing(dots: number): this {
    this._push(ESC, 0x33, dots);
    return this;
  }

  resetLineSpacing(): this {
    this._push(ESC, 0x32);
    return this;
  }

  setCodePage(page: string | number): this {
    const code = typeof page === 'number' ? page : (CODEPAGE[page] || 0x00);
    this._push(ESC, 0x74, code);
    return this;
  }

  printRaw(data: Uint8Array | number[]): this {
    if (data instanceof Uint8Array) {
      for (let i = 0; i < data.length; i++) this.buffer.push(data[i]);
    } else {
      this._push(...data);
    }
    return this;
  }

  printLine(text: string): this {
    this._pushStr(String(text));
    this._push(0x0A);
    return this;
  }

  print(text: string): this {
    this._pushStr(String(text));
    return this;
  }

  feedLine(): this {
    this._push(0x0A);
    return this;
  }

  feedPaper(lines: number = 1): this {
    this._push(ESC, 0x64, lines);
    return this;
  }

  printSeparator(): this {
    const cols = this.paperWidth === 58 ? 32 : 48;
    this._pushStr('-'.repeat(cols));
    this._push(0x0A);
    return this;
  }

  printDashedSeparator(): this {
    const cols = this.paperWidth === 58 ? 32 : 48;
    this._pushStr('='.repeat(cols));
    this._push(0x0A);
    return this;
  }

  printColumns(leftText: string, rightText: string): this {
    const cols = this.paperWidth === 58 ? 32 : 48;
    const leftLen = leftText.length;
    const rightLen = rightText.length;
    const spaces = Math.max(1, cols - leftLen - rightLen);
    this._pushStr(leftText + ' '.repeat(spaces) + rightText);
    this._push(0x0A);
    return this;
  }

  printTotalLine(label: string, value: string): this {
    this.setBold(true);
    this.printColumns(label, value);
    this.setBold(false);
    return this;
  }

  printQRCode(data: string, options: { version?: number; errorCorrection?: string; moduleSize?: number } = {}): this {
    const { errorCorrection = 'M', moduleSize = 6 } = options;
    const ecMap: Record<string, number> = { L: 0x30, M: 0x31, Q: 0x32, H: 0x33 };
    const ecLevel = ecMap[errorCorrection] || 0x31;
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    const dataLen = dataBytes.length;

    this._push(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    this._push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, moduleSize);
    this._push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, ecLevel);
    const pL = (dataLen + 3) & 0xFF;
    const pH = ((dataLen + 3) >> 8) & 0xFF;
    this._push(GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30);
    this.printRaw(dataBytes);
    this._push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
    return this;
  }

  printBarcode(data: string, type: number = BARCODE.CODE128, height: number = 50, showText: boolean = true): this {
    this._push(GS, 0x68, height);
    this._push(GS, 0x48, showText ? 2 : 0);
    this._push(GS, 0x6B, type);
    this._pushStr(data);
    this._push(0x00);
    return this;
  }

  cutFull(): this {
    this._push(GS, 0x56, 0x00);
    return this;
  }

  cutPartial(): this {
    this._push(GS, 0x56, 0x01);
    return this;
  }

  feedAndCut(lines: number = 3): this {
    this.feedPaper(lines);
    this.cutFull();
    return this;
  }

  beep(n: number = 1, t: number = 2): this {
    this._push(ESC, 0x42, n, t);
    return this;
  }

  printImage(bitmap: Uint8Array, width: number, height: number): this {
    const pL = width & 0xFF;
    const pH = (width >> 8) & 0xFF;
    const nL = height & 0xFF;
    const nH = (height >> 8) & 0xFF;
    this._push(GS, 0x76, 0x30, pL, pH, nL, nH);
    this.printRaw(bitmap);
    return this;
  }

  buildTicket(data: TicketData): this {
    const {
      shopName = '', shopAddress = '', shopPhone = '', shopNif = '',
      clientNom = '', clientNif = '', items = [], total = '0',
      cashGiven = '', change = '', seller = '', date = '',
      currency = 'Kz', payMode = 'dinheiro', montantDinheiro = '',
      montantExpress = '', numeroFacture = '', segundaVia = false,
      statut = '', flags = {}, appVersion = '',
    } = data;

    const cols = this.paperWidth === 58 ? 32 : 48;

    this.initialize();
    this.alignCenter();
    if (shopName) {
      this.setBold(true);
      this.setCharacterSize(1, 0);
      this.printLine(shopName);
      this.setCharacterSize(0, 0);
      this.setBold(false);
    }
    if (shopNif && flags.showNif !== false) this.printLine(`NIF: ${shopNif}`);
    if (shopPhone && flags.showPhone !== false) this.printLine(`Tel: ${shopPhone}`);
    if (shopAddress && flags.showAddress !== false) this.printLine(shopAddress);

    this.alignLeft();
    this.printSeparator();
    this.alignCenter();
    this.setBold(true);
    this.printLine('FACTURA RECIBO');
    this.setBold(false);
    if (numeroFacture && flags.showFactureNum !== false) this.printLine(numeroFacture);
    if (flags.showSecondaVia !== false) this.printLine(segundaVia ? '2a via' : 'Original');

    this.alignLeft();
    this.printDashedSeparator();

    if (flags.showClientNom !== false) this.printColumns('Cliente:', clientNom || 'CONSUMIDOR FINAL');
    if (flags.showClientNif !== false) this.printColumns('NIF:', clientNif || 'CONSUMIDOR FINAL');
    this.printColumns('Data:', date);
    if (flags.showSeller !== false) this.printColumns('Vendedor:', (seller || '').toUpperCase());

    if (statut === 'annule') {
      this.feedLine();
      this.alignCenter();
      this.setBold(true);
      this.printLine('*** ANULADO ***');
      this.setBold(false);
      this.alignLeft();
    }

    this.printSeparator();

    // Items header
    const h1 = this._padOrTruncate('Descricao', Math.floor(cols * 0.5), 'left');
    const h2 = this._padOrTruncate('Qtd', Math.floor(cols * 0.1), 'center');
    const h3 = this._padOrTruncate('Preco', Math.floor(cols * 0.18), 'right');
    const h4 = this._padOrTruncate('Total', Math.floor(cols * 0.22), 'right');
    this.setBold(true);
    this._pushStr(h1 + h2 + h3 + h4);
    this._push(0x0A);
    this.setBold(false);

    for (const item of items) {
      const name = String(item.name || '').substring(0, Math.floor(cols * 0.5));
      const qty = String(item.qty || '');
      const price = String(item.price || '');
      const subtotal = String(item.subtotal || item.price || '');
      const c1 = this._padOrTruncate(name, Math.floor(cols * 0.5), 'left');
      const c2 = this._padOrTruncate(qty, Math.floor(cols * 0.1), 'center');
      const c3 = this._padOrTruncate(price, Math.floor(cols * 0.18), 'right');
      const c4 = this._padOrTruncate(subtotal, Math.floor(cols * 0.22), 'right');
      this._pushStr(c1 + c2 + c3 + c4);
      this._push(0x0A);
      if (item.type) { this.print(`  (${item.type})`); this.feedLine(); }
    }

    this.printSeparator();
    this.setBold(true);
    this.setCharacterSize(1, 0);
    this.printTotalLine('TOTAL', `${total} ${currency}`);
    this.setCharacterSize(0, 0);
    this.setBold(false);

    this.feedLine();
    this.setBold(true);
    this.printLine('FORMA DE PAGAMENTO');
    this.setBold(false);
    this.printDashedSeparator();

    const payLabel = payMode === 'dinheiro' ? 'Numerario' : payMode === 'express' ? 'App Express' : 'Misto';
    this.printColumns(payLabel.toUpperCase(),
      payMode === 'misto' ? `${total} ${currency}` :
      payMode === 'dinheiro' ? `${montantDinheiro} ${currency}` :
      `${montantExpress} ${currency}`
    );

    if (payMode === 'misto') {
      this.print(`  └ Numerario: ${montantDinheiro} ${currency}`); this.feedLine();
      this.print(`  └ App Express: ${montantExpress} ${currency}`); this.feedLine();
    }
    this.printDashedSeparator();

    if (payMode === 'dinheiro' && cashGiven) this.printColumns('Recebido:', `${cashGiven} ${currency}`);
    if (change && change !== '0' && change !== '0,00') this.printColumns('Troco:', `${change} ${currency}`);

    this.printSeparator();
    this.alignCenter();
    if (flags.showObrigado !== false) this.printLine('OBRIGADO PELA SUA COMPRA!');
    if (flags.showVersion !== false) { this.print(`CKBPOS v${appVersion}`); this.feedLine(); }

    this.feedAndCut(3);
    return this;
  }

  private _padOrTruncate(str: string, width: number, align: string = 'left'): string {
    const s = String(str || '');
    const len = s.length;
    if (len >= width) return s.substring(0, width);
    const pad = width - len;
    if (align === 'right') return ' '.repeat(pad) + s;
    if (align === 'center') {
      const leftPad = Math.floor(pad / 2);
      return ' '.repeat(leftPad) + s + ' '.repeat(pad - leftPad);
    }
    return s + ' '.repeat(pad);
  }
}

export function createESCPOS(options: ESCPOSOptions = {}): ESCPOS {
  return new ESCPOS(options);
}

export function createTicketBuilder(paperWidth: number = 80): ESCPOS {
  return new ESCPOS({ paperWidth });
}
