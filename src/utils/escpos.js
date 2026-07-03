/**
 * ESC/POS Command Generator for CKBPOS
 * Pure JS implementation — no npm dependencies.
 * Generates raw ESC/POS byte sequences for thermal printers.
 */

// ── ESC/POS Command Constants ──────────────────────────────
const ESC = 0x1B;
const GS  = 0x1D;
const FS  = 0x1C;
const DLE = 0x10;
const FF  = 0x0C;

// Character code tables
const CODEPAGE = {
  cp437:  0x00,
  cp850:  0x02,
  cp860:  0x03,
  cp863:  0x04,
  cp865:  0x05,
  cp1252: 0x10,
  cp858:  0x13,
  utf8:   0x49, // Some printers support UTF-8 natively
};

// Barcode types
const BARCODE = {
  UPC_A:    0x00,
  UPC_E:    0x01,
  EAN13:    0x02,
  EAN8:     0x03,
  CODE39:   0x04,
  ITF:      0x05,
  CODABAR:  0x06,
  CODE93:   0x07,
  CODE128:  0x08,
};

class ESCPOS {
  constructor(options = {}) {
    this.buffer = [];
    this.codepage = options.codepage || 'cp437';
    this.paperWidth = options.paperWidth || 80; // mm (58 or 80)
    this.dpi = options.dpi || 203;
    this.encoding = options.encoding || 'binary';
  }

  // ── Buffer Management ────────────────────────────────────

  reset() {
    this.buffer = [];
    return this;
  }

  getData() {
    return Buffer.from(this.buffer);
  }

  getHex() {
    return Buffer.from(this.buffer).toString('hex');
  }

  _push(...bytes) {
    for (const b of bytes) {
      if (Array.isArray(b)) {
        this.buffer.push(...b);
      } else {
        this.buffer.push(b & 0xFF);
      }
    }
    return this;
  }

  _pushStr(str, encoding = 'ascii') {
    const buf = Buffer.from(str, encoding);
    for (let i = 0; i < buf.length; i++) {
      this.buffer.push(buf[i]);
    }
    return this;
  }

  // ── Initialize ───────────────────────────────────────────

  /**
   * Initialize printer (ESC @)
   * Resets printer to default state
   */
  initialize() {
    this._push(ESC, 0x40); // ESC @
    return this;
  }

  // ── Text Formatting ──────────────────────────────────────

  /**
   * Set print mode (ESC ! n)
   * n is a bitmask:
   *   bit 0: bold
   *   bit 1: double height
   *   bit 2: double width
   *   bit 3: underline
   *   bit 4: strike-through
   *   bit 5: double height + double width
   */
  setBold(enabled) {
    this._push(ESC, 0x45, enabled ? 1 : 0);
    return this;
  }

  setDoubleHeight(enabled) {
    this._push(ESC, 0x21, enabled ? 0x10 : 0x00);
    return this;
  }

  setDoubleWidth(enabled) {
    this._push(ESC, 0x21, enabled ? 0x20 : 0x00);
    return this;
  }

  setDoubleSize(enabled) {
    this._push(ESC, 0x21, enabled ? 0x30 : 0x00);
    return this;
  }

  setUnderline(mode = 1) {
    // 0: off, 1: 1-dot, 2: 2-dot
    this._push(ESC, 0x2D, mode);
    return this;
  }

  setStrikeThrough(enabled) {
    this._push(ESC, 0x21, enabled ? 0x40 : 0x00);
    return this;
  }

  /**
   * Combined font mode (ESC ! n)
   * More flexible than individual setters
   */
  setFontMode(bold = false, doubleHeight = false, doubleWidth = false, underline = false) {
    let n = 0;
    if (bold)          n |= 0x08;
    if (doubleHeight)  n |= 0x10;
    if (doubleWidth)   n |= 0x20;
    if (underline)     n |= 0x80;
    this._push(ESC, 0x21, n);
    return this;
  }

  /**
   * Set character size (GS ! n)
   * n bits: 0-3 = height multiplier, 4-7 = width multiplier
   * 0 = 1x, 1 = 2x, ... 7 = 8x
   */
  setCharacterSize(widthMultiplier = 0, heightMultiplier = 0) {
    const n = ((heightMultiplier & 0x07) << 4) | (widthMultiplier & 0x07);
    this._push(GS, 0x21, n);
    return this;
  }

  /**
   * Simple size presets
   */
  setSizeNormal() {
    return this.setCharacterSize(0, 0);
  }

  setSizeLarge() {
    return this.setCharacterSize(1, 1);
  }

  setSizeExtraLarge() {
    return this.setCharacterSize(2, 2);
  }

  // ── Alignment ────────────────────────────────────────────

  /**
   * Set alignment (ESC a n)
   * 0 = left, 1 = center, 2 = right
   */
  setAlignment(align) {
    this._push(ESC, 0x61, align);
    return this;
  }

  alignLeft()   { return this.setAlignment(0); }
  alignCenter() { return this.setAlignment(1); }
  alignRight()  { return this.setAlignment(2); }

  // ── Line Spacing ─────────────────────────────────────────

  /**
   * Set line spacing (ESC 3 n)
   * n = spacing in dots
   */
  setLineSpacing(dots) {
    this._push(ESC, 0x33, dots);
    return this;
  }

  /**
   * Reset line spacing to default
   */
  resetLineSpacing() {
    this._push(ESC, 0x32);
    return this;
  }

  /**
   * Set character spacing (ESC SP n)
   * n = spacing in dots (0-255)
   */
  setCharacterSpacing(dots) {
    this._push(ESC, 0x20, dots);
    return this;
  }

  // ── Code Page ────────────────────────────────────────────

  /**
   * Select character code table (ESC t n)
   */
  setCodePage(page) {
    const code = typeof page === 'number' ? page : (CODEPAGE[page] || 0x00);
    this._push(ESC, 0x74, code);
    return this;
  }

  // ── Printing ─────────────────────────────────────────────

  /**
   * Print text (raw bytes)
   */
  printRaw(data) {
    if (Buffer.isBuffer(data)) {
      for (let i = 0; i < data.length; i++) {
        this.buffer.push(data[i]);
      }
    } else if (Array.isArray(data)) {
      this._push(...data);
    }
    return this;
  }

  /**
   * Print text string with line feed
   */
  printLine(text) {
    this._pushStr(String(text), 'utf8');
    this._push(0x0A); // LF
    return this;
  }

  /**
   * Print text string WITHOUT line feed
   */
  print(text) {
    this._pushStr(String(text), 'utf8');
    return this;
  }

  /**
   * Print line feed only
   */
  feedLine() {
    this._push(0x0A);
    return this;
  }

  /**
   * Feed paper n lines (ESC d n)
   */
  feedPaper(lines = 1) {
    this._push(ESC, 0x64, lines);
    return this;
  }

  // ── Separator Lines ──────────────────────────────────────

  /**
   * Print solid separator line
   */
  printSeparator() {
    const cols = this.paperWidth === 58 ? 32 : 48;
    this._pushStr('-'.repeat(cols), 'ascii');
    this._push(0x0A);
    return this;
  }

  /**
   * Print dashed separator line
   */
  printDashedSeparator() {
    const cols = this.paperWidth === 58 ? 32 : 48;
    this._pushStr('='.repeat(cols), 'ascii');
    this._push(0x0A);
    return this;
  }

  // ── Column Printing ──────────────────────────────────────

  /**
   * Print a line with two columns, right-aligned second column
   */
  printColumns(leftText, rightText) {
    const cols = this.paperWidth === 58 ? 32 : 48;
    const leftLen = this._visibleLength(leftText);
    const rightLen = this._visibleLength(rightText);
    const spaces = Math.max(1, cols - leftLen - rightLen);
    this._pushStr(leftText, 'utf8');
    this._pushStr(' '.repeat(spaces), 'ascii');
    this._pushStr(rightText, 'utf8');
    this._push(0x0A);
    return this;
  }

  /**
   * Print a line with three columns
   */
  printThreeColumns(col1, col2, col3) {
    const cols = this.paperWidth === 58 ? 32 : 48;
    const w1 = Math.floor(cols * 0.45);
    const w2 = Math.floor(cols * 0.15);
    const w3 = cols - w1 - w2;

    const t1 = this._padOrTruncate(col1, w1, 'left');
    const t2 = this._padOrTruncate(col2, w2, 'center');
    const t3 = this._padOrTruncate(col3, w3, 'right');

    this._pushStr(t1 + t2 + t3, 'utf8');
    this._push(0x0A);
    return this;
  }

  /**
   * Print a bold total line (two columns)
   */
  printTotalLine(label, value) {
    this.setBold(true);
    this.printColumns(label, value);
    this.setBold(false);
    return this;
  }

  // ── QR Code ──────────────────────────────────────────────

  /**
   * Print QR Code using GS ( k commands
   * Version 1-10 (0 = auto), Error correction L/M/Q/H
   */
  printQRCode(data, options = {}) {
    const {
      version = 0,
      errorCorrection = 'M',
      moduleSize = 6,
    } = options;

    const ecMap = { L: 0x30, M: 0x31, Q: 0x32, H: 0x33 };
    const ecLevel = ecMap[errorCorrection] || 0x31;

    // Store data in symbol (GS ( k pL pH fn cn)
    const dataBytes = Buffer.from(data, 'utf8');
    const dataLen = dataBytes.length;

    // Function 1: Set symbol model
    this._push(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);

    // Function 2: Set size
    this._push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, moduleSize);

    // Function 3: Set error correction
    this._push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, ecLevel);

    // Function 4: Store data
    const pL = (dataLen + 3) & 0xFF;
    const pH = ((dataLen + 3) >> 8) & 0xFF;
    this._push(GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30);
    this.printRaw(dataBytes);

    // Function 5: Print
    this._push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);

    return this;
  }

  // ── Barcode ──────────────────────────────────────────────

  /**
   * Print barcode (GS k m d1...dk NUL)
   */
  printBarcode(data, type = BARCODE.CODE128, height = 50, showText = true) {
    // Set barcode height
    this._push(GS, 0x68, height);
    // Set HRI text position (0 = not printed, 1 = above, 2 = below, 3 = both)
    this._push(GS, 0x48, showText ? 2 : 0);
    // Print barcode
    this._push(GS, 0x6B, type);
    this._pushStr(data, 'ascii');
    this._push(0x00);
    return this;
  }

  // ── Cut Paper ────────────────────────────────────────────

  /**
   * Full cut (GS V m)
   * m = 0: full cut, m = 1: partial cut
   */
  cutFull() {
    this._push(GS, 0x56, 0x00);
    return this;
  }

  /**
   * Partial cut (GS V m)
   */
  cutPartial() {
    this._push(GS, 0x56, 0x01);
    return this;
  }

  /**
   * Feed and cut (GS V m n)
   * Feed n lines then cut
   */
  feedAndCut(lines = 3) {
    this.feedPaper(lines);
    this.cutFull();
    return this;
  }

  // ── Beep ─────────────────────────────────────────────────

  /**
   * Sound buzzer (ESC B n t)
   * n = number of beeps (1-8), t = time (1-8, each = 50ms)
   */
  beep(n = 1, t = 2) {
    this._push(ESC, 0x42, n, t);
    return this;
  }

  // ── Image / Raster ───────────────────────────────────────

  /**
   * Print raster image using GS v 0
   * @param {Buffer} bitmap - monochrome bitmap data
   * @param {number} width - width in dots
   * @param {number} height - height in dots
   */
  printImage(bitmap, width, height) {
    const bytesPerLine = Math.ceil(width / 8);
    const pL = width & 0xFF;
    const pH = (width >> 8) & 0xFF;
    const nL = height & 0xFF;
    const nH = (height >> 8) & 0xFF;

    // GS v 0 m xL xH yL yH d1...dk
    this._push(GS, 0x76, 0x30, pL, pH, nL, nH);
    this.printRaw(bitmap);

    return this;
  }

  // ── Complete Ticket Builder ──────────────────────────────

  /**
   * Build a complete ticket from structured data
   */
  buildTicket(data) {
    const {
      shopName = '',
      shopAddress = '',
      shopPhone = '',
      shopNif = '',
      clientNom = '',
      clientNif = '',
      items = [],
      total = '0',
      cashGiven = '',
      change = '',
      seller = '',
      date = '',
      currency = 'Kz',
      payMode = 'dinheiro',
      montantDinheiro = '',
      montantExpress = '',
      numeroFacture = '',
      segundaVia = false,
      statut = '',
      flags = {},
    } = data;

    const cols = this.paperWidth === 58 ? 32 : 48;

    this.initialize();

    // ── Shop Header ──
    this.alignCenter();
    if (shopName) {
      this.setBold(true);
      this.setCharacterSize(1, 0); // double width
      this.printLine(shopName);
      this.setCharacterSize(0, 0); // reset
      this.setBold(false);
    }
    if (shopNif && flags.showNif !== false) {
      this.printLine(`NIF: ${shopNif}`);
    }
    if (shopPhone && flags.showPhone !== false) {
      this.printLine(`Tel: ${shopPhone}`);
    }
    if (shopAddress && flags.showAddress !== false) {
      this.printLine(shopAddress);
    }

    // ── Separator ──
    this.alignLeft();
    this.printSeparator();

    // ── Invoice Title ──
    this.alignCenter();
    this.setBold(true);
    this.printLine('FACTURA RECIBO');
    this.setBold(false);
    if (numeroFacture && flags.showFactureNum !== false) {
      this.printLine(numeroFacture);
    }
    if (flags.showSecondaVia !== false) {
      this.printLine(segundaVia ? '2a via' : 'Original');
    }

    // ── Separator ──
    this.alignLeft();
    this.printDashedSeparator();

    // ── Client Info ──
    if (flags.showClientNom !== false) {
      this.printColumns('Cliente:', clientNom || 'CONSUMIDOR FINAL');
    }
    if (flags.showClientNif !== false) {
      this.printColumns('NIF:', clientNif || 'CONSUMIDOR FINAL');
    }
    this.printColumns('Data:', date);
    if (flags.showSeller !== false) {
      this.printColumns('Vendedor:', (seller || '').toUpperCase());
    }

    // ── Legal Mention ──
    if (flags.showMentionLegal !== false && shopAddress) {
      this.feedLine();
      this.printLine(`Os bens/Servicos foram colocados a disposicao do adquirente na data do documento: ${shopAddress}.`);
    }

    // ── Cancelled notice ──
    if (statut === 'annule') {
      this.feedLine();
      this.alignCenter();
      this.setBold(true);
      this.printLine('*** ANULADO ***');
      this.setBold(false);
      this.alignLeft();
    }

    // ── Separator ──
    this.printSeparator();

    // ── Items ──
    this.alignLeft();
    // Header
    const h1 = this._padOrTruncate('Descricao', Math.floor(cols * 0.5), 'left');
    const h2 = this._padOrTruncate('Qtd', Math.floor(cols * 0.1), 'center');
    const h3 = this._padOrTruncate('Preco', Math.floor(cols * 0.18), 'right');
    const h4 = this._padOrTruncate('Total', Math.floor(cols * 0.22), 'right');
    this.setBold(true);
    this._pushStr(h1 + h2 + h3 + h4, 'utf8');
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
      this._pushStr(c1 + c2 + c3 + c4, 'utf8');
      this._push(0x0A);

      // Item type on next line (small)
      if (item.type) {
        this.print(`  (${item.type})`);
        this.feedLine();
      }
    }

    // ── Total ──
    this.printSeparator();
    this.setBold(true);
    this.setCharacterSize(1, 0);
    this.printTotalLine('TOTAL', `${total} ${currency}`);
    this.setCharacterSize(0, 0);
    this.setBold(false);

    // ── Payment Info ──
    this.feedLine();
    this.setBold(true);
    this.printLine('FORMA DE PAGAMENTO');
    this.setBold(false);
    this.printDashedSeparator();

    const payLabel = payMode === 'dinheiro' ? 'Numerario' :
                     payMode === 'express' ? 'App Express' : 'Misto';
    this.printColumns(payLabel.toUpperCase(),
      payMode === 'misto' ? `${total} ${currency}` :
      payMode === 'dinheiro' ? `${montantDinheiro} ${currency}` :
      `${montantExpress} ${currency}`
    );

    if (payMode === 'misto') {
      this.print(`  └ Numerario: ${montantDinheiro} ${currency}`);
      this.feedLine();
      this.print(`  └ App Express: ${montantExpress} ${currency}`);
      this.feedLine();
    }

    this.printDashedSeparator();

    if (payMode === 'dinheiro' && cashGiven) {
      this.printColumns('Recebido:', `${cashGiven} ${currency}`);
    }
    if (change && change !== '0' && change !== '0,00') {
      this.printColumns('Troco:', `${change} ${currency}`);
    }

    // ── Footer ──
    this.printSeparator();
    this.alignCenter();
    if (flags.showObrigado !== false) {
      this.printLine('OBRIGADO PELA SUA COMPRA!');
    }
    if (flags.showVersion !== false) {
      this.print(`CKBPOS v${data.appVersion || ''}`);
      this.feedLine();
    }

    // ── Feed + Cut ──
    this.feedAndCut(3);

    return this;
  }

  // ── Helper Methods ───────────────────────────────────────

  /**
   * Get visible length of string (ignoring ANSI-like sequences if any)
   */
  _visibleLength(str) {
    return String(str).length;
  }

  /**
   * Pad or truncate string to target width
   */
  _padOrTruncate(str, width, align = 'left') {
    const s = String(str || '');
    const len = s.length;
    if (len >= width) {
      return s.substring(0, width);
    }
    const pad = width - len;
    if (align === 'right') {
      return ' '.repeat(pad) + s;
    } else if (align === 'center') {
      const leftPad = Math.floor(pad / 2);
      const rightPad = pad - leftPad;
      return ' '.repeat(leftPad) + s + ' '.repeat(rightPad);
    }
    return s + ' '.repeat(pad);
  }
}

// ── Factory Functions ──────────────────────────────────────

function createESCPOS(options = {}) {
  return new ESCPOS(options);
}

function createTicketBuilder(paperWidth = 80) {
  return new ESCPOS({ paperWidth });
}

module.exports = {
  ESCPOS,
  createESCPOS,
  createTicketBuilder,
  CODEPAGE,
  BARCODE,
};
