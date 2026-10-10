# Dépannage

Device Bridge est prévu pour fournir ses outils Android dans l’application installée. L’utilisateur n’a pas à télécharger ni installer ADB ou scrcpy séparément. Les étapes ci-dessous servent à isoler le problème ; elles ne remplacent pas un correctif si l’erreur persiste.

## Aucun appareil détecté

1. Déverrouillez le téléphone et vérifiez qu’il affiche une autorisation de débogage USB en attente.
2. Acceptez uniquement l’ordinateur de confiance. Si une ancienne clé a été refusée, révoquez les autorisations de débogage USB depuis Android, rebranchez le téléphone et acceptez la nouvelle demande.
3. Essayez un câble USB capable de transférer des données et un autre port de l’ordinateur.
4. Cliquez sur **Actualiser**. Pour le sans-fil, vérifiez que le débogage sans fil est actif et que les deux appareils sont sur le même réseau local.
5. Fermez puis relancez Device Bridge. Ne supprimez pas les outils embarqués et n’installez pas un second ADB comme solution de contournement.

## Fenêtre noire au démarrage (Windows)

Une fenêtre noire indique que le contenu WebView n’a pas été rendu correctement ; ce n’est pas un message confirmant un problème ADB.

1. Fermez Device Bridge normalement et relancez-le.
2. Vérifiez que **Microsoft Edge WebView2 Runtime** est présent dans les applications installées de Windows. S’il est absent ou endommagé, utilisez l’installateur officiel WebView2 ou la fonction de réparation de Windows.
3. Installez les mises à jour Windows en attente, redémarrez, puis réessayez.
4. Si l’écran reste noir, notez la version de Windows, le modèle de GPU et l’étape exacte d’apparition. Le correctif doit ensuite être reproduit et vérifié avec un build Windows ; ces vérifications ne sont pas encore réputées validées par la seule présence de cette page.

## L’installeur refuse d’écrire `AdbWinApi.dll`

Un message du type **Error opening file for writing** peut être causé par un fichier encore utilisé, un droit d’accès, une quarantaine antivirus ou un autre problème d’installation. La cause n’est pas confirmée sans journal d’installation.

1. Annulez l’installation, fermez Device Bridge, puis réessayez l’installateur.
2. Dans le Gestionnaire des tâches, vérifiez qu’aucun processus **Device Bridge** ne reste ouvert.
3. Si l’erreur continue, redémarrez Windows puis relancez l’installation. Vérifiez aussi l’historique de protection de l’antivirus sans désactiver durablement sa protection.
4. N’arrêtez pas aveuglément tous les processus ADB : Android Studio et d’autres outils peuvent utiliser le serveur ADB partagé. Ne remplacez pas manuellement `AdbWinApi.dll` et ne cochez pas **Ignore** comme solution définitive.
5. Si l’erreur revient, conservez une capture et le journal NSIS/Windows afin d’identifier le processus ou la politique qui bloque l’écriture.

## Notifications absentes

- Vérifiez les trois interrupteurs de **Paramètres → Notifications système**.
- Vérifiez dans les paramètres de Windows, macOS ou Linux que Device Bridge est autorisé à notifier.
- Les notifications sont natives. Une interdiction du système peut empêcher leur affichage sans empêcher l’action (capture, appairage ou détection) de réussir.

## Limites de ce diagnostic

La fenêtre noire et le verrouillage possible de `AdbWinApi.dll` doivent encore être reproduits sur une installation Windows et corrigés dans le produit si nécessaire. Cette documentation n’affirme pas que ces deux problèmes sont déjà résolus.
