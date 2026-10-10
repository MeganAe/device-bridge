# Contrôles de l’appareil et réglages du miroir

Device Bridge expose ces commandes dans la fenêtre **Réglages** de chaque appareil Android autorisé. Les options de miroir sont mémorisées localement par numéro de série dans le stockage de l’application ; elles ne sont pas envoyées vers un service distant.

## Fonctions disponibles

- **Luminosité** : curseur Android de 1 à 255, avec choix entre réglage manuel et luminosité automatique.
- **Qualité vidéo** : limite de résolution (ou résolution native), FPS, débit et codec. H.264 est sélectionné par défaut pour privilégier la compatibilité.
- **Audio** : activation ou désactivation de l’audio du téléphone pendant la session.
- **Capture** : capture PNG enregistrée dans `Pictures/Device Bridge` du compte utilisateur.
- **Enregistrement** : option MP4 enregistrée dans `Videos/Device Bridge` sous Windows/Linux et `Movies/Device Bridge` sous macOS. Fermer la fenêtre scrcpy termine la session et son enregistrement.

Ces commandes sont transmises à l’ADB et à scrcpy intégrés dans les paquets de publication. L’interface ne propose pas d’exécution de commande shell arbitraire.

## Notes issues de la documentation officielle

- scrcpy conserve le rapport d’image quand une taille maximale est imposée. Les paramètres de résolution, de fréquence, de débit et de codec sont documentés dans la [documentation vidéo de scrcpy](https://github.com/Genymobile/scrcpy/blob/master/doc/video.md).
- Le transfert audio scrcpy nécessite Android 11 ou ultérieur ; la prise en charge effective des codecs dépend des encodeurs disponibles sur le téléphone. Voir la [documentation audio](https://github.com/Genymobile/scrcpy/blob/master/doc/audio.md).
- scrcpy sait enregistrer une session, notamment en MP4, et finalise le fichier à l’arrêt de la session. Voir la [documentation d’enregistrement](https://github.com/Genymobile/scrcpy/blob/master/doc/recording.md).
- Android documente les réglages système de luminosité et le mode automatique dans [`Settings.System`](https://developer.android.com/reference/android/provider/Settings.System). Device Bridge utilise les valeurs système courantes (`screen_brightness` et `screen_brightness_mode`) via ADB.

## Limites pratiques

Le fabricant, la version Android et les politiques de l’appareil peuvent restreindre la luminosité ou l’accès aux réglages système. Un codec sélectionné peut être absent du téléphone ; dans ce cas scrcpy peut refuser de démarrer la session. L’audio n’est pas disponible sur les anciennes versions d’Android. Ces comportements dépendent de l’appareil et ne peuvent pas être garantis par l’application.
