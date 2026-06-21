# 📦 CKBPOS Releases & Changelog

Tous les releases de CKBPOS sont listés ici avec leurs changements et notes.

---

## 🚀 Versions publiées

### [v4.9.3](https://github.com/lpourmoment-dot/CKBPOS/releases/tag/v4.9.3) — Latest
**Published** : 21 juin 2026

#### ✨ Nouvelles fonctionnalités
- ✅ **Auto-update système complet** — Vérification automatique des mises à jour (démarrage + toutes les 30 min)
- ✅ **Barre de progression temps réel** — Affiche le % téléchargé + ETA dynamique basé sur la vitesse connexion
- ✅ **Bouton "Vérifier les mises à jour"** — Manuel dans Settings → System Information
- ✅ **Module Random Joke Generator** — Bonus : générateur de blagues aléatoires via JokeAPI
- ✅ **Notifications i18n complètes** — Updates notifiées en pt-BR, fr, en

#### 🐛 Bugs fixés
- ✅ **Encodage SettingsPage.js** — Caractères accentués (Saída, não, etc.) corrigés
- ✅ **Releases GitHub mode Draft** — Maintenant publiées directement (pas de draft)
- ✅ **i18n orphelin** — Clés updates.* complétées pour UI + backend

#### 🔧 Améliorations techniques
- Electron-updater intégré avec fallback GitHub API
- Check périodique (setInterval 30 min) + check au démarrage (setTimeout 5s)
- IPC main↔renderer (updateCheck, updateDownload, updateInstall)
- Composant UpdateBanner avec animation shimmer
- Configuration `releaseType: release` dans package.json

#### 📝 Notes
- Compatible avec v4.9.0 et v4.9.1
- **Auto-update activé** : clients v4.9.0/4.9.1 seront notifiés de v4.9.3
- Aucune migration DB requise
- Aucun token GitHub requis côté client (repo public)

#### 📥 Télécharger
- **CKBPOS-Setup-4.9.3.exe** (104 MB) — Installateur Windows
- Source code — zip + tar.gz

#### 🔗 Liens
- [Compare avec v4.9.2](https://github.com/lpourmoment-dot/CKBPOS/compare/v4.9.2...v4.9.3)
- [Full Release](https://github.com/lpourmoment-dot/CKBPOS/releases/tag/v4.9.3)

---

### [v4.9.1](https://github.com/lpourmoment-dot/CKBPOS/releases/tag/v4.9.1)
**Published** : 21 juin 2026

#### ✨ Nouvelles fonctionnalités
- Préparation auto-update (backend setup)

#### 🐛 Bugs fixés
- Divers petits fixes

#### 📥 Télécharger
- **CKBPOS-Setup-4.9.1.exe** (104 MB)

#### 🔗 Liens
- [Compare avec v4.9.0](https://github.com/lpourmoment-dot/CKBPOS/compare/v4.9.0...v4.9.1)
- [Full Release](https://github.com/lpourmoment-dot/CKBPOS/releases/tag/v4.9.1)

---

### [v4.9.0](https://github.com/lpourmoment-dot/CKBPOS/releases/tag/v4.9.0)
**Published** : 21 juin 2026 — **First stable release**

#### ✨ Nouvelles fonctionnalités
- Système de point de vente (POS) complet
- Caisse tactile avec calcul monnaie
- Gestion produits (carton/demi/unité)
- Dashboard Admin + Dashboard Vendeur
- Historique ventes
- Gestion utilisateurs (admin/vendeur)
- Impression tickets
- Google Drive sync
- Mode dark
- Stock en temps réel
- Système i18n (pt-BR, fr, en)

#### 📥 Télécharger
- **CKBPOS-Setup-4.9.0.exe** (104 MB)

#### 🔗 Liens
- [Full Release](https://github.com/lpourmoment-dot/CKBPOS/releases/tag/v4.9.0)

---

## 📊 Historique & Roadmap

| Version | Status | Features | Auto-Update |
|---------|--------|----------|-------------|
| v4.9.3  | ✅ Released | Auto-update complet | ✅ Yes |
| v4.9.1  | ✅ Released | Setup backend | Partial |
| v4.9.0  | ✅ Released | Core POS | No |
| v5.0.0  | 📋 Planned | ERP v2, API REST | ✅ Yes |

---

## 🔒 Sécurité

- ✅ Tous les releases sont signés et vérifiés
- ✅ Pas de tokens stockés côté client
- ✅ Secrets (credentials.json) jamais inclus dans les releases
- ✅ .gitignore protège les données sensibles

---

## 📝 Guide d'installation

### Installation locale
```bash
# Télécharger le .exe depuis la release
# Double-cliquer et suivre l'assistant
```

### Installation silencieuse (pour déploiement IT)
```bash
CKBPOS-Setup-4.9.3.exe /S /D=C:\CKBPOS
```

### Vérifier la version installée
- Lancez l'app → Settings → System Information

---

## 💬 Support

- 🐛 **Signaler un bug** : https://github.com/lpourmoment-dot/CKBPOS/issues/new
- 📖 **Documentation** : [README.md](./README.md)
- 📧 **Contact** : lpourmoment@gmail.com

---

## 🔄 Update Policy

**Auto-update** :
- Check automatique toutes les 30 min
- Check manuel via Settings → "Vérifier les mises à jour"
- Notification en haut de l'app (UpdateBanner)
- Téléchargement + installation en fond, restart nécessaire

**Compatibilité** :
- v4.9.0 → v4.9.3 : ✅ Mise à jour directe
- v4.9.1 → v4.9.3 : ✅ Mise à jour directe
- Versions < 4.9.0 : ⚠️ Réinstallation recommandée

---

*Last updated : 21 juin 2026*  
*Repository : https://github.com/lpourmoment-dot/CKBPOS*  
*Maintainer : @lpourmoment-dot*
