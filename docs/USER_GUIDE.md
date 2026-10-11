# Guide utilisateur

Device Bridge est une application de bureau qui détecte et contrôle des appareils Android. ADB est fourni par le paquet. Le moteur de miroir maison est en développement et n’est pas encore disponible.

## Première connexion par USB

1. Sur le téléphone, ouvrez **Paramètres → À propos du téléphone** et touchez plusieurs fois **Numéro de build** pour activer les Options pour les développeurs (le chemin exact varie selon le fabricant).
2. Activez **Débogage USB** dans les Options pour les développeurs.
3. Branchez le téléphone à l’ordinateur avec un câble compatible données et déverrouillez-le.
4. Acceptez la demande **Autoriser le débogage USB** sur Android. Ne l’acceptez que sur un ordinateur de confiance.
5. Dans Device Bridge, cliquez sur **Actualiser** ou **Rechercher les appareils**.
6. Une fois l’appareil connecté, les commandes ADB et les transferts sont disponibles. Le miroir vidéo est désactivé jusqu’à la sortie du moteur Device Bridge maison.

## Connexion sans fil

Android 11 ou une version ultérieure est recommandé pour le flux d’appairage intégré.

1. Connectez le téléphone et l’ordinateur au même réseau local.
2. Ouvrez **Options pour les développeurs → Débogage sans fil** et activez-le.
3. Dans Device Bridge, ouvrez **Connexion Wi‑Fi → Saisir les informations d’appairage**.
4. Sur Android, choisissez **Appairer avec un code**. Saisissez dans Device Bridge l’adresse et le code à six chiffres affichés.
5. Une fois l’appairage terminé, saisissez l’adresse IP et le port de débogage affichés sur l’écran principal de Débogage sans fil.
6. Gardez le téléphone et l’ordinateur sur le même réseau. Le port sans fil peut changer après une reconnexion.

## Contrôles et captures

- Le bouton de réglages d’un appareil permet de régler sa luminosité si le fabricant autorise la commande.
- **Capture d’écran** enregistre une image dans `Pictures/Device Bridge` ; les notifications natives peuvent être activées dans Paramètres.
- Le miroir vidéo et l’enregistrement restent désactivés jusqu’à ce que le moteur propriétaire soit réellement développé et testé.

## Fichiers, journaux et commandes ADB

- **Installer un APK…** choisit un fichier `.apk` sur l’ordinateur et l’installe sur l’appareil actif en conservant une application existante lorsque c’est possible.
- **Envoyer un fichier…** copie le fichier dans le dossier `Download` Android et affiche la progression fournie par ADB.
- **Récupérer un fichier…** demande un chemin Android absolu, par exemple `/sdcard/Download/rapport.pdf`, puis une destination locale.
- **Ouvrir les journaux (logcat)** affiche le flux Android en direct, filtrable par texte et niveau. Il s’arrête à la fermeture du panneau ou au débranchement.
- **Terminal ADB** envoie une commande `adb shell` à l’appareil actif. Une confirmation est demandée avant chaque commande ; vérifiez soigneusement les commandes sensibles.
- Le menu **Aide → Vérifier les mises à jour** compare la version locale avec la dernière publication GitHub stable. Il n’installe rien automatiquement.

Le miroir final utilisera le moteur Device Bridge et un compagnon Android demandant le consentement système pour la capture. L’architecture et l’état d’avancement sont décrits dans [`MIRROR_ENGINE.md`](MIRROR_ENGINE.md).

## Fenêtre et navigation

La barre supérieure personnalisée permet de déplacer la fenêtre et d’utiliser les commandes réduire, agrandir/restaurer et fermer. La taille de démarrage est calculée depuis la zone de travail du moniteur et la fenêtre est centrée après redimensionnement ; elle n’est pas maximisée automatiquement. Les barres de défilement sont masquées, mais le défilement à la molette et au pavé tactile reste actif.

La barre latérale donne accès aux pages **Appareils**, **Paramètres** et **Documentation**. Les paramètres généraux sont locaux à l’ordinateur et restent enregistrés après fermeture de l’application.

## Sécurité

Le débogage USB autorise un ordinateur à exécuter des opérations puissantes sur le téléphone. Utilisez uniquement un ordinateur de confiance, désactivez le débogage USB lorsque vous n’en avez plus besoin et ne partagez pas les codes ou ports d’appairage. Une connexion sans fil n’est pas un service distant : elle est limitée au réseau configuré par Android.
