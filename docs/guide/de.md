# Einrichtung und tägliche Nutzung

[English](README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · **Deutsch** · [Français](fr.md) · [Español](es.md) · [Projekt](../../README.md) · [Harness öffnen](https://igent.cc/) · [Architektur](../architecture/overview.md)

Du brauchst ein iPhone oder iPad mit iOS/iPadOS 27+, ein ESP32-Board, USB-Stromversorgung, WLAN und ein KI-Konto oder einen API-Schlüssel. Die Firmware installierst du am Computer mit Chrome oder Edge.

Telefon und Bridge nutzen dasselbe WLAN. Lass die eingerichtete Bridge mit Strom versorgt in Bluetooth-Reichweite stehen.

## Inhalt

[AssistiveTouch](#accessibility) · [Firmware](#flash) · [WLAN](#wifi) · [Bluetooth](#bluetooth) · [Harness](#open-harness) · [Modelle](#models) · [Verbinden und testen](#bridge) · [Zwischenablage](#clipboard) · [Community-Skills](#install-skills) · [Skill erstellen](#authoring) · [Veröffentlichen](#publish)

<a id="accessibility"></a>
## 1. AssistiveTouch aktivieren

Öffne auf dem iPhone **Einstellungen → Bedienungshilfen → Tippen → AssistiveTouch** und schalte es ein. So kann die Bridge mit dem Zeiger tippen und ziehen.

<a id="flash"></a>
## 2. ESP32-Firmware im Browser installieren

1. Öffne den [Browser-Installer](https://igent.cc/flash) am Computer in Chrome oder Edge.
2. Wähle den auf dem Board angegebenen Chip. C2 benötigt mindestens **2 MB Flash**, die anderen aufgeführten Chips mindestens **4 MB Standard-SPI-Flash**.
3. Verbinde das Board mit einem USB-Datenkabel. Klicke auf **USB-Gerät wählen und installieren**, wähle dein Board und warte auf den Abschluss.
4. Klicke auf **Geräteinformationen lesen**, wähle dasselbe Board und bewahre die angezeigten WLAN-Daten und den Verbindungslink fürs Telefon auf.

Startet die Installation nicht, halte BOOT beim erneuten Anschließen gedrückt, lasse die Taste los und versuche es erneut. Die passende C2-Version mit 26 oder 40 MHz wird automatisch gewählt. Nach der Einrichtung braucht das Board nur Strom; das Telefon wird drahtlos bedient.

<a id="wifi"></a>
## 3. Die Bridge ins gewohnte WLAN aufnehmen

1. Verbinde den Computer mit dem im Installer angezeigten WLAN `iPhone-Harness-…`. Das Passwort steht daneben.
2. Öffne `http://192.168.4.1` und gib Namen und Passwort deines gewohnten WLANs ein. Ein 2,4-GHz-Netz funktioniert mit allen unterstützten Chips.
3. Sobald die Bridge verbunden ist, wechsle am Computer zurück ins normale WLAN. Das Telefon muss dasselbe Netzwerk nutzen.

Die Bridge merkt sich das WLAN und verbindet sich beim Einschalten. Dieser Schritt ist nur beim ersten Einsatz oder einem Netzwerkwechsel nötig. Später kannst du Einstellungen unter `http://igent.local/settings` ändern.

<a id="bluetooth"></a>
## 4. Bluetooth-Eingabebridge koppeln

Öffne auf dem Telefon **Einstellungen → Bluetooth** und kopple **iPhone Agent Bridge**. Lass AssistiveTouch eingeschaltet.

Über Bluetooth bedient die Bridge das Telefon. Die WLAN-Verbindung zwischen Harness und Bridge richtest du in Schritt 7 ein.

<a id="open-harness"></a>
## 5. Web Harness öffnen

Öffne [igent.cc](https://igent.cc/) in Safari auf dem iPhone oder iPad. Du landest direkt im Harness.

Wenn du eine Aufgabe ausführst, erlaube die Bildschirmfreigabe und lass das Telefon entsperrt. Danach kannst du zu einer anderen App wechseln. Beendest du die Freigabe, pausiert die Aufgabe. Mit **Bildschirm teilen und fortfahren** im Harness teilst du den Bildschirm erneut und setzt sie fort.

<a id="models"></a>
## 6. API oder ChatGPT-Konto einrichten

Öffne **Einstellungen → Konten oder API → Hinzufügen**. Du kannst mehrere Verbindungen speichern und ihre Modelle im Gespräch wechseln.

**Mit API-Schlüssel**

1. Wähle passend zu deinem Anbieter **OpenAI-kompatibel** oder **Anthropic-kompatibel**.
2. Gib einen Namen, den API-Endpunkt und den Schlüssel ein. Beispiel: `https://api.example.com/v1`. Auch eine vollständige Adresse mit `/chat/completions` oder `/messages` für den gewählten API-Typ funktioniert.
3. Klicke auf **Modelle abrufen** und wähle ein Standardmodell oder gib seinen Namen ein. Die übrigen Modelle bleiben ebenfalls auswählbar.
4. Speichere. Für Telefonaufgaben brauchst du ein Modell mit Bildverarbeitung und Werkzeugaufrufen. Falls unterstützt, kannst du die Denktiefe im Modellmenü einstellen.

**Mit ChatGPT-Konto**

Wähle in Harness „ChatGPT-Abonnement“ und dann „Mit ChatGPT fortfahren“. Öffne die offizielle Seite und erlaube den Zugriff. Danach kann der Browser die lokale Rücksprungadresse (`127.0.0.1`) nicht öffnen; das ist zu erwarten. Kopiere die vollständige URL aus der Adresszeile, kehre zu Harness zurück, füge sie in „Rücksprungadresse“ ein und wähle „Anmeldung abschließen“. Wähle ein Modell aus der geladenen Liste und speichere das Konto. Die Zugangsdaten bleiben in diesem Browser; Modellanfragen gehen direkt an OpenAI. Bestehende Codex-Verbindungen bleiben erhalten; das ChatGPT-Abonnement wird als separates Konto hinzugefügt. [OpenAI-Anmeldereferenz](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).

Anmeldedaten und Schlüssel bleiben in diesem Browser. Anfragen gehen direkt an deinen Anbieter, dessen API Browserzugriffe unterstützen muss.

### Standort

Unter **Einstellungen → Standort** kannst du den Standortzugriff aktivieren; standardmäßig ist er ausgeschaltet. Erst wenn der Agent ausdrücklich `phone_get_location` aufruft, wird dein Standort einmal abgefragt. Beim ersten Aufruf bittet der Browser um Erlaubnis; das Ergebnis erhält das aktuell ausgewählte Modell. Ermittelt wird der Standort des Geräts, auf dem Harness geöffnet ist. Das funktioniert auch ohne ESP32-Verbindung oder Bildschirmfreigabe.

<a id="bridge"></a>
## 7. Bridge verbinden und Eingabe optional testen

1. Öffne **Geräte** in der Gesprächsliste oder tippe im Gespräch auf den Bridge-Status.
2. Wähle beim ersten Mal **Bridge-Informationen abrufen**. Auf der Bridge-Seite führt der Rückkehrlink zum Harness. Alternativ nutze den Telefonlink des Installers.
3. Klicke auf **ESP32-Bridge verbinden** und wähle bei Bedarf dein gekoppeltes Telefon. Beim nächsten Mal nutzt du die gespeicherte Verbindung.
4. Zum Prüfen klicke auf **Eingabetest starten** und bleibe auf der Seite. Die Bridge tippt acht Ziffern; Harness prüft sie automatisch. Den Test kannst du überspringen.

Eine Bridge unterstützt zwei unabhängige Harness-Verbindungen. Wähle bei zwei Telefonen auf jeder Seite das zugehörige Telefon und prüfe die Zuordnung jeweils mit dem optionalen Eingabetest.

Ist das Telefon noch nicht bereit, prüfe Bluetooth, warte kurz und klicke auf **Aktualisieren**.

Probiere „Öffne die Uhr und stelle einen Wecker auf 7:00“. Erlaube die Bildschirmfreigabe. Nach Abschluss kehrt der Agent zum Gespräch zurück. Ändern kannst du das unter **Einstellungen → Aufgabenabschluss → Zu Harness zurückkehren**.

<a id="clipboard"></a>
## 8. Kopieren mit Kurzbefehlen einrichten

1. Öffne auf dem Telefon die [Zwischenablage-Anleitung](https://igent.cc/shortcuts/clipboard.html) und installiere den Kurzbefehl.
2. Behalte den Namen **iPhone Agent Clipboard**.
3. Verbinde die Bridge im Harness. Wähle bei vorbereitetem Text **Mit Kurzbefehlen kopieren** und erlaube den Bridge-Zugriff, falls iOS fragt.
4. Kehre nach dem Kopieren zum Harness zurück, damit der Text ins gewünschte Feld eingefügt wird.

Das funktioniert auch mit langen und mehrsprachigen Texten. Ist Harness sichtbar, kannst du auch **Kopieren und weiter** verwenden.

<a id="install-skills"></a>
## 9. Community-Skill installieren

Öffne **Einstellungen → Skills → Community** oder die [Skill-Community](https://igent.cc/skills). Lies die Beschreibung und wähle **Lokal hinzufügen**. In deiner Liste kannst du Skills ein- oder ausschalten.

Integrierte Skills sind bereits installiert. Beim Neuladen werden Updates gesucht; deine Auswahl bleibt erhalten. Neue Versionen gelten ab der nächsten Aufgabe.

<a id="authoring"></a>
## 10. Eigenen Skill erstellen und verbessern

Öffne am Computer [Skills](https://igent.cc/skills) und wähle **Eigenen Skill erstellen**. Am Telefon: **Einstellungen → Skills → Erstellen**. Trage Namen, eine kurze Kennung in Kleinbuchstaben, Beschreibung und Anweisungen ein und speichere.

Du kannst Harness auch bitten, deinen Skill zu schreiben oder zu verbessern. Beschreibe Einsatz, Schritte und Ergebniskontrolle. Möchtest du einen Community-Skill anpassen, erstelle einen eigenen und behalte das Original des Autors.

Vor einem Browserwechsel exportiere deine Skills und sichere die **Autorenidentität**. Importiere beides im neuen Browser, um unter demselben Autor weiterzuveröffentlichen.

<a id="publish"></a>
## 11. Skill teilen

Öffne einen eigenen Skill und wähle auf der Community-Seite **Veröffentlichen** oder am Telefon **In der Community veröffentlichen**. Prüfe den Inhalt und bestätige. Nach einer Änderung veröffentlichst du ihn erneut, um ein Update bereitzustellen.

Andere können ihn im Katalog hinzufügen. Fehler und Ideen gehören in [Issues](https://github.com/cccat6/iphone-agent-harness/issues), Verbesserungen an Code und Dokumentation in einen [Pull Request](https://github.com/cccat6/iphone-agent-harness/pulls).

## Gespräche verwalten

Tippe auf den Listentitel, um zwischen **Gesprächen** und **Archiv** zu wechseln. Wische über ein Gespräch zum Umbenennen oder Archivieren; im Archiv kannst du es wiederherstellen oder löschen. Scrolle für ältere Nachrichten nach oben, mit **Neueste** kommst du zur letzten Antwort.

Exportiere ein Gespräch über sein Menü und importiere die Datei in den Einstellungen. Sie enthält Nachrichten und Bilder. Kontodaten und Schlüssel werden separat im Browser gespeichert.
