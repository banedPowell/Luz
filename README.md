# Luz

Luz est un gestionnaire de bibliothèque musicale local d'abord. Il télécharge de la musique depuis des sources en ligne, la tague correctement et la range sous forme de simples fichiers audio sur ton propre disque.

> **État :** développement précoce. L'application n'a encore qu'une coquille (barre latérale, thèmes, pages vides) ; aucune fonctionnalité musicale n'est utilisable. Voir la [feuille de route](docs/ROADMAP.md).

## Pourquoi

La musique que tu possèdes devrait vivre dans des fichiers que tu contrôles, avec des métadonnées propres, des noms de dossiers cohérents et des playlists qui te suivent d'un appareil à l'autre. Luz veut rendre cela simple :

- **Télécharger** des titres, albums et playlists depuis des sources configurables, grâce à [yt-dlp](https://github.com/yt-dlp/yt-dlp) et [FFmpeg](https://ffmpeg.org/).
- **Organiser** une bibliothèque de titres, d'albums et d'artistes, construite à partir des fichiers eux-mêmes.
- **Taguer** les fichiers avec des métadonnées et des pochettes exactes, récupérées auprès du fournisseur le plus pertinent, avec une correction manuelle quand l'automatisation se trompe.
- **Composer** des playlists et les exporter.
- **Emporter sa musique** grâce à des profils d'appareil (téléphone, baladeur, ordinateur) qui définissent chacun leur format, leur qualité et leur nommage.

Luz commence comme une application web qui tourne sur ton propre ordinateur. L'auto-hébergement avec Docker, l'authentification optionnelle et le multi-utilisateur viendront plus tard.

## Démarrer

Prérequis : Node (version dans [`.nvmrc`](.nvmrc)) et Vite+ (`vp`), qui choisit lui-même la bonne version de Node et de pnpm.

```sh
vp install     # dépendances et hooks Git
vp run dev     # serveur de développement sur http://localhost:3000
```

Avant de proposer une modification, lance ce que lance la CI :

```sh
vp check           # formatage, lint et types
vp run typecheck   # vérification des types de chaque paquet
vp run test        # tous les tests
vp run build       # build de production
```

## Contribuer

Le fonctionnement est décrit dans [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE.md) : libre d'utilisation, de modification et de partage pour tout usage non commercial. Un usage commercial nécessite un accord préalable.
