# Paramètres de l’application

La page **Paramètres** configure Device Bridge sur l’ordinateur courant. Les préférences sont stockées dans le stockage local de l’application ; elles ne sont pas synchronisées vers le cloud.

## Apparence

- **Système** : suit le thème clair ou sombre du système d’exploitation.
- **Clair** et **Sombre** : forcent le thème de l’interface Device Bridge.

## Détection automatique

La détection en arrière-plan peut être activée ou désactivée. Quand elle est activée, Device Bridge recherche les appareils à l’intervalle choisi : 10, 15 ou 30 secondes. Le bouton **Actualiser** permet toujours de lancer une recherche immédiate.

La détection utilise les outils Android embarqués par l’application. Elle n’installe pas de logiciel système sur l’ordinateur.

## Notifications système

Les options suivantes utilisent le plugin de notifications natif de Tauri, et non l’API de notification du navigateur :

- nouvel appareil connecté ;
- capture d’écran enregistrée ;
- appairage ou connexion sans fil réussi.

Le système d’exploitation peut demander une autorisation au premier envoi. Si les notifications sont refusées au niveau du système, les messages restent disponibles dans l’interface. Chaque catégorie peut être désactivée séparément.

## Confidentialité et dépannage

Les réglages de thème, d’actualisation, de notifications et les options vidéo par appareil restent sur l’ordinateur. Les réglages vidéo sont indexés par numéro de série Android dans le stockage local de l’application.

Pour les erreurs de lancement, de fenêtre noire ou d’installation Windows, consultez [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md). Les paramètres de luminosité sont des commandes propres à chaque appareil, décrites dans [`DEVICE_CONTROLS.md`](DEVICE_CONTROLS.md).
