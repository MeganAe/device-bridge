# Moteur de miroir Device Bridge

## Décision produit

Le miroir final sera développé par Device Bridge : session, protocole de transport, contrôle et interface seront du code du projet. Aucun exécutable tiers de miroir d’écran ne doit être lancé ou inclus dans les ressources du produit.

## État réel

La dépendance et le lancement du moteur de miroir tiers ont été retirés du code hôte et du workflow de préparation. **Le moteur propriétaire n’est pas encore implémenté** : les actions « Afficher l’écran », « Démarrer le miroir » et l’enregistrement vidéo restent donc désactivés plutôt que simulés. ADB reste disponible pour la détection, les commandes, les transferts et l’installation future d’un compagnon.

## Architecture recommandée

- **Hôte de bureau :** Rust/Tauri gère les sessions, l’interface et les transports Device Bridge.
- **Compagnon Android :** application du projet qui demande le consentement `MediaProjection`, capture l’écran et encode en H.264 via `MediaCodec`.
- **Protocole Device Bridge :** protocole de session et de messages conçu par le projet, pour la négociation, le flux vidéo, les commandes de contrôle, la reconnexion et l’arrêt propre.
- **Codecs :** réutiliser d’abord les encodeurs/décodeurs système et les formats standards. Le protocole et le moteur restent propriétaires; réinventer la compression vidéo serait un chantier séparé, long et peu compatible.
- **ADB :** conservé comme pont de connexion et moyen d’installer/démarrer le compagnon. Il ne fait pas le miroir. La version embarquée est Android SDK Platform-Tools uniquement.

Android exige le consentement explicite de l’utilisateur pour la capture d’écran à distance. Le contrôle tactile doit lui aussi respecter les permissions Android et être expliqué avant activation.

## Étapes de développement

1. Créer l’application compagnon et valider la capture MediaProjection sur un appareil réel.
2. Implémenter le protocole local Device Bridge et acheminer un flux vidéo jusqu’à l’hôte Rust/Tauri.
3. Ajouter le rendu fluide, les commandes tactiles, la gestion de rotation/reconnexion, puis l’enregistrement et l’audio.
4. Tester l’ensemble sur de vrais appareils USB et Wi‑Fi, avec plusieurs fabricants et versions Android.
5. N’activer les boutons miroir qu’après ces tests; publier alors les limites et les permissions demandées.
