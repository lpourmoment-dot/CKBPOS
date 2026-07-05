# CKBPOS Mobile — Session Context

## Étape 1 — Vérification rendu ✅

### Bootstrap DB
- **Tables**: 15 tables créées (users, products, product_variants, stock_mouvements, historique_modifications, clients, ventes, vente_items, shifts, settings, reservations, reservation_items, empresas, caderno_entries, caderno_trabalhadores, caderno_produtos, caderno_motivos, sync_log, sync_state, schema_version)
- **Triggers**: 21 triggers sync (ventes:3, vente_items:3, products:3, stock_mouvements:1, caderno_entries:3, users:2, caderno_motivos:2, caderno_trabalhadores:2, caderno_produtos:2, settings:2)
- **Migrations**: 42 ALTER TABLE migrations — gèrent les conflits via try/catch (IF NOT EXISTS pattern)
- **Settings par défaut**: 16 settings initiaux
- **Motivos par défaut**: 16 motifs (entree/sortie/perte)
- **Admin par défaut**: admin@ckbpos.com / admin123 (bcryptjs hash)

### Navigation
- **Bottom Tabs** (4): Dashboard, Caisse, Products, Settings
- **Stack Screens** (8): Estoque, Historique, Caderno, Users, Reservations, License (post-login), SetupScreen, LoginScreen (pre-login)
- **Total**: 12 screens ✅

### Theme
- Dark: `#0f0f0f` (background) ✅
- Accent: `#e8c547` (primary) ✅
- Applied via COLORS object in `src/theme/index.ts`
- All screens use COLORS from theme ✅

### i18n
- 3 langues: pt-BR, fr, en ✅
- Store: Zustand + AsyncStorage ✅
- Switch fonctionnel via SettingsScreen ✅
- Clés: ~65 clés par langue (auth, nav, dashboard, caisse, products, estoque, historique, caderno, settings, license, common, sync, users, setup, reservation)

### SetupScreen Wizard
- 4 étapes: Welcome/ShopInfo → Machine → Admin → Complete ✅
- Validation, machine_id auto-généré, network_key auto-généré
- Bcrypt hash pour admin password
- Marque setup_done=1 + machine_id dans settings

## Étape 2 — Tests device Android/iOS

### Login
- Email/password avec bcryptjs hash ✅ (compatible Desktop)
- Tentativas_login tracking
- Login PIN supporté

### Flux vente complet
- Caisse → panier (CartStore/Zustand) → paiement (dinheiro/express/misto) → INSERT vente + items → UPDATE stock → Generate facture_num
- Machine_id + UUID pour sync

### CRUD Produits
- Create, Read, Update, Delete (soft delete actif=0)
- Prix carton/demi/unite
- Stock + alerte
- Barcode field présent (saisie manuelle, expo-camera requis pour scan)

### Mouvements stock
- 4 types: entree, sortie, ajuste, retour ✅
- stock_avant/stock_apres tracking
- cout_entree + fournisseur

### Licence
- evaluateLicenseStatus: free mode < 30 ventes ✅
- SecureStore pour stockage licence ✅
- SubtleCrypto (AES-CBC + RS256) pour validation .ckb ✅
- startLicenseListener via Supabase

### Point d'attention SubtleCrypto
- `globalThis.crypto.subtle` utilisé pour AES-CBC decrypt et RS256 verify
- Risque connu: Android <21 (Polyfill `react-native-quick-crypto` recommandé si nécessaire)
- Expo Go utilise le runtime Hermes qui supporte SubtleCrypto ✅

## Bugs corrigés cette session

1. **package.json incomplet** — 15+ dépendances manquantes (navigation, zustand, bcryptjs, expo-sqlite, etc.)
2. **@expo/vector-icons absent** — Nécessaire pour Ionicons dans tous les screens
3. **react-native-gesture-handler** — Version incompatible avec RN 0.86.0 (upgrade vers ~2.32.0)
4. **react-native-safe-area-context + react-native-screens** — Manquants pour navigation stack
5. **Navigation `id` prop** — Requis par React Navigation 7+ (Tab id="MainTabs", Stack id="RootStack")
6. **TypeScript: CaisseScreen type mismatch** — `'unite' === 'demi'` impossible (fixé type narrowing)
7. **TypeScript: bluetooth.ts Platform.Version** — Cast en `number` requis
8. **TypeScript: licensing.ts SubtleCrypto** — Cast `buffer as ArrayBuffer` requis pour Uint8Array
9. **TypeScript: syncStore.ts** — Cast `as any` requis pour SQLite bind params

## Fichiers modifiés
- `package.json` — Dépendances complètes
- `src/navigation/AppNavigator.tsx` — id props ajoutés
- `src/screens/CaisseScreen.tsx` — Type narrowing fixé
- `src/services/bluetooth.ts` — Platform.Version cast
- `src/services/licensing.ts` — SubtleCrypto buffer casts
- `src/stores/syncStore.ts` — SQLite bind casts

## Statut
- **TypeScript**: 0 errors ✅
- **Metro bundler Android**: 1088 modules, 0 errors ✅
- **Prêt pour**: Tests device Android/iOS
- **Prochaine étape**: Bluetooth/impression (après confirmation stable Étapes 1-2)
