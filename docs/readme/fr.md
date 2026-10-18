# iPhone Agent Harness

[English](../../README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · **Français** · [Español](es.md)

Un environnement ouvert permettant à un agent IA d’utiliser un iPhone ou un iPad dans plusieurs apps, depuis un navigateur avec un contrôleur Bluetooth ESP32.

Conçu pour **Safari sur iOS/iPadOS 27 ou ultérieur**. Sur iPhone et iPad, le site ouvre le Harness. Sur ordinateur, il propose la présentation, la communauté de compétences et l’installation du firmware ESP32.

Guide d’utilisation : [English](../acceptance/README.md) · [简体中文](../acceptance/zh-Hans.md). Les principaux écrans et les actions du quotidien.

Le site est disponible sur [igent.cc](https://igent.cc). Harness se connecte au pont ESP32 du réseau local par **WebRTC Direct**, depuis la même page. Aucun onglet de connexion supplémentaire, code de connexion ou certificat à installer. Importez les paramètres une fois depuis le lien de configuration USB ou la page de réglages de l’appareil, puis connectez-vous dans Harness. Le firmware intégrant RTC et Bluetooth est en cours de validation sur matériel. Voir le [guide de connexion et les résultats](../architecture/secure-lan.md).

## Fonctionnalités

- **Conversations :** messages et images locaux, recherche, renommage, épinglage, archivage et import/export de fichiers. Modes Discussion, Plan et Tâche.
- **Comptes ou API :** plusieurs connexions, points de terminaison compatibles OpenAI et Anthropic, chargement et sélection des modèles. L’adaptateur et l’interface de connexion à l’abonnement ChatGPT sont implémentés ; la connexion réelle dans Safari reste à vérifier.
- **Contexte :** résumés automatiques par le modèle à partir d’un seuil réglable de **750 000 tokens** par défaut. L’historique complet reste sur l’appareil.
- **Images :** compression JPEG à trois niveaux de qualité, en conservant les dimensions d’origine.
- **Compétences :** dix compétences intégrées, création et modification de vos compétences, téléchargements et publication dans la communauté. L’adresse officielle est préconfigurée. Le Harness peut vous aider à rédiger et améliorer vos compétences en conversation.
- **MCP :** ajout de plusieurs serveurs Streamable HTTP, sélection indépendante de leurs outils et utilisation en mode Tâche.

Les conversations restent dans le navigateur ; les messages et images sélectionnés sont envoyés au service de modèle choisi. Les clés API et identifiants restent en mémoire par défaut, avec une option de stockage local chiffré.

## Projet et développement local

Les deux parties du produit sont `apps/web/` (site, Harness et communauté) et `firmware/IPhoneAutomationHarness/` (firmware Arduino). Le site peut aussi être auto-hébergé.

Utilisez Node.js 22.13 ou ultérieur :

```sh
npm ci
npm test
npm run build
npm run preview
```

L’aperçu sur ordinateur utilise localhost ; le partage d’écran du téléphone nécessite HTTPS. Déployez `build/site` avec le [routage documenté](../architecture/deployment.md#self-hosted-page-routing). Les cartes et la compilation sont décrites dans le [guide Arduino](../../firmware/IPhoneAutomationHarness/README.md).

**Publications manuelles :** un push ordinaire ne lance pas GitHub Actions. Sur demande, le workflow réutilise les firmwares inchangés, compile les versions ESP32/C3/S3/C6 modifiées et publie les mêmes fichiers dans Releases et sur le site. [Configuration des publications](../architecture/manual-release.md).

[Architecture](../architecture/system-blueprint.md) · [Actions et captures](../architecture/actions.md) · [Comptes et MCP](../architecture/auth-and-backends.md) · [Propriété des compétences](../architecture/skill-community.md) · [Langues](../architecture/localization.md)

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
