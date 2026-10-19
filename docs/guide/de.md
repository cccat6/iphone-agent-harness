# Einrichtung und tägliche Nutzung

[English](README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · **Deutsch** · [Français](fr.md) · [Español](es.md) · [Projekt](../../README.md) · [Harness öffnen](https://igent.cc/) · [Architektur](../architecture/overview.md)

Benötigt werden ein iPhone oder iPad mit iOS/iPadOS 27 oder neuer, ein unterstütztes ESP32-Board, USB-Stromversorgung, lokales WLAN und ein kompatibles KI-Konto oder eine API. Die Firmware wird mit Chrome oder Edge am Computer installiert. Für die fertigen Images brauchen Sie weder Arduino noch Xcode, Entwicklerkonto oder lokalen Compiler.

Telefon und Bridge nutzen das gewohnte gemeinsame WLAN. Die Bridge wird nicht an das Telefon angeschlossen: Nach der Einrichtung kann sie versorgt an einem geeigneten Ort innerhalb der Bluetooth-Reichweite bleiben. Erledigen Sie die einmalige WLAN-Einrichtung am Computer, damit das Telefon nie den Einrichtungs-Hotspot der Bridge verwenden muss.

## Inhalt

[AssistiveTouch](#accessibility) · [Firmware](#flash) · [WLAN](#wifi) · [Bluetooth](#bluetooth) · [Harness](#open-harness) · [Modelle](#models) · [Verbinden und testen](#bridge) · [Zwischenablage](#clipboard) · [Community-Skills](#install-skills) · [Skill erstellen](#authoring) · [Veröffentlichen](#publish)

<a id="accessibility"></a>
## 1. AssistiveTouch aktivieren

Öffnen Sie am Telefon **Einstellungen → Bedienungshilfen → Tippen → AssistiveTouch** und aktivieren Sie die Funktion. Sie setzt Bluetooth-Zeigereingaben der Bridge in App-Interaktionen um. Der vollständige Tastaturzugriff kann unverändert bleiben; er ist weder für die Home-Aktion noch für die Zeigersteuerung erforderlich.

<a id="flash"></a>
## 2. ESP32-Firmware im Browser installieren

1. Öffnen Sie am Computer [Firmware installieren](https://igent.cc/flash) in Chrome oder Edge.
2. Wählen Sie das zum aufgedruckten Chip passende Profil. Der Installer zeigt die aktuell gebauten Varianten. ESP32-C2 benötigt mindestens **2 MB Flash**, alle anderen aufgeführten Chips **4 MB**. PSRAM, Display und externe Sensoren sind nicht nötig.
3. Verbinden Sie das Board mit einem USB-**Datenkabel**. Wählen Sie „USB-Gerät auswählen und installieren“ und anschließend dieses Board in der seriellen Geräteauswahl des Browsers.
4. Warten Sie auf Installation und Prüfung. Startet der Downloadmodus nicht automatisch, halten Sie BOOT beim Anschließen oder Zurücksetzen gedrückt, lassen anschließend los und versuchen es erneut.
5. Wählen Sie „Geräteinformationen lesen“ und dasselbe Board. Der Installer zeigt Name und Passwort des Einrichtungs-WLANs sowie einen Telefonlink. Halten Sie diese Informationen bereit.

USB dient zum Installieren, Lesen der Einrichtung und zur Stromversorgung. Während der Telefonbedienung genügt ein Netzteil oder eine andere USB-Stromquelle; es gibt kein Kabel vom Telefon zur Bridge.

Die einzelne Installer-Auswahl **ESP32-C2** wählt automatisch das Image für den 26- oder 40-MHz-Quarz. Das 2-MB-Image hat eine einzelne Anwendungspartition ohne OTA. C2 verbindet sich über **USB-zu-UART** (häufig auf dem Board integriert), nicht über natives USB CDC. Das **ESP32-C5**-Image verwendet 80-MHz-Flash und natives USB CDC.

<a id="wifi"></a>
## 3. Die Bridge ins gewohnte WLAN aufnehmen

Bei einem neuen Board einmal ausführen:

1. Verbinden Sie den **Computer** vorübergehend mit dem vom Installer angezeigten Einrichtungs-WLAN `iPhone-Harness-…`. Verwenden Sie das angezeigte Passwort.
2. Öffnen Sie `http://192.168.4.1` und geben Sie Name und Passwort des normalen lokalen WLANs ein. Ein 2,4-GHz-Netz funktioniert mit allen unterstützten Varianten.
3. Warten Sie auf die Verbindungsbestätigung und wechseln Sie den Computer zurück ins gewohnte WLAN.
4. Lassen Sie das Telefon im selben lokalen Netz. Es benötigt weder den Access Point des Boards noch einen Mobilfunk-Umweg zur KI.

Die Bridge speichert diese WLAN-Daten lokal und verbindet sich nach dem Einschalten wieder. Bereits eingerichtete Boards überspringen diesen Schritt. Unter `http://igent.local/settings` stehen die angebotenen Geräteeinstellungen zur Verfügung, etwa der lokale Name.

<a id="bluetooth"></a>
## 4. Bluetooth-Eingabebridge koppeln

Öffnen Sie am Telefon **Einstellungen → Bluetooth** und koppeln Sie **iPhone Agent Bridge**. AssistiveTouch bleibt aktiv. Die System-Bluetooth-Verbindung übermittelt Eingaben an iOS; die Netzwerkverbindung zwischen Browser und Bridge übermittelt Agent-Befehle an das Board. Es sind getrennte Verbindungen.

Ändert ein Firmware-Update die HID-Berichte, entfernen Sie den alten Bluetooth-Eintrag in den Systemeinstellungen und koppeln erneut. Ein normales Neuladen der Seite oder ein Modellwechsel erfordert das nicht.

<a id="open-harness"></a>
## 5. Web Harness öffnen

Öffnen Sie [igent.cc](https://igent.cc/) in Safari am Telefon. Unterstützte iPhones/iPads gelangen zum Harness; Computer zeigen Homepage, Skill-Community und Firmware-Installer. Eine zusätzliche iOS-App, ein Zertifikatsprofil, eine Safari-Erweiterung oder der Entwicklermodus sind nicht erforderlich.

Beim Start einer Aktion bittet Safari um Bildschirmfreigabe. Erlauben Sie sie und lassen Sie das Telefon während der Arbeit entsperrt. Das ist die normale iOS-Freigabe; experimentelle Netzwerk-Flags oder zusätzliche Umwege zur Netzwerkautorisierung sind unnötig. Beenden der Freigabe pausiert eine aktive Aufgabe. „Weiter“ fragt sie bei Bedarf erneut an.

<a id="models"></a>
## 6. API oder ChatGPT-Konto einrichten

Öffnen Sie **Einstellungen → Konten oder API → Hinzufügen**. Sie können mehrere Verbindungen speichern und die Modelle über die Auswahl im Gespräch wechseln.

### API-Endpunkt und Schlüssel

1. Wählen Sie eine **OpenAI-kompatible** oder **Anthropic-kompatible** API.
2. Tragen Sie Anbieter-Endpunkt, API-Schlüssel und Verbindungsnamen ein. Beachten Sie den Formularhinweis: Dienstwurzel oder `/v1`-Basis sind möglich; unterstützte vollständige Operations-URLs normalisiert der Adapter.
3. Wählen Sie „Modelle abrufen“. Ein Standardmodell auswählen oder dessen ID eingeben. Alle gefundenen Modelle bleiben im Gespräch auswählbar.
4. Speichern Sie. Für Telefonaufgaben ein Modell mit Bildverständnis und Werkzeugaufrufen verwenden. Eine unterstützte Denkintensität lässt sich gegebenenfalls in der Auswahl einstellen.

Schlüssel werden in diesem Browser gespeichert. Anfragen gehen direkt an den Anbieter und werden nicht über den Website-Host vermittelt. Der Anbieter muss Browseranfragen von der verwendeten Website zulassen.

### ChatGPT-Abonnementkonto

Aktivieren Sie zunächst die Gerätecode-Anmeldung in den ChatGPT-Sicherheitseinstellungen. Bei verwalteten Arbeitsbereichen muss dies gegebenenfalls ein Administrator freigeben. Wählen Sie dann ChatGPT/Codex in Harness, starten Sie die Anmeldung und öffnen Sie die im Formular angezeigte offizielle Prüfseite. Geben Sie dort den angezeigten Code ein und schließen Sie die Anmeldung ab. Kehren Sie zurück, drücken Sie die Abschluss-Schaltfläche, laden Sie die Modelle und speichern Sie die Verbindung. Zugangsdaten bleiben lokal und werden vom Kontoadapter erneuert. Dies ist eine Abonnementverbindung, kein gewöhnlicher OpenAI-API-Schlüssel; der offizielle Anmeldedienst muss im Browser erreichbar sein. Siehe [OpenAIs Anleitung zur Gerätecode-Anmeldung](https://learn.chatgpt.com/docs/auth#preferred-device-code-authentication-beta).

<a id="bridge"></a>
## 7. Bridge verbinden und Eingabe optional testen

1. Öffnen Sie „Geräte“ aus der Sitzungsliste oder über den Bridge-Status im Gespräch.
2. Sind noch keine Informationen gespeichert, wählen Sie „Bridge-Informationen abrufen“, öffnen die lokale Geräteseite und nutzen deren Rückkehrlink. Er importiert Adresse und öffentliche WebRTC-Verbindungsdaten. Der Telefonlink des Installers liefert dieselben Informationen.
3. Wählen Sie „ESP32-Bridge verbinden“ und gegebenenfalls das gekoppelte, eingabebereite Telefon. Nach dem Speichern beginnt die nächste Nutzung direkt mit Verbinden, ohne erneute WLAN-Einrichtung.
4. Für eine zusätzliche Prüfung nativer Tastatureingabe „Eingabetest starten“ einmal drücken und Seite samt Testfeld im Vordergrund lassen. Das Board tippt acht Ziffern, die der Browser automatisch bestätigt. Bei aktueller Firmware ist der Test optional.

„Aktualisieren“ liest nur den Zustand. „Bridge verbunden“, „Telefon-Bluetooth verbunden“ und „Eingabe bereit“ sind unterschiedliche Zustände. Während der Initialisierung kurz warten und aktualisieren. Ein eindeutig wegen Ratenbegrenzung abgelehnter Test zeigt einen Countdown und darf einmal erneut versuchen; Eingaben mit unbekanntem physischem Ergebnis werden nicht blind gesendet. Verbindungsfehler zeigen Status und Ursache.

Probieren Sie „Uhr öffnen und einen Wecker für 7:00 stellen“. Erlauben Sie die Freigabe und wechseln Sie zur Ziel-App. Der Agent beobachtet, handelt und prüft. Standardmäßig kehrt er zu dieser Harness-Sitzung zurück. Zum Verbleib in der Ziel-App **Einstellungen → Aufgabenabschluss → Zu Harness zurückkehren** abschalten.

<a id="clipboard"></a>
## 8. Kopieren mit Kurzbefehlen einrichten

1. Öffnen Sie am Telefon die [Zwischenablage-Anleitung](https://igent.cc/shortcuts/clipboard.html) und laden Sie den signierten Kurzbefehl.
2. Fügen Sie ihn in Apples Kurzbefehle-App als **iPhone Agent Clipboard** hinzu und behalten Sie diesen genauen Namen.
3. Verbinden Sie die Bridge. Sobald der Agent Text vorbereitet hat, wählen Sie „Mit Kurzbefehlen kopieren“. Fragt iOS nach Zugriff des Kurzbefehls auf die lokale Bridge-URL, erlauben Sie ihn. Das ist eine eigene Berechtigungsanfrage des Kurzbefehls.
4. Kehren Sie nach dem Kopieren zurück. Harness wartet auf die Kopierbestätigung und prüft Ziel-App und Eingabefeld vor dem Einfügen.

Der Browser liefert Text in Abschnitten an die Bridge, die ihn mit einer lokalen HTTP-Antwort an den Kurzbefehl weitergibt. Sie muss nicht den ganzen Text puffern. Ohne wartenden Auftrag liefert der Kurzbefehl keinen Text und verändert die Zwischenablage nicht. Alternativ steht „Kopieren und weiter“ im Vordergrund ohne Kurzbefehl bereit.

<a id="install-skills"></a>
## 9. Community-Skill installieren

Öffnen Sie am Telefon **Einstellungen → Skills → Community** oder die [Skill-Community](https://igent.cc/skills). Lesen Sie die Anweisungen und wählen Sie „Lokal hinzufügen“. Integrierte Skills stehen neben Community-Veröffentlichungen und sind bereits lokal verfügbar. Installierte Skills lassen sich in der Liste an- und ausschalten.

Neuladen aktualisiert die integrierten Skills und prüft unveränderte Community-Installationen auf neue Versionen. Aktivierungswahl und lokale Änderungen bleiben erhalten. Laufende Aufgaben verwenden ihre Startversionen; Updates gelten für nachfolgende Aufgaben. Community-Downloads bleiben schreibgeschützt und behalten den ursprünglichen Autor.

<a id="authoring"></a>
## 10. Eigenen Skill erstellen und verbessern

Öffnen Sie am Computer [Skills](https://igent.cc/skills) und unter „Erstellen und veröffentlichen“ die Aktion „Eigenen Skill erstellen“. Am Telefon nutzen Sie **Einstellungen → Skills → Erstellen**. Name, kleingeschriebenen Slug, Kurzbeschreibung und Markdown-Anweisungen eingeben, dann den lokalen Entwurf speichern.

Sie können auch Harness um Erstellung oder Verbesserung Ihres Skills bitten. Beschreiben Sie Ziel, Einsatzbedingungen, Bedienelemente, sichtbares Erfolgskriterium und Anpassung nach Fehlern. Community-Downloads und integrierte Skills bleiben schreibgeschützt.

Eigentum beruht auf einer vom Browser erzeugten Signieridentität, verfügbar am Computer wie unter iOS, nicht auf einer iOS-UID. Vor Browser- oder Gerätewechsel Skill-Datei und verschlüsselte Sicherung der „Autorenidentität“ exportieren. Identität im neuen Browser wiederherstellen und eigene Skill-Datei importieren, um unter demselben Autor weiterzuarbeiten.

<a id="publish"></a>
## 11. Skill teilen

Wählen Sie für Ihren Entwurf „Veröffentlichen“ auf der Community-Seite, oder am Telefon „In Community veröffentlichen“ im Freigabebereich des Skills. Prüfen Sie den Inhalt und bestätigen Sie. Das öffentliche Paket wird mit Ihrer lokalen Identität signiert. Erneutes Bearbeiten und Veröffentlichen erzeugt die nächste Version, die andere Nutzer beim Aktualisieren ihrer installierten Kopien erhalten.

[Issues](https://github.com/cccat6/iphone-agent-harness/issues) für Fehler und Wünsche sowie [Pull Requests](https://github.com/cccat6/iphone-agent-harness/pulls) für Code, Dokumentation und Übersetzungen sind willkommen. Eigene Skills bitte über die Website-Community statt als Code-PR teilen.

## Sitzungen und Selbsthosting

Der Listentitel wechselt zwischen Sitzungen und Archiv. Wischen bietet Umbenennen/Archivieren bzw. im Archiv Umbenennen/Wiederherstellen/Löschen. Ältere Nachrichten laden beim Hochscrollen; Antworten bewahren die Leseposition. „Neueste“ führt zur aktuellen Ausgabe.

Sitzungen, gespeicherte Bilder und Zugangsdaten bleiben in diesem Browser. Export erfolgt im Sitzungsmenü, Import in Einstellungen; Exporte enthalten keine Zugangsdaten. Der Host liefert Seiten und öffentliche Skills, ausgewählte Modell-/MCP-Daten gehen direkt an die konfigurierten Dienste. [Web Harness selbst hosten](../architecture/deployment.md) ist ebenfalls möglich.
