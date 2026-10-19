# iPhone Agent Harness

[English](../../README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · **Deutsch** · [Français](fr.md) · [Español](es.md)

Ein quelloffenes Harness, mit dem ein KI-Agent iPhone und iPad über App-Grenzen hinweg bedient: im Browser und mit einem ESP32 als Bluetooth-Controller.

Für **Safari unter iOS/iPadOS 27 oder neuer**. Auf iPhone und iPad öffnet sich das Harness; am Computer stehen Projektseite, Skill-Community und ESP32-Firmwareinstallation bereit.

Bedienungsanleitung: [English](../acceptance/README.md) · [简体中文](../acceptance/zh-Hans.md). Die wichtigsten Ansichten und alltäglichen Abläufe.

Die Website ist unter [igent.cc](https://igent.cc) erreichbar. Harness verbindet sich auf derselben Seite über **WebRTC Direct** mit der ESP32-Bridge im lokalen Netzwerk. Ein zusätzlicher Verbindungs-Tab, ein Verbindungscode oder eine Zertifikatsinstallation sind nicht nötig. Importieren Sie die Verbindungsdaten einmal über den USB-Einrichtungslink oder die Geräteeinstellungen; danach verbinden Sie sich direkt in Harness. Die gemeinsame Nutzung von RTC und Bluetooth in der Produktfirmware wird derzeit am Gerät geprüft. Siehe [Verbindungsanleitung und Ergebnisse](../architecture/secure-lan.md).

## Funktionen

- **Sitzungen:** lokale Nachrichten und Bilder, Suche, Umbenennen, Anheften, Archivieren sowie Dateiimport und -export. Besprechen, Planen und Ausführen erfolgen in einem Chat. Eine Bitte um einen Plan startet keine Aktionen.
- **Konten oder API:** mehrere Verbindungen, OpenAI- und Anthropic-kompatible Endpunkte sowie Modellabfrage und -wechsel. Anmeldung und Adapter für ChatGPT-Abonnements sind implementiert; die tatsächliche Anmeldung in Safari wird noch geprüft.
- **Kontext:** automatische Modellzusammenfassungen ab einer einstellbaren Schwelle von standardmäßig **750.000 Token**. Der vollständige Verlauf bleibt auf dem Gerät.
- **Bilder:** JPEG-Komprimierung in drei Qualitätsstufen bei unveränderten Originalabmessungen.
- **Skills:** zehn integrierte Skills, eigene bearbeitbare Skills, Community-Downloads und Veröffentlichung. Die offizielle Community-Adresse ist voreingestellt. Das Harness hilft im Chat beim Erstellen und Überarbeiten eigener Skills.
- **MCP:** mehrere Streamable-HTTP-Server hinzufügen, Werkzeuge einzeln auswählen und freigegebene Werkzeuge bei der Ausführung verwenden.

Sitzungen bleiben im Browser; ausgewählte Nachrichten und Bilder werden an den gewählten Modelldienst gesendet. API-Schlüssel und Zugangsdaten werden in diesem Browser getrennt von Chats und Exporten gespeichert. Ein Entsperrpasswort ist nicht nötig. Beim Löschen der Websitedaten werden auch diese Zugangsdaten entfernt.

Als API-Endpunkt wird eine Basis wie `https://api.example.com/v1` oder eine vollständige `/chat/completions`-URL akzeptiert; bei Anthropic-kompatiblen Diensten auch `/v1/messages`. Hinweise im Editor erklären das benötigte Präfix. Nach dem Laden der Modellliste lässt sich das Standardmodell im selben Feld auswählen oder eingeben. Alle erkannten Modelle bleiben im Chat auswählbar.

## Projekt und lokale Entwicklung

Die beiden Produktteile sind `apps/web/` (Website, Harness und Skill-Community) und `firmware/IPhoneAutomationHarness/` (Arduino-Firmware). Die Website kann selbst gehostet werden.

Node.js 22.13 oder neuer verwenden:

```sh
npm ci
npm test
npm run build
npm run preview
```

Die Desktop-Vorschau läuft über localhost; die Bildschirmfreigabe des Telefons benötigt HTTPS. Stellen Sie `build/site` mit dem [beschriebenen Routing](../architecture/deployment.md#self-hosted-page-routing) bereit. Boards und Builds sind in der [Arduino-Anleitung](../../firmware/IPhoneAutomationHarness/README.md) beschrieben.

**Manuelle Releases:** Normale Pushes starten keine GitHub Actions. Auf Anforderung wird unveränderte Firmware wiederverwendet und geänderte Firmware für ESP32/C3/S3/C6 gebaut. Dieselben Binärdateien erscheinen in Releases und auf der Website. [Release-Einrichtung](../architecture/manual-release.md).

[Architektur](../architecture/system-blueprint.md) · [Aktionen und Screenshots](../architecture/actions.md) · [Konten und MCP](../architecture/auth-and-backends.md) · [Skill-Autorschaft](../architecture/skill-community.md) · [Sprachen](../architecture/localization.md)

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
