# Guide utilisateur

Device Bridge est une application de bureau qui détecte des appareils Android et permet de les afficher depuis l’ordinateur. Les binaires ADB nécessaires sont fournis par les paquets de l’application : il n’est pas nécessaire d’installer ADB ou scrcpy séparément.

## Première connexion par USB

1. Sur le téléphone, ouvrez **Paramètres → À propos du téléphone** et touchez plusieurs fois **Numéro de build** pour activer les Options pour les développeurs (le chemin exact varie selon le fabricant).
2. Activez **Débogage USB** dans les Options pour les développeurs.
3. Branchez le téléphone à l’ordinateur avec un câble compatible données et déverrouillez-le.
4. Acceptez la demande **Autoriser le débogage USB** sur Android. Ne l’acceptez que sur un ordinateur de confiance.
5. Dans Device Bridge, cliquez sur **Actualiser** ou **Rechercher les appareils**.
6. Quand l’appareil est indiqué comme connecté, choisissez **Afficher l’écran** pour ouvrir le miroir.

## Connexion sans fil

Android 11 ou une version ultérieure est recommandé pour le flux d’appairage intégré.

1. Connectez le téléphone et l’ordinateur au même réseau local.
2. Ouvrez **Options pour les développeurs → Débogage sans fil** et activez-le.
3. Dans Device Bridge, ouvrez **Connexion Wi‑Fi → Saisir les informations d’appairage**.
4. Sur Android, choisissez **Appairer avec un code**. Saisissez dans Device Bridge l’adresse et le code à six chiffres affichés.
5. Une fois l’appairage terminé, saisissez l’adresse IP et le port de débogage affichés sur l’écran principal de Débogage sans fil.
6. Gardez le téléphone et l’ordinateur sur le même réseau. Le port sans fil peut changer après une reconnexion.

## Affichage, contrôle et captures

- **Afficher l’écran** ouvre le miroir pour l’appareil sélectionné.
- Le bouton de réglages de l’appareil donne accès à la luminosité, la qualité vidéo, l’audio et l’enregistrement disponibles dans la version actuelle.
- **Capture d’écran** enregistre une image dans `Pictures/Device Bridge` du compte utilisateur ; les notifications natives peuvent être activées dans Paramètres.
- **Enregistrer l’écran** démarre scrcpy avec l’enregistrement MP4 dans `Videos/Device Bridge` (Windows/Linux) ou `Movies/Device Bridge` (macOS). Fermez la fenêtre scrcpy pour terminer le fichier.
- La qualité vidéo peut être réduite pour améliorer la fluidité sur un réseau lent ou un téléphone moins puissant.

## Fichiers, journaux et commandes ADB

- **Installer un APK…** choisit un fichier `.apk` sur l’ordinateur et l’installe sur l’appareil actif en conservant une application existante lorsque c’est possible.
- **Envoyer un fichier…** copie le fichier dans le dossier `Download` Android et affiche la progression fournie par ADB.
- **Récupérer un fichier…** demande un chemin Android absolu, par exemple `/sdcard/Download/rapport.pdf`, puis une destination locale.
- **Ouvrir les journaux (logcat)** affiche le flux Android en direct, filtrable par texte et niveau. Il s’arrête à la fermeture du panneau ou au débranchement.
- **Terminal ADB** envoie une commande `adb shell` à l’appareil actif. Une confirmation est demandée avant chaque commande ; vérifiez soigneusement les commandes sensibles.
- Le menu **Aide → Vérifier les mises à jour** compare la version locale avec la dernière publication GitHub stable. Il n’installe rien automatiquement.

Le moteur de miroir intégré utilise scrcpy et ADB ; les binaires sont fournis dans les paquets. scrcpy ne démarre que lorsque vous demandez explicitement le miroir. Voir [`MIRROR_ENGINE.md`](MIRROR_ENGINE.md).

## Fenêtre et navigation

La barre supérieure personnalisée permet de déplacer la fenêtre et d’utiliser les commandes réduire, agrandir/restaurer et fermer. La taille de démarrage est calculée depuis la zone de travail du moniteur et la fenêtre est centrée après redimensionnement ; elle n’est pas maximisée automatiquement. Les barres de défilement sont masquées, mais le défilement à la molette et au pavé tactile reste actif.

La barre latérale donne accès aux pages **Appareils**, **Paramètres** et **Documentation**. Les paramètres généraux sont locaux à l’ordinateur et restent enregistrés après fermeture de l’application.

## Sécurité

Le débogage USB autorise un ordinateur à exécuter des opérations puissantes sur le téléphone. Utilisez uniquement un ordinateur de confiance, désactivez le débogage USB lorsque vous n’en avez plus besoin et ne partagez pas les codes ou ports d’appairage. Une connexion sans fil n’est pas un service distant : elle est limitée au réseau configuré par Android.
