# Planning × Minecraft — notes de conception (28/11/2026)

## Idée validée par l'utilisateur
- Le planning est relié à **son serveur Minecraft**.
- **La carte se débloque au fur et à mesure de l'avancement réel** : la bordure du monde s'agrandit quand des tâches sont faites. Elle ne rétrécit jamais (aucune punition).
- **Une saison = un an** : remise à zéro du monde une fois par an (date à fixer), avec un mémorial de la saison.
- **Survie extrême.**
- Deux joueurs : l'utilisateur et sa compagne, chacun relié à son propre planning.

## Architecture proposée (à confirmer)
- Plugin serveur (Paper/Spigot si serveur Java) qui lit le Gist privé de chaque joueur (déjà utilisé par la synchro du planning) toutes les ~30 s.
- Récompenses déduites des événements du planning avec les mêmes clés anti-doublon que Last Outpost (`task:<id>:complete`…), mémorisées côté plugin.
- Le plugin peut écrire un petit fichier d'état dans le Gist (taille de la bordure, saison) pour l'afficher dans le planning.
- Aucun port à ouvrir ; fonctionne même si le serveur était éteint (rattrapage à la reconnexion).

## Informations manquantes avant de coder
- Type de serveur (Java Paper/Spigot/Purpur, Fabric/Forge, ou Bedrock) et version.
- Hébergement (chez soi / VPS / hébergeur payant / Aternos — Aternos interdit les plugins personnels).
- Pseudos Minecraft des deux joueurs.
- Règles de « survie extrême » et de taille de bordure à valider.
