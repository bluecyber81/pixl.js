# Versionsverlauf des Allmiibo-Dateimanagers

## Dateimanager 3.55.4 · LCD und OLED

Die Firmware-Auswahl und die Anleitung führen zum passenden Paket für das eigene Gerät. Für LCD stehen DE3.75 Final und die Vorschau DE3.81 zur Wahl. Das OLED-Testpaket DE3.81 für S112 7.2.0 wird am Handy als App-Update installiert. [LCD-Freigabe](https://github.com/bluecyber81/pixl.js/releases/tag/de3.75) · [OLED-Testversion und Anleitung](https://github.com/bluecyber81/pixl.js/releases/tag/de3.81-oled-t1) · [Dateimanager 3.55.4](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.4)

## Dateimanager 3.55.3

Im Akkuverlauf unter **Gerät & Diagnose** siehst du Messdauer, Spannweite und Unterbrechungen. Der erste neue Messwert nach einer Pause markiert die Fortsetzung. Der CSV-Export enthält den Pausengrund in der fünften Spalte `pause_reason`. [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Windows-Paket und Quellcode](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.3)

## Dateimanager 3.55.2

Beim Vergleich zweier Startberichte kommen die Scanzeit, die Lesezugriffe und die gelesenen Bytes hinzu. Startberichte behalten gültige PREP- und Testversionsbezeichnungen. Das Hardwareprofil behält die gemeldete Laufwerksgröße bei Einzelabfragen in derselben Verbindung. Beim Versionsvergleich wird DE3.80 als bekannte Vorschau eingeordnet. Für App653 dokumentiert die Paketreferenz die auf einem LCD bestätigten Versions- und Bootdaten. [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [3.55.2 für Windows und als Quellcode](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.2)

## Dateimanager 3.55.1

Der Firmwarekatalog enthält die App DE3.80. Die Diagnose erkennt die Z20-Bootregion an Zähler und Prüfsumme. Der Hardwarebericht erklärt, ob der Flash-Treiber den gelesenen Kapazitätscode kennt. [Android ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.80/Allmiibo_LCD_S112_7_3_0_Z20_DE3_80_653_KOMPLETT.zip) · [App ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.80/Allmiibo_LCD_DE3_80_653_NUR_APP.zip) · [Web 3.55.1](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.1)

## Hardwarediagnose und Akkuverlauf · Dateimanager 3.55.0

Unter **Gerät & Diagnose** kannst du den Akkuverlauf starten. Der Browser liest alle zehn Sekunden die zuletzt gemeldete Spannung und die Ladeanzeige aus. Die letzten 120 Einträge gelten für die aktuelle Verbindung. Während einer Dateiübertragung oder bei verborgenem Tab pausiert die Aufzeichnung. Steht „551520 · 180 mAh · 3,8 V · 0,684 Wh“ auf deinem Akku, kannst du das unter **Hardwareprofil → Akkuetikett diesem Gerät zuordnen** bestätigen. Der Diagnoseexport kennzeichnet diese Angabe als Akkuaufdruck.

Am LCD zeigt der Kontrastregler den wirksamen Bereich von 60 bis 100 %. Bei langen Listen verarbeitet die Zeichnung nur die sichtbaren Zeilen einschließlich der angeschnittenen Ränder. Im Dateimanager kannst du das Displayfoto in Originalgröße, 2× oder 3× ansehen und als PNG mit 128 × 64 Pixeln speichern.

Die LCD-Testfirmware **DE3.79 / App652** meldet die drei Kennbytes des externen Flashs. Der Dateimanager zeigt damit Herstellerkennung, Speichertyp und Kapazitätscode. Die Abfrage nutzt die beim Einrichten des Speichers gelesenen Bytes. Geräte mit älterer Firmware können die übrige Diagnose weiterhin nutzen. [App-ZIP fürs LCD mit PFS1, Z19 und S112 7.3.0](https://github.com/bluecyber81/pixl.js/releases/download/de3.79/Allmiibo_LCD_DE3_79_652_NUR_APP.zip) · [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Windows-Paket und Quellcode](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.0)

## Akkuanzeige · LCD-Firmware DE3.77 und Dateimanager 3.54.1

Auf dem LCD erscheinen Spannung und achtstufiges Akkusymbol größer. Ein Blitz zeigt den Ladevorgang an. Bei niedrigem Stand erscheint „Niedrig“, bei fehlendem Messwert ein Strich. Der Dateimanager zeigt die Spannung in beiden Diagnoseansichten einheitlich in Volt, auf Deutsch zum Beispiel **3,870 V**.

Die signierte App650 ist eine Testversion für das Allmiibo LCD mit PFS1, Z19 und S112 7.3.0. [App-ZIP fürs Handy](https://github.com/bluecyber81/pixl.js/releases/download/de3.77/Allmiibo_LCD_DE3_77_650_NUR_APP.zip) · [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Stabile Firmware DE3.75](https://github.com/bluecyber81/pixl.js/releases/tag/de3.75)

## Junger Link und Junge Zelda · Dateimanager 3.54.0

Im Figurenkatalog findest du beide für 2027 angekündigten Figuren über ihren deutschen oder englischen Namen und über das Switch-2-Spiel *The Legend of Zelda: Ocarina of Time*. Jede Figur hat ein eigenes Bild und einen deutschen Spielhinweis. Nintendo nennt besondere Masken, die Link tragen kann. [Spielinformationen bei Nintendo](https://www.nintendo.com/de-de/Spiele/Nintendo-Switch-2-Spiele/The-Legend-of-Zelda-Ocarina-of-Time-3115664.html)

Auch alle sieben Figuren aus *Kirby Air Riders* haben jetzt auf dem LCD ein eigenes Bild und deutsche Spielhinweise, darunter Kirby mit Schwert & Dragoon und Dedede Noir & Hydra. [Versionshinweise zu Kirby Air Riders](https://www.nintendo.com/de-de/Support/Kaufe-und-Mitgliedschaften/Spiele/Das-Aktualisieren-von-Kirby-Air-Riders--2967700.html)

Für die eingebaute Datenbank auf dem **Allmiibo LCD** gibt es die signierte **DE3.76 / App649** als Testversion für PFS1 mit Z19 und S112 7.3.0. Im Dateimanager findest du die ZIP unter **Update**. [App-ZIP fürs Handy](https://github.com/bluecyber81/pixl.js/releases/download/de3.76/Allmiibo_LCD_DE3_76_649_NUR_APP.zip) · [Stabile Firmware DE3.75](https://github.com/bluecyber81/pixl.js/releases/tag/de3.75)

## Web 3.53.0 · 15.11.2026

Ordnersicherungen lassen sich mit einer früheren ZIP beschleunigen. Der Dateimanager vergleicht kleine Dateien mit der aktuellen Prüfsumme vom Gerät. Du kannst die ZIP komprimieren, die Dauer je Sicherungsphase sehen und einen gesicherten Figurenordner offline prüfen. Beim Umbenennen und vor dem ZIP-Import wird die verbleibende Pfadlänge angezeigt. Unter Gerät & Diagnose lassen sich MIFARE-Mini-Slots lesend prüfen.

## Dateimanager 3.52.1

**DE3.75 / App648 ist die stabile LCD-Firmware** für Geräte mit PFS1, Z19 und S112 7.3.0. Auf einem LCD gelangen die Rückkehr zur gewählten Figur und das Aufwachen in beiden Apps. Die Switch erkannte außerdem eine bekannte Figur. Wer die signierte App648 bereits geflasht hat, kann sie weiterverwenden. [App-ZIP fürs Handy](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_LCD_DE3_75_648_NUR_APP.zip) · [Änderungen und Gerätetests](RELEASE_DE3_75.md)

Unter **Gerät & Diagnose** kannst du mehrere gespeicherte Geräteprüfungen vergleichen und das Ergebnis als JSON speichern. Bei gleichzeitiger Bearbeitung in zwei Tabs kannst du beide Entwürfe wieder öffnen. Der Prüftext passt auch bei großer Schrift auf ein schmales Display. Die Figuren-ID lässt sich direkt kopieren. [Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.52.1)

## Dateimanager 3.52.0

Unter **Gerät & Diagnose** dokumentierst du die Rückkehr zur letzten Figur und das Aufwachen. Die Figurenauswahl bleibt nach einer Onlineprüfung alphabetisch. Der Dateimanager lädt die Werkzeuge für Sicherung, Update und Fernbedienung beim ersten Öffnen. [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.52.0)

Nach einem Verbindungsabbruch beim Umbenennen prüft der Dateimanager beim Wiederverbinden mit demselben Gerät den Ordnerinhalt. Alte und neue Namen werden dabei exakt verglichen. Die Kapazitätsprüfung umfasst auch die LCD-Testversion DE3.75/App648.

## Dateimanager 3.51.1 · Figurenbild beim Scrollen

Wähle unter **Dateien** eine Figur aus. Am Laptop bleibt die **Auswahl** mit Bild und Figurendaten rechts sichtbar, während du durch einen langen Ordner scrollst. Klickst du eine andere Figur an, erscheint dort ihre Vorschau. [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Windows und Quellcode](https://github.com/bluecyber81/pixl.js/releases/tag/web3.51.1)

## Dateimanager 3.51.0 · Dateien und Ordnerupload

Ordner stehen oben. Tippe eine Figurendatei an, um ihr Bild und ihre Informationen zu öffnen. Am Handy stehen Dateityp und Größe unter dem Namen, die Aktionen findest du rechts. Ist ein lokaler Name für das Allmiibo ungeeignet, kannst du den Zielnamen vor dem Hochladen korrigieren oder den Eintrag überspringen. [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Downloads für Windows und Quellcode](https://github.com/bluecyber81/pixl.js/releases/tag/web3.51.0)

## DE3.74 / App647 und Dateimanager 3.50.0

**Finale LCD-Version.** Am 14. November 2026 bestätigte der Besitzer, dass das Displayfoto in der Fernbedienung auf seinem Allmiibo LCD mit DE3.74 und Dateimanager 3.50.0 funktioniert. Der Diagnoseexport weist App647, Bootloader Z19 und SoftDevice S112 7.3.0 aus. [Firmwarefreigabe](https://github.com/bluecyber81/pixl.js/releases/tag/de3.74)

Unter **Fernbedienung → Displaybild aktualisieren** zeigt das Handy das aktuelle Gerätemenü. Du kannst das Bild drehen, als PNG speichern und nach dem nächsten Tastendruck erneut aufnehmen. Aktiviere dazu am wachen LCD-Allmiibo die BLE-Fernbedienung und verbinde **Pixl.Remote**. DE3.74 fügt die Fotoaufnahme hinzu. Auch auf DE3.73 kannst du mit **Verbindung prüfen** die Uhrzeit der letzten angeforderten Geräteantwort sehen. Ein abgebrochener Verbindungsversuch kann eine neu aufgebaute Dateiübertragung nicht mehr versehentlich trennen.

[Signierte Android-DFU-ZIP für LCD mit PFS1, Z19 und S112 7.3.0](https://github.com/bluecyber81/pixl.js/releases/download/de3.74/Allmiibo_LCD_DE3_74_647_NUR_APP.zip) · [Dateimanager 3.50.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.50.0)

## Dateimanager 3.49.0

Auf dem iPhone erklärt der Dateimanager die Möglichkeiten für Katalog und Bluetooth. Beim erneuten Ordnerabgleich lassen sich Änderungen auf beiden Seiten erkennen. Für Geräte mit cylin577s Firmware gibt es einen eigenen PixLink-Zugang. [Veröffentlichung und Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.49.0)

## Dateimanager 3.48.4

Bei der Online-Katalogprüfung zeigt der Dateimanager an, wenn Spielhinweise oder Schreibangaben in der Quelle fehlen. Die geprüften Spielhinweise bleiben verfügbar. Die Fernbedienung unterstützt die Tastatur und zeigt an, welchen Befehl das Gerät bestätigt hat. Für Dragoon und Hydra nennt die Dateiprüfung beide möglichen Maschinen, weil sie den gleichen Platinencode verwenden. [Veröffentlichung und Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.48.4)

## Dateimanager 3.48.3

Der Offline-Katalog umfasst 954 Figuren. Unter **Figurenkatalog → Spiel → Kirby Air Riders** findest du sieben Fahrer, darunter Kirby mit Schwert & Dragoon sowie Dedede Noir & Hydra. Beide lassen sich auch unter ihrem deutschen Namen finden. Der Firmware-Namensfilter umfasst die 952 IDs der veröffentlichten App646. [Windows und Quellcode](https://github.com/bluecyber81/pixl.js/releases/tag/web3.48.3)

## Dateimanager 3.48.2

Die lokale Platzprüfung unterstützt App646. Beim Ändern des Schreibschutzes bleiben die vorhandenen Metadaten erhalten. Reservierte Namen im Stammordner werden bereits vor dem Schreiben erkannt. Die Sicherungsansicht erklärt, wann die ZIP im Browser gespeichert ist und wann sie heruntergeladen wurde. [Dateimanager und Quellcode](https://github.com/bluecyber81/pixl.js/releases/tag/web3.48.2) · [ChatGPT-Prüfpaket](https://github.com/bluecyber81/pixl.js/releases/download/de3.73-test646/Allmiibo_DE3_73_App646_Z19_Web3_48_2_ChatGPT_Pruefpaket.zip)

### Frühere Veröffentlichungen

Der Amiibo-Emulator sortiert die sichtbare Seite im Figurenordner einmal. Unter **Gerät & Diagnose → Alle Diagnosewerte auslesen** zeigt der Dateimanager mit DE3.70 die erkannten Mitteltastenereignisse bis zur ersten Auswahl im Hauptmenü und die Dauer des App-Aufrufs. Die Daten bleiben bis zum Neustart im RAM. [LCD DE3.70 (ZIP)](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_70_642_NUR_APP.zip) · [Web 3.47.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.47.0)


**Stand am 9. November 2026.** Damals war 3.47.0 veröffentlicht. Der Updater bot für LCD mit bestehendem PFS1 und S112 7.3.0 die stabile App DE3.65/637 und die neue Testversion DE3.70/642. [Online-Dateimanager](https://bluecyber81.github.io/pixl.js/) · [Bedienung](DATEIMANAGER_WEB.md) · [Prüfprotokoll](validation/WEB3_47_0.json)

## Veröffentlichungen auf GitHub

Jede verlinkte Version führt zu ihren damaligen Hinweisen und Downloads. 3.34.0 ist im Release DE3.56 enthalten. Die Versionsnummer des Dateimanagers steht für die Software im Browser. Funktionen mit einer angegebenen DE-Version erfordern zusätzlich die entsprechende Unterstützung am Gerät.

| Dateimanager | Änderung gegenüber dem vorherigen Stand |
| --- | --- |
| [3.47.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.47.0) | Hauptmenü und Einstellungen mit eigener Tastendiagnose. |
| [3.46.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.46.0) | Zwei Sicherungen offline vergleichen und veröffentlichte LCD-Pakete direkt in der Android-DFU-App öffnen. |
| [3.45.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.45.0) | Figuren nach Spiel, vollständiger Ordnervergleich in beide Richtungen und eigener Anzeigename pro verbundenem Gerät. |
| [3.44.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.44.0) | Beim Öffnen wählt der Dateimanager die erste unterstützte Sprache aus der Sprachliste des Browsers. Im Sprachmenü kannst du eine feste Sprache wählen oder wieder zur automatischen Auswahl wechseln. [Anleitung](DATEIMANAGER_WEB.md#dateimanager-3440) |
| [3.43.1](https://github.com/bluecyber81/pixl.js/releases/tag/web3.43.1) | Die lokale LittleFS-Platzprüfung zeigt DE3.67 mit App-Zähler 639 als neueste geprüfte Firmware. Das Speicherprofil gilt für DE3.55 bis DE3.67. [Anleitung](DATEIMANAGER_WEB.md#dateimanager-3431) |
| [3.43.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.43.0) | Ordnersicherungen nach Browserneustart fortsetzen, Webfavoriten und Filter speichern, Linklisten austauschen und LCD-PNG drehen. [Anleitung](DATEIMANAGER_WEB.md#dateimanager-3430) |
| [3.42.2](https://github.com/bluecyber81/pixl.js/releases/tag/web3.42.2) | Kompaktere Schnelleinstiege zu Figurenimport und Firmwareupdate. Die [Handy-Downloads](DATEIMANAGER_WEB.md#dateimanager-3422) bieten Quellcode und ChatGPT-Prüfpaket für 3.42.2 und 3.42.1 getrennt an. |
| [3.42.1](https://github.com/bluecyber81/pixl.js/releases/tag/web3.42.1) | Sechs farblich gekennzeichnete Arbeitsbereiche und eine Gerätekarte mit breitem Speicherbalken. Der mobile Figurenimport öffnet sich auch bei langsamem Laden mit dem ersten Klick. Die Anleitung ergänzt Bluetooth-DFU am PC mit passender Nordic-Hardware. |
| [3.42.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.42.0) | Zwei bebilderte Schnelleinstiege, lokaler BIN-Vergleich nach externem Download, Download aus Suchtreffern, Sammlungs-CSV und eine [Anleitung für Firmware und Speicher](https://bluecyber81.github.io/pixl.js/guide/index.html). |
| [3.41.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.41.0) | Direkten HTTPS-Link bei einer Figuren-ID speichern. Ein Klick auf ihren Namen lädt die geprüfte BIN-Datei herunter. |
| [3.40.1](https://github.com/bluecyber81/pixl.js/releases/tag/web3.40.1) | Die Paketkarte übernimmt die Auswahl in den DFU-Updater. Auch Serien mit ausschließlich angekündigten Figuren sind filterbar. Nach einer Sicherung zeigt der Dateimanager, wie viele Dateien frisch gelesen oder nach Prüfung wiederverwendet wurden. |
| [3.40.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.40.0) | Neun Nintendo-Ankündigungen getrennt von 952 bestätigten Katalog-IDs. Gerätesuche mit Bild, Restzeit beim Web-DFU und Inhaltsvergleich beim Fortsetzen einer Sicherung. Mit DE3.66 zusätzlich LCD-Displayfoto und Geräteprüfsumme für kleine Dateien bis 572 Byte auf E:. |
| [3.39.5](https://github.com/bluecyber81/pixl.js/releases/tag/web3.39.5) | DE3.65/637 als mitgelieferte LCD-App. Die Synchronisation erklärt Änderungen seit dem Vergleich. Sicherungshinweise, Textkontrast und Fehlerbehandlung im Windows-Starter verbessert. |
| [3.39.4](https://github.com/bluecyber81/pixl.js/releases/tag/web3.39.4) | Verständliche Pfadhinweise beim Dateiabgleich, deutsche Texte für alle 54 unterschiedlichen englischen Spielhinweise und Wachhaltefunktion auf der DFU-Seite. Zuordnung von Z19 und den Apps DE3.64/65 in der Diagnose. |
| [3.39.3](https://github.com/bluecyber81/pixl.js/releases/tag/web3.39.3) | DFU kennzeichnet eine vom Browser angeforderte Trennung nach bestätigtem Abschluss. Bei zu langen Namen und Pfaden zeigt der Dateimanager die betroffene Stelle und ihr UTF-8-Bytebudget. Beide Korrekturen wurden zuvor als `3.39.3-local.1` erprobt. |
| [3.39.2](https://github.com/bluecyber81/pixl.js/releases/tag/web3.39.2) | Der Figurenkatalog zeigt den tatsächlich eingebauten Datenstand. DE3.63/635 in Paketauswahl und PFS1-Platzprüfung aufgenommen. |
| [3.39.1](https://github.com/bluecyber81/pixl.js/releases/tag/web3.39.1) | Der sichtbare Browser-Tab kann bei langen Sicherungen, Übertragungen und Abfragen den Bildschirm wach halten. Status, Ausschalten und erneuter Versuch sind sichtbar. |
| [3.39.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.39.0) | Sammlungsprüfung unterscheidet gleiche Figuren-ID und bytegleichen Inhalt. Kataloghinweise, lokale Prüfung bestimmter Karten-Slots und Regeln für interne Journaldateien beim ZIP-Import. |
| [3.38.1](https://github.com/bluecyber81/pixl.js/releases/tag/web3.38.1) | Bei fehlgeschlagenem Öffnen eines Sicherungslaufwerks bleibt die Fehlermeldung auch nach erfolgreichem Neuladen der Laufwerksliste sichtbar. |
| [3.38.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.38.0) | Zeigt das Speicherstartprofil von DE3.62 sowie die Aussagekraft weniger RAM-Stichproben. Präzisere Laufwerksmeldungen und Unterscheidung der Bootloaderprofile Z17/Z18. |
| [3.37.5](https://github.com/bluecyber81/pixl.js/releases/tag/web3.37.5) | **Sicherung → Laufwerk E: öffnen** führt direkt zur Sicherung des gesamten Laufwerks. Bei fehlenden Laufwerksdaten lässt sich die Liste neu einlesen. |
| [3.37.4](https://github.com/bluecyber81/pixl.js/releases/tag/web3.37.4) | Getrennte Zeiten für Dateisystem, Journal und restlichen Speicherstart mit DE3.61. Diagnose unterscheidet ATT-MTU, GATT-Kapazität und Nutzdaten sowie Z15/Z16. |
| [3.37.3](https://github.com/bluecyber81/pixl.js/releases/tag/web3.37.3) | Web-DFU macht Übertragung, Prüfung, Abschlussbestätigung und Wiederverbinden sichtbar. Mitgeliefertes App-Paket DE3.60. |
| [3.37.2](https://github.com/bluecyber81/pixl.js/releases/tag/web3.37.2) | Nach Bluetooth-Abbruch beim Hochladen einer Figur bleiben Zielpfad und ursprüngliche Sitzung für die Wiederaufnahme im geöffneten Tab sichtbar. |
| [3.37.1](https://github.com/bluecyber81/pixl.js/releases/tag/web3.37.1) | Restzeitschätzung beim Prüfen der Sammlung und beim Sichern von Ordnern. Orange markierte Figuren erhalten einen konkreten Prüfhinweis. |
| [3.37.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.37.0) | Stackreserve von DE3.59 und Vergleich mehrerer Kaltstartberichte mit Median und Spannweite. |
| [3.36.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.36.0) | Vergleicht zwei Startberichte in Millisekunden. Zeigt Paketgröße, SHA-256, Anwendungszähler, Hardwarefeld und SoftDevice-IDs bei der DFU-Paketprüfung. |
| [3.35.1](https://github.com/bluecyber81/pixl.js/releases/tag/web3.35.1) | Eingebundene App und Paketvergleich auf DE3.57/629 aktualisiert. |
| [3.35.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.35.0) | **Gerät & Diagnose → Alle Diagnosewerte auslesen** sammelt die verfügbaren Start-, RAM-, Speicher-, Funk- und Tastenwerte. Jede Teilabfrage erhält ihren eigenen Status und Zeitstempel. |
| [3.34.0](https://github.com/bluecyber81/pixl.js/releases/tag/de3.56) | Galerie und Filter für den geprüften Figurenbestand. Gerätesuche, Vorschau, Eigenschaften und lokale Dateiprüfung verwenden denselben aktualisierten Katalog. |
| [3.33.1](https://github.com/bluecyber81/pixl.js/releases/tag/web3.33.1) | Deutlich sichtbare Rahmen an den Figurenkarten. Rot setzt eine vollständige Inhaltsprüfung des ganzen Laufwerks voraus. Nach dem Trennen bleibt der datierte letzte Prüfstand sichtbar. |
| [3.33.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.33.0) | Öffentliche Katalogaktualisierungen, Sammlungsabgleich und Übernahme eigener Figurendateien mit Prüfung der ID. |
| [3.32.5](https://github.com/bluecyber81/pixl.js/releases/tag/web3.32.5) | Erste Ausgabe für GitHub Pages. Die Online-Seite und das portable Paket haben passende Pfade für Flasher, Downloads und die sieben Speicherprüfprofile. |

## Frühere Browserstände

Vor GitHub Pages wurde der Dateimanager als Browserpaket für den lokalen Betrieb bereitgestellt. Die Tabelle nennt die in den Projektquellen und archivierten Paketanleitungen belegten Stände. Wo ein passender historischer GitHub-Download vorliegt, ist er verlinkt. Zusätzliche technische Einzelheiten stehen im [kumulativen Änderungsbericht](../CHANGELOG_DE3_SERIES.md) und in der [Entwicklungsgeschichte](DEVELOPMENT_HISTORY.de.md).

| Dateimanager | Änderung oder dokumentierter Paketstand |
| --- | --- |
| 3.32.4 | Eigenes Platzprüfprofil für den PFS1-Kern von DE3.55. |
| 3.32.3 | Aktualisierte Patchversionen der Web-Bauwerkzeuge und korrigierte Zuordnung einer Abhängigkeit in der Paketliste. |
| 3.32.2 | Optionale begrenzte Inhaltssuche für Figuren ohne gespeicherte ID. |
| 3.32.1 | Verwirft überholte Vorschauaktionen nach Ordnerwechsel oder Löschen. |
| 3.32.0 | Suche über Geräteordner, direkte Figurenvorschau und ein gemeinsamer Einstieg für Datei-, Ordner- und ZIP-Uploads. |
| 3.31.1 | Korrigierte Figurenlinks und Browser-QR-Codes für Mario (Melody Car) und Toad aus My Mario. Aktualisierte Übersetzungsbibliothek. |
| 3.31.0 | Mit DE3.51 direkter Wechsel von der Fernbedienung zur Dateiübertragung. Die gebundene Raw128-Wiederherstellung schreibt Inhalt und Metadaten gemeinsam. |
| 3.30.3 | Notizlänge wird in UTF-8-Bytes angezeigt. Ungültige oder zu lange Eingaben werden vor dem Speichern erklärt. |
| 3.30.2 | Fortschritt und Fehler bei der Laufzeitdiagnose bleiben sichtbar. Verspätete Antworten einer alten Verbindung beeinflussen die neue Sitzung nicht mehr. |
| 3.30.1 | Bessere Behandlung verspäteter Fernbedienungsantworten und bereits vorhandener Startpakete bei der Wiederaufnahme eines DFU-Updates. |
| 3.30.0 | Optionale Bluetooth-Fernbedienung für unterstützte Firmware, im Gerätemenü aktivierbar. |
| 3.29.5 | Eigenes Platzprüfprofil für DE3.46. Ein längeres früheres DFU-Startpaket kann beim erneuten Versuch innerhalb der erlaubten Größe ersetzt werden. |
| 3.29.4 | Platzprüfprofil und Komponentenvergleich für DE3.45/617. |
| 3.29.3 | Der Ordner wird nach der Übertragung aus dem Dateiabgleich auch bei Teilfehlern oder Abbruch aktualisiert. |
| 3.29.2 | Vergleichsangaben auf DE3.43/615 und BL8 mit Bootloaderzähler 11 abgestimmt. |
| 3.29.1 | Platzprüfung erkennt die gemeinsame Speicherimplementierung von DE3.42/614 und DE3.43/615. |
| 3.29.0 | Ordnerwechsel setzt alte Filter zurück, Fehler beim Ordnerlesen sind sichtbar, Startdiagnose zeigt den längsten Abschnitt. |
| 3.28.0 | Direkte Navigation im Ordnerpfad, wählbare Seitengröße und gezieltes Auslesen der Startmarken mit JSON-Export. |
| [3.27.0](https://github.com/bluecyber81/pixl.js/releases/tag/de3.37) | Prüft Ordnerattribute vor Abschluss des ZIP-Imports erneut, damit zwischenzeitliche Änderungen erhalten bleiben. |
| 3.26.1 | Diagnoseexport mit JSON-Vorschau, Speicherdialog und Kopiermöglichkeit bei blockiertem Download. |
| 3.26.0 | Eigene Arbeitsbereiche für Dateien, Sicherung, Update und Diagnose. Der Migrationsassistent führt zum vollständigen Abschlussvergleich. |
| 3.25.6 | ZIP-Import und direkter Upload beachten den Schreibschutz im Zielordner und seinen übergeordneten Ordnern. |
| 3.25.5 | Der Ordnerabgleich prüft geschützte und ungültige Ordnerattribute auch vor dem Schreiben. |
| 3.25.4 | Prüfberichte bleiben beim Statuslesen und Neustart erhalten. Der bestätigte Importabschluss erhält einen exportierbaren Beleg. |
| 3.25.3 | Weniger wiederholte Ordnerabfragen im bereits gebundenen PFS1-Import. Der vollständige Vergleich erfolgt am Ende. |
| 3.25.2 | Kapazitätssimulation als eigenständig gebauter Hintergrundprozess. Der Produktionstest führt den ausgelieferten Worker mit dem echten Speichersimulator aus. |
| 3.25.1 | An den PFS1-Kern gebundenes Platzprüfprofil und Wiederaufnahme eines bereits an die Sicherung gebundenen Imports. Die zweite Paketfassung derselben Version richtet Gerätevergleich und Migrationsprofil auf DE3.31/603 aus. |
| 3.25.0 | Ablauf für die PFS1-Umstellung mit Quellvergleich, Platzsimulation, bestätigter Ersteinrichtung und Abschlussprüfung. |
| 3.24.0 | Vollständige Raw128-Quellsicherung für die SPIFFS-Vorbereitungsfirmware. Bei diesem Stand war die Wiederherstellung noch gesperrt. |
| 3.23.0 | Schutz vor kollidierenden Dateinamen, Fortschritt innerhalb der Übertragungsdialoge und Auswahl nur neuer Dateien. |
| 3.22.2 | Geordneter Abbau der Bluetooth-Dateisitzung beim Trennen. |
| 3.22.1 | Vergleichsziel für DE3.25 und BL6 korrigiert. |
| 3.22.0 | Import von Sicherungs-ZIPs mit Originalnamen und Zusatzdaten sowie fortsetzbare Ordnersicherung. |
| 3.21.0 | Kompakte Figurendetails mit ausklappbaren Angaben, Bild und lokal erzeugtem QR-Code. |
| 3.20.0 | Figurendetails aus dem Katalog und gezieltes Lesen der ID aus einer unterstützten Datei. |
| 3.19.0 | Zeitgrenzen und Abbruch für hängende Bluetooth-Verbindungen sowie präzisere Meldungen bei Gerätefehlern. |
| 3.18.0 | Der Web-Flasher wartet beim Senden auf die vom Bootloader bestätigte Byteposition und prüft vor dem Abschluss die CRC. |
| 3.17.0 | Manuell abrufbare Bootloader- und SoftDevice-Diagnose mit JSON-Export. |
| 3.16.0 | Integrierte DFU-Seite mit lokaler Paketprüfung vor der Geräteauswahl. |
| 3.15.0 | Sicherer Upload mit temporärer Kopie, Rücklesen der Prüfsumme und Erhalt vorhandener Metadaten. |
| 3.14.0 | Geräte- und Speicherübersicht, Restzeitschätzung für Übertragungen und Diagnoseexport. |
| 3.13.0 | Ordnersicherung als ZIP mit Metadaten und Prüfsummen, Schutz vor unbeabsichtigtem Überschreiben und Vorschau ohne Gerät. |
| [3.12.0](https://github.com/bluecyber81/pixl.js/releases/tag/de3.16) | Beachtet die UTF-8-Grenzen von Pfaden und Dateinamen und weist ungültige Zeichenfolgen beim Ordnerlesen zurück. Als Begleitsoftware von DE3.16 veröffentlicht. |
| 3.10.0 | Teilt lange Bluetooth-Anfragen für kleine Paketgrößen auf. Dieser Browserstand wurde auch mit der Gerätesoftware DE3.11 geführt. |
| 3.9.0 | Lokaler Dateimanager mit Vue 3, Vite und Windows-Starter. |
