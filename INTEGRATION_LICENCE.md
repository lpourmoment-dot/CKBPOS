# Integration du systeme de licence dans CKBPOS

## 1. Dependances a installer
```
npm install jsonwebtoken @supabase/supabase-js
```

## 2. Fichiers a copier a la racine du projet CKBPOS (a cote de main.js)
- `licensing.js`
- `license-ipc.js`
- `LicensePage.js` (dans le dossier des pages React, ex: src/pages/)
- `LicensePage.css` (meme dossier que LicensePage.js)
- `license-keys.json` → genere depuis CKBPOS-ADMIN, onglet **Cles & Securite** →
  bouton "Exporter le bundle pour CKBPOS" → copier le JSON affiche → creer le fichier
  `license-keys.json` a la racine du projet CKBPOS (meme niveau que package.json)
  ⚠️ Ne JAMAIS commiter ce fichier sur un repo public (il contient la cle AES partagee)

## 3. translations.js
Une section `licensing` (27 cles, pt-BR/fr/en) a deja ete ajoutee dans le fichier
`translations.js` fourni dans cette livraison. Remplacer l'ancien fichier par celui-ci
(ou fusionner manuellement si des changements ont eu lieu entre temps).

## 4. Modifications dans main.js (CKBPOS)

Ajouter en haut du fichier :
```js
const { registerLicenseIPC, incrementSalesCounter } = require('./license-ipc');
```

A la fin de `app.whenReady().then(() => { ... })`, apres la creation de la fenetre
et l'obtention du machine_id existant (`getMachineId()` ou equivalent deja present
dans le projet) :
```js
registerLicenseIPC(db, ipcMain, machineId); // machineId = la variable existante du projet
```

Dans le handler existant qui enregistre une vente (recherche du handler qui fait
l'INSERT dans la table `ventes`), ajouter un appel apres l'insertion reussie :
```js
incrementSalesCounter(db);
```

## 5. Modifications dans preload.js (CKBPOS)
Coller le contenu de `preload-license-additions.js` a l'interieur du bloc
`contextBridge.exposeInMainWorld('electron', { ... })` existant.

## 6. Cote React (App.js ou equivalent point d'entree)
Au demarrage de l'app, appeler `window.electron.licenseStatus()` :
- si `valid: false` → afficher `<LicensePage onActivated={...} />` en bloquant l'acces
  au reste de l'app (sauf si tier FREE et sales_used < 30, dans ce cas autoriser
  l'usage avec un banner d'avertissement)
- si `valid: true` → continuer normalement

Exemple minimal (a adapter au routeur/structure existante du projet) :
```jsx
const [licenseOk, setLicenseOk] = useState(null);

useEffect(() => {
  window.electron.licenseStatus().then(res => {
    setLicenseOk(res?.data?.valid || res?.data?.reason === 'no_license' && res?.data?.salesUsed < 30);
  });
}, []);

if (licenseOk === false) return <LicensePage onActivated={() => setLicenseOk(true)} />;
```

## 7. Flux complet
1. Client paie (Multicaixa Express) → CKB recoit confirmation manuelle (WhatsApp/SMS)
2. CKB ouvre CKBPOS-ADMIN → cree la licence (nom, email, whatsapp, tier)
3. CKBPOS-ADMIN genere le `.ckb` ET le diffuse automatiquement via Supabase Realtime
   sur le canal `license-{email}`
4. Cote client CKBPOS :
   - **Option automatique** : le client saisit son email dans l'onglet "Recevoir
     automatiquement" de `LicensePage` → reste a l'ecoute du canal → activation
     instantanee a la reception
   - **Option manuelle** : CKB copie le contenu `.ckb` affiche dans CKBPOS-ADMIN
     et l'envoie par WhatsApp → le client le colle dans l'onglet "Coller manuellement"
5. Le payload est stocke localement (table `settings`, cles `license_payload` et
   `license_ckb_raw`) → revalide a chaque demarrage + verification periodique
   recommandee (ex: toutes les 6h, meme pattern que le check auto-update existant)

## 8. Points a ajouter dans une session suivante
- Verification periodique automatique (pas seulement au demarrage)
- Banner d'expiration imminente (J-7, J-3, J-1)
- Gestion du cas "machine_id deja utilise" cote ADMIN (alerte si tentative
  d'activation sur une 2e machine pour une licence a machine_id fixe)
