# Moteur de miroir

Le brief produit le plus récent conserve **ADB et scrcpy** comme moteur de connexion, de miroir et de contrôle. Les versions publiées doivent les embarquer afin que l’utilisateur n’ait rien à installer séparément. Le code source actuel suit déjà ce choix : il lance scrcpy uniquement après une action explicite de l’utilisateur.

Aucune APK compagnon Android ni remplacement propriétaire de scrcpy ne fait partie de l’étape de conception actuelle. Ne pas supprimer ni remplacer scrcpy : les options vidéo, audio et d’enregistrement existantes en dépendent. Le système doit gérer proprement ses processus, notamment à la fermeture de l’application ou au débranchement d’un appareil.
