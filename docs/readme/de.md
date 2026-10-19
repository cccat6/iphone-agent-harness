# iPhone Agent Harness

[English](../../README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · **Deutsch** · [Français](fr.md) · [Español](es.md)

Ein quelloffenes Browser-Harness, mit dem KI ein iPhone oder iPad über Apps hinweg mittels ESP32-Bluetooth-Bridge bedient.

[igent.cc](https://igent.cc) · [GitHub](https://github.com/cccat6/iphone-agent-harness)

![Platzhaltergrafik: Browser, ESP32-Bridge und Telefon. Ein Demo-Video/GIF folgt demnächst.](../../apps/web/media/demo-placeholder.svg)

Platzhaltergrafik: Browser, ESP32-Bridge und Telefon. Ein Demo-Video/GIF folgt demnächst.

## In fünf Schritten starten

Benötigt werden Safari auf iOS/iPadOS 27+, ein ESP32/C3/S3/C6 mit mindestens 4 MB Flash, ein USB-Datenkabel, gemeinsames 2,4-GHz-WLAN und ein KI-Konto oder eine kompatible API. Zum Flashen im Browser dient Chrome/Edge am Computer.

1. **Firmware installieren.** Am Computer den Installer öffnen, Board wählen und flashen. Geräteinformationen lesen und den Telefonlink behalten. Ein neues Board über sein Einrichtungs-WLAN mit dem normalen Netz verbinden; danach das Telefon wieder dorthin wechseln.

2. **Telefon verbinden.** Den Link öffnen oder Bridge-Informationen in Harness abrufen, speichern und ESP32 verbinden. In iOS Bluetooth iPhone Agent Bridge koppeln, AssistiveTouch aktivieren und das bereite Telefon wählen. Der Acht-Ziffern-Test ist bei aktueller Firmware optional; voller Tastaturzugriff darf an oder aus sein. Kein Verbindungscode, Zertifikat oder weiterer Tab ist nötig.

3. **KI auswählen.** Unter Einstellungen → Konten/API Endpunkt und Schlüssel eintragen und Modelle laden oder ChatGPT anmelden. Das Standardmodell auswählen oder eingeben; alle gefundenen Modelle bleiben verfügbar. Gespräch erstellen und Modell sowie unterstützte Denkintensität wählen.

4. **Bildschirm teilen und Aufgabe stellen.** Mit einer kurzen sicheren Aufgabe beginnen, etwa einem Testwecker. Fähigkeitsfragen werden beantwortet, Planwünsche zeigen einen prüfbaren Plan, ausdrückliche Aktionen können ausgeführt werden. Telefon entsperrt lassen und erste Schritte beobachten. Stop beendet, Verlust der Freigabe pausiert.

5. **Ergebnis prüfen.** Die KI prüft vor dem Abschluss das Ergebnis und kehrt standardmäßig zu Harness zurück. Unter Einstellungen → Aufgabenabschluss lässt sich die Rückkehr abschalten. Wichtige Ergebnisse selbst am Bildschirm kontrollieren.

## Im Alltag

- Mit der Titelauswahl der Sitzungsliste zwischen Gesprächen und Archiv wechseln. Wischen zeigt Umbenennen/Archivieren, im Archiv Umbenennen/Wiederherstellen/Löschen mit Bestätigung. Herunterziehen oder Suche drücken.

- Ältere Nachrichten werden beim Hochscrollen geladen. Neue Antworten bewahren die Leseposition; „Neueste“ führt zurück. Export im Gesprächsmenü, Import in Einstellungen, mit Bildern höchstens 64 MiB.

- Für lange Texte iPhone Agent Clipboard über die Anleitung installieren. Mit Kurzbefehlen oder der Vordergrund-Schaltfläche kopieren. Die Aufgabe wartet auf Kopierbestätigung und prüft vor dem Einfügen das Zielfeld.

- 12 integrierte Skills unterstützen Beobachtung, Planung, Eingabe, Wiederherstellung, Erstellung, Uhrzeit und Gestenkorrektur. Zahlen werden direkt eingegeben, wenn möglich; sonst folgen kleine Korrekturen mit Wartezeit bis zum Stillstand.

- Eigene Skills am Computer oder Telefon erstellen, bearbeiten und veröffentlichen. Eigentum beruht auf einer kryptografischen Browseridentität, keiner iOS-UID. Vor Browserwechsel verschlüsselt sichern. Integrierte und heruntergeladene Skills sind schreibgeschützt; Updates beim Neuladen bewahren Aktivierung und bei Fehlern die bisherige Version.

- Optionales MCP verbindet browserfähige Streamable-HTTP-Server mit ausdrücklicher Werkzeugfreigabe und erforderlichem CORS. stdio und vollständiges Remote-OAuth-Hosting fehlen.

## Daten und Grenzen

Gespräche, Bilder, API-Schlüssel und Tokens bleiben in diesem Browser. Zugangsdaten sind von Exporten getrennt und brauchen kein Entsperrpasswort. Ausgewählte Inhalte gehen an den Modelldienst. Löschen der Websitedaten entfernt lokale Inhalte; Wichtiges exportieren. Veröffentlichung sendet nur das ausdrücklich gewählte Skill-Paket.

Experimentelle Hardwarefunktionen beaufsichtigt verwenden. Gesten, Hintergrundbilder, Kurzbefehle und mehrere Telefone müssen auf eigenen Geräten geprüft werden; Build und Desktop-Tests ersetzen dies nicht. Safari kann im Hintergrund pausieren. Kein standardmäßiges Gesamtlimit gilt für Aufgaben, Sicherheitsgrenzen einzelner Pläne bleiben. Safari-ChatGPT-Anmeldung und Token-Erneuerung haben Kompatibilitätsgrenzen. Die Bridge hat einen aktiven WebRTC-Peer. Die neue Mehrclient-Registrierung/Importreparatur ist im Quelltext vorbereitet, noch nicht geflasht und am Gerät geprüft.

## Entwicklung und Selbsthosting

Node.js 22.13+ verwenden. Produktteile sind apps/web und firmware/IPhoneAutomationHarness. Die statische Website kann einen optionalen API-Dienst für signierte öffentliche Skills nutzen. Bildschirmfreigabe braucht HTTPS.

```sh
npm ci
npm test
npm run build
npm run preview
```

Releases werden manuell gestartet; normale Pushes starten keine GitHub Actions. Firmware-Wiederverwendung und Deployment sind im Release-Leitfaden beschrieben.

[Telefonanleitung](../acceptance/README.md) · [Arduino](../../firmware/IPhoneAutomationHarness/README.md) · [Architektur](../architecture/overview.md) · [Selbsthosting](../architecture/deployment.md) · [Manuelle Releases](../architecture/manual-release.md) · [Zwischenablage](https://igent.cc/shortcuts/clipboard.html)

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
