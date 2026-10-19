# iPhone Agent Harness

[English](../../README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · **Français** · [Español](es.md)

Un Harness open source qui permet à une IA de piloter un iPhone ou iPad entre applications depuis un navigateur et un pont Bluetooth ESP32.

[igent.cc](https://igent.cc) · [GitHub](https://github.com/cccat6/iphone-agent-harness)

![Illustration provisoire : navigateur, pont ESP32 et téléphone. Une vidéo/GIF de démonstration arrive prochainement.](../../apps/web/media/demo-placeholder.svg)

Illustration provisoire : navigateur, pont ESP32 et téléphone. Une vidéo/GIF de démonstration arrive prochainement.

## Démarrer en cinq étapes

Prévoir Safari sur iOS/iPadOS 27+, un ESP32/C3/S3/C6 avec au moins 4 Mo de flash, un câble USB de données, le même Wi-Fi 2,4 GHz et un compte IA ou une API compatible. Le flashage web demande Chrome/Edge sur ordinateur.

1. **Installer le firmware.** Sur ordinateur, ouvrir l’installateur, choisir la carte et la flasher. Lire les informations et garder le lien pour le téléphone. Pour une carte neuve, rejoindre son Wi-Fi de configuration, enregistrer le réseau habituel puis y reconnecter le téléphone.

2. **Connecter le téléphone.** Ouvrir le lien ou récupérer les informations du pont dans Harness, les enregistrer puis connecter l’ESP32. Associer iPhone Agent Bridge dans Bluetooth iOS, activer AssistiveTouch et sélectionner le téléphone prêt. Le test de huit chiffres est facultatif avec le firmware actuel ; l’accès complet au clavier peut rester activé ou non. Aucun code, certificat ou onglet supplémentaire n’est nécessaire.

3. **Choisir une IA.** Dans Réglages → Comptes/API, ajouter endpoint et clé puis charger les modèles, ou suivre la connexion ChatGPT. Choisir ou saisir le modèle par défaut ; tous les modèles trouvés restent disponibles. Créer une conversation et choisir le modèle et son effort de raisonnement pris en charge.

4. **Partager et demander.** Partager l’écran et commencer par une tâche courte sans risque, comme une alarme de test. Une question de capacité reçoit une réponse, une demande de plan montre un plan vérifiable, une action explicite peut être exécutée. Garder le téléphone déverrouillé et observer les premiers essais. Arrêter termine ; perdre le partage met en pause.

5. **Vérifier le résultat.** L’IA vérifie avant de terminer puis revient par défaut dans Harness. Désactiver ce retour dans Réglages → Fin de tâche pour rester dans l’application cible. Vérifier personnellement les résultats importants.

## Utilisation courante

- Le sélecteur du titre de liste bascule entre conversations et archives. Balayer propose Renommer/Archiver, ou Renommer/Restaurer/Supprimer dans les archives, avec confirmation. Tirer la liste vers le bas ou utiliser la recherche.

- Les anciens messages se chargent en remontant. Les réponses préservent la position de lecture ; « Derniers » revient aux récents. Exporter par le menu et importer dans Réglages : 64 Mio maximum avec images.

- Installer iPhone Agent Clipboard via le tutoriel pour les textes longs. Copier avec Raccourcis ou le bouton au premier plan. La tâche attend la confirmation et vérifie le champ cible avant de coller.

- 12 compétences intégrées couvrent observation, planification, saisie, reprise, création, horloge et correction des gestes. Saisie numérique directe si possible, sinon petits ajustements et attente de stabilisation.

- Créer, modifier et publier ses compétences sur ordinateur ou téléphone. La propriété repose sur une identité cryptographique du navigateur, pas un UID iOS. En faire une sauvegarde chiffrée avant de changer de navigateur. Compétences intégrées/téléchargées en lecture seule, vérifiées à l’actualisation ; activation conservée et ancienne version maintenue en cas d’échec.

- MCP facultatif : serveurs Streamable HTTP accessibles au navigateur, outils explicitement autorisés et CORS requis. Pas de processus stdio ni d’hébergement OAuth distant complet.

## Données et limites

Conversations, images, clés et jetons sont conservés dans ce navigateur. Les identifiants sont exclus des exports et ne demandent pas de mot de passe de déverrouillage. Les contenus choisis vont au modèle. Effacer les données du site les supprime : exporter les conversations importantes. La publication envoie seulement le paquet choisi explicitement.

Surveiller les fonctions matérielles expérimentales. Gestes, capture en arrière-plan, Raccourcis et plusieurs téléphones doivent être testés sur vos appareils ; compilation et tests de bureau ne les prouvent pas. Safari peut suspendre l’arrière-plan. Pas de limite globale de durée/étapes par défaut, mais chaque plan garde ses limites. Connexion et renouvellement ChatGPT dans Safari restent une limite de compatibilité. Un seul pair WebRTC actif est pris en charge. La réparation d’inscription/import multiclient est préparée dans le code, pas encore flashée ni validée physiquement.

## Développer et auto-héberger

Utiliser Node.js 22.13+. Deux parties : apps/web et firmware/IPhoneAutomationHarness. Le site statique peut utiliser l’API facultative de compétences publiques signées. Le partage d’écran demande HTTPS.

```sh
npm ci
npm test
npm run build
npm run preview
```

Les publications sont manuelles ; les pushs ordinaires ne lancent pas GitHub Actions. Consulter le guide pour réutiliser les firmwares et déployer.

[Guide téléphone](../acceptance/README.md) · [Arduino](../../firmware/IPhoneAutomationHarness/README.md) · [Architecture](../architecture/overview.md) · [Auto-hébergement](../architecture/deployment.md) · [Publications manuelles](../architecture/manual-release.md) · [Tutoriel presse-papiers](https://igent.cc/shortcuts/clipboard.html)

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
