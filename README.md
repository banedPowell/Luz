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

### Configuration

Luz se configure par des variables d'environnement `NUXT_*`, toutes décrites avec leur valeur par défaut dans [`apps/web/.env.example`](apps/web/.env.example) :

| Variable            | Rôle                                               | Défaut                                                                                                                 |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `NUXT_DATA_DIR`     | Dossier des données de Luz (base, cookies, caches) | Windows `%APPDATA%\Luz`, macOS `~/Library/Application Support/Luz`, Linux `$XDG_DATA_HOME/luz` ou `~/.local/share/luz` |
| `NUXT_YT_DLP_PATH`  | Commande ou chemin de yt-dlp                       | `yt-dlp`                                                                                                               |
| `NUXT_FFMPEG_PATH`  | Commande ou chemin de FFmpeg                       | `ffmpeg`                                                                                                               |
| `NUXT_FFPROBE_PATH` | Commande ou chemin de ffprobe                      | `ffprobe`                                                                                                              |

Le dossier de données est créé au premier démarrage. En développement, copie `apps/web/.env.example` en `apps/web/.env` : il règle `NUXT_DATA_DIR=.luz`, ce qui garde tes données de dev à part de tes vraies données. Les journaux du serveur vont sur la sortie standard.

La base SQLite (`luz.db`) vit dans ce dossier ; ses migrations s'appliquent toutes seules au démarrage du serveur. Pour faire évoluer le schéma (`apps/web/server/infrastructure/database/schema.ts`) :

```sh
vp run db:generate --name <nom>   # génère la migration à committer avec le schéma
vp run db:studio                  # explore la base avec Drizzle Studio
```

Avant de proposer une modification, lance ce que lance la CI :

```sh
vp check           # formatage, lint et types
vp run typecheck   # vérification des types de chaque paquet
vp run test        # tous les tests
vp run build       # build de production
```

Un test lance l'app buildée dans Chromium (headless, via Playwright). Installe le navigateur une fois, depuis `apps/web` :

```sh
vp exec playwright-core install --only-shell chromium
```

## Contribuer

Le fonctionnement est décrit dans [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE.md) : libre d'utilisation, de modification et de partage pour tout usage non commercial. Un usage commercial nécessite un accord préalable.
