# CKBPOS Anti-Error Build/Packaging System — Implementation Plan

## Project Analysis Summary

### Current State Audit

| File | Lines | Requires (local) | Requires (npm) | In build.files? |
|------|-------|-------------------|-----------------|------------------|
| `main.js` | 5171 | `./license-ipc`, `./src/utils/adaptive-print`, `./src/utils/printer-detect`, `./src/utils/escpos`, `./database/driveSync`, `./database/db`, `./package.json` | electron, path, fs, electron-store, qrcode, electron-updater | ✅ |
| `preload.js` | 279 | (none local) | electron | ✅ |
| `license-ipc.js` | 251 | `./licensing` | @supabase/supabase-js, ws | ✅ |
| `licensing.js` | 79 | (none local) | fs, path, crypto, jsonwebtoken | ✅ |
| `database/db.js` | 638 | (none local) | better-sqlite3, path, electron, bcryptjs, crypto | ✅ |
| `database/driveSync.js` | 158 | (none local) | googleapis, fs, path, electron, electron-store | ✅ |
| `src/utils/adaptive-print.js` | 534 | `./printer-detect`, `./escpos` | path, os, fs, electron | ✅ (via `src/**/*`) |
| `src/utils/printer-detect.js` | 299 | (none local) | child_process | ✅ (via `src/**/*`) |
| `src/utils/escpos.js` | 703 | (none local) | (none — pure JS) | ✅ (via `src/**/*`) |

### Issues Found

1. **`credentials.json`** — required by `database/driveSync.js` (line 8) but NOT in `build.files`. This is intentional (user must provide), but startup will crash without it.
2. **`preload-license-additions.js`** — exists at root but is NOT in `build.files`. It's a reference/snippet file (not imported at runtime), so this is fine.
3. **`src/**/*` is included** — the raw React source is bundled into the asar. Only `build/**/*` is needed for the renderer. The `src/utils/*.js` files are needed for main process, but the rest (`src/pages/`, `src/components/`, `src/styles/`) are dead weight.
4. **No build verification** exists — the only check is whether electron-builder exits 0.
5. **No CI/CD** — builds are local-only.
6. **No startup protection** — if a native module (better-sqlite3) fails to load, the user sees a raw Node.js crash dialog.

---

## Task 1: `verify-build.js` — Pre-Build Verification Script

### File: `scripts/verify-build.js`

This is the central piece. It runs as a Node.js script (no extra deps) and performs 5 verification phases.

### Architecture

```
Phase 1: Structure Check
  → Verify all critical files exist on disk
  
Phase 2: Dependency Scan
  → Parse require()/import from Main Process files
  → Verify each local target exists
  
Phase 3: Build Config Validation
  → Match build.files globs against actual files
  → Verify asarUnpack targets exist in node_modules
  
Phase 4: Asar Inspection (post-build)
  → Open app.asar, list contents
  → Verify critical files are inside
  
Phase 5: Report
  → Console output + write report JSON
```

### Key Functions

```javascript
// ── Phase 1: Structure ───────────────────────────────────
function checkProjectStructure(projectRoot) → { passed: string[], failed: string[] }

// ── Phase 2: Dependency Scan ─────────────────────────────
function scanRequireStatements(filePath) → string[]
  // Parses require('./...') and import '...' patterns
  // Resolves relative paths to actual files
  // Returns list of { source, target, exists }

// ── Phase 3: Build Config ────────────────────────────────
function validateBuildConfig(projectRoot, pkg) → { passed: string[], warnings: string[] }
  // Expands build.files globs using fast-glob equivalent (Node fs.readdirSync)
  // Verifies asarUnpack paths exist in node_modules/
  // Checks assets/icon.ico exists for win.icon

// ── Phase 4: Asar Inspection ─────────────────────────────
function inspectAsar(asarPath) → string[]
  // Uses @electron/asar (already available via electron-builder dep)
  // Falls back to reading asar header manually if @electron/asar not available
  // Lists all entries, checks critical files

// ── Phase 5: Report ──────────────────────────────────────
function generateReport(results) → { success: boolean, phases: {...} }
  // Writes JSON to verify-build-report.json
  // Prints colored console output
  // Exits with code 1 if any phase failed
```

### Critical Files List (to verify in all phases)

These files MUST exist in the built asar for the app to start:

```
Main Process (top-level):
  main.js
  preload.js
  license-ipc.js
  licensing.js
  license-keys.json

Main Process (database/):
  database/db.js
  database/driveSync.js

Main Process (src/utils/ — loaded by main.js):
  src/utils/adaptive-print.js
  src/utils/printer-detect.js
  src/utils/escpos.js

Renderer (React build output):
  build/index.html
  build/static/js/*.js
  build/static/css/*.css

Native Modules (unpacked):
  node_modules/better-sqlite3/  (directory)
  node_modules/ws/              (directory)
  node_modules/@supabase/       (directory)

Assets:
  assets/icon.ico

Config:
  package.json
```

### Require/Import Scanner Logic

The scanner uses regex to extract local require/import paths:

```javascript
const REQUIRE_REGEX = /require\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g;
const IMPORT_REGEX = /import\s+.*?from\s+['"](\.\.?\/[^'"]+)['"]/g;
const DYNAMIC_REQUIRE_REGEX = /require\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g;
```

For each match, resolve the path relative to the source file's directory and check `fs.existsSync()`. Handle both `./file` and `./directory/index.js` patterns.

Files to scan (all main-process files):
- `main.js`
- `license-ipc.js`
- `licensing.js`
- `database/db.js`
- `database/driveSync.js`
- `src/utils/adaptive-print.js`
- `src/utils/printer-detect.js`
- `src/utils/escpos.js`

### Build.files Glob Expansion

Since we can't use `fast-glob` (zero-dep constraint), implement a simple recursive glob:

```javascript
function expandGlob(baseDir, pattern) → string[]
  // Handle: exact file, dir/**/*, dir/** patterns
  // Use fs.readdirSync recursively
  // Filter by extension when specified
```

### Asar Inspection Approach

Two strategies, with fallback:

**Strategy A**: If `@electron/asar` is importable (it's a dep of electron-builder):
```javascript
const asar = require('@electron/asar');
const header = asar.extractAll('dist/win-unpacked/resources/app.asar', '/tmp/asar-check');
// or: asar.listPackage('dist/win-unpacked/resources/app.asar')
```

**Strategy B**: Parse the asar header manually (asar format is documented):
- Read first 16 bytes: header size (LE uint32) + header size again
- Parse JSON header
- Check file entries exist

### Console Output Format

```
╔══════════════════════════════════════════════════════════╗
║          CKBPOS Build Verification Report                ║
╚══════════════════════════════════════════════════════════╝

Phase 1: Project Structure
  ✅ main.js
  ✅ preload.js
  ✅ license-ipc.js
  ✅ database/db.js
  ❌ MISSING: credentials.json (WARN — user-provided)

Phase 2: Dependency Scan
  ✅ main.js → ./license-ipc → license-ipc.js
  ✅ main.js → ./database/db → database/db.js
  ✅ license-ipc.js → ./licensing → licensing.js
  ...

Phase 3: Build Config
  ✅ build.files matches 47 files
  ✅ asarUnpack: better-sqlite3 found
  ✅ asarUnpack: ws found
  ✅ asarUnpack: @supabase/* found
  ⚠️  src/pages/ (12 files) bundled but not needed at runtime

Phase 4: Asar Inspection
  ✅ app.asar exists (2.4 MB)
  ✅ Critical files found in asar: 9/9
  ✅ Native modules unpacked: better-sqlite3, ws, @supabase

══════════════════════════════════════════════════════════
RESULT: PASS (1 warning)
══════════════════════════════════════════════════════════
```

### CLI Usage

```bash
# Pre-build check (Phase 1-3)
node scripts/verify-build.js --pre-build

# Post-build check (Phase 4, requires built app)
node scripts/verify-build.js --post-build dist/win-unpacked

# Full check (Phases 1-4, for CI)
node scripts/verify-build.js --full dist/win-unpacked

# Just scan requires
node scripts/verify-build.js --scan
```

---

## Task 2: Improved electron-builder Config

### File: `package.json` (modify `build` section)

#### Changes to `build.files`:

**Problem**: `src/**/*` bundles the entire React source (pages, components, styles) into the asar. Only `src/utils/*.js` is needed by main.js.

**Fix**: Be explicit about what goes in:

```json
"files": [
  "main.js",
  "preload.js",
  "license-ipc.js",
  "licensing.js",
  "license-keys.json",
  "package.json",
  "build/**/*",
  "database/**/*",
  "src/utils/adaptive-print.js",
  "src/utils/printer-detect.js",
  "src/utils/escpos.js",
  "assets/**/*",
  "installer.nsh"
]
```

**Rationale**:
- `src/pages/**`, `src/components/**`, `src/styles/**`, `src/config/**`, `src/index.js`, `src/App.js` — only needed at React build time, not at runtime. The built React app lives in `build/`.
- `src/utils/adaptive-print.js`, `src/utils/printer-detect.js`, `src/utils/escpos.js` — these ARE needed by main.js at runtime.
- `package.json` — explicitly included so `require('./package.json').version` works in the asar.
- `installer.nsh` — electron-builder reads this during NSIS compilation, not needed in asar, but including it is harmless and prevents edge-case issues.

#### Changes to `asarUnpack`:

Keep as-is. The current config is correct:
```json
"asarUnpack": [
  "node_modules/better-sqlite3/**/*",
  "node_modules/ws/**/*",
  "node_modules/@supabase/**/*"
]
```

#### New: Add `extraFiles` for credentials.json (optional):

```json
"extraFiles": [
  {
    "from": "credentials.json",
    "to": "credentials.json",
    "filter": ["credentials.json"]
  }
]
```

This ensures `credentials.json` is placed next to the exe (outside asar) so `driveSync.js` can find it. However, since credentials.json is user-specific, we should handle its absence gracefully instead. **Recommendation**: Don't include in build — instead, add startup protection (Task 4).

#### New: Add `asar` validation via custom hook:

Not needed — the verify-build.js script handles this.

#### Summary of package.json changes:

```json
{
  "scripts": {
    "start": "electron .",
    "dev": "concurrently \"npm run react-start\" \"wait-on http://localhost:3000 && electron .\"",
    "react-start": "react-scripts start",
    "react-build": "react-scripts build",
    "dist": "electron-builder --win",
    "publish-update": "electron-builder --win --publish always",
    "rebuild": "electron-rebuild -f -w better-sqlite3",
    "postinstall": "electron-rebuild -f -w better-sqlite3",
    "predist": "npm run react-build && npm run rebuild",
    "verify": "node scripts/verify-build.js --pre-build",
    "verify:full": "node scripts/verify-build.js --full dist/win-unpacked",
    "verify:post": "node scripts/verify-build.js --post-build dist/win-unpacked"
  }
}
```

---

## Task 3: GitHub Actions CI/CD Pipeline

### File: `.github/workflows/build.yml`

#### Workflow Design

```
trigger: push to main, pull_request to main, tag v*
runner: windows-latest

jobs:
  build-and-verify:
    steps:
      1. Checkout
      2. Setup Node.js 20
      3. npm ci
      4. electron-rebuild
      5. npm run react-build
      6. npm run verify (pre-build check)
      7. npm run dist
      8. npm run verify:post (asar check)
      9. Upload artifact (installer)
      10. Publish (only on tag push)
```

#### Detailed Steps

```yaml
name: Build & Verify CKBPOS

on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: windows-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Rebuild native modules
        run: npx @electron/rebuild -f -w better-sqlite3

      - name: Build React app
        run: npm run react-build

      - name: Pre-build verification
        run: node scripts/verify-build.js --pre-build

      - name: Build Electron app
        run: npx electron-builder --win

      - name: Post-build verification
        run: node scripts/verify-build.js --post-build dist/win-unpacked

      - name: Upload installer
        uses: actions/upload-artifact@v4
        with:
          name: CKBPOS-Installer
          path: dist/*.exe
          retention-days: 30

      - name: Publish release
        if: startsWith(github.ref, 'refs/tags/v')
        uses: actions/create-release@v1
        with:
          tag_name: ${{ github.ref }}
          release_name: CKBPOS ${{ github.ref }}
          files: dist/*.exe
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### Conditional publish note

The `publish` config in package.json already has GitHub provider. For automatic publishing via electron-builder:
```yaml
- name: Publish
  if: startsWith(github.ref, 'refs/tags/v')
  run: npx electron-builder --win --publish always
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### Secrets needed:
- `GITHUB_TOKEN` — automatic in GitHub Actions, no setup needed

#### Environment matrix (optional future):
```yaml
strategy:
  matrix:
    node-version: [20, 22]
```

---

## Task 4: Startup Protection in `main.js`

### File: `scripts/startup-guard.js` (new utility)
### File: `main.js` (modify top ~30 lines)

#### Approach

Create a `startup-guard.js` module that validates critical file existence BEFORE any `require()` calls. If files are missing, show a professional Electron dialog and exit gracefully.

#### startup-guard.js — Key Functions

```javascript
// scripts/startup-guard.js

const fs = require('fs');
const path = require('path');

/**
 * Critical files that MUST exist for the app to function.
 * Path is relative to app root (dirname of main.js).
 */
const CRITICAL_FILES = [
  // Main process
  'main.js',
  'preload.js',
  'license-ipc.js',
  'licensing.js',
  'license-keys.json',
  'package.json',
  // Database layer
  'database/db.js',
  'database/driveSync.js',
  // Print engine (loaded eagerly by main.js)
  'src/utils/adaptive-print.js',
  'src/utils/printer-detect.js',
  'src/utils/escpos.js',
  // React build output
  'build/index.html',
  // Assets
  'assets/icon.ico',
];

/**
 * Files that are important but app can degrade gracefully without.
 */
const OPTIONAL_FILES = [
  'credentials.json',    // Google Drive — user may not set up
];

/**
 * Native modules that must load successfully.
 */
const CRITICAL_NATIVE_MODULES = [
  'better-sqlite3',
];

/**
 * Validate all critical files exist.
 * Returns { ok: boolean, missing: string[], warnings: string[] }
 */
function validateStartup(appRoot) {
  const missing = [];
  const warnings = [];

  // Check critical files
  for (const file of CRITICAL_FILES) {
    const fullPath = path.join(appRoot, file);
    if (!fs.existsSync(fullPath)) {
      missing.push(file);
    }
  }

  // Check optional files (warnings only)
  for (const file of OPTIONAL_FILES) {
    const fullPath = path.join(appRoot, file);
    if (!fs.existsSync(fullPath)) {
      warnings.push(file);
    }
  }

  // Check native modules can be resolved
  for (const mod of CRITICAL_NATIVE_MODULES) {
    try {
      require.resolve(mod);
    } catch (e) {
      missing.push(`node_modules/${mod} (native module)`);
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    warnings,
  };
}

module.exports = { validateStartup, CRITICAL_FILES, OPTIONAL_FILES };
```

#### Integration into main.js

Replace the top of `main.js` (before any other requires) with:

```javascript
// ── Startup Guard (must be first — before any require) ────
const path = require('path');
const fs = require('fs');

// Only run validation when packaged (not in dev)
if (require('electron').app.isPackaged) {
  const { validateStartup } = require('./scripts/startup-guard');
  const result = validateStartup(__dirname);
  
  if (!result.ok) {
    // Show professional dialog, then exit
    const { app, dialog } = require('electron');
    app.whenReady().then(() => {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'CKBPOS — Erreur de démarrage',
        message: 'Fichiers critiques manquants',
        detail: [
          'Les fichiers suivants sont introuvables :',
          '',
          ...result.missing.map(f => `  • ${f}`),
          '',
          'Veuillez réinstaller CKBPOS ou contacter le support.',
          '',
          `Chemin d'installation : ${__dirname}`,
        ].join('\n'),
        buttons: ['Quitter'],
        defaultId: 0,
      });
      app.exit(1);
    });
    // Prevent any further code from executing
    throw new Error('Startup validation failed');
  }
  
  // Show warnings for optional files
  if (result.warnings.length > 0) {
    console.warn('[CKBPOS] Fichiers optionnels manquants:', result.warnings);
  }
}

// ── Normal main.js continues below ────────────────────────
const { registerLicenseIPC, incrementSalesCounter } = require('./license-ipc');
// ... rest of existing main.js
```

**Key design decisions**:
1. Guard runs ONLY when packaged (`app.isPackaged`). In dev, files are always on disk.
2. Uses `dialog.showMessageBoxSync` (sync) so it blocks until user clicks OK, then exits.
3. The `throw new Error` after `app.exit(1)` ensures no further code in main.js executes.
4. The guard is at the very top of the file, before any other requires.

#### Handling driveSync.js credentials.json issue

In `database/driveSync.js`, the `getOAuth2Client()` function already checks for credentials.json and throws. We should wrap the require in main.js to prevent crash:

In `main.js` line ~704, change:
```javascript
// Before:
const driveSync = require('./database/driveSync');

// After:
let driveSync = null;
try { driveSync = require('./database/driveSync'); } catch(e) {
  console.warn('[CKBPOS] Google Drive désactivé:', e.message);
}
```

And guard the IPC handlers:
```javascript
ipcMain.handle('drive-auth', async () => {
  if (!driveSync) return { success: false, error: 'Google Drive non configuré (credentials.json manquant)' };
  // ... existing code
});
```

---

## Integration Points

### How scripts connect to npm scripts

```
npm run dist
  → preinstall: electron-rebuild
  → predist: react-build + rebuild
  → electron-builder --win
  → verify-build.js --post-build (manual or CI)

CI Pipeline:
  npm ci → rebuild → react-build → verify --pre-build → dist → verify --post-build → upload
```

### Package.json script additions:

```json
{
  "scripts": {
    "verify": "node scripts/verify-build.js --pre-build",
    "verify:full": "node scripts/verify-build.js --full dist/win-unpacked",
    "verify:post": "node scripts/verify-build.js --post-build dist/win-unpacked",
    "dist:verified": "npm run verify && npm run dist && npm run verify:post"
  }
}
```

### Flow diagram:

```
Developer pushes to main
        │
        ▼
GitHub Actions triggers build.yml
        │
        ├── checkout
        ├── npm ci
        ├── electron-rebuild
        ├── react-scripts build
        ├── verify-build.js --pre-build    ← Phase 1-3
        │     └── FAIL? → build stops, report uploaded as artifact
        │
        ├── electron-builder --win
        │
        ├── verify-build.js --post-build   ← Phase 4
        │     └── FAIL? → build stops
        │
        ├── upload installer artifact
        │
        └── (if tag) publish to GitHub Releases
```

---

## Complete File List

### Files to CREATE:

| File | Purpose | Lines (est.) |
|------|---------|--------------|
| `scripts/verify-build.js` | Pre/post build verification | ~400 |
| `scripts/startup-guard.js` | Startup file validation | ~100 |
| `.github/workflows/build.yml` | CI/CD pipeline | ~80 |

### Files to MODIFY:

| File | Change |
|------|--------|
| `package.json` | Add verify scripts, tighten build.files |
| `main.js` | Add startup guard at top, wrap driveSync require |
| `database/driveSync.js` | (Optional) Improve error message for missing credentials.json |

### Files UNCHANGED:

- `preload.js` — no changes needed
- `license-ipc.js` — no changes needed
- `licensing.js` — no changes needed
- `database/db.js` — no changes needed
- `src/utils/*.js` — no changes needed
- `installer.nsh` — no changes needed

---

## Risks and Edge Cases

### 1. `@electron/asar` not importable in verify-build.js

**Risk**: The script assumes `@electron/asar` is available for Phase 4 inspection.

**Mitigation**: Implement fallback — parse the asar header manually. The asar format is:
- 4 bytes: pickled header size (LE uint32)
- 4 bytes: same value (unpickled header size)  
- 4 bytes: "ASAR" magic
- 4 bytes: offset to header (LE uint32)
- N bytes: header JSON

```javascript
function readAsarHeader(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  const buf = Buffer.alloc(16);
  fs.readSync(fd, buf, 0, 16, 0);
  fs.closeSync(fd);
  
  const headerSize = buf.readUInt32LE(0);
  const headerOffset = buf.readUInt32LE(12);
  
  const fd2 = fs.openSync(asarPath, 'r');
  const headerBuf = Buffer.alloc(headerSize);
  fs.readSync(fd2, headerBuf, 0, headerSize, headerOffset);
  fs.closeSync(fd2);
  
  return JSON.parse(headerBuf.toString('utf8'));
}
```

### 2. `src/utils/*.js` path in asar

**Risk**: When we change `build.files` from `src/**/*` to explicit utils paths, electron-builder may not include the directory structure correctly.

**Mitigation**: Verify-build.js Phase 3 checks that glob expansion finds the files. Also test locally before first CI run.

### 3. electron-builder version 24 + Electron 41 compatibility

**Risk**: electron-builder 24 may not fully support Electron 41.

**Mitigation**: The current setup already works (user confirmed builds succeed). The verify-build.js script catches regressions. If issues arise, upgrade to electron-builder 25+.

### 4. better-sqlite3 rebuild in CI

**Risk**: `@electron/rebuild` may fail on the GitHub Actions Windows runner if node-gyp or Visual Studio Build Tools aren't available.

**Mitigation**: Use `windows-latest` runner which includes VS Build Tools. Add explicit `npm install -g node-gyp` if needed. The CI step `npx @electron/rebuild -f -w better-sqlite3` handles this.

### 5. credentials.json absence

**Risk**: driveSync.js requires credentials.json at import time (line 8: `const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json')`). Even though it only throws when `getOAuth2Client()` is called, the path resolution at import time is fine — the error only happens when the function runs.

**Mitigation**: The existing try/catch in main.js line 203 already handles this. The startup guard lists it as optional. No change needed.

### 6. `require('./package.json').version` in asar

**Risk**: Inside an asar, `require('./package.json')` should work since package.json is in build.files. But in some edge cases, the package.json in the asar root may be the packed one, not the project one.

**Mitigation**: Explicitly include `package.json` in build.files (added in Task 2). The verify-build.js script checks this.

### 7. Native module paths inside asar vs unpacked

**Risk**: better-sqlite3 is listed in asarUnpack, but if the unpack path doesn't match exactly, the native .node file may be inside the asar and fail to load.

**Mitigation**: Phase 4 of verify-build.js explicitly checks that `node_modules/better-sqlite3/` exists as an unpacked directory, not inside the asar entries.

### 8. Startup guard `throw` prevents main.js from loading

**Risk**: The `throw new Error('Startup validation failed')` at the top of main.js will crash the process, not show the dialog cleanly.

**Mitigation**: The dialog is shown with `showMessageBoxSync` (blocks) before the throw. The user sees the dialog, clicks OK, then the process exits. The throw is a safety net to prevent any code from running after the dialog. In practice, `app.exit(1)` is called inside `whenReady()`, and the throw prevents the rest of main.js from executing synchronously.

**Better approach**: Instead of throwing, restructure main.js to use a guard pattern:

```javascript
// At the very top of main.js
const { app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

if (app.isPackaged) {
  const { validateStartup } = require('./scripts/startup-guard');
  const result = validateStartup(__dirname);
  
  if (!result.ok) {
    app.whenReady().then(() => {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'CKBPOS — Erreur de démarrage',
        message: 'Fichiers critiques manquants',
        detail: `Fichiers manquants :\n${result.missing.join('\n')}\n\nRéinstallez CKBPOS.`,
        buttons: ['Quitter'],
      });
      app.exit(1);
    });
    // Return early — no more code runs
    // But this requires wrapping all subsequent code in an if/else
  }
}
```

**Final approach**: Wrap the entire main.js content in a function, call it only if validation passes:

```javascript
// top of main.js
const { app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function main() {
  // ... ALL existing main.js code goes here ...
}

if (app.isPackaged) {
  const { validateStartup } = require('./scripts/startup-guard');
  const result = validateStartup(__dirname);
  if (!result.ok) {
    app.whenReady().then(() => {
      dialog.showMessageBoxSync({ /* ... */ });
      app.exit(1);
    });
  } else {
    main();
  }
} else {
  main();
}
```

**Problem with this**: The 5171-line main.js would need to be wrapped. That's a big diff.

**Best approach**: Minimal change — add the guard at the top, use `app.whenReady()` for the dialog, and set a global flag:

```javascript
// At the very top of main.js:
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

let STARTUP_OK = true;
if (app.isPackaged) {
  try {
    const { validateStartup } = require('./scripts/startup-guard');
    const result = validateStartup(__dirname);
    if (!result.ok) {
      STARTUP_OK = false;
      app.whenReady().then(() => {
        const { dialog } = require('electron');
        dialog.showMessageBoxSync({
          type: 'error',
          title: 'CKBPOS — Erreur de démarrage',
          message: 'Fichiers critiques manquants',
          detail: `Fichiers manquants :\n${result.missing.join('\n')}\n\nRéinstallez CKBPOS.`,
          buttons: ['Quitter'],
        });
        app.exit(1);
      });
    }
  } catch (e) {
    console.error('[CKBPOS] Startup guard failed:', e);
  }
}

// Guard: if startup failed, skip all initialization
if (!STARTUP_OK) {
  // App will exit after dialog. Prevent any further requires.
  module.exports = {};
} else {
  // ... existing main.js code from line 1 onward ...
}
```

**Wait** — this won't work because the `else` block would need to contain 5171 lines.

**Simplest correct approach**: Don't change main.js structure at all. Instead, the startup guard checks files exist, and if not, shows dialog and calls `app.exit(1)` before main.js's own requires run. The key insight: Node.js evaluates `require()` calls at the point they appear. So if we put the guard BEFORE the first `require('./license-ipc')`, and `app.exit(1)` is called synchronously via `app.whenReady()`, the rest of the file never executes.

But `app.whenReady()` is async... 

**Final final approach**: Use `app.on('ready', ...)` pattern. Since `main.js` currently uses `app.whenReady().then(...)` at line 199, we can add the guard check before that:

Actually, the simplest and most robust approach:

```javascript
// TOP OF main.js — before line 1
const { app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Startup Guard ─────────────────────────────────────────
if (app.isPackaged) {
  try {
    const { validateStartup } = require('./scripts/startup-guard');
    const result = validateStartup(path.dirname(__filename || __dirname));
    if (!result.ok) {
      // Block on dialog, then exit. Nothing below will run.
      app.whenReady().then(() => {
        dialog.showMessageBoxSync({
          type: 'error',
          title: 'CKBPOS — Erreur de démarrage',
          message: 'Fichiers critiques manquants',
          detail: [
            'Les fichiers suivants sont introuvables :',
            '',
            ...result.missing.map(f => '  • ' + f),
            '',
            'Veuillez réinstaller CKBPOS ou contacter le support.',
          ].join('\n'),
          buttons: ['Quitter'],
          defaultId: 0,
        });
        app.exit(1);
      });
      // Throw to halt further execution
      throw new Error('Startup validation failed — dialog shown');
    }
  } catch (e) {
    if (e.message.includes('Startup validation failed')) {
      // Re-throw to prevent main.js from continuing
      // But this will crash... 
    }
  }
}
```

**The real solution**: Since we can't easily stop Node.js from executing the rest of the file, the best approach is to wrap the guard around the module loading:

```javascript
// At the top of main.js:
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function startupCheck() {
  if (!app.isPackaged) return true;
  try {
    const { validateStartup } = require('./scripts/startup-guard');
    return validateStartup(__dirname).ok;
  } catch { return true; } // If guard itself fails, let app try to start
}

if (startupCheck()) {
  // All original main.js code here (unchanged)
  const { registerLicenseIPC, incrementSalesCounter } = require('./license-ipc');
  // ... etc
}
```

But this requires indenting 5171 lines. Not practical.

**Pragmatic solution**: Add the guard as a separate pre-main script. Use electron's `MAIN_WINDOW_PRELOAD_WEBPACK` or simply create a wrapper:

**Actually, the simplest approach that works**: The guard script is required at the top. If validation fails, it calls `process.exit(1)` after showing the dialog. Since `process.exit()` kills the Node.js process immediately, nothing else runs.

```javascript
// startup-guard.js
function validateAndExit(appRoot) {
  const result = validateStartup(appRoot);
  if (result.ok) return true;
  
  const { app, dialog } = require('electron');
  app.whenReady().then(() => {
    dialog.showMessageBoxSync({ /* ... */ });
    app.exit(1);
  });
  
  // Keep the event loop alive until dialog is shown
  return false;
}
```

```javascript
// TOP OF main.js (before any other requires except electron):
const { app } = require('electron');
const path = require('path');

if (app.isPackaged) {
  const { validateAndExit } = require('./scripts/startup-guard');
  if (!validateAndExit(__dirname)) {
    // Stop execution — app will exit after dialog
    // Require a module that doesn't exist to halt? No...
    // Just set a flag and wrap everything in if
  }
}
```

**OK, let me settle on the ACTUAL simplest approach**:

The startup guard validates files. If missing, it shows a dialog via Electron's sync dialog API and calls `app.exit(1)`. The key is timing — `app.whenReady()` may not have fired yet when the guard runs at module load time.

**Solution**: Register an early `app.on('ready')` listener:

```javascript
// startup-guard.js — final version
const fs = require('fs');
const path = require('path');

function validateStartup(appRoot) { /* ... as above ... */ }

function installGuard(appRoot) {
  const { app, dialog } = require('electron');
  
  if (!app.isPackaged) return; // Skip in dev
  
  const result = validateStartup(appRoot);
  if (result.ok) return;
  
  // Register a 'ready' handler that shows dialog and exits
  // This fires BEFORE any app.whenReady().then() callbacks
  app.on('ready', () => {
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'CKBPOS — Erreur de démarrage',
      message: 'Fichiers critiques manquants',
      detail: `Fichiers manquants :\n${result.missing.join('\n')}\n\nRéinstallez CKBPOS.`,
      buttons: ['Quitter'],
    });
    app.exit(1);
  });
  
  // Prevent app.whenReady() handlers from running
  // by removing all listeners except ours
  // Actually, we can't do that cleanly.
  
  // Instead: throw to halt module evaluation
  throw new Error(`CKBPOS startup failed: ${result.missing.length} files missing`);
}

module.exports = { validateStartup, installGuard };
```

```javascript
// main.js — top
try {
  require('./scripts/startup-guard').installGuard(__dirname);
} catch (e) {
  if (e.message.startsWith('CKBPOS startup failed')) {
    // Guard threw — app will show dialog and exit
    // Don't continue
  } else {
    console.error(e);
  }
}

// But the rest of main.js still executes...
```

**FINAL ANSWER**: The only clean way is to conditionally execute the rest of main.js. Since the file is 5171 lines and we can't restructure it, we use a global flag + the guard at the top:

```javascript
// At the very top of main.js:
const { app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Startup Guard ──
let _startupFailed = false;
if (app.isPackaged) {
  try {
    const { validateStartup } = require('./scripts/startup-guard');
    const r = validateStartup(__dirname);
    if (!r.ok) {
      _startupFailed = true;
      app.whenReady().then(() => {
        dialog.showMessageBoxSync({
          type: 'error',
          title: 'CKBPOS — Erreur de démarrage',
          message: 'Fichiers critiques manquants',
          detail: r.missing.join('\n') + '\n\nRéinstallez CKBPOS.',
          buttons: ['Quitter'],
        });
        app.exit(1);
      });
    }
  } catch (e) { console.error('[StartupGuard]', e.message); }
}

// Guard: only run main logic if startup check passed
if (!_startupFailed) {
  // ── ORIGINAL LINE 1 of main.js ──
  const { registerLicenseIPC, incrementSalesCounter } = require('./license-ipc');
  // ... rest of original main.js (lines 2-5171)
}
```

This adds ~20 lines at the top and wraps the existing content in `if (!_startupFailed) { ... }`. The indentation change is cosmetic — the code works identically. The `app.whenReady()` for the guard fires before the main `app.whenReady().then()` at line 199 because it's registered first.

**Actually**, there's an even simpler approach: since `app.exit(1)` kills the process, we don't need to wrap anything. The guard's `app.whenReady()` callback fires, shows dialog, calls `app.exit(1)`, and the process dies. The rest of main.js's `app.whenReady().then(...)` never fires because the process is already dead.

But main.js also has top-level requires that run synchronously (lines 1-24). Those would still execute and potentially crash if files are missing.

**Conclusion**: The guard must prevent those synchronous requires from running. The `if (!_startupFailed)` wrapper is the correct solution. It's a 2-line change at the top and a `}` at the bottom.

---

## Implementation Order

1. **Create `scripts/verify-build.js`** — the core verification tool
2. **Create `scripts/startup-guard.js`** — the runtime validation
3. **Modify `main.js`** — add startup guard integration (top 25 lines)
4. **Modify `package.json`** — tighten build.files, add verify scripts
5. **Create `.github/workflows/build.yml`** — CI/CD pipeline
6. **Test locally** — run verify, build, verify post-build
7. **Push and verify CI** — confirm GitHub Actions passes
