# Installation et utilisation courante

[English](README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · **Français** · [Español](es.md) · [Projet](../../README.md) · [Ouvrir Harness](https://igent.cc/) · [Architecture](../architecture/overview.md)

Prévoyez un iPhone ou iPad sous iOS/iPadOS 27+, une carte ESP32, une alimentation USB, du Wi-Fi et un compte IA ou une clé API. Installez le firmware dans Chrome ou Edge sur ordinateur.

Le téléphone et le pont utilisent le même Wi-Fi. Après la configuration, laissez le pont alimenté à portée Bluetooth du téléphone.

## Sommaire

[AssistiveTouch](#accessibility) · [Firmware](#flash) · [Wi-Fi](#wifi) · [Bluetooth](#bluetooth) · [Harness](#open-harness) · [Modèles](#models) · [Connexion et test](#bridge) · [Presse-papiers](#clipboard) · [Installer une compétence](#install-skills) · [Créer](#authoring) · [Publier](#publish)

<a id="accessibility"></a>
## 1. Activer AssistiveTouch

Sur l’iPhone, ouvrez **Réglages → Accessibilité → Toucher → AssistiveTouch** et activez-le. Le pont pourra ainsi toucher et faire glisser les éléments avec un pointeur.

<a id="flash"></a>
## 2. Installer le firmware ESP32 dans le navigateur

1. Ouvrez l’[installateur web](https://igent.cc/flash) dans Chrome ou Edge sur ordinateur.
2. Sélectionnez la puce indiquée sur la carte. Il faut au moins **2 Mo de flash** pour C2, et au moins **4 Mo de flash SPI standard** pour les autres puces proposées.
3. Branchez la carte avec un câble USB de données. Cliquez sur **Choisir un appareil USB et installer**, sélectionnez la carte et attendez la fin.
4. Cliquez sur **Lire les informations de l’appareil**, sélectionnez la même carte et gardez les identifiants Wi-Fi et le lien de connexion pour le téléphone.

Si l’installation ne démarre pas, maintenez BOOT en rebranchant l’USB, relâchez puis réessayez. La version C2 à 26 ou 40 MHz est choisie automatiquement. Ensuite, alimentez la carte pour commander le téléphone sans fil.

<a id="wifi"></a>
## 3. Connecter le pont au Wi-Fi habituel

1. Sur l’ordinateur, rejoignez le Wi-Fi `iPhone-Harness-…` indiqué par l’installateur, avec le mot de passe affiché.
2. Ouvrez `http://192.168.4.1` et saisissez le nom et le mot de passe de votre Wi-Fi habituel. Le 2,4 GHz convient à toutes les puces compatibles.
3. Une fois le pont connecté, remettez l’ordinateur sur le réseau habituel. Le téléphone doit utiliser ce même réseau.

Le pont mémorise le réseau et s’y reconnecte au démarrage. Cette configuration sert à la première utilisation ou lors d’un changement de réseau. Les réglages restent accessibles sur `http://igent.local/settings`.

<a id="bluetooth"></a>
## 4. Associer le pont d’entrée Bluetooth

Sur le téléphone, ouvrez **Réglages → Bluetooth** et associez **iPhone Agent Bridge**. Gardez AssistiveTouch activé.

Le Bluetooth sert à commander le téléphone. La connexion Wi-Fi entre Harness et le pont se fait à l’étape 7.

<a id="open-harness"></a>
## 5. Ouvrir Web Harness

Ouvrez [igent.cc](https://igent.cc/) dans Safari sur l’iPhone ou l’iPad pour accéder directement à Harness.

Quand vous demandez une action, autorisez le partage d’écran et gardez le téléphone déverrouillé. Vous pouvez ensuite passer à une autre app. Arrêter le partage met la tâche en pause ; appuyez sur **Partager l’écran et continuer** dans Harness pour partager à nouveau et reprendre.

<a id="models"></a>
## 6. Configurer une API ou un compte ChatGPT

Ouvrez **Réglages → Comptes ou API → Ajouter**. Vous pouvez enregistrer plusieurs connexions et changer de modèle dans la conversation.

**Avec une clé API**

1. Choisissez **Compatible OpenAI** ou **Compatible Anthropic** selon votre fournisseur.
2. Saisissez un nom, l’adresse de l’API et la clé. Exemple : `https://api.example.com/v1`. Une adresse complète terminée par `/chat/completions` ou `/messages` convient aussi au type d’API correspondant.
3. Cliquez sur **Récupérer les modèles**, choisissez celui par défaut ou saisissez son nom. Les autres restent disponibles dans les conversations.
4. Enregistrez. Pour agir sur le téléphone, prenez un modèle capable de lire les images et d’appeler des outils. Réglez l’effort de raisonnement dans le sélecteur si le modèle le propose.

**Avec un compte ChatGPT**

Activez la connexion par code d’appareil dans les paramètres de sécurité de ChatGPT. Choisissez ChatGPT/Codex dans Harness, lancez la connexion et saisissez le code sur la page officielle indiquée. Revenez pour terminer, charger les modèles et enregistrer. Pour un compte d’organisation, l’administrateur peut devoir activer cette option. [Instructions OpenAI](https://learn.chatgpt.com/docs/auth#preferred-device-code-authentication-beta).

Identifiants et clés restent dans ce navigateur. Les requêtes vont directement au fournisseur, dont l’API doit accepter les accès depuis un navigateur.

<a id="bridge"></a>
## 7. Connecter le pont et tester les entrées si souhaité

1. Ouvrez **Appareils** depuis la liste des conversations, ou touchez l’état du pont dans une conversation.
2. La première fois, choisissez **Obtenir les informations du pont**. Sur sa page, utilisez le lien de retour vers Harness. Le lien pour téléphone de l’installateur fonctionne aussi.
3. Cliquez sur **Connecter le pont ESP32** et choisissez le téléphone associé si nécessaire. La connexion sera mémorisée pour la prochaine fois.
4. Pour vérifier la saisie, cliquez sur **Démarrer le test de saisie** et restez sur cette page. Le pont tape huit chiffres, vérifiés automatiquement. Vous pouvez passer ce test.

Si le téléphone n’est pas prêt, vérifiez le Bluetooth, patientez puis cliquez sur **Actualiser**.

Essayez « Ouvre Horloge et règle une alarme à 7 h ». Autorisez le partage d’écran. L’agent revient ensuite à la conversation ; modifiez ce comportement dans **Réglages → Fin de tâche → Revenir à Harness**.

<a id="clipboard"></a>
## 8. Configurer la copie avec Raccourcis

1. Sur le téléphone, ouvrez le [guide du presse-papiers](https://igent.cc/shortcuts/clipboard.html) et installez le raccourci.
2. Gardez le nom **iPhone Agent Clipboard**.
3. Connectez le pont dans Harness. Lorsque le texte est prêt, choisissez **Copier avec Raccourcis**. Autorisez l’accès au pont si iOS le demande.
4. Revenez dans Harness après la copie pour coller dans le champ voulu.

Cela fonctionne avec les textes longs et plusieurs langues. Quand Harness est affiché, vous pouvez aussi choisir **Copier et continuer**.

<a id="install-skills"></a>
## 9. Installer une compétence communautaire

Ouvrez **Réglages → Compétences → Communauté** ou la [communauté](https://igent.cc/skills). Lisez la description puis choisissez **Ajouter en local**. Vous pouvez activer ou désactiver chaque compétence dans votre liste.

Les compétences intégrées sont déjà installées. Actualiser la page recherche les mises à jour et garde vos choix d’activation. Les nouvelles versions s’appliquent à la prochaine tâche.

<a id="authoring"></a>
## 10. Créer et améliorer sa compétence

Sur ordinateur, ouvrez [Compétences](https://igent.cc/skills) et choisissez **Créer votre compétence**. Sur le téléphone : **Réglages → Compétences → Créer**. Saisissez un nom, un identifiant court en minuscules, une description et les instructions, puis enregistrez.

Vous pouvez demander à Harness d’écrire ou d’améliorer votre compétence. Expliquez quand l’utiliser, les étapes et comment vérifier le résultat. Pour adapter une compétence communautaire, créez la vôtre et gardez l’original de son auteur.

Avant de changer de navigateur, exportez vos compétences et sauvegardez votre **Identité d’auteur**. Importez les deux dans le nouveau navigateur pour continuer à publier sous le même nom.

<a id="publish"></a>
## 11. Partager une compétence

Ouvrez une compétence que vous avez créée et choisissez **Publier** sur le site, ou **Publier dans la communauté** sur le téléphone. Vérifiez puis confirmez. Après modification, publiez à nouveau pour proposer la mise à jour.

Les autres utilisateurs pourront l’ajouter depuis le catalogue. Signalez bugs et idées dans les [Issues](https://github.com/cccat6/iphone-agent-harness/issues), et proposez vos améliorations du code ou des documents par [pull request](https://github.com/cccat6/iphone-agent-harness/pulls).

## Gérer les conversations

Touchez le titre de la liste pour passer des **Conversations** aux **Archives**. Balayez une conversation pour la renommer ou l’archiver ; dans les archives, vous pouvez la restaurer ou la supprimer. Remontez pour lire l’historique et touchez **Derniers** pour revenir à la dernière réponse.

Exportez depuis le menu de la conversation et importez le fichier dans les réglages. Il contient les messages et images. Les comptes et clés sont enregistrés séparément dans le navigateur.
