# Installation et utilisation courante

[English](README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · **Français** · [Español](es.md) · [Projet](../../README.md) · [Ouvrir Harness](https://igent.cc/) · [Architecture](../architecture/overview.md)

Prévoir un iPhone ou iPad sous iOS/iPadOS 27 ou ultérieur, une carte ESP32 prise en charge, une alimentation USB, un réseau Wi-Fi local et un compte IA ou une API compatible. Utiliser Chrome ou Edge sur ordinateur pour installer le firmware. Les images précompilées ne demandent ni Arduino, ni Xcode, ni compte développeur, ni compilateur local.

Le téléphone et le pont utilisent le même Wi-Fi habituel. Le pont ne se branche pas au téléphone : après configuration, il peut rester alimenté à un endroit à portée Bluetooth. Effectuer la configuration initiale du Wi-Fi sur ordinateur pour que le téléphone n’ait jamais à rejoindre le point d’accès de configuration du pont.

## Sommaire

[AssistiveTouch](#accessibility) · [Firmware](#flash) · [Wi-Fi](#wifi) · [Bluetooth](#bluetooth) · [Harness](#open-harness) · [Modèles](#models) · [Connexion et test](#bridge) · [Presse-papiers](#clipboard) · [Installer une compétence](#install-skills) · [Créer](#authoring) · [Publier](#publish)

<a id="accessibility"></a>
## 1. Activer AssistiveTouch

Sur le téléphone, ouvrir **Réglages → Accessibilité → Toucher → AssistiveTouch** et l’activer. Cette fonction système transforme les entrées du pointeur Bluetooth du pont en interactions avec les applications. L’accès complet au clavier peut garder son réglage actuel ; il n’est pas requis pour l’action Accueil ou le pointeur.

<a id="flash"></a>
## 2. Installer le firmware ESP32 dans le navigateur

1. Sur ordinateur, ouvrir [Installer le firmware](https://igent.cc/flash) dans Chrome ou Edge.
2. Choisir le profil de la puce indiquée sur la carte. L’installateur présente les variantes actuellement compilées. ESP32-C2 demande au moins **2 Mo de flash**, les autres puces du tableau **4 Mo**. PSRAM, écran et capteurs externes ne sont pas nécessaires.
3. Brancher la carte avec un câble USB **de données**. Choisir « Sélectionner le périphérique USB et installer », puis cette carte dans le sélecteur de port série du navigateur.
4. Attendre la fin de l’installation et de la vérification. Si le mode téléchargement ne démarre pas automatiquement, maintenir BOOT pendant le branchement ou la réinitialisation, relâcher puis réessayer.
5. Choisir « Lire les informations de l’appareil » et la même carte. La page indique le nom/mot de passe du Wi-Fi de configuration et le lien pour le téléphone. Garder ces informations pour la suite.

L’USB sert à installer, lire la configuration et alimenter la carte. Pendant le pilotage, un adaptateur secteur ou une autre source USB suffit ; aucun câble ne relie téléphone et carte.

L’unique option **ESP32-C2** choisit automatiquement l’image pour quartz 26 ou 40 MHz. L’image 2 Mo comporte une seule partition applicative, sans OTA. C2 utilise **USB–UART** (souvent intégré à la carte), pas USB CDC natif. L’image **ESP32-C5** utilise un profil flash à 80 MHz et USB CDC natif.

<a id="wifi"></a>
## 3. Connecter le pont au Wi-Fi habituel

À faire une fois pour une nouvelle carte :

1. Sur l’**ordinateur**, rejoindre temporairement le Wi-Fi `iPhone-Harness-…` indiqué par l’installateur, avec son mot de passe affiché.
2. Ouvrir `http://192.168.4.1` et saisir le nom et le mot de passe du Wi-Fi local habituel. Le 2,4 GHz fonctionne avec toutes les variantes prises en charge.
3. Attendre la confirmation de connexion, puis remettre l’ordinateur sur ce réseau habituel.
4. Garder le téléphone sur le même réseau local. Il n’a besoin ni du point d’accès de la carte, ni d’un détour par les données mobiles pour joindre le modèle.

Le pont conserve les paramètres localement et se reconnecte à la mise sous tension. Ignorer cette étape s’il est déjà configuré. Le gestionnaire `http://igent.local/settings` propose les réglages disponibles, dont le nom local de l’appareil.

<a id="bluetooth"></a>
## 4. Associer le pont d’entrée Bluetooth

Sur le téléphone, ouvrir **Réglages → Bluetooth** et associer **iPhone Agent Bridge**. Garder AssistiveTouch activé. Le Bluetooth système transmet les entrées à iOS ; le réseau entre navigateur et pont transmet les commandes de l’agent à la carte. Ce sont deux connexions distinctes.

Si une mise à jour du firmware modifie les rapports HID, oublier l’ancien appareil dans Bluetooth puis le réassocier. Une actualisation normale ou un changement de modèle ne le demande pas.

<a id="open-harness"></a>
## 5. Ouvrir Web Harness

Ouvrir [igent.cc](https://igent.cc/) dans Safari sur le téléphone. Les iPhone/iPad compatibles entrent dans Harness ; les ordinateurs affichent l’accueil, la communauté et l’installateur. Aucune app iOS dédiée, aucun profil de certificat, aucune extension Safari ni mode développeur n’est nécessaire.

Au démarrage d’une opération, Safari demande de partager l’écran. Accepter et garder le téléphone déverrouillé pendant la tâche. C’est l’autorisation iOS habituelle ; aucun indicateur réseau expérimental ni contournement supplémentaire n’est requis. Arrêter le partage met la tâche en pause. « Continuer » redemande le partage si nécessaire.

<a id="models"></a>
## 6. Configurer une API ou un compte ChatGPT

Ouvrir **Réglages → Comptes ou API → Ajouter**. Plusieurs connexions peuvent être conservées et leurs modèles sélectionnés depuis la conversation.

### Endpoint et clé API

1. Choisir une API **compatible OpenAI** ou **compatible Anthropic**.
2. Saisir l’endpoint du fournisseur, la clé et un nom. Suivre l’indication du formulaire : racine du service ou base `/v1` ; une URL d’opération complète prise en charge est aussi normalisée par l’adaptateur.
3. Choisir « Charger les modèles ». Sélectionner le modèle par défaut ou saisir son ID. Tous les modèles découverts restent disponibles dans le sélecteur de conversation.
4. Enregistrer. Pour piloter le téléphone, choisir un modèle comprenant les images et pouvant appeler des outils. Régler l’effort de raisonnement dans le sélecteur si le modèle le permet.

Les clés sont enregistrées dans ce navigateur. Les requêtes partent directement au fournisseur et ne passent pas par l’hôte du site. Le fournisseur doit autoriser les requêtes de navigateur provenant du site utilisé.

### Compte avec abonnement ChatGPT

Activer d’abord la connexion par code d’appareil dans les réglages de sécurité ChatGPT ; un espace géré peut demander l’activation par son administrateur. Dans Harness, sélectionner ChatGPT/Codex et démarrer cette connexion. Ouvrir la page officielle de vérification indiquée par le formulaire, saisir le code affiché et terminer la connexion. Revenir à Harness et choisir le bouton de finalisation, charger les modèles puis enregistrer. Les identifiants restent locaux et sont renouvelés par l’adaptateur. Il s’agit d’une connexion par abonnement, distincte d’une clé API OpenAI ordinaire ; le service officiel doit être accessible au navigateur. Voir les [instructions OpenAI d’authentification par code](https://learn.chatgpt.com/docs/auth#preferred-device-code-authentication-beta).

<a id="bridge"></a>
## 7. Connecter le pont et tester les entrées si souhaité

1. Ouvrir « Appareils » depuis la liste de conversations ou le statut du pont dans une conversation.
2. Si aucune information n’est enregistrée, choisir « Obtenir les informations du pont », ouvrir sa page locale puis utiliser le lien de retour. Cela importe l’adresse et les paramètres WebRTC publics. Le lien du téléphone fourni par l’installateur donne les mêmes informations.
3. Choisir « Connecter le pont ESP32 », puis si nécessaire le téléphone associé et prêt aux entrées. Les paramètres enregistrés permettent de commencer directement par Connecter la prochaine fois, sans refaire le Wi-Fi.
4. Pour vérifier une saisie native, choisir une fois « Démarrer le test d’entrée » et garder la page et son champ au premier plan. La carte saisit huit chiffres que le navigateur confirme automatiquement. Ce test est facultatif avec le firmware actuel.

« Actualiser » ne fait que lire l’état. Pont connecté, Bluetooth du téléphone connecté et entrées prêtes sont distincts. Si l’entrée s’initialise, patienter puis actualiser. Un test clairement refusé pour limitation de débit affiche un compte à rebours et peut réessayer une fois ; une entrée d’issue physique inconnue n’est pas renvoyée aveuglément. Les erreurs présentent statut et cause.

Essayer une courte tâche, par exemple « Ouvre Horloge et règle une alarme à 7 h ». Autoriser le partage et passer à l’app cible. L’agent observe, agit et vérifie, puis revient par défaut à cette conversation. Désactiver **Réglages → Fin de tâche → Revenir dans Harness** pour rester dans l’application cible.

<a id="clipboard"></a>
## 8. Configurer la copie avec Raccourcis

1. Sur le téléphone, ouvrir le [tutoriel du presse-papiers](https://igent.cc/shortcuts/clipboard.html) et télécharger le raccourci signé.
2. L’ajouter dans l’app Raccourcis d’Apple en gardant exactement **iPhone Agent Clipboard**.
3. Connecter le pont. Quand l’agent prépare un texte, choisir « Copier avec Raccourcis ». Si iOS demande à autoriser l’accès du raccourci à l’URL locale du pont, accepter : cette permission appartient au raccourci lui-même.
4. Après copie, revenir à Harness. Il attend le reçu de copie et vérifie l’app et le champ de destination avant de coller.

Le navigateur fournit le texte par morceaux au pont, qui le transmet dans une réponse HTTP locale au raccourci. Le pont n’a pas besoin de conserver le texte entier. Sans copie en attente, le raccourci ne renvoie pas de texte et laisse le presse-papiers intact. « Copier et continuer » au premier plan reste disponible sans Raccourcis.

<a id="install-skills"></a>
## 9. Installer une compétence communautaire

Ouvrir **Réglages → Compétences → Communauté** sur téléphone, ou la [communauté](https://igent.cc/skills). Lire les instructions et choisir « Ajouter en local ». Les compétences intégrées apparaissent à côté des publications et sont déjà disponibles localement. Activer ou désactiver une compétence dans la liste installée.

Actualiser met à jour les intégrées et cherche de nouvelles versions des installations communautaires non modifiées. Les choix d’activation et modifications locales sont conservés. Une tâche en cours garde ses versions initiales ; les mises à jour servent aux suivantes. Les téléchargements restent en lecture seule avec leur auteur d’origine.

<a id="authoring"></a>
## 10. Créer et améliorer sa compétence

Sur ordinateur, ouvrir [Compétences](https://igent.cc/skills), puis « Créer sa compétence » dans « Créer et publier ». Sur téléphone, utiliser **Réglages → Compétences → Créer**. Donner un nom, un slug en minuscules, une courte description et des instructions Markdown, puis enregistrer le brouillon local.

On peut aussi demander à Harness de créer ou améliorer sa propre compétence. Décrire objectif, conditions d’utilisation, contrôles à employer, résultat visible attendu et changement d’approche après échec. Les téléchargements communautaires et intégrées restent en lecture seule.

La propriété utilise une identité de signature générée dans le navigateur, sur ordinateur comme sur iOS, pas un UID iOS. Avant de changer de navigateur ou d’appareil, exporter le fichier de compétence et la sauvegarde chiffrée « Identité du créateur ». Restaurer cette identité puis importer son fichier permet de continuer sous le même auteur.

<a id="publish"></a>
## 11. Partager une compétence

Choisir « Publier » sur son brouillon dans la communauté, ou « Publier dans la communauté » depuis le panneau de partage du téléphone. Vérifier et confirmer. Le paquet public est signé par l’identité locale. Modifier puis republier crée la version suivante, reçue par les autres utilisateurs lors de l’actualisation de leurs copies installées.

Utiliser les [Issues](https://github.com/cccat6/iphone-agent-harness/issues) pour signaler bugs et suggestions, et les [PR](https://github.com/cccat6/iphone-agent-harness/pulls) pour code, documentation et traductions. Les compétences personnalisées se partagent via la communauté du site plutôt que par PR de code.

## Conversations et auto-hébergement

Le titre de liste alterne Conversations/Archives. Balayer offre Renommer/Archiver, ou Renommer/Restaurer/Supprimer dans les archives. Les anciens messages se chargent en remontant ; les réponses gardent la position de lecture. « Derniers » ramène à la sortie actuelle.

Conversations, images conservées et identifiants restent dans ce navigateur. Exporter via le menu, importer dans Réglages ; les exports excluent les identifiants. L’hôte sert pages et compétences publiques ; les données choisies pour modèles/MCP vont directement aux services configurés. Il est aussi possible d’[auto-héberger Web Harness](../architecture/deployment.md).
