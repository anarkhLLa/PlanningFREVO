# Planning — app téléphone

App de planning très simple (PWA : s'installe sur l'écran d'accueil, marche hors-ligne).

- **Couleurs** : chaque tâche a sa propre couleur (aléatoire, bouton 🎲 pour en changer) ; le **petit carré** devant le titre indique l'importance : rouge (urgent), orange (important), jaune (normal), blanc (faible). **Vert** = terminée, **violet** = bloquée, grisée barrée = abandonnée.
- **Contour d'importance** : chaque tâche à faire est entourée de la couleur de son importance (épaisseur réglable de 0 à 6 px dans Réglages ; le petit carré peut être masqué). Les tâches terminées ou barrées n'ont pas de contour et sont estompées ; une tâche en retard porte une étiquette EN RETARD.
- **Jours** : couleur fixe — lundi gris, mardi jaune, mercredi orange, jeudi bleu, vendredi vert, samedi rouge, dimanche blanc. Chaque jour est coupé en **Matin** / **Après-midi** : on glisse la tâche dans la demi-journée voulue (ou on choisit dans le menu de la tâche).
- **Planning** : semaines en colonnes verticales (lundi → dimanche), la semaine actuelle à gauche, de 1 à 8 semaines côte à côte (boutons − / +), navigation ‹ Auj. ›.
- **Glisser-déposer** : appui long sur une tâche puis glisser vers un autre jour (ou vers « À planifier »).
- **Étaler sur plusieurs jours** (menu de la tâche → Durée, de 1 à 14 jours) : ça ne crée pas de nouvelle tâche ; la tâche reste dans « À planifier » (×2 = 2 jours encore à placer) et on la glisse autant de fois que nécessaire. Dans le planning, chaque case affiche j1/3, j2/3… et chaque jour peut être marqué « Journée faite ».
- **Besoins** : chaque tâche a sa liste (ex. « 2 paquets de vis »), visible dans l'onglet 🛒 Besoins où on les coche une fois obtenus. 🛒2 sur une tâche = 2 besoins à obtenir.
- **Toucher une tâche** : Terminé, Barrer, Reporter (+1 jour, +1 semaine, date au choix), Bloquer (violet + ajout aux attentes), changer la couleur, Modifier, Supprimer. « Annuler » dans le message en bas pour revenir en arrière.
- **Fenêtre Attentes** (toujours visible en haut) : colis, pièces, outils… Devient orange le jour de l'arrivée prévue. « Reçu » débloque automatiquement la tâche liée.
- **Réglage des couleurs** (Réglages → Couleurs) : couleurs d'importance, de « terminée » et « bloquée », des 7 jours, liste des couleurs tirées au hasard pour les tâches (ajouter / retirer / redistribuer), couleurs d'alerte et couleur principale. Bouton pour revenir aux couleurs d'origine.
- **Fond d'écran et transparence** (Réglages) : photo du téléphone en fond (réduite automatiquement), assombrir et flouter le fond, opacité des tâches, des cases jours et des panneaux. L'image reste sur le téléphone et n'est pas incluse dans l'export.
- **Catégories** (Réglages → Catégories) : trois listes modifiables — Tâches, Attentes, Besoins. Ajouter, renommer ✎ (tout ce qui l'utilise suit), monter ↑, supprimer ✕ (les éléments passent en « Sans catégorie »). Les attentes sont regroupées par catégorie dans la fenêtre Attentes ; l'onglet Besoins peut s'afficher « Par tâche » ou « Par catégorie » (pratique comme liste de courses). Toucher une attente ou un besoin permet de le modifier.
- **Notifications** (Réglages → Activer) : résumé des tâches du jour, en retard, des colis attendus et des besoins non remplis.
- **Sauvegarde** : données stockées sur le téléphone, export/import d'un fichier JSON dans Réglages.

## Apparence
Thème « verre » sombre (panneaux translucides sur fond dégradé ou fond d'écran). Seules couleurs : l'importance (trait à gauche de chaque tâche, réglable) et la couleur du nom de chaque jour.

**Sur ordinateur** : menu latéral, chaque semaine sur une ligne de 7 jours, glisser-déposer à la souris, menus en fenêtre centrée. Raccourcis : **N** nouvelle tâche, **← →** semaine précédente / suivante, **T** aujourd'hui, **Échap** fermer.

## Synchronisation téléphone ↔ ordinateur
Réglages → Synchronisation : coller un jeton GitHub (permission « gist » uniquement, créé sur https://github.com/settings/tokens/new?scopes=gist&description=Planning). L'app crée un Gist **privé** « planning-sync.json » et s'y synchronise : à l'ouverture, au retour sur l'app, toutes les 45 s et quelques secondes après chaque modification. La fusion se fait tâche par tâche (la modification la plus récente gagne, les suppressions sont conservées), donc on peut modifier sur les deux appareils. Le fond d'écran n'est pas synchronisé.

Utiliser la même adresse sur tous les appareils, idéalement GitHub Pages (pas raw.githack.com, qui est partagé avec d'autres sites).

## Installation
Adresse : **https://anarkhlla.github.io/PlanningFREVO/**
(GitHub Pages : Settings → Pages → Branch `main`, dossier `/ (root)`).

- **Android (Chrome)** : menu ⋮ → « Installer l'application ».
- **iPhone (Safari)** : Partager → « Sur l'écran d'accueil », puis ouvrir l'app installée et activer les notifications (iOS 16.4 minimum).
