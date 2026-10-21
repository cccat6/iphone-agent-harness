<p align="center"><img src="../media/logo-card.svg" width="128" height="128" alt="iPhone Agent Harness"></p>

<h1 align="center">iPhone Agent Harness</h1>

<p align="center"><strong>Lass KI dein iPhone bedienen.</strong></p>

<p align="center">
  <a href="../../README.md">English</a> · <a href="zh-Hans.md">简体中文</a> · <a href="zh-Hant.md">繁體中文</a> · <a href="ja.md">日本語</a> · <a href="ru.md">Русский</a> · <strong>Deutsch</strong> · <a href="fr.md">Français</a> · <a href="es.md">Español</a>
</p>

<p align="center">
  <a href="https://github.com/cccat6/iphone-agent-harness/actions/workflows/checks.yml"><img src="https://github.com/cccat6/iphone-agent-harness/actions/workflows/checks.yml/badge.svg" alt="CI"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/iOS%20%2F%20iPadOS-27%2B-111827" alt="iOS / iPadOS 27+">
  <img src="https://img.shields.io/badge/ESP32-C2%20%C2%B7%20C3%20%C2%B7%20C5%20%C2%B7%20C6%20%C2%B7%20S3%20%C2%B7%20Classic-cf4a2b" alt="ESP32 C2, C3, C5, C6, S3, Classic">
</p>

<p align="center">
  <a href="https://igent.cc/">📱 Harness</a> ·
  <a href="https://igent.cc/flash">⚡ Browser-Installer</a> ·
  <a href="../guide/de.md">📖 Anleitung</a> ·
  <a href="https://igent.cc/skills">🧩 Skills</a> ·
  <a href="../architecture/overview.md">🗺️ Architektur</a>
</p>

Dem iPhone eine Aufgabe in Alltagssprache geben: Bildschirm prüfen, Text eingeben, Regler einstellen oder einen kurzen Ablauf über Apps hinweg erledigen. Eine kleine versorgte ESP32-Bridge liefert Bluetooth-Eingaben, Safari übernimmt Gespräch und Bildschirmaufnahme.

- **Im Browser installieren.** Wähle deinen ESP32 und installiere die Firmware mit Chrome oder Edge am Computer.
- **Das Telefon bleibt kabellos.** Lass die Bridge mit Strom versorgt im Regal oder einer Zimmerecke in Bluetooth-Reichweite stehen.
- **Dein gewohntes WLAN.** Verbinde Telefon und Bridge mit demselben Heim- oder Büronetz und starte die Aufgabe in Safari.

https://github.com/user-attachments/assets/d72669a6-e150-40d7-ba2f-1d9586d9c2ea

Ein Agent stellt auf einem echten iPhone einen Wecker.

## ⚙️ So funktioniert es

Safari sendet Bildschirm und gewählten Kontext an die KI. Harness prüft den Plan, übergibt ihn lokal per WebRTC an ESP32, und Bluetooth-Maus/Tastatur bedient das Telefon. Eine neue Aufnahme prüft das Ergebnis.

```mermaid
flowchart LR
  subgraph Phone["iPhone / iPad"]
    Harness["Safari · Harness"]
    Apps["iPhone- / iPad-Apps"]
    Storage[("Lokaler Browserspeicher<br/>Gespräche · Bilder · Schlüssel")]
    Apps -->|Bildschirmfreigabe| Harness
    Harness <--> Storage
    Shortcut["Apple Kurzbefehle<br/>iOS-Zwischenablage"]
  end
  Harness <-->|API / MCP| AI["Deine gewählte KI"]
  Harness <-->|ChatGPT-Abonnement| Relay["Zustandsloser Relay"]
  Relay <--> AI
  Harness <-->|WebRTC · lokales WLAN| Bridge["ESP32-Bridge"]
  Bridge -->|Bluetooth-Tastatur / Maus| Apps
  Bridge -->|Lokales HTTP · Text| Shortcut
  Shortcut -->|Kopieren bestätigt| Harness
```

[Architektur](../architecture/overview.md)

## 🔌 Board auswählen

Ein einfaches ESP32-C3-Board kostet ungefähr **2 US-Dollar**. Im [Browser-Installer](https://igent.cc/flash) den Chip wählen und das Board per USB-Datenkabel mit dem Computer verbinden.

| Chip | Unterstützte Modelle |
|---|---|
| ESP32-C2 | Mindestens 2 MB · 26/40-MHz-Quarz automatisch erkannt |
| ESP32-C3 | Alle Modelle* |
| ESP32-C5 | Alle Modelle* |
| ESP32-C6 | Alle Modelle* |
| ESP32-S3 | Alle Modelle* |
| ESP32 (classic) | Alle Modelle* |

*Die aktuellen Images für C3, C5, C6, S3 und den klassischen ESP32 sind für Standard-SPI-Flash mit mindestens 4 MB ausgelegt.

## 🚀 Einrichten und ausprobieren

Die vollständige Anleitung beschreibt alle Schritte:

1. **[Bedienungshilfen](../guide/de.md#accessibility)**

2. **[Flashen](../guide/de.md#flash)**

3. **[WLAN](../guide/de.md#wifi)**

4. **[Bluetooth](../guide/de.md#bluetooth)**

5. **[Harness öffnen](../guide/de.md#open-harness)**

6. **[KI einrichten](../guide/de.md#models)**

7. **[Bridge verbinden/testen](../guide/de.md#bridge)**

8. **[Zwischenablage-Kurzbefehl](../guide/de.md#clipboard)**

9. **[Community-Skill](../guide/de.md#install-skills)**

10. **[Eigener Skill](../guide/de.md#authoring)**

11. **[Veröffentlichen](../guide/de.md#publish)**

## 💬 Gespräche, Pläne und Skills

Stelle Fragen, bespreche einen Plan oder beauftrage den Agenten im selben Gespräch. Gespräche lassen sich umbenennen, archivieren, durchsuchen und exportieren. Lies während einer laufenden Aufgabe im Verlauf und kehre jederzeit zur neuesten Antwort zurück.

Skills helfen bei alltäglichen Telefonaufgaben und verbessern Tippen, Texteingabe und Gesten. Füge sie aus der Community hinzu oder lass Harness beim Schreiben eigener Skills helfen. MCP-Werkzeuge verbindest du in den Einstellungen.

Echte Harness-Oberflächen mit Beispieldaten.

<table>
  <tr><th>Gesprächsliste</th><th>Beispielgespräch</th><th>Skills</th></tr>
  <tr>
    <td><img src="../../apps/web/media/sessions-example.jpg" width="240" alt="Gesprächsliste"></td>
    <td><img src="../../apps/web/media/conversation-example.jpg" width="240" alt="Beispielgespräch"></td>
    <td><img src="../../apps/web/media/skills-example.jpg" width="240" alt="Skills"></td>
  </tr>
</table>

Eine Bridge unterstützt zwei unabhängige Harness-Verbindungen. Wähle bei zwei Telefonen auf jeder Seite das zugehörige Telefon und prüfe die Zuordnung jeweils mit dem optionalen Eingabetest.

## 📋 Lange Texte in vielen Sprachen

Normale Texteingabe und Tastenkombinationen laufen über die Bluetooth-Tastatur der Bridge. Bei langen oder mehrsprachigen Texten kopiert **iPhone Agent Clipboard** den Inhalt mit Apple Kurzbefehle; anschließend fügt der Agent ihn ins gewünschte Feld ein.

Der Browser sendet den Text in kleinen Teilen per lokalem WebRTC an den ESP32. Die Bridge leitet sie als eine HTTP-Antwort an den Kurzbefehl weiter, der den vollständigen Text in die iPhone-Zwischenablage kopiert.

[Zwischenablage einrichten](../guide/de.md#clipboard)

## 🔒 Daten und Datenschutz

Sitzungen, Screenshots und Zugangsdaten werden im Browser gespeichert; normale APIs verbinden sich direkt. ChatGPT-Abonnements nutzen wegen CORS den Cloudflare-Relay des Projekts oder deinen eigenen zustandslosen Relay für ausgewählten Kontext, Bilder, Ausgaben und ein kurzlebiges Zugriffstoken. Die Relay-Anwendung speichert diese Daten nicht und protokolliert keine Inhalte oder Zugangsdaten.

## 🤝 Mitwirken

Ideen und Fehler bitte als [Issue](https://github.com/cccat6/iphone-agent-harness/issues) melden, Verbesserungen als [Pull Request](https://github.com/cccat6/iphone-agent-harness/pulls) einreichen. Eigene Skills kannst du in der [Skill-Community](https://igent.cc/skills) teilen.

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)

## 💛 Danksagung

Danke an [onehumanbeing/esp32-iphone-agent](https://github.com/onehumanbeing/esp32-iphone-agent) für die Inspiration.
