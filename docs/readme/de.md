# iPhone Agent Harness

[English](../../README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · **Deutsch** · [Français](fr.md) · [Español](es.md)

Ein quelloffenes Harness, mit dem ein KI-Agent iPhone und iPad über App-Grenzen hinweg bedient: im Browser und mit einem ESP32 als Bluetooth-Controller.

Für **Safari unter iOS/iPadOS 27 oder neuer**. Auf iPhone und iPad öffnet sich das Harness; am Computer stehen Projektseite, Skill-Community und ESP32-Firmwareinstallation bereit.

Bedienungsanleitung: [English](../acceptance/README.md) · [简体中文](../acceptance/zh-Hans.md). Die wichtigsten Ansichten und alltäglichen Abläufe.

Die Website ist unter [igent.cc](https://igent.cc) erreichbar. Kehre nach dem Verbinden zu Harness zurück und lasse den Geräte-Tab geöffnet. Eine Zertifikatsinstallation oder Weiterleitung der Steuerbefehle über die Cloud ist nicht nötig. Auf einem iPhone mit Safari 27.0.1 gelangen fünf GET/POST-Anfragen über etwa 21 Sekunden, auch mit beiden Tabs im Hintergrund während der Bildschirmfreigabe. Damit sind weder unbegrenzter Hintergrundbetrieb noch sämtliche Telefonaktionen bestätigt. Siehe die [Verbindungstests](../architecture/lan-connection.md).

## Funktionen

- **Sitzungen:** lokale Nachrichten und Bilder, Suche, Umbenennen, Anheften, Archivieren sowie Dateiimport und -export. Chat-, Planungs- und Aufgabenmodus.
- **Konten oder API:** mehrere Verbindungen, OpenAI- und Anthropic-kompatible Endpunkte sowie Modellabfrage und -wechsel. Anmeldung und Adapter für ChatGPT-Abonnements sind implementiert; die tatsächliche Anmeldung in Safari wird noch geprüft.
- **Kontext:** automatische Modellzusammenfassungen ab einer einstellbaren Schwelle von standardmäßig **750.000 Token**. Der vollständige Verlauf bleibt auf dem Gerät.
- **Bilder:** JPEG-Komprimierung in drei Qualitätsstufen bei unveränderten Originalabmessungen.
- **Skills:** zehn integrierte Skills, eigene bearbeitbare Skills, Community-Downloads und Veröffentlichung. Die offizielle Community-Adresse ist voreingestellt. Das Harness hilft im Chat beim Erstellen und Überarbeiten eigener Skills.
- **MCP:** mehrere Streamable-HTTP-Server hinzufügen, Werkzeuge einzeln auswählen und im Aufgabenmodus verwenden.

Sitzungen bleiben im Browser; ausgewählte Nachrichten und Bilder werden an den gewählten Modelldienst gesendet. API-Schlüssel und Zugangsdaten bleiben standardmäßig im Seitenspeicher und können optional verschlüsselt auf dem Gerät gespeichert werden.

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
