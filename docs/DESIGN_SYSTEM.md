# Décisions de conception

## Références consultées

- **Windows :** [Microsoft — Design Windows apps](https://learn.microsoft.com/en-us/windows/apps/design/). Les recommandations officielles couvrent la navigation, la mise en page, la typographie, l’accessibilité et l’adaptation aux tailles de fenêtre.
- **macOS :** [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/), en particulier les recommandations macOS et les mises en page à volets.
- **Linux/GNOME :** [GNOME Human Interface Guidelines](https://developer.gnome.org/hig/) et [Navigation](https://developer.gnome.org/hig/guidelines/navigation.html), qui préconisent des vues ciblées et une navigation simple.

## Direction retenue

Device Bridge est d’abord une **application de bureau Android**, pas une interface mobile transposée. L’application utilise la barre de titre native du système, une navigation latérale stable, des listes alignées, des commandes explicites et les polices système. La mise en page est partagée, tandis que la police et quelques dimensions suivent la plateforme détectée.

- **Windows :** hiérarchie visuelle sobre inspirée de Fluent, avec une surface claire, une seule couleur d’accent et des états de contrôle lisibles.
- **macOS :** police système et contrôles simples ; la barre de titre et les commandes de fenêtre restent natives.
- **Linux :** police système et rayons plus discrets, sans supposer un thème GNOME particulier.
- **Thèmes :** clair ou sombre selon la préférence système.

Material Design n’est pas appliqué mécaniquement à cette interface desktop : ses motifs Android ne remplacent pas les conventions de fenêtre et de navigation de Windows, macOS ou Linux.

## Règles demandées pour éviter l’aspect « template IA »

1. Pas de badges décoratifs, de rangées de pastilles, de compteurs marketing ou de fausses statistiques.
2. Pas de dégradés, d’illustrations de remplissage, d’émojis d’interface ni de messages promotionnels.
3. Une seule vue principale utile : la liste des appareils. Le diagnostic se trouve dans une vue distincte.
4. Chaque message explique un état réel ou l’action nécessaire ; pas de notifications répétitives.
5. Les séparateurs et la typographie structurent l’écran ; les panneaux ne sont pas empilés en cartes sans raison.
6. Les actions sont nommées par leur résultat (« Rechercher les appareils », « Appairer », « Afficher l’écran »).
7. Aucun CDN, police distante ou ressource externe nécessaire à l’interface.
8. Les interactions sont accessibles au clavier et disposent d’un état de focus visible.

Le nom affiché est Device Bridge. L’icône retenue représente un écran d’ordinateur relié à un téléphone ; les fichiers source et les formats adaptés aux installateurs sont conservés dans `src-tauri/icons/`.
