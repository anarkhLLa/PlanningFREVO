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
- [ ] **Session 3** : intégration planning — boîte d'envoi d'événements dans le planning (task.created/started/completed…, ids stables), adaptateur + inbox + registre append-only idempotent, moteur de récompenses (démarrage 3 min, fin, bonus rapide, enveloppe grosses tâches), contrat RUMOR → LOOT_AVAILABLE → LOOT_CLAIMED, solde de capsules et « nouveau à aller chercher » dans le planning, succès « Couché tôt, levé tôt ».
- [ ] **Session 4** : zone du garage reliée par la route, cache du contrat à fouiller, mode construction (établi), synchro de la partie via le Gist, parcours complet du cahier des charges (partie 30, 17 points) testé de bout en bout.

## Étapes suivantes
2. Survie et combat · 3. Construction et crafting · 4. Économie et contrats complets · 5. Missions et histoire · 6. Régions et carte · 7. Ergonomie et équilibrage
M1. Fondations multijoueur · M2. Visites · M3. Commerce · M4. Coopération · M5. Compétition · M6. Monde communautaire
(détail, estimations et justification : voir l'analyse du 26/11/2026, reprise ci-dessus dans « Décisions »)

## Points d'attention
- Ne jamais modifier les tâches depuis le jeu : le jeu ne fait que réagir aux événements.
- Pas de punition d'inactivité, pas de série, pas de rouge culpabilisant.
- Toute récompense passe par le registre avec la clé `eventId + ruleId + version`.
