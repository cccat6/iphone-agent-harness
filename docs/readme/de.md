# iPhone Agent Harness

[English](../../README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · **Deutsch** · [Français](fr.md) · [Español](es.md)

Ein quelloffenes Harness, mit dem ein KI-Agent iPhone und iPad über App-Grenzen hinweg bedient: im Browser, mit einem ESP32 als Bluetooth-HID-Brücke.

Zielplattform ist **Safari unter iOS/iPadOS 27 oder neuer**. Auf iPhone und iPad öffnet sich standardmäßig das Harness. Am Desktop erscheinen die Projektstartseite, die Skill-Community und Seiten zur ESP32-Einrichtung und Firmware. Eine native App und eine Android-Version sind derzeit nicht vorgesehen.

## Stand des Projekts

Web-Anwendung, authentifizierter LAN-Transport und Geräteeinrichtung sind implementiert. Website und signierte Skill-Community sind unter [igent.cc](https://igent.cc) bereitgestellt. Die Abnahme der Produktfirmware am Gerät läuft noch. Kompilierung, Hosttests und Browsersimulationen bestätigen weder die tatsächliche Telefonsteuerung noch die Verbindung von Safari zum lokalen Gerät.

Separate Versuche mit iPhone 12/iOS 27.0.1 bestätigten die Aufnahme anderer Apps, verzögerte und gestreamte Hintergrundantworten sowie vier kurze echte DeepSeek-Anfragen über beide kompatiblen Protokolle. Frühere Versuchsfirmware unterstützte Tastatur, Home, Zeiger und Wischbewegungen. Das bestätigt weder die neue Firmware noch unbegrenzte Hintergrundausführung. Siehe [Versuchsbericht](../research/background-api.md) und [Firmware-Grenzen](../architecture/firmware-implementation.md).

## Enthaltene Funktionen

- **Lokale Sitzungen:** IndexedDB, Anhänge, Import/Export, Chat-, Planungs- und Aufgabenmodus sowie Abbruch. Ausgewählter Kontext und Bilder gehen an den selbst konfigurierten KI-Dienst; das Projekt betreibt keine Cloud-Datenbank für Gespräche.
- **Modelle und Konten:** OpenAI-/Anthropic-kompatible Schnittstellen, Modellabfrage und mehrere Kontoprofile. Gerätecode, Token-Erneuerung und Responses-Adapter für Codex-Abonnements sind implementiert. Echte Safari-Anmeldung und CORS der älteren Codex-Endpunkte sind noch nicht bestätigt; Fehler werden nicht als Verbindungserfolg dargestellt.
- **Kontext und Bilder:** einstellbare Komprimierungsschwellen, Zielbudgets, Antwortreserve, Bildanzahl sowie Modellzusammenfassungen oder Auszüge. Tokenzahlen sind Schätzwerte. Maximale Bildkante und JPEG-Qualität sind konfigurierbar; Maßstab und Zeitangaben bleiben erhalten. Cache-Treffer hängen vom Anbieter ab.
- **10 integrierte Skills:** Bildschirmbeobachtung, zeitliche Beobachtung, Planung, Navigation, Texteingabe, Listen-Scrollen, Drag-and-drop, Wiederherstellung, Zuordnung von Prüfungen und Skill-Erstellung. Die Werkzeuge sind fest eingebaut; Skills installieren keine ausführbaren Plugins.
- **Autorschaft und Community:** lokale P-256-Identität, verschlüsselte Sicherung und Wiederherstellung auf anderen Geräten. Nur eigene Skills sind bearbeitbar; Community-Downloads sind schreibgeschützt. Veröffentlichen erfordert eine ausdrückliche Benutzeraktion. Das optionale Community-API ist **auf der offiziellen Website bereitgestellt** und speichert nur bewusst veröffentlichte Pakete.

Zugangsdaten bleiben standardmäßig im Arbeitsspeicher. Optional lassen sie sich lokal verschlüsseln und per Passphrase entsperren; sie gehören nicht zum statischen Build. Details stehen in den [Abonnementhinweisen](../research/codex-subscription.md).

## Lokal ausführen

Das Produkt besteht aus `apps/web/` und `firmware/IPhoneAutomationHarness/`. Community und optionales API gehören zum Web-Teil. Die statische Website kann selbst gehostet werden; für lokale Nutzung ist kein Community-Server nötig.

Voraussetzung: Node.js 22.13 oder neuer.

```sh
npm ci
npm test
npm run build
npm run preview
```

Desktop-Vorschau funktioniert über localhost; Bildschirmfreigabe auf dem Telefon braucht **HTTPS**. `build/site` kann auf Cloudflare oder einem HTTPS-Host mit dem beschriebenen [Seitenrouting](../architecture/deployment.md#self-hosted-page-routing) bereitgestellt werden. Die [Arduino-Anleitung](../../firmware/IPhoneAutomationHarness/README.md) beschreibt die Werkzeugkette.

[Systemarchitektur](../architecture/system-blueprint.md) · [Gesten und Aufnahmebarrieren](../architecture/actions.md) · [Skill-Zuordnung](../architecture/skill-community.md) · [Lokalisierung](../architecture/localization.md)

Noch zu prüfen sind sichere WLAN-Ersteinrichtung und Zielzuordnung, Safari-Verbindungen zum lokalen ESP32, echte Trägheitsgesten und die Trennung zweier Telefone an einem C3. mDNS löst weder HTTPS noch die Authentifizierung.

Vollständige Abnahmecheckliste: [English](../acceptance/README.md) · [简体中文](../acceptance/zh-Hans.md). Sie erfasst alle Funktionen und Inhalte, Desktop-Nachweise sowie die aufgeschobenen Schritte am Telefon. Vorbereitung am Computer und abschließende Release-Prüfung übernimmt das Projektteam.

Auf dem Mac wurden HTTPS mit CA-/DNS-Prüfung und die Besitzerkopplung des Produktclients mit dem echten C3 erfolgreich geprüft. Es wurden keine Telefoneingaben gesendet. Das endgültige Image sowie Safari und Telefon benötigen eine eigene Abnahme. [Client-Prüfbericht](../research/device-client-live-verification.json).

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
