# ROADMAP — LAST OUTPOST

Jeu de survie isométrique (style blocs, façon Minecraft) relié au planning PlanningFREVO.
Ce fichier sert à reprendre le travail dans une nouvelle session sans tout réexpliquer.

## Décisions validées (26/11/2026)
- **Joueurs** : l'utilisateur et sa compagne, chacun son planning (même app, son appareil, son Gist). Multijoueur limité à eux deux.
- **Emplacement** : dans ce dépôt. Sources `game-src/` (TypeScript + Vite + Phaser 3.90), compilé dans `game/` (fichiers générés, committés : GitHub Pages sert la branche `main` telle quelle, pas besoin de GitHub Actions). URL : https://anarkhlla.github.io/PlanningFREVO/game/
- **XP (planning) et capsules (jeu) liées** : une seule source de vérité, le registre économique. Le planning affiche le solde de capsules et « 📦 Nouveau à aller chercher : … » ; le jeu affiche XP et niveau d'atelier.
- **Projet = grosse tâche** (durée « 1 h+ » ou étalée sur plusieurs jours) : récompense plus grosse, enveloppe répartie sur ses journées.
- **Difficulté** depuis la durée du planning (≤5 min = petite, 15 / 30-60 min = moyenne, 1 h+ = difficile, aucune = moyenne). Réglable. « Me pèse » = avoidanceLevel 1.
- **Démarrage** : récompense validée 3 min après « Je commence ». **Bonus exécution rapide** : « terminée » en un clic → bonus ; commencée et finie le même jour → même bonus ; commencée un jour et finie un autre → pas de bonus. Montants réglables.
- **Tâches terminées avant le jeu** : ne rapportent rien (caisse de départ à la place).
- **Synchro de la partie** entre appareils dès l'étape 1, via le Gist privé existant.
- **PC et téléphone** jouables : clavier/souris + joystick tactile.
- **Style** : provisoirement en blocs dessinés par le code. **Souhait exprimé le 26/11 : un rendu semi-réaliste « cartoon réaliste », vraiment comme Project Zomboid.** Ce style demande de vrais sprites (dessinés ou achetés) : à décider plus tard (packs isométriques, artiste, ou génération d'images), le code d'affichage est prévu pour remplacer les textures sans toucher aux règles.
- **Graphismes définitifs (décidé le 26/11)** : pipeline **3D → sprites** (option A), ressources **gratuites** suffisent (usage personnel, pas de commercialisation). Priorité : **ne pas complexifier le code**. Donc : personnages **et** animations depuis **Mixamo** (une seule source, squelette commun : pas de reciblage d'animations), décors gratuits (Quaternius, Kenney, Poly Pizza…) + modèles de l'utilisateur, rendus hors du jeu par un script Blender en planches de sprites. Le jeu reste en 2D Phaser et ne fait qu'afficher des images (aucune 3D dans le code du jeu). `CREDITS.md` liste les sources. Calendrier : finir la boucle de jeu (étape 1, sessions 2 à 4), puis une session de test de style (1 personnage marche/course 8 directions, 1 mur, 1 sol, 1 caisse) avant de tout convertir.
- **Contrôles** : flèche droite = droite de l'écran (comme Project Zomboid), personnage dessiné en 8 vraies orientations. Réglage `controls: 'grid'` dans `config.ts` si on préfère suivre les lignes de la carte.
- **Succès « Couché tôt, levé tôt »** : « 🌙 Je me couche » avant 23 h 00, puis « ☀️ Je suis levé » avant 9 h 00 le lendemain, au moins 5 h après. Une fois par nuit, aucune sanction ni série. Heures, délai et récompense réglables.
- **Multijoueur (plus tard)** : Supabase (comptes, Postgres, fonctions transactionnelles) + Colyseus (salles temps réel autoritaires). La logique du jeu vit dans `game-src/src/core/` (TypeScript pur, sans Phaser) pour être réutilisée côté serveur.

- **Monde continu (décidé le 26/11)** : pas de changement de carte ni de transition. Les régions (`core/world.ts`, tableau `REGIONS` avec position `ox, oy`) sont posées côte à côte sur une seule grande carte ; on les traverse en marchant. Affichage par morceaux de 16×16 cases autour de la caméra (le monde apparaît en avançant, reste léger sur téléphone). Ajouter une région = une fonction de construction déterministe + une position. Sauvegarde schéma 2 (conversion automatique des parties v1).

## Architecture
```
game-src/src/core/   règles pures (aucun import Phaser) : config, iso, map, movement, rng…
game-src/src/game/   client Phaser : scènes, textures procédurales, contrôles, HUD
game-src/tests/      tests Vitest du core
game/                build généré (ne pas modifier à la main)
```
Commandes (dans `game-src/`) : `npm install`, `npm run dev`, `npm test`, `npm run build` (vérifie les types puis compile dans `../game`).
Tous les réglages de gameplay : `game-src/src/core/config.ts`.
Fichiers clés du core : `items.ts` (objets), `inventory.ts`, `ledger.ts` (capsules), `state.ts` (état de partie, butin, conteneurs, migrations), `map.ts` (cartes + objets interactifs). Côté client : `game/save.ts`, `game/panels.ts` (fenêtres HTML), `game/scenes/RefugeScene.ts`.
Débogage : `window.__scene` (état, joueur) dans la console du navigateur.

## Étape 1 — Tranche verticale solo (en cours)
- [x] **Session 1** : socle TS/Vite/Phaser, rendu iso 64×32 avec tri en profondeur, textures en blocs générées par le code, refuge 32×32 déterministe (cabane, route, forêt, caisses), survivant 8 directions, collisions, course + endurance, caméra qui suit, zoom (molette, pincement, boutons), transparence des blocs qui cachent le joueur, joystick + bouton course sur téléphone, bouton retour au planning, lien depuis le mode Maintenant, 10 tests.
- [x] **Session 2** : interaction (E / bouton ✋, objet surligné, invite, fouille 0,9 s en temps réel), conteneurs au butin tiré une seule fois (graine = id du conteneur, jamais retiré), caisse de départ (10 bois, 5 ferraille, remise à niveau 1 fois/jour), inventaire 12 emplacements + poids (20, tolérance 10, surcharge = ralenti sans course), équipement (sac, outil), fenêtres inventaire (I) et conteneur (prendre / déposer / tout prendre), **registre des capsules append-only idempotent** (20 capsules de départ), sauvegarde IndexedDB + copie localStorage synchrone (la plus récente gagne), schéma v1 + `migrate()`, 19 tests.
- [x] **Session 3** : moteur d'économie `core/economy.ts` (pur, testé) qui DÉDUIT récompenses et contrats des données du planning (tâches + journal `events` déjà synchronisé). Clés stables : `task:<id>:start|slot:n|step:n|complete`, `earlybird:<jour>` → rouvrir / resynchroniser ne rapporte jamais deux fois. Activation : `EconomyConfig.activatedAt` (26/11 04:00 UTC) ; délai d'annulation 10 s. Barème : démarrage 10 (après 3 min), petite 25 / moyenne 60 / grosse 100, bonus rapide +20 % (un clic, ou commencée et finie le même jour), enveloppe des grosses tâches répartie sur leurs journées (70 %) + étapes (5, max 3). Contrats : un par tâche, modèle narratif selon la catégorie, graine fixe, états RUMOR / IN_PROGRESS / LOOT_AVAILABLE / LOOT_CLAIMED / ARCHIVED, butin pré-tiré. Compilé aussi en `game/economy.js` (5 Ko) chargé par le planning : **même solde des deux côtés** (registre du jeu + récompenses pas encore inscrites). Jeu : `game/bridge.ts` inscrit les récompenses au registre (à l'ouverture, en direct si le planning change, toutes les 15 s), journal radio (J / 📻). Planning : carte « 🧢 capsules · 📦 À aller chercher » + lien vers le jeu, boutons 🌙 Je me couche / ☀️ Je suis levé (Réglages : 23:00, 09:00, 5 h min). 31 tests.
- [x] **Session 4** : `WorldScene` multi-zones (sorties sur la route, fondu), **garage de Riverside** (`buildGarage`, briques, béton, parking, cour) avec une cache par contrat LOOT_AVAILABLE (20 emplacements `GARAGE_CACHE_SLOTS`, butin pré-tiré du contrat) ; cache vidée = `state.claimed` (le planning affiche LOOT_CLAIMED) ; **réparation de l'établi** (10 bois + 5 ferraille, `state.built`) ; **synchro de la partie** via le Gist du planning (fichier `last-outpost-save.json`, `game/cloud.ts`, fusion `mergeSaves` : la plus récente fait foi, registre/caches/constructions réunis, capsules jamais additionnées) ; 37 tests + parcours complet du cahier (partie 30, 17 points) joué dans le navigateur, + synchro PC → téléphone : tout vert.

**✅ Étape 1 terminée (26/11/2026).**

Astuce tests : en navigateur headless le jeu tourne à peu d'images/seconde (pas de GPU) et chaque pas de temps est plafonné à 0,05 s : garder les touches enfoncées jusqu'à une condition (`waitForFunction`) plutôt qu'un délai fixe. Ne pas utiliser l'horloge simulée de Playwright pendant les phases jouées (elle fige l'animation) : reculer plutôt l'heure des événements du planning.

## Étapes suivantes
**Fait après l'étape 1** : monde continu (refuge au nord, garage 32 cases au sud, reliés par la route), 38 tests.
**Prochaine session proposée** : test de style graphique (personnage Mixamo marche/course 8 directions, mur, sol, caisse rendus par un script Blender) OU étape 2 (survie et combat) — à choisir par l'utilisateur.
2. Survie et combat · 3. Construction et crafting · 4. Économie et contrats complets · 5. Missions et histoire · 6. Régions et carte · 7. Ergonomie et équilibrage
M1. Fondations multijoueur · M2. Visites · M3. Commerce · M4. Coopération · M5. Compétition · M6. Monde communautaire
(détail, estimations et justification : voir l'analyse du 26/11/2026, reprise ci-dessus dans « Décisions »)

## Points d'attention
- Ne jamais modifier les tâches depuis le jeu : le jeu ne fait que réagir aux événements.
- Pas de punition d'inactivité, pas de série, pas de rouge culpabilisant.
- Toute récompense passe par le registre avec la clé `eventId + ruleId + version`.
