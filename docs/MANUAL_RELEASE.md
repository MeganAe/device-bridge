# Builds manuels pour Windows, macOS et Linux

## Lancer une construction depuis GitHub

1. Pousser le dépôt sur le GitHub du projet (profil du propriétaire : [Metoushela Walker](https://github.com/MeganAe)).
2. Ouvrir l’onglet **Actions**.
3. Choisir **Builds manuels multiplateformes**.
4. Cliquer **Run workflow**.
5. Sélectionner `all`, `windows`, `macos` ou `linux`, puis saisir le numéro de version, par exemple `0.2.0`.
6. Une fois terminé, télécharger les artefacts dans le résumé du workflow.

Le workflow est déclenché uniquement à la demande (`workflow_dispatch`). Il construit sur deux générations de runners par système :

| Cible | Runners de build | Sorties attendues |
|---|---|---|
| Windows | Windows Server 2022 et 2025 | installateurs Windows générés par Tauri |
| macOS | macOS 14 et 15 | application/macOS bundle pour l’architecture native du runner |
| Linux | Ubuntu 22.04 et 24.04 | paquets générés par Tauri pour Linux |

Chaque job prépare uniquement Android SDK Platform-Tools 37.0.1 pour le système cible, vérifie la somme SHA-1 publiée dans les métadonnées Google, puis inclut ADB et ses bibliothèques nécessaires comme ressources Tauri. Aucun moteur tiers de miroir n’est empaqueté. Les binaires téléchargés restent hors du dépôt Git. La version vérifiée se trouve dans `scripts/prepare_tools.py`.

Les runners permettent de contrôler plusieurs environnements de compilation. Ils ne garantissent pas, à eux seuls, que chaque ancien système d’exploitation cible fonctionnera : la compatibilité doit être testée sur de vraies versions de Windows, macOS et distributions Linux. Pour un binaire macOS universel Intel + Apple Silicon, il faudra ajouter explicitement une construction `universal-apple-darwin` et les cibles Rust correspondantes.

## Build local, à la main

Construire un paquet doit se faire sur une machine du système cible. Installer Python 3.9+, Node.js/npm et les prérequis Tauri, puis :

```sh
npm ci
python3 scripts/prepare_tools.py
npm run set-version -- 0.2.0   # optionnel
npm run build
```

Sous Windows PowerShell :

```powershell
npm ci
py -3 scripts/prepare_tools.py
npm run set-version -- 0.2.0
npm run build
```

Les scripts `scripts/build.sh` et `scripts/build.ps1` téléchargent et préparent aussi les outils avant de lancer le build. Ils ne font pas de cross-compilation : Windows produit Windows, macOS produit macOS, Linux produit Linux.

Sortie : `src-tauri/target/release/bundle/`.

## Prérequis de compilation

- Windows : Rust, outils C++ MSVC, WebView2, Node.js/npm et Python 3.9+.
- macOS : Rust, outils en ligne de commande Xcode, Node.js/npm et Python 3.9+.
- Linux : Rust et WebKitGTK 4.1, GTK, OpenSSL, librsvg, libxdo, les bibliothèques d’indicateur requises par Tauri, Node.js/npm et Python 3.9+. La [documentation Tauri](https://v2.tauri.app/start/prerequisites/) donne les commandes par distribution.

Ubuntu 22.04 est utilisé comme base Linux dans le workflow parce que le projet cible WebKitGTK 4.1. Pour construire et tester des paquets destinés à d’autres distributions, ajouter des runners ou des machines correspondants.

## Signature et publication

Les builds de départ sont non signés. Avant une distribution publique :

- Windows : obtenir un certificat de signature de code et le configurer dans les secrets du dépôt.
- macOS : configurer un certificat Apple Developer et la notarisation ; ne jamais committer les certificats ou mots de passe.
- Linux : envisager la signature du dépôt ou des paquets selon le canal de distribution.

Le workflow conserve les fichiers en tant qu’artefacts. Il ne crée pas automatiquement de Release GitHub et ne publie pas sur un store. Les binaires tiers et leurs notices sont détaillés dans [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
