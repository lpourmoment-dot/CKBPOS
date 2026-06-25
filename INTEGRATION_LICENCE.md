# Integration du systeme de licence dans CKBPOS

> **Statut : termine (v4.9.5)** — Commit `cb6173d` sur branche `add-ckbpos-4.9.3`

---

## 1. Dependances a installer ✅
```bash
npm install jsonwebtoken @supabase/supabase-js
```

## 2. Fichiers a copier a la racine du projet CKBPOS ✅
- `licensing.js` — logique de validation JWT + signature AES
- `license-ipc.js` — handlers IPC (activation, statut, realtime, verification periodique 30 min)
- `LicensePage.js` → `src/pages/LicensePage.js`
- `LicensePage.css` → `src/pages/LicensePage.css`
- `license-keys.json` — genere depuis CKBPOS-ADMIN (onglet Cles & Securite → "Exporter le bundle")
  - ⚠️ Ne JAMAIS commiter ce fichier sur un repo public (contient la cle AES partagee)

## 3. translations.js ✅
Section `licensing` (42 cles, pt-BR/fr/en) fusionnee dans `src/pages/translations.js`.
Cles incluses : titre, stamps, statuts, sales, expiration, activation, erreurs, mode FREE, banner (J-7/J-3/J-1).

## 4. Modifications dans main.js ✅

- **Import** : `const { registerLicenseIPC, incrementSalesCounter } = require('./license-ipc');`
- **Enregistrement IPC** : `registerLicenseIPC(db, ipcMain, machineId)` dans `app.whenReady()`
- **Compteur ventes** : `incrementSalesCounter(db)` apres chaque INSERT dans `ventes` (3 handlers)
- **UUID ventes (v4.9.5)** :
  - Injection automatique `uuid` + `machine_id` dans tout INSERT INTO ventes (handler db-query)
  - 2 handlers caisse : colonnes `uuid` + `machine_id` ajoutees a l'INSERT
  - Migration `ALTER TABLE ventes ADD COLUMN uuid TEXT` + backfill pour ventes existantes
  - Sync : deduplication par UUID aux 3 endroits (realtime, pull HTTP, snapshot)

## 5. Modifications dans preload.js ✅
API exposees dans `contextBridge.exposeInMainWorld('electron', { ... })` :
- `licenseActivateManual(ckbContent)`
- `licenseStatus()`
- `licenseListenRealtime(email)`
- `licenseStopListen()`
- `onLicenseReceived(cb)` / `onLicenseSalesUpdated(cb)`

## 6. Cote React (App.js) ✅
- `LicenseContext` + `useLicense()` pour partage d'etat
- `LicenseWatcher` : ecoute les mises a jour IPC (ventes + reception realtime)
- Route `/license` toujours accessible meme si acces bloque
- Gating `hasLicenseAccess` : licence valide OU mode FREE < 30 ventes
- Redirection declarative vers `/license` si acces bloque

## 7. Flux complet ✅
1. Client paie (Multicaixa Express) → CKB recoit confirmation (WhatsApp/SMS)
2. CKB ouvre CKBPOS-ADMIN → cree la licence (nom, email, whatsapp, tier)
3. CKBPOS-ADMIN genere le `.ckb` ET le diffuse via Supabase Realtime sur `license-{email}`
4. Cote client CKBPOS :
   - **Option automatique** : client saisit son email → ecoute realtime → activation instantanee
   - **Option manuelle** : CKB envoie le `.ckb` par WhatsApp → client le colle dans LicensePage
5. Payload stocke localement (table `settings`, cles `license_payload` + `license_ckb_raw`)
6. Revalidation au demarrage + verification periodique (toutes les 30 min)

## 8. Points ajoutes en session 17-18 ✅
- ✅ Verification periodique automatique (30 min, dans `license-ipc.js`)
- ✅ Banner d'expiration imminente (J-7/J-3/J-1, dans `ExpirationBanner` + `global.css`)
- ✅ UUID ventes + deduplication sync (dans `main.js`)
- ⬜ Gestion du cas "machine_id deja utilise" cote ADMIN (a faire dans **CKBPOS-ADMIN**, pas ce repo)

---

## Fichiers modifies (commit cb6173d)

| Fichier | Changements |
|---|---|
| `license-ipc.js` | +24 — verification periodique 30 min |
| `main.js` | +98/-3 — UUID ventes, migration, deduplication sync |
| `src/App.js` | +157/-30 — LicenseContext, LicenseWatcher, gating, ExpirationBanner |
| `src/components/Layout.js` | +3/-1 — rendu ExpirationBanner dans `<main>` |
| `src/pages/translations.js` | +141 — 42 cles licensing x 3 langues |
| `src/styles/global.css` | +61 — bloc .license-banner* + keyframe |
