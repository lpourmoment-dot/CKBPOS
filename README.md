# 🏪 CKBPOS — Application Point de Vente Professionnelle

**Version : 4.9.6** | Electron + React + SQLite

---

## ✅ Prérequis

- [Node.js](https://nodejs.org/) (v16+)
- Windows 10/11

---

## 📁 ÉTAPE 1 — Préparer le projet

```bash
cd Desktop
mkdir CKBPOS
cd CKBPOS
```

Copie tous les fichiers du projet dans ce dossier.

---

## 🔑 ÉTAPE 2 — Fichier credentials.json

Place ton fichier `credentials.json` Google dans la **racine** du projet :
```
CKBPOS/
  credentials.json   ← ICI (non inclus dans le repo)
  main.js
  package.json
  ...
```

---

## 📦 ÉTAPE 3 — Installer les dépendances

```bash
npm install
```

> `postinstall` lance automatiquement `electron-rebuild` pour `better-sqlite3`.

---

## 🚀 ÉTAPE 4 — Lancer en mode développement

```bash
npm run dev
```

Cela démarre le serveur React sur `http://localhost:3000` puis ouvre Electron.

**Compte admin par défaut :**
- Email : `admin@ckbpos.com`
- Mot de passe : `admin123`

> ⚠️ Change le mot de passe admin immédiatement après la première connexion !

---

## 🏗️ ÉTAPE 5 — Compiler l'installateur .exe

```bash
npm run dist
```

Le fichier `.exe` sera dans le dossier `dist/`.

---

## 📋 Structure du projet

```
CKBPOS/
├── main.js                     # Electron main process (IPC, DB, sync, licence)
├── preload.js                  # IPC bridge (contextBridge)
├── licensing.js                 # Validation JWT + signature AES (licence)
├── license-ipc.js               # Handlers IPC licence + vérification périodique
├── license-keys.json            # Clés de sécurité licence (NON committé)
├── preload-license-additions.js # API licence côté renderer
├── credentials.json             # Google OAuth (NON committé)
├── package.json
├── INSTALLER.bat / DEMARRER.bat # Scripts d'installation/lancement
├── database/
│   ├── db.js                    # SQLite schema + migrations
│   └── driveSync.js             # Google Drive sync (legacy)
├── public/
│   └── index.html               # Template HTML
├── src/
│   ├── index.js                 # Point d'entrée React
│   ├── App.js                   # Root + routing + LicenseContext + ExpirationBanner
│   ├── styles/
│   │   └── global.css           # Thème dark/light + composants partagés + banner licence
│   ├── utils/
│   │   ├── useLang.js           # Hook i18n (pt-BR, fr, en)
│   │   └── translations.js      # Traductions (compat legacy)
│   ├── components/
│   │   ├── Layout.js            # Sidebar + titlebar + console SQL + banner licence
│   │   ├── ShiftModal.js        # Ouverture/fermeture de caisse (fundo de caixa)
│   │   ├── UpdateBanner.js      # Banner auto-update
│   │   └── AlertModal.js        # Alerte stock bas
│   └── pages/
│       ├── LoginPage.js         # Login admin + PIN vendeur
│       ├── SetupPage.js         # Configuration initiale (réseau, cloud, imprimante)
│       ├── DashboardPage.js     # Dashboard admin/vendeur
│       ├── CaissePage.js        # Interface de caisse tactile
│       ├── ProductsPage.js      # Gestion produits (carton/demi/unité)
│       ├── EstoquePage.js       # Gestion de stock
│       ├── HistoriquePage.js    # Historique des ventes
│       ├── CadernoPage.js       # Registre caderno (relevés)
│       ├── UsersPage.js         # Gestion utilisateurs (admin/vendeur)
│       ├── SettingsPage.js      # Paramètres (réseau, cloud, langue, impression)
│       ├── CoordDashboardPage.js# Dashboard coordinateur (multi-machines)
│       ├── AuditLogPage.js      # Journal d'audit
│       ├── MessagingPage.js     # Messagerie inter-machines
│       ├── LicensePage.js       # Activation + statut licence
│       └── translations.js      # Toutes les traductions (pt-BR, fr, en)
└── assets/
    └── icon.ico
```

---

## 🎯 Fonctionnalités

### Caisse & Ventes
| Fonctionnalité | Statut |
|---|---|
| Caisse tactile | ✅ |
| Calcul monnaie rendue | ✅ |
| Paiement mixte (Dinheiro + Multicaixa Express) | ✅ |
| Tickets avec impression thermique 72mm | ✅ |
| Partage d'impression entre machines | ✅ |
| Réservations (pending → pago) | ✅ |
| Historique des ventes | ✅ |

### Produits & Stock
| Fonctionnalité | Statut |
|---|---|
| Gestion produits (carton/demi/unité) | ✅ |
| Stock en temps réel | ✅ |
| Alertes stock bas | ✅ |
| Scan code-barres / QR code | ✅ |
| Registre Caderno (relevés) | ✅ |

### Utilisateurs & Rôles
| Fonctionnalité | Statut |
|---|---|
| Login Admin + PIN vendeur | ✅ |
| Gestion utilisateurs (CRUD) | ✅ |
| Ouverture/fermeture de caisse (shift) | ✅ |
| Dashboard vendeur | ✅ |
| Dashboard admin | ✅ |

### Multi-machines & Cloud
| Fonctionnalité | Statut |
|---|---|
| Sync cloud (Supabase Realtime) | ✅ |
| Sync snapshot complet | ✅ |
| Dashboard coordinateur | ✅ |
| Messagerie inter-machines | ✅ |
| Console SQL intégrée | ✅ |
| Journal d'audit | ✅ |
| Auto-update (electron-updater) | ✅ |

### Licence
| Fonctionnalité | Statut |
|---|---|
| Activation par fichier .ckb (manuelle) | ✅ |
| Activation par Supabase Realtime (automatique) | ✅ |
| Mode FREE (30 ventes) | ✅ |
| Vérification périodique (30 min) | ✅ |
| Banner d'expiration (J-7 / J-3 / J-1) | ✅ |
| Gating par licence | ✅ |

### Internationalisation
| Fonctionnalité | Statut |
|---|---|
| Português (pt-BR) | ✅ |
| Français (fr) | ✅ |
| English (en) | ✅ |
| Thème dark / light | ✅ |

---

## 🌐 Langues

CKBPOS supporte 3 langues, sélectionnables dans les paramètres :

- 🇧🇷 **Português (pt-BR)** — langue par défaut
- 🇫🇷 **Français (fr)**
- 🇬🇧 **English (en)**

---

## 🔧 Résolution des problèmes

### Erreur `better-sqlite3` / module natif
```bash
npm rebuild better-sqlite3
```

### L'app ne démarre pas
```bash
# Terminal 1 : React
npm run react-start
# Terminal 2 : Electron
npx electron .
```

### Build React échoue (warning `crypto`)
C'est un warning lié à `bcryptjs` et webpack 5 — il n'empêche pas le fonctionnement.

---

## ⚠️ Sécurité

- `credentials.json` — **ne jamais commiter** (contient les clés Google OAuth)
- `license-keys.json` — **ne jamais commiter** (contient la clé AES partagée)
- Changer le mot de passe admin par défaut immédiatement
- Les bases `.db` sont exclues du repo via `.gitignore`

---

## 📝 Versions récentes

| Version | Ajouts |
|---|---|
| **4.9.5-4.9.6** | Système de licence complet (activation, realtime, banner, UUID ventes, sync dédup) |
| **4.9.0** | Auto-update, console SQL, thème light |
| **4.6.0** | Console SQL intégrée |
| **4.1.0** | Messagerie inter-machines, badge non-lus |
| **3.9.0** | QR code produits, caderno |
| **3.5.0** | Dashboard coordinateur, audit |
| **3.4.0** | Setup page, first-run wizard |

---

## 📞 Support

En cas de problème, note l'erreur exacte et contacte le support.
