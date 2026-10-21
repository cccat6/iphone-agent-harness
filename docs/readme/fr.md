<p align="center"><img src="../media/logo-card.svg" width="128" height="128" alt="iPhone Agent Harness"></p>

<h1 align="center">iPhone Agent Harness</h1>

<p align="center"><strong>Confiez les commandes de votre iPhone à une IA.</strong></p>

<p align="center">
  <a href="../../README.md">English</a> · <a href="zh-Hans.md">简体中文</a> · <a href="zh-Hant.md">繁體中文</a> · <a href="ja.md">日本語</a> · <a href="ru.md">Русский</a> · <a href="de.md">Deutsch</a> · <strong>Français</strong> · <a href="es.md">Español</a>
</p>

<p align="center">
  <a href="https://github.com/cccat6/iphone-agent-harness/actions/workflows/checks.yml"><img src="https://github.com/cccat6/iphone-agent-harness/actions/workflows/checks.yml/badge.svg" alt="CI"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/iOS%20%2F%20iPadOS-27%2B-111827" alt="iOS / iPadOS 27+">
  <img src="https://img.shields.io/badge/ESP32-C2%20%C2%B7%20C3%20%C2%B7%20C5%20%C2%B7%20C6%20%C2%B7%20S3%20%C2%B7%20Classic-cf4a2b" alt="ESP32 C2, C3, C5, C6, S3, Classic">
</p>

<p align="center">
  <a href="https://igent.cc/">📱 Harness</a> ·
  <a href="https://igent.cc/flash">⚡ Installateur web</a> ·
  <a href="../guide/fr.md">📖 Guide complet</a> ·
  <a href="https://igent.cc/skills">🧩 Compétences</a> ·
  <a href="../architecture/overview.md">🗺️ Architecture</a>
</p>

Demandez à l’iPhone de lire un écran, saisir du texte, ajuster un contrôle ou suivre un court parcours entre applications. Un petit ESP32 alimenté fournit les entrées Bluetooth ; Safari gère la conversation et la capture.

- **Installer dans le navigateur.** Choisissez votre ESP32 et installez son firmware avec Chrome ou Edge sur ordinateur.
- **Le téléphone reste sans fil.** Laissez le pont alimenté sur une étagère à portée Bluetooth.
- **Votre Wi-Fi habituel.** Connectez téléphone et pont au même réseau domestique ou professionnel et démarrez une tâche dans Safari.

https://github.com/user-attachments/assets/d72669a6-e150-40d7-ba2f-1d9586d9c2ea

Un agent règle une alarme sur un véritable iPhone.

## ⚙️ Fonctionnement

Safari envoie l’écran et le contexte choisi à l’IA. Harness vérifie le plan, le transmet localement par WebRTC à l’ESP32, puis le pont utilise souris/clavier Bluetooth. Une nouvelle observation vérifie le résultat.

```mermaid
flowchart LR
  subgraph Phone["iPhone / iPad"]
    Harness["Safari · Harness"]
    Apps["Apps iPhone / iPad"]
    Storage[("Stockage local du navigateur<br/>Conversations · images · clés")]
    Apps -->|Partage d’écran| Harness
    Harness <--> Storage
    Shortcut["Raccourcis Apple<br/>Presse-papiers iOS"]
  end
  Harness <-->|API / MCP| AI["Votre IA"]
  Harness <-->|Abonnement ChatGPT| Relay["Relais sans état"]
  Relay <--> AI
  Harness <-->|WebRTC · Wi-Fi local| Bridge["Pont ESP32"]
  Bridge -->|Clavier / souris Bluetooth| Apps
  Bridge -->|HTTP local · texte| Shortcut
  Shortcut -->|Copie confirmée| Harness
```

[Architecture](../architecture/overview.md)

## 🔌 Choisir une carte

Une simple ESP32-C3 coûte environ **2 dollars US**. Choisissez la puce dans l’[installateur web](https://igent.cc/flash), puis branchez la carte à l’ordinateur avec un câble USB de données.

| Puce | Modèles compatibles |
|---|---|
| ESP32-C2 | 2 Mo minimum · quartz 26/40 MHz détecté automatiquement |
| ESP32-C3 | Tous les modèles* |
| ESP32-C5 | Tous les modèles* |
| ESP32-C6 | Tous les modèles* |
| ESP32-S3 | Tous les modèles* |
| ESP32 (classic) | Tous les modèles* |

*Les images actuelles pour C3, C5, C6, S3 et ESP32 classique utilisent une mémoire flash SPI standard d’au moins 4 Mo.

## 🚀 Installer et essayer

Le guide complet décrit les onze étapes :

1. **[Accessibilité](../guide/fr.md#accessibility)**

2. **[Flasher](../guide/fr.md#flash)**

3. **[Wi-Fi](../guide/fr.md#wifi)**

4. **[Bluetooth](../guide/fr.md#bluetooth)**

5. **[Ouvrir Harness](../guide/fr.md#open-harness)**

6. **[Configurer l’IA](../guide/fr.md#models)**

7. **[Connecter/tester le pont](../guide/fr.md#bridge)**

8. **[Raccourci presse-papiers](../guide/fr.md#clipboard)**

9. **[Compétence communautaire](../guide/fr.md#install-skills)**

10. **[Créer une compétence](../guide/fr.md#authoring)**

11. **[Publier](../guide/fr.md#publish)**

## 💬 Conversations, plans et compétences

Posez une question, préparez un plan ou confiez une tâche à l’agent dans la même conversation. Renommez, archivez, recherchez et exportez vos conversations. Consultez l’historique pendant une tâche et revenez à la dernière réponse quand vous le souhaitez.

Les compétences aident l’agent dans les tâches courantes et améliorent ses gestes et sa saisie. Ajoutez-en depuis la communauté ou demandez à Harness de vous aider à créer les vôtres. Les réglages permettent aussi de connecter des outils MCP.

Véritables écrans de Harness avec des données de démonstration.

<table>
  <tr><th>Vos conversations</th><th>Exemple de conversation</th><th>Compétences</th></tr>
  <tr>
    <td><img src="../../apps/web/media/sessions-example.jpg" width="240" alt="Vos conversations"></td>
    <td><img src="../../apps/web/media/conversation-example.jpg" width="240" alt="Exemple de conversation"></td>
    <td><img src="../../apps/web/media/skills-example.jpg" width="240" alt="Compétences"></td>
  </tr>
</table>

Un pont prend en charge deux connexions Harness indépendantes. Avec deux téléphones, sélectionnez celui qui correspond à chaque page et faites le test de saisie facultatif sur chacun pour confirmer l’association.

## 📋 Des textes longs, dans plusieurs langues

La saisie courante et les raccourcis clavier passent par le clavier Bluetooth du pont. Pour les textes longs ou multilingues, **iPhone Agent Clipboard** copie le contenu avec Raccourcis d’Apple, puis l’agent le colle dans le champ choisi.

Le navigateur envoie le texte à l’ESP32 par petits blocs via le WebRTC local. Le pont transmet ces blocs dans une seule réponse HTTP au raccourci, qui place le texte complet dans le presse-papiers de l’iPhone.

[Configurer le presse-papiers](../guide/fr.md#clipboard)

## 🔒 Données et confidentialité

Sessions, captures et identifiants sont enregistrés dans le navigateur ; les API ordinaires sont directes. En raison de CORS, ChatGPT utilise le relais Cloudflare du projet ou votre relais sans état pour le contexte choisi, les images, les réponses et un jeton d’accès temporaire. L’application relais ne conserve pas ces données et ne journalise ni contenus ni identifiants.

## 🤝 Contribuer

Vos idées et signalements sont les bienvenus dans les [Issues](https://github.com/cccat6/iphone-agent-harness/issues), tout comme vos améliorations par [pull request](https://github.com/cccat6/iphone-agent-harness/pulls). Partagez vos propres compétences dans la [communauté](https://igent.cc/skills).

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)

## 💛 Remerciements

Merci à [onehumanbeing/esp32-iphone-agent](https://github.com/onehumanbeing/esp32-iphone-agent) pour l’inspiration.
