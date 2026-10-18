# iPhone Agent Harness

[English](../../README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · **Français** · [Español](es.md)

Un environnement ouvert pour qu’un agent IA utilise un iPhone ou un iPad dans plusieurs apps, depuis une interface web, avec un ESP32 comme passerelle Bluetooth HID.

La cible est **Safari sur iOS/iPadOS 27 ou version ultérieure**. Sur iPhone et iPad, le site ouvre le Harness par défaut. Sur ordinateur, il présente l’accueil du projet, la communauté Skills et les pages de configuration et de firmware ESP32. Aucune app native ni version Android n’est prévue.

## État du projet

L’application web, le transport LAN authentifié et l’interface de configuration sont implémentés. Le site et la communauté Skill avec signatures sont déployés sur [igent.cc](https://igent.cc). La validation du firmware produit sur appareil réel reste en cours : compilation, tests sur ordinateur et simulations du navigateur ne prouvent ni le bon fonctionnement des commandes ni la connexion de Safari au réseau local.

Des expériences distinctes sur iPhone 12/iOS 27.0.1 ont confirmé la capture d’autres apps, les réponses différées et les flux en arrière-plan, ainsi que quatre courts appels DeepSeek réels avec les deux protocoles compatibles. Un ancien firmware expérimental a aussi validé clavier, Home, pointeur et balayage. Ces résultats ne valident pas le nouveau produit et ne garantissent pas une exécution illimitée en arrière-plan. Voir le [rapport](../research/background-api.md) et les [limites du firmware](../architecture/firmware-implementation.md).

## Fonctionnalités

- **Conversations locales :** IndexedDB, pièces jointes, import/export, modes dialogue, planification et tâche, avec annulation. Le contexte et les images sélectionnés sont envoyés au fournisseur IA configuré ; le projet n’exploite pas de base de conversations dans le cloud.
- **Modèles et comptes :** interfaces compatibles OpenAI/Anthropic, découverte des modèles et plusieurs profils. Le code d’appareil, le renouvellement des jetons et l’adaptateur Responses pour l’abonnement Codex sont implémentés. La connexion réelle depuis Safari et le CORS des anciens points d’accès restent à vérifier ; une erreur n’est jamais présentée comme une connexion réussie.
- **Contexte et images :** seuils de compression, budget cible, réserve de réponse, nombre d’images, résumé par modèle ou extraits. Le nombre de jetons est estimé. Taille maximale et qualité JPEG sont réglables, avec conservation de l’échelle et des horaires. Le cache dépend du fournisseur et ses succès ne sont pas garantis.
- **10 Skills intégrés :** observation d’écran, observation temporelle, planification, navigation, saisie de texte, défilement, glisser-déposer, récupération, orientation des défis de vérification et création de Skills. Les outils sont fixes ; les Skills n’installent pas de plugins exécutables.
- **Création et communauté :** identité locale P-256, sauvegarde chiffrée et restauration sur un autre appareil. Seuls ses propres Skills sont modifiables ; les téléchargements communautaires restent en lecture seule. La publication demande une action explicite. L’API communautaire facultative **est déployée sur le site officiel** et ne conserve que les paquets volontairement publiés.

Les identifiants restent en mémoire par défaut. Un stockage local chiffré, déverrouillé par phrase secrète, est proposé ; aucun secret n’est inclus dans le site statique. Consulter les [notes sur l’abonnement](../research/codex-subscription.md).

## Exécution locale

Deux parties composent le produit : `apps/web/` et `firmware/IPhoneAutomationHarness/`. La communauté et l’API facultative appartiennent au Web. Le site peut être auto-hébergé, sans serveur communautaire pour un usage local.

Utiliser Node.js 22.13 ou une version ultérieure :

```sh
npm ci
npm test
npm run build
npm run preview
```

L’aperçu sur ordinateur fonctionne sur localhost ; la capture du téléphone exige **HTTPS**. Déployer `build/site` sur Cloudflare ou un hébergement HTTPS avec le [routage des pages](../architecture/deployment.md#self-hosted-page-routing) indiqué. Le [guide Arduino](../../firmware/IPhoneAutomationHarness/README.md) décrit la chaîne de compilation.

[Architecture](../architecture/system-blueprint.md) · [Gestes et synchronisation](../architecture/actions.md) · [Propriété des Skills](../architecture/skill-community.md) · [Langues](../architecture/localization.md)

Restent à valider : configuration Wi-Fi sécurisée, association au bon téléphone, accès Safari à l’ESP32 local, gestes avec inertie et isolation de deux téléphones sur un C3. mDNS facilite la résolution du nom, sans remplacer HTTPS ni l’authentification.

Liste complète de recette : [English](../acceptance/README.md) · [简体中文](../acceptance/zh-Hans.md). Elle couvre toutes les fonctions et tous les contenus, les preuves sur ordinateur et les étapes sur téléphone reportées. L’équipe du projet prend en charge la préparation sur ordinateur et les vérifications finales de publication.

Sur Mac, le HTTPS avec validation CA/DNS et l’association du propriétaire par le client du produit ont réussi avec le vrai C3. Aucune commande téléphonique n’a été envoyée. L’image finale et Safari/le téléphone nécessitent une recette distincte. [Rapport du client réel](../research/device-client-live-verification.json).

Les publications démarrent uniquement sur demande explicite ; un push ordinaire ne lance pas Actions. Le processus réutilise le firmware inchangé, compile les versions ESP32/C3/S3/C6 modifiées et publie les mêmes fichiers binaires dans Releases et sur le site. [Procédure et configuration du jeton](../architecture/manual-release.md).

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
