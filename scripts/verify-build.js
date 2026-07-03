#!/usr/bin/env node
/**
 * CKBPOS Build Verification Script
 * ================================
 * 5-phase verification: Structure, Requires, Config, ASAR, Native Modules
 * 
 * Usage:
 *   node scripts/verify-build.js              # Full verification (pre-build)
 *   node scripts/verify-build.js --post-build # Includes ASAR inspection
 *   node scripts/verify-build.js --asar-only  # Only check ASAR contents
 * 
 * Exit codes: 0 = success, 1 = failure
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Configuration ──────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');

/**
 * Critical files that MUST exist in the project root or subdirectories.
 * Each entry: { path, required, category, description }
 */
const CRITICAL_FILES = [
  // Main Process
  { path: 'main.js', required: true, category: 'Main Process', desc: 'Electron main entry point' },
  { path: 'preload.js', required: true, category: 'Main Process', desc: 'IPC bridge' },
  { path: 'license-ipc.js', required: true, category: 'Main Process', desc: 'License IPC handlers' },
  { path: 'licensing.js', required: true, category: 'Main Process', desc: 'License validation logic' },
  { path: 'package.json', required: true, category: 'Main Process', desc: 'Project manifest' },

  // Database
  { path: 'database/db.js', required: true, category: 'Database', desc: 'SQLite database module' },
  { path: 'database/driveSync.js', required: true, category: 'Database', desc: 'Google Drive backup' },

  // Print Engine
  { path: 'src/utils/adaptive-print.js', required: true, category: 'Print Engine', desc: 'Adaptive print orchestrator' },
  { path: 'src/utils/printer-detect.js', required: true, category: 'Print Engine', desc: 'Printer detection' },
  { path: 'src/utils/escpos.js', required: true, category: 'Print Engine', desc: 'ESC/POS command generator' },

  // React Build Output
  { path: 'build/index.html', required: true, category: 'React Build', desc: 'Built React app' },

  // Assets
  { path: 'assets/icon.ico', required: true, category: 'Assets', desc: 'Windows app icon' },

  // Installer
  { path: 'installer.nsh', required: true, category: 'Installer', desc: 'NSIS custom script' },
];

/**
 * Main Process files to scan for require()/import statements.
 * Only files in the Main Process (not React/renderer) are scanned.
 */
const MAIN_PROCESS_FILES = [
  'main.js',
  'license-ipc.js',
  'licensing.js',
  'database/db.js',
  'database/driveSync.js',
  'src/utils/adaptive-print.js',
  'src/utils/printer-detect.js',
];

/**
 * Built-in Node.js modules — never need to be resolved on disk.
 */
const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
  'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline',
  'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

/**
 * Optional dependencies (try/catch wrapped in code) — warn but don't fail.
 */
const OPTIONAL_DEPS = new Set([
  'qrcode', 'nodemailer', 'xlsx', 'electron-updater',
]);

// ── Utilities ──────────────────────────────────────────────────

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, text) {
  console.log(`${color}${text}${COLORS.reset}`);
}

function pass(msg) { log(COLORS.green, `  ✅ ${msg}`); }
function fail(msg) { log(COLORS.red, `  ❌ ${msg}`); }
function warn(msg) { log(COLORS.yellow, `  ⚠️  ${msg}`); }
function info(msg) { log(COLORS.dim, `  ℹ️  ${msg}`); }
function section(title) { console.log(`\n${COLORS.bold}${COLORS.cyan}── ${title} ──${COLORS.reset}`); }

function fileExists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function findFileWithExtensions(basePath) {
  const extensions = ['', '.js', '.json', '.ts', '.jsx', '.tsx', '/index.js', '/index.json'];
  for (const ext of extensions) {
    if (fs.existsSync(path.join(ROOT, basePath + ext))) {
      return basePath + ext;
    }
  }
  return null;
}

// ── Phase 1: Structure Verification ────────────────────────────

function phase1_structure() {
  section('Phase 1/5 — Structure du projet');
  let errors = 0;
  let warnings = 0;

  for (const file of CRITICAL_FILES) {
    if (fileExists(file.path)) {
      pass(`${file.path} ${COLORS.dim}(${file.desc})${COLORS.reset}`);
    } else if (file.required) {
      fail(`${file.path} introuvable — ${file.desc}`);
      errors++;
    } else {
      warn(`${file.path} absent (optionnel) — ${file.desc}`);
      warnings++;
    }
  }

  // Check that src/utils/ directory has the 3 critical utils
  const utilsDir = path.join(ROOT, 'src', 'utils');
  if (fs.existsSync(utilsDir)) {
    const utilsFiles = fs.readdirSync(utilsDir).filter(f => f.endsWith('.js'));
    info(`${utilsFiles.length} fichiers dans src/utils/: ${utilsFiles.join(', ')}`);
  }

  return { errors, warnings };
}

// ── Phase 2: Require/Import Analysis ───────────────────────────

function phase2_requires() {
  section('Phase 2/5 — Analyse des require()');
  let errors = 0;
  let warnings = 0;
  const scanned = [];

  for (const file of MAIN_PROCESS_FILES) {
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) {
      fail(`${file} introuvable — impossible de scanner les require()`);
      errors++;
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const requires = extractRequires(content);

    for (const req of requires) {
      // Skip Node builtins
      if (NODE_BUILTINS.has(req.module)) continue;

      // Skip Electron modules
      if (req.module === 'electron' || req.module === 'electron-store') continue;

      // Check if it's a local require
      if (req.module.startsWith('./') || req.module.startsWith('../')) {
        const resolved = findFileWithExtensions(path.join(path.dirname(file), req.module));
        if (resolved) {
          scanned.push({ from: file, module: req.module, resolved, status: 'ok' });
        } else {
          fail(`${file}:${req.line} — require('${req.module}') → fichier introuvable`);
          errors++;
        }
      } else {
        // npm package — check node_modules
        const pkgDir = path.join(ROOT, 'node_modules', req.module);
        if (fs.existsSync(pkgDir)) {
          scanned.push({ from: file, module: req.module, resolved: `node_modules/${req.module}`, status: 'ok' });
        } else if (OPTIONAL_DEPS.has(req.module)) {
          warn(`${file}:${req.line} — require('${req.module}') → package optionnel absent`);
          warnings++;
        } else {
          fail(`${file}:${req.line} — require('${req.module}') → package npm introuvable`);
          errors++;
        }
      }
    }

    if (errors === 0) {
      pass(`${file} — ${requires.length} require() analysés, tous valides`);
    }
  }

  return { errors, warnings, scanned };
}

/**
 * Extract require() calls from source code.
 * Handles: require('...'), require("..."), require(`...`)
 * Also handles dynamic requires inside try/catch.
 */
function extractRequires(content) {
  const results = [];
  const lines = content.split('\n');

  // Pattern 1: require('...') or require("...")
  const requireRegex = /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    let match;
    const lineRegex = /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    while ((match = lineRegex.exec(line)) !== null) {
      results.push({ module: match[1], line: i + 1 });
    }
  }

  return results;
}

// ── Phase 3: Package.json Build Config Validation ──────────────

function phase3_config() {
  section('Phase 3/5 — Configuration packaging');
  let errors = 0;
  let warnings = 0;

  const pkgPath = path.join(ROOT, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    fail('package.json introuvable');
    return { errors: 1, warnings: 0 };
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const build = pkg.build;

  if (!build) {
    fail('Section "build" absente de package.json');
    return { errors: 1, warnings: 0 };
  }

  pass('Section "build" présente');

  // Validate build.files patterns
  if (build.files && Array.isArray(build.files)) {
    for (const pattern of build.files) {
      if (pattern.includes('*')) {
        // Glob pattern — check directory exists
        const baseDir = pattern.replace(/\*\*\/\*/, '').replace(/\*\.*/, '');
        if (baseDir && fileExists(baseDir)) {
          pass(`build.files: "${pattern}" → dossier existe`);
        } else if (baseDir) {
          fail(`build.files: "${pattern}" → dossier "${baseDir}" introuvable`);
          errors++;
        }
      } else {
        // Exact file
        if (fileExists(pattern)) {
          pass(`build.files: "${pattern}" → fichier existe`);
        } else {
          fail(`build.files: "${pattern}" → fichier introuvable`);
          errors++;
        }
      }
    }
  }

  // Validate asarUnpack
  if (build.asarUnpack && Array.isArray(build.asarUnpack)) {
    for (const pattern of build.asarUnpack) {
      const pkgName = pattern.replace('node_modules/', '').replace('/**/*', '');
      const pkgDir = path.join(ROOT, 'node_modules', pkgName);
      if (fs.existsSync(pkgDir)) {
        pass(`asarUnpack: "${pkgName}" → package présent`);
      } else {
        fail(`asarUnpack: "${pkgName}" → package introuvable dans node_modules`);
        errors++;
      }
    }
  }

  // Check that key files are in build.files
  const expectedInFiles = [
    'main.js', 'preload.js', 'license-ipc.js', 'licensing.js',
    'license-keys.json', 'build/**/*', 'database/**/*', 'assets/**/*',
  ];

  for (const expected of expectedInFiles) {
    if (!build.files.includes(expected)) {
      warn(`build.files ne contient pas "${expected}" — peut-être oublié`);
      warnings++;
    }
  }

  // Check native modules are in asarUnpack
  const expectedUnpack = ['better-sqlite3', 'ws', '@supabase'];
  for (const pkg of expectedUnpack) {
    const pattern = `node_modules/${pkg}/**/*`;
    if (!build.asarUnpack.includes(pattern)) {
      warn(`asarUnpack ne contient pas "${pkg}" — native module pourrait manquer`);
      warnings++;
    }
  }

  // Check publish config
  if (build.publish) {
    pass(`Publish config: GitHub (${build.publish.owner}/${build.publish.repo})`);
  } else {
    warn('Pas de config publish — auto-update pourrait ne pas fonctionner');
    warnings++;
  }

  // Check icon exists
  if (build.win && build.win.icon) {
    if (fileExists(build.win.icon)) {
      pass(`Icone Windows: ${build.win.icon}`);
    } else {
      fail(`Icone Windows: ${build.win.icon} introuvable`);
      errors++;
    }
  }

  return { errors, warnings };
}

// ── Phase 4: ASAR Inspection ───────────────────────────────────

function phase4_asar(postBuild) {
  section('Phase 4/5 — Vérification app.asar');

  if (!postBuild) {
    info('Ignoré (utilisez --post-build pour activer)');
    return { errors: 0, warnings: 0, skipped: true };
  }

  // Find app.asar in dist/
  const asarPath = findAsar();
  if (!asarPath) {
    warn('app.asar non trouvé dans dist/ — build pas encore effectué');
    return { errors: 0, warnings: 1, skipped: true };
  }

  pass(`app.asar trouvé: ${path.relative(ROOT, asarPath)}`);

  let errors = 0;

  try {
    const asarContents = parseAsarHeader(asarPath);
    if (!asarContents) {
      fail('Impossible de parser l\'en-tête asar');
      return { errors: 1, warnings: 0, skipped: false };
    }

    const files = Object.keys(asarContents.files || {});

    // Check critical files in asar
    const criticalInAsar = [
      'main.js',
      'preload.js',
      'license-ipc.js',
      'licensing.js',
      'license-keys.json',
      'package.json',
      'database/db.js',
      'database/driveSync.js',
      'src/utils/adaptive-print.js',
      'src/utils/printer-detect.js',
      'src/utils/escpos.js',
      'build/index.html',
    ];

    for (const file of criticalInAsar) {
      if (files.includes(file)) {
        pass(`app.asar contient ${file}`);
      } else {
        fail(`app.asar NE contient PAS ${file}`);
        errors++;
      }
    }

    // Check that React src files are NOT in asar (after build.files fix)
    const unwantedPatterns = ['src/pages/', 'src/components/', 'src/styles/', 'src/config/'];
    let unwantedCount = 0;
    for (const file of files) {
      for (const pattern of unwantedPatterns) {
        if (file.startsWith(pattern)) {
          unwantedCount++;
          break;
        }
      }
    }

    if (unwantedCount === 0) {
      pass('Aucun fichier React inutile dans l\'asar');
    } else {
      warn(`${unwantedCount} fichiers React inutiles détectés dans l'asar (src/pages/, src/components/, etc.)`);
    }

    // Check asar.unpacked/ exists for native modules
    const unpackedDir = asarPath.replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(unpackedDir)) {
      pass('app.asar.unpacked/ présent pour les modules natifs');
    } else {
      warn('app.asar.unpacked/ absent — les modules natifs pourraient ne pas fonctionner');
    }

    info(`${files.length} fichiers total dans l'asar`);

  } catch (err) {
    fail(`Erreur lors de la lecture asar: ${err.message}`);
    errors++;
  }

  return { errors, warnings: 0, skipped: false };
}

function findAsar() {
  // Look in dist/ for app.asar
  if (!fs.existsSync(DIST_DIR)) return null;

  const searchDirs = (dir) => {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.name === 'app.asar') return fullPath;
      if (entry.isDirectory()) {
        const found = searchDirs(fullPath);
        if (found) return found;
      }
    }
    return null;
  };

  return searchDirs(DIST_DIR);
}

/**
 * Parse asar header without requiring @electron/asar.
 * ASAR format: 4-byte magic "asar" + 4-byte header size + 4-byte header size (again) + JSON header
 */
function parseAsarHeader(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  try {
    const headerBuf = Buffer.alloc(16);
    fs.readSync(fd, headerBuf, 0, 16, 0);

    // Check magic bytes "asar"
    const magic = headerBuf.toString('ascii', 0, 4);
    if (magic !== 'asar') {
      return null;
    }

    // Header size at offset 4 (uint32 LE)
    const headerSize = headerBuf.readUInt32LE(4);

    // Read the JSON header
    const headerJson = Buffer.alloc(headerSize);
    fs.readSync(fd, headerJson, 0, headerSize, 16);

    return JSON.parse(headerJson.toString('utf-8'));
  } finally {
    fs.closeSync(fd);
  }
}

// ── Phase 5: Native Modules ────────────────────────────────────

function phase5_native() {
  section('Phase 5/5 — Modules natifs');
  let errors = 0;
  let warnings = 0;

  const nativeModules = [
    { name: 'better-sqlite3', desc: 'SQLite native addon (C++)' },
    { name: 'ws', desc: 'WebSocket (optionnel native)' },
  ];

  for (const mod of nativeModules) {
    const pkgDir = path.join(ROOT, 'node_modules', mod.name);
    if (!fs.existsSync(pkgDir)) {
      fail(`${mod.name} absent de node_modules`);
      errors++;
      continue;
    }

    // Check for native build artifacts
    const bindingGyp = path.join(pkgDir, 'binding.gyp');
    const buildDir = path.join(pkgDir, 'build');
    const hasNative = fs.existsSync(bindingGyp);

    if (hasNative) {
      if (fs.existsSync(buildDir)) {
        pass(`${mod.name} — natif compilé (${mod.desc})`);
      } else {
        warn(`${mod.name} — binding.gyp présent mais build/ absent — exécutez npm rebuild`);
        warnings++;
      }
    } else {
      pass(`${mod.name} — pure JS ou pré-compilé (${mod.desc})`);
    }
  }

  // Check electron-rebuild status
  try {
    const electronVersion = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf-8')
    ).version;
    pass(`Electron v${electronVersion}`);
  } catch {
    warn('Impossible de lire la version d\'Electron');
    warnings++;
  }

  return { errors, warnings };
}

// ── Main ───────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const postBuild = args.includes('--post-build') || args.includes('--asar-only');
  const asarOnly = args.includes('--asar-only');

  console.log('');
  log(COLORS.bold + COLORS.cyan, '╔══════════════════════════════════════════════════╗');
  log(COLORS.bold + COLORS.cyan, '║       CKBPOS Build Verification Script           ║');
  log(COLORS.bold + COLORS.cyan, '║                  v1.0.0                          ║');
  log(COLORS.bold + COLORS.cyan, '╚══════════════════════════════════════════════════╝');

  const results = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  if (!asarOnly) {
    const r1 = phase1_structure();
    results.push({ name: 'Structure du projet', errors: r1.errors, warnings: r1.warnings });
    totalErrors += r1.errors;
    totalWarnings += r1.warnings;

    const r2 = phase2_requires();
    results.push({ name: 'Modules require()', errors: r2.errors, warnings: r2.warnings });
    totalErrors += r2.errors;
    totalWarnings += r2.warnings;

    const r3 = phase3_config();
    results.push({ name: 'Config packaging', errors: r3.errors, warnings: r3.warnings });
    totalErrors += r3.errors;
    totalWarnings += r3.warnings;
  }

  const r4 = phase4_asar(postBuild);
  results.push({ name: 'app.asar', errors: r4.errors, warnings: r4.warnings, skipped: r4.skipped });
  totalErrors += r4.errors;
  totalWarnings += r4.warnings;

  const r5 = phase5_native();
  results.push({ name: 'Modules natifs', errors: r5.errors, warnings: r5.warnings });
  totalErrors += r5.errors;
  totalWarnings += r5.warnings;

  // ── Report ──
  console.log('\n');
  log(COLORS.bold, '╔══════════════════════════════════════════════════╗');
  log(COLORS.bold, '║              RAPPORT DE VÉRIFICATION             ║');
  log(COLORS.bold, '╠══════════════════════════════════════════════════╣');

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const num = `[${i + 1}/${results.length}]`;
    const name = r.name.padEnd(25);
    let status;
    if (r.skipped) {
      status = `${COLORS.yellow}⏭️  SKIP${COLORS.reset}`;
    } else if (r.errors > 0) {
      status = `${COLORS.red}❌ FAIL (${r.errors} erreur${r.errors > 1 ? 's' : ''})${COLORS.reset}`;
    } else {
      status = `${COLORS.green}✅ PASS${COLORS.reset}`;
    }
    console.log(`║  ${COLORS.dim}${num}${COLORS.reset} ${name} ${status}`);
  }

  log(COLORS.bold, '╠══════════════════════════════════════════════════╣');

  if (totalWarnings > 0) {
    log(COLORS.yellow, `║  ⚠️  ${totalWarnings} avertissement${totalWarnings > 1 ? 's' : ''}`);
  }

  if (totalErrors === 0) {
    log(COLORS.bold + COLORS.green, '║  🎉 AUCUNE ERREUR DÉTECTÉE');
    log(COLORS.green, '║  Le build peut procéder en toute sécurité.');
  } else {
    log(COLORS.bold + COLORS.red, `║  🚫 ${totalErrors} ERREUR${totalErrors > 1 ? 'S' : ''} DÉTECTÉE${totalErrors > 1 ? 'S' : ''}`);
    log(COLORS.red, '║  Build annulé. Corrigez les erreurs ci-dessus.');
  }

  log(COLORS.bold, '╚══════════════════════════════════════════════════╝');
  console.log('');

  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
