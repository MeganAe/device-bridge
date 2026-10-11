# Contrôles de l’appareil

Cette version utilise ADB pour la détection, les commandes Android, les transferts, l’installation d’APK, logcat, la luminosité et les captures PNG.

## Disponibilité

- **Luminosité :** mode manuel ou automatique, selon les permissions et l’implémentation du fabricant.
- **Capture :** PNG enregistré sous `Pictures/Device Bridge` dans le dossier utilisateur.
- **Miroir vidéo, commandes tactiles et enregistrement :** désactivés dans cette version. Le moteur propriétaire Device Bridge et son compagnon Android ne sont pas encore implémentés; aucun moteur de miroir tiers n’est lancé.

Ne pas réactiver les boutons vidéo tant que le flux n’est pas réellement traité par le moteur Device Bridge et validé sur un appareil Android. Les exigences techniques sont dans [`MIRROR_ENGINE.md`](MIRROR_ENGINE.md).
