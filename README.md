# 🏪 CKBPOS — Guide d'installation complet

## ✅ Prérequis (déjà installés)
- Node.js
- Git

---

## 📁 ÉTAPE 1 — Préparer le projet

Ouvre **PowerShell** ou **CMD** et tape :

```bash
cd Desktop
mkdir CKBPOS
cd CKBPOS
```

Copie tous les fichiers du projet dans ce dossier `CKBPOS`.

---

## 🔑 ÉTAPE 2 — Placer le fichier credentials.json

Place ton fichier `credentials.json` Google dans la **racine** du projet :
```
CKBPOS/
  credentials.json   ← ICI
  main.js
  package.json
  ...
```

Si tu n'as pas le fichier JSON, crée un fichier `credentials.json` avec ce contenu :
```json
{
  "installed": {
    "client_id": "690009821524-s7dttaegc1ducnvvtkshqb9cj2ot9321.apps.googleusercontent.com",
    "project_id": "ckbpos",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "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",
    "redirect_uris": ["http://localhost"]
  }
}
```

---

## 📦 ÉTAPE 3 — Installer les dépendances

Dans le dossier CKBPOS, ouvre PowerShell et tape :

```bash
npm install
```

⏳ Attends que l'installation se termine (peut prendre 2-5 minutes)

---

## 🚀 ÉTAPE 4 — Lancer en mode développement

```bash
npm run dev
```

Cela va :
1. Démarrer le serveur React sur http://localhost:3000
2. Ouvrir automatiquement l'application Electron

**Compte admin par défaut :**
- Email : `admin@ckbpos.com`
- Mot de passe : `admin123`

⚠️ **Change le mot de passe admin immédiatement** après la première connexion !

---

## 🏗️ ÉTAPE 5 — Compiler l'application .exe

Quand tu es prêt à créer l'installateur Windows :

```bash
npm run dist
```

Le fichier `.exe` sera généré dans le dossier `dist/`

---

## 🔧 RÉSOLUTION DES PROBLÈMES

### Erreur "better-sqlite3 not found"
```bash
npm rebuild better-sqlite3
```

### Erreur "electron not found"
```bash
npm install electron --save-dev
```

### Erreur EACCES (permissions)
Lance PowerShell en **Administrateur**

### L'app ne démarre pas
```bash
npm run react-start
# Dans un autre terminal :
npx electron .
```

---

## 📋 STRUCTURE DU PROJET

```
CKBPOS/
├── main.js              # Electron main process
├── preload.js           # IPC bridge
├── credentials.json     # Google OAuth (NE PAS PARTAGER)
├── package.json
├── database/
│   ├── db.js           # SQLite + schema
│   └── driveSync.js    # Google Drive sync
├── src/
│   ├── App.js          # React root + routing
│   ├── index.js
│   ├── styles/
│   │   └── global.css
│   ├── components/
│   │   └── Layout.js   # Sidebar + titlebar
│   └── pages/
│       ├── LoginPage.js
│       ├── DashboardPage.js
│       ├── CaissePage.js
│       ├── ProductsPage.js
│       ├── HistoriquePage.js
│       ├── UsersPage.js
│       └── SettingsPage.js
└── public/
    └── index.html
```

---

## 🎯 FONCTIONNALITÉS INCLUSES

| Fonctionnalité | Status |
|----------------|--------|
| Login Admin/Vendeur | ✅ |
| PIN rapide vendeur | ✅ |
| Gestion produits (carton/demi/unité) | ✅ |
| Caisse tactile | ✅ |
| Calcul monnaie | ✅ |
| Dashboard Admin | ✅ |
| Dashboard Vendeur | ✅ |
| Historique ventes | ✅ |
| Gestion utilisateurs | ✅ |
| Impression tickets | ✅ |
| Google Drive sync | ✅ |
| Mode dark | ✅ |
| Stock en temps réel | ✅ |

---

## ⚠️ SÉCURITÉ

- Ne jamais mettre `credentials.json` sur GitHub
- Ajouter dans `.gitignore` : `credentials.json`, `*.db`, `node_modules/`
- Changer le mot de passe admin par défaut immédiatement

---

## 📞 SUPPORT

En cas de problème, note l'erreur exacte et contacte le support.
