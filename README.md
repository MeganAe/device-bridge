# Device Bridge

Application de bureau pour détecter et contrôler des appareils Android depuis Windows, macOS et Linux.

- **Auteur :** [@MeganAe](https://github.com/MeganAe)
- **Licence du code original :** MIT (voir [`LICENSE`](LICENSE))
- **État :** prototype de bureau en développement.

## Fonctions présentes dans le code

- Détection des appareils Android par USB, appairage et connexion au débogage sans fil.
- Miroir et contrôle interactif avec scrcpy ; réglages par appareil pour la résolution maximale, les FPS, le débit, le codec et l’audio. Les préférences vidéo sont conservées localement sur l’ordinateur.
- Réglage de luminosité Android en mode manuel ou automatique.
- Capture d’écran PNG dans `Pictures/Device Bridge` et enregistrement MP4 dans `Videos/Device Bridge` (Windows/Linux) ou `Movies/Device Bridge` (macOS). Détails et limites : [`docs/DEVICE_CONTROLS.md`](docs/DEVICE_CONTROLS.md).
- ADB et scrcpy **embarqués dans les paquets publiés** : l’utilisateur final n’a pas à les installer séparément.
- Workflow GitHub Actions manuel pour générer des paquets par système et version de runner.

Le workflow récupère l’archive officielle de scrcpy **5.0.1**, vérifie son SHA‑256 et l’ajoute aux ressources Tauri. Cette archive contient scrcpy et ADB pour la cible de build. Les binaires téléchargés ne sont pas conservés dans le dépôt source ; les notices amont sont conservées dans le paquet. scrcpy est publié sous Apache-2.0 sur son [dépôt officiel](https://github.com/Genymobile/scrcpy).

La disponibilité de l’audio dépend notamment de la version Android (scrcpy le prend en charge à partir d’Android 11) et les codecs proposés dépendent des encodeurs du téléphone. Le réglage de luminosité peut également varier selon le fabricant. Le transfert de fichiers, les macros, l’installation d’APK depuis l’interface et l’assistance à distance ne sont pas encore implémentés. L’aperçu navigateur montre seulement l’interface ; il ne peut pas accéder aux appareils USB.

## Développer et construire localement

### Prérequis

- Node.js 20+ et npm.
- Python 3.9+ pour préparer les outils embarqués.
- Rust stable/Cargo et les dépendances de compilation Tauri pour le système cible.

### Windows

Après avoir installé Rust, les outils C++ MSVC, WebView2 et Python :

```powershell
npm ci
py -3 scripts/prepare_tools.py
npm run dev
```

### macOS

Après avoir installé Rust, les outils en ligne de commande Xcode et Python :

```sh
npm ci
python3 scripts/prepare_tools.py
npm run dev
```

### Linux (Debian/Ubuntu)

```sh
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
npm ci
python3 scripts/prepare_tools.py
npm run dev
```

La liste complète des prérequis Tauri par système est dans la [documentation officielle](https://v2.tauri.app/start/prerequisites/).

Pour produire l’installateur local, exécuter `scripts/build.ps1` sous Windows ou `scripts/build.sh` sous macOS/Linux. Les paquets se trouvent sous `src-tauri/target/release/bundle/`. Ces scripts ne font pas de cross-compilation : il faut construire chaque cible sur le système correspondant. En mode développement (`npm run dev`), le terminal qui lance Tauri reste ouvert normalement ; les paquets installables, eux, ne doivent pas ouvrir de console. ADB sert à détecter l’appareil ; scrcpy ne démarre que sur action explicite de l’utilisateur.

## Aperçu de l’interface

```sh
python3 -m http.server 1420 --directory ui --bind 0.0.0.0
```

Ouvrir `http://localhost:1420`. Le navigateur n’exécute pas ADB ; les binaires intégrés sont utilisés par l’application native.

## Builds manuels sur GitHub

Dans **Actions → Builds manuels multiplateformes → Run workflow**, choisir `all`, `windows`, `macos` ou `linux`, puis saisir la version. Le workflow télécharge et vérifie les outils nécessaires, les inclut dans l’application et conserve les installateurs comme artefacts. Détails : [`docs/MANUAL_RELEASE.md`](docs/MANUAL_RELEASE.md).

Les builds sont actuellement non signés. La signature Windows et la signature/notarisation macOS restent à configurer avant une diffusion publique.

## Sécurité et licences

- L’interface ne peut appeler que des commandes natives ciblées ; aucune commande shell générique n’est exposée.
- Le débogage USB donne des permissions importantes : n’autorisez que les ordinateurs de confiance.
- Le code original du projet est MIT. Les binaires embarqués et leurs composants conservent leurs licences et notices amont ; voir [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
- Les sessions distantes et le cloud ne font pas partie de ce prototype.
