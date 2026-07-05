# CKBPOS — Contexte État Actuel Complet
_Généré le 05/07/2026 — Analyse de code source_

---

## 1. Vue d'ensemble des 3 projets

| Projet | Stack | Version | Emplacement | PID Electron |
|---|---|---|---|---|
| **CKBPOS Standard** | Electron 41 + React 18 + SQLite (better-sqlite3) + Node 20 | v5.0.6 | `C:\Users\CHRIST BLACK CKB\Desktop\CKBPOS` | `com.ckb.pos` |
| **CKBPOS-PRO** | Fork white-label du Standard | v1.0.0 | `C:\Users\CHRIST BLACK CKB\Desktop\CKBPOS-PRO` | `com.ckb.ckbpospro` |
| **CKBPOS-ADMIN** | Electron 41 + Vanilla JS + SQLite | v0.1.0 | `C:\Users\CHRIST BLACK CKB\Desktop\CKBPOS-ADMIN` | `com.ckb.ckbpos-admin` |

**Machines physiques :**
- **CKB** — ID: `C5CC1637…` (coordinator)
- **NLANDU** — ID: `5F4D206D…` (terminal vente)

---

## 2. Architecture technique détaillée

### 2.1 CKBPOS Standard

**Entrée :** `main.js` → `preload.js` → React (`build/index.html` ou `localhost:3000` en dev)

**Structure des fichiers critiques :**
```
CKBPOS/
├── main.js                    # Process principal Electron (~2800 lignes)
├── preload.js                 # Bridge IPC (283 lignes)
├── database/
│   ├── db.js                  # SQLite init + schema + migrations (681 lignes)
│   └── driveSync.js           # Sync Google Drive
├── scripts/
│   ├── startup-guard.js       # Vérification fichiers critiques au démarrage
│   ├── db-encryption.js       # AES-256-GCM au repos (DÉSACTIVÉ à l'arrêt)
│   ├── cert-pinning.js        # Pinning SSL Supabase
│   ├── integrity-check.js     # Vérification intégrité
│   ├── generate-integrity.js  # Génération manifest SHA-256
│   └── verify-build.js        # Vérification post-build
├── src/
│   ├── main/
│   │   ├── coordinator.js     # Leader election + stock lock + print queue (427 lignes)
│   │   ├── audit.js           # Audit log automatique
│   │   ├── console.js         # Console SQL in-app
│   │   ├── email.js           # Envoi rapports par email
│   │   ├── excel.js           # Export Excel
│   │   └── templates.js       # Templates HTML tickets/rapports
│   ├── components/            # React components
│   ├── pages/                 # Pages React
│   ├── utils/
│   │   ├── adaptive-print.js  # Moteur d'impression v5.0
│   │   ├── printer-detect.js  # Détection capacités imprimante
│   │   └── escpos.js          # Builder ESC/POS
│   └── config/                # Configuration
├── license-ipc.js             # IPC licences (251 lignes)
├── licensing.js               # Validation fichiers .ckb (119 lignes)
├── license-keys.json          # Clés publiques RSA + AES key + config Supabase PRO
└── CKBPOS-Mobile/             # App mobile Expo/React Native
```

**Réseau LAN :**
- WebSocket server: port `41234`
- UDP discovery: port `41235` / alt `41236`
- PRODUCT_ID: `CKBPOS` (isolation avec PRO)
- Chiffrement LAN: AES-256-GCM (si `network_key` configurée)
- Heartbeat: PING/PONG toutes les 5s, timeout 15s
- Sync delta: `SYNC_REQUEST` → `SYNC_DELTA` → `SYNC_ACK` (last-write-wins)
- Tables syncées: ventes, vente_items, products, stock_mouvements, caderno_*, users, settings
- Dedup cross-machine: colonne `uuid` sur ventes (clé composite `${machine_id}_${id}`)

**Cloud :**
- Supabase: `okutvlizyngqknqltsko` (eu-west-1)
- Bridge cloud: push/pull delta
- Auto-update: GitHub Releases (provider `github`, owner `lpourmoment-dot`, repo `ckbpos`)

**Sécurité :**
- Auth: bcrypt, brute-force protection (5 tentatives → lockout 15min)
- DB query whitelist: tables autorisées uniquement
- Anti-debug en production (DevTools fermé périodiquement)
- Anti-tamper: détection variables d'environnement debug
- Certificate pinning Supabase
- DB encryption: AES-256-GCM au repos (clé dérivée hostname+MAC), **chiffrement à l'arrêt DÉSACTIVÉ** (bug hardware fingerprint)

**Licensing :**
- Fichiers `.ckb`: JWT RS256 signé, chiffré AES-256-CBC
- Tiers: FREE (30 ventes), BASIC (15k/mois), STANDARD (35k/mois, 3 machines), PRO (250k/an, 5 machines), BUSINESS (450k/an, 10 machines), PREMIUM (700k/an, illimité), VITALICIA (350k, vie)
- Realtime delivery via Supabase Broadcast + `license_deliveries` table

### 2.2 CKBPOS-PRO

**Fork du Standard** avec ajouts conformité fiscale AGT Angola.

**Différences clés avec Standard :**
- `PRODUCT_ID`: `CKBPOS-PRO` (isolation réseau LAN)
- Ports LAN: `53611` (WS) / `53612` (UDP) — **DIFFÉRENTS du Standard**
- Supabase PRO: `gpbmxzochrgfuimqztsy` (eu-west-1)
- `build.appId`: `com.ckb.ckbpospro`
- Tables supplémentaires:
  - `document_series` — séries documentaires transactionnelles
  - `fiscal_config` — config IVA (régime geral, 14% par défaut)
  - `pgc_contas` — Plan Général de Contabilité (Decreto 82/01)
  - `lancamentos_contabilisticos` — écritures comptables double-entrée
  - `notas_credito_debito` — notes de crédit/débit
- Colonnes supplémentaires sur ventes: `iva_taxa`, `iva_valor`, `base_tributavel`, `regime_iva`
- `nextFactureNum` IPC: pattern `FR CKB${year}/${MACHINE_ID}-${seq}`
- `fiscal-vente-create` IPC: vente atomique (vente+lignes+stock+écritures comptables) dans une transaction
- `generateFacturaFiscalTicketHTML`: template ticket fiscal 72mm avec mention légale AGT
- `nota-credito-generar` / `nota-credito-listar` IPCs
- `fiscal-config-get` / `fiscal-config-set` IPCs

**Fichiers d'audit présents :**
- `AUDIT_AGT_CKBPOS.md`
- `AUDIT_DASHBOARD.md`
- `AUDIT_ELECTRON_UPGRADE.md`
- `STABILITE_PRE_DEPOT.md`
- `PRINT_SYSTEM_FIX_PLAN.md`
- `RAPPORT_SESSION_CKBPOS.md`
- `INTEGRATION_LICENCE.md`

### 2.3 CKBPOS-ADMIN

**App Vanilla JS** pour gestion des licences.

**Architecture :**
```
CKBPOS-ADMIN/
├── main.js          # Process principal (424 lignes)
├── preload.js       # Bridge IPC (42 lignes)
├── db.js            # SQLite licences (188 lignes)
├── licensing.js     # Génération fichiers .ckb (RSA)
├── renderer/        # UI HTML vanilla
└── .keys/           # Clés RSA privées
```

**Tables :**
- `licenses` — licences clients
- `license_audit` — audit des actions licences
- `promo_codes` — codes promo
- `tier_config` — config tiers (durée, prix, limites, features)
- `admins` — comptes admin (pbkdf2 hash, pas bcrypt)

**Fonctionnalités :**
- Auth admin: login local + Supabase Auth
- CRUD licences: créer, révoquer, pauser, reprendre, supprimer
- Rotation clés RSA
- Export bundle client (clé publique + AES)
- Sync tarifs → `tier_config_cloud` (Supabase)
- Self-service: `purchase_requests` + `comprovativos` bucket
- Realtime delivery: broadcast Supabase + `license_deliveries`

**Identifiants Supabase ADMIN:** `okutvlizyngqknqltsko`

---

## 3. Fonctionnalités terminées (session récente)

### PRO
1. **`nextFactureNum` IPC** — Pattern `FR CKB${year}/${MACHINE_ID}-${seq}`
2. **Fix `startup-guard`** — `build.files` corrigé pour inclure les fichiers critiques
3. **Fix faux-positif dialog sécurité** — Utilise `app.getAppPath()` au lieu de `__dirname`
4. **Logging diagnostic** — App sans fenêtre pour débogage terrain
5. **Séries documentaires** — `document_series` transactionnelles (remplace MAX(id))
6. **Vente atomique** — `fiscal-vente-create` dans une transaction DB
7. **IVA + PGC double-entrée** — Écritures comptables automatiques
8. **Notes de crédit/débit** — Auto-générées lors d'annulations
9. **Facture fiscale AGT** — Template 72mm avec mention légale

### Standard
- Système complet de POS multi-machines LAN
- Caderno de Caixa v1.2.7
- Coordinateur v3.0 (leader election + stock lock + print queue)
- Impression partagée v1.9.1
- Sync delta v1.5.0
- Cloud bridge v1.7.0
- Auto-update v4.9.0
- Console SQL in-app (DEV)
- Messagerie interne v4.1.0
- Audit log v4.2.0
- Email rapports v4.3.0
- Export Excel v4.5.0
- Adaptive Print Engine v5.0

### ADMIN
- Gestion complète des licences
- Codes promo
- Rotation clés RSA
- Self-service (purchase_requests)
- Realtime delivery

---

## 4. BUGS CONNUS — Analyse détaillée

### BUG 1: `ReferenceError: MACHINE_ID` (TDZ) — PRO SEULEMENT
- **Emplacement:** `main.js` ligne ~2072 (dans un `setTimeout`)
- **Cause:** `MACHINE_ID` est importé via `const { MACHINE_ID } = require('./database/db')` à la ligne 382. En PRO, `db.js` est un module ESM-compatible qui exporte `MACHINE_ID` à la toute fin (ligne 775). Le problème est que dans `database/db.js` du PRO, la variable `MACHINE_ID_FINAL` est calculée en bas de fichier et exportée via `module.exports.MACHINE_ID = MACHINE_ID_FINAL`. Si `app.getPath('userData')` échoue ou si la DB ne peut pas s'ouvrir (bug #2), l'import échoue silencieusement et `MACHINE_ID` est `undefined`.
- **Impact:** `setTimeout` callbacks qui utilisent `MACHINE_ID` crashent au runtime
- **Résolution probable:** Le TDZ vient du fait que `MACHINE_ID` peut être `undefined` si la DB ne s'est pas initialisée correctement. Vérifier que `database/db.js` a bien initialisé la DB avant tout usage.

### BUG 2: `SqliteError: file is not a database` — PRO SEULEMENT
- **Emplacement:** `database/db.js` ligne 34-47 (`new Database(dbPath)`)
- **Cause probable:** Le fichier `ckbpos.db` est corrompu OU le chiffrement au repos (AES-256-GCM) a laissé un fichier chiffré que better-sqlite3 ne peut pas ouvrir. Le script `db-encryption.js` devrait le déchiffrer en amont via `preDecryptDb()`, mais si le déchiffrement échoue (empreinte hardware changée), le fichier reste chiffré.
- **Vérification:** Regarder si un fichier `ckbpos.db.encrypted` existe dans `%APPDATA%/ckbpos-pro/`. Si oui, le déchiffrement a échoué.
- **Impact:** L'app affiche un dialog d'erreur et quitte (`app.exit(1)`)

### BUG 3: `coordinatorModule.registerIPC()` jamais appelé — PRO SEULEMENT
- **Emplacement:** `main.js` — le module est importé (ligne 10: `const coordinatorModule = require('./src/main/coordinator')`) mais `coordinatorModule.registerIPC(ipcMain)` n'est **jamais appelé** dans le `app.whenReady()`.
- **Conséquence:** Les IPC `coord-status`, `stock-reserve`, `stock-release`, `print-queue-status` ne sont pas enregistrés → les handlers sont orphelins.
- **Correction:** Ajouter `coordinatorModule.init({ db, mainWindow, MACHINE_ID, peersMap, ... }); coordinatorModule.registerIPC(ipcMain); coordinatorModule.startTimers();` dans `app.whenReady()`.

### BUG 4: `license-keys.json` non-conforme (dette sécurité)
- **Emplacement:** `CKBPOS-PRO/license-keys.json`
- **Problème:** Le fichier contient `aesKey` en clair (ancien format) au lieu du nouveau format `aesKeyEncrypted` + `aesKeyIv`. C'est une copie du Standard qui n'a pas été régénérée proprement pour PRO.
- **Impact:** Sécurité affaiblie — la clé AES n'est pas chiffrée par le machine_id

### BUG 5: Standard — erreur JS process principal post-update
- **Détails manquants** — investigation nécessaire

---

## 5. Configuration réseau

| Paramètre | Standard | PRO |
|---|---|---|
| WS Port | 41234 | 53611 |
| UDP Port | 41235 | 53612 |
| PRODUCT_ID | `CKBPOS` | `CKBPOS-PRO` |
| Supabase | `okutvlizyngqknqltsko` | `gpbmxzochrgfuimqztsy` |
| GitHub Repo | `lpourmoment-dot/ckbpos` | `lpourmoment-dot/CKBPOS-PRO` |

**Isolation:** Les deux apps sur le même LAN ne se synchronisent PAS grâce au `PRODUCT_ID` différent.

---

## 6. Base de données SQLite — Schéma complet

### Tables communes (Standard + PRO)
- `users` — utilisateurs (admin/vendeur)
- `products` — produits
- `product_variants` — variantes produits
- `stock_mouvements` — mouvements stock
- `ventes` — ventes
- `vente_items` — lignes de vente
- `shifts` — caisses
- `settings` — paramètres (key-value)
- `clients` — clients
- `reservations` — réservations
- `reservation_items` — lignes réservation
- `empresas` — entreprises
- `caderno_entries` — entrées caderno
- `caderno_motivos` — motifs caderno
- `caderno_trabalhadores` — travailleurs
- `caderno_produtos` — produits caderno
- `network_peers` — pairs LAN
- `sync_log` — log synchronisation
- `sync_state` — état sync
- `stock_reservations` — réservations stock (coordinator)
- `print_queue` — file impression
- `coordinator_log` — log coordinateur
- `user_sessions` — sessions utilisateurs
- `historique_modifications` — historique modifications

### Tables PRO uniquement
- `document_series` — séries documentaires (FR, NC, ND)
- `fiscal_config` — config IVA/fiscal
- `pgc_contas` — Plan Général de Contabilité
- `lancamentos_contabilisticos` — écritures comptables
- `notas_credito_debito` — notes de crédit/débit

### Tables ADMIN uniquement
- `licenses` — licences clients
- `license_audit` — audit licences
- `promo_codes` — codes promo
- `tier_config` — config tiers
- `admins` — comptes admin

---

## 7. Tâches restantes (priorité)

### BLOQUANT — PRO
1. **Résoudre `SqliteError: file is not a database`** — Vérifier l'état du fichier DB + chiffrement
2. **Résoudre `ReferenceError: MACHINE_ID` (TDZ)** — Conséquence du bug #1
3. **Appeler `coordinatorModule.registerIPC()`** dans `app.whenReady()`
4. **Régénérer `license-keys.json` PRO** avec `aesKeyEncrypted` + `aesKeyIv`

### NON-BLOQUANT
5. **ADMIN :** Définir scope mécanisme de login (session persistence, roles, 2FA ?)
6. **Standard :** Investiguer erreur JS process principal post-update
7. **PRO :** Chaîne fiscale AGT (SAF-T, API, signature hash-chain) — bloquée en attente dépôt/autorisation AGT

---

## 8. Décisions techniques

1. **Séparation stricte des keypairs RSA** par variante produit
2. **`ventes.id` AUTOINCREMENT** non-unique cross-machine → clé composite `${machine_id}_${id}`
3. **Discipline debug PRO :** 1 fix = 1 test séquentiel, jamais groupé en instabilité
4. **Chiffrement DB désactivé** à l'arrêt (empreintes hardware trop changes)
5. **Electron 41** (upgrade depuis 29.4.6, tous projets)
6. **bcrypt pour Standard/PRO**, pbkdf2 pour ADMIN
7. **Triggers SQLite** pour sync delta (skip si `sync_applying='1'`)
8. **White-label PRO** = fork du Standard, même codebase mais PRODUCT_ID et ports différents

---

## 9. Dépendances communes

- Electron 41, Node 20, better-sqlite3 12.11.1
- electron-builder NSIS, `CKBPOS.bat` ([D] release GH, [E] GH_TOKEN)
- RS256 JWT + AES-256-CBC (`.ckb`), clé privée réservée à ADMIN
- @supabase/supabase-js 2.108.2
- React 18, react-router-dom 6, recharts, framer-motion
- ws (WebSocket LAN), qrcode
- electron-updater (auto-update)
- electron-store (config locale)
- googleapis (Google Drive backup)
- nodemailer (email rapports)

---

## 10. Commandes utiles

```bash
# Standard
cd CKBPOS && npm start          # Lancer en dev
cd CKBPOS && npm run dist       # Build installer

# PRO
cd CKBPOS-PRO && npm start      # Lancer en dev
cd CKBPOS-PRO && npm run dist   # Build installer

# ADMIN
cd CKBPOS-ADMIN && npm start    # Lancer
```

---

## 11. Notes importantes

- **Standard et PRO partagent ~90% du codebase** — les différences sont dans `main.js` (fiscal) et `database/db.js` (tables comptables)
- **Le Standard a une app mobile** (`CKBPOS-Mobile/`) en Expo/React Native
- **Pas de tests unitaires** — aucun projet n'a de suite de tests
- **Pas de CI/CD** — build manuel via scripts batch
- **Pas de `.env.example`** — les variables d'environnement sont hardcodées ou dans des fichiers `.env` non versionnés
