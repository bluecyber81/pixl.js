# Allmiibo Dateimanager

## Dateimanager 3.55.6

Die Diagnose für LCD DE3.84 zeigt die SourceID der laufenden App, eine verfügbare Fehlernotiz vom vorherigen Start und die Cachebelegung beim letzten Einbinden des Speichers. Der Prüfassistent bietet 40 zusätzliche LCD-Fälle auf Deutsch und Englisch. Der Besitzer bestätigte am 17.11.2026 den praktischen Betrieb von App657 mit Z21. [LCD-Testversion für Android](https://github.com/bluecyber81/pixl.js/releases/tag/de3.84-lcd-test1) · [Dateimanager für Windows und Quellcode](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.6)

LCD DE3.84 diagnostics show the running app’s SourceID, an available previous-boot fault note and cache use at the last mount. Guided checks add 40 LCD cases in English and German. An owner reported successful practical use of App657 with Z21 on 17 November 2026. [Open the file manager](https://bluecyber81.github.io/pixl.js/)

## Archiv · Dateimanager 3.55.5 und LCD-Firmware DE3.81

Für LCD ist DE3.81 / App654 die aktuelle Firmware. Mit eingerichtetem Packed LittleFS (PFS1), S112 7.3.0 und Z19, Z20 oder Z21 genügt die [App-ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_DE3_81_654_NUR_APP.zip). Für ein kompatibles LCD mit älterem Bootloader enthält das [Android-Komplettpaket](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_S112_7_3_0_Z21_DE3_81_654_KOMPLETT.zip) S112 7.3.0, Z21 und App654. [Installationsanleitung für LCD](https://bluecyber81.github.io/pixl.js/guide/index.html#flash) · [Separate OLED-Testversion](https://bluecyber81.github.io/pixl.js/guide/index.html#oled)

## Archiv · Dateimanager 3.55.4

Die Firmware-Auswahl und die Anleitung führen zum passenden Paket für das eigene Gerät. Bei Veröffentlichung von 3.55.4 standen DE3.75 Final und die Vorschau DE3.81 zur Wahl. Das OLED-Testpaket DE3.81 für S112 7.2.0 wird am Handy als App-Update installiert. [LCD-Freigabe](https://github.com/bluecyber81/pixl.js/releases/tag/de3.75) · [OLED-Testversion und Anleitung](https://github.com/bluecyber81/pixl.js/releases/tag/de3.81-oled-t1) · [Dateimanager 3.55.4](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.4)

## Akkuverlauf im Dateimanager 3.55.3

Der Akkuverlauf zeigt Messdauer, Spannweite und Pausengründe. Nach einer Pause markiert der erste neue Messwert die Fortsetzung. Die CSV enthält Zeit, Spannung, Ladezustand, Ereignis und Pausengrund. [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Windows und Quellcode](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.3)

## Startvergleich im Dateimanager 3.55.2

Unter **Gerät & Diagnose → Startzeiten der Anwendung** lassen sich jetzt die Scanzeit von PackedFS, die Anzahl der Flash-Lesezugriffe und die gelesenen Bytes mit einem früheren Bericht vergleichen. Nach dem erneuten Lesen der JEDEC-Kennung bleibt die bereits ermittelte Laufwerksgröße in derselben Geräteverbindung sichtbar. [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [3.55.2 für Windows und als Quellcode](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.2)

## Dateimanager 3.55.1

Der Dateimanager bietet die App DE3.80 für Z19 und Z20 an und vergleicht bei gelesenen Bootdaten den gespeicherten Zähler und den Hash der Bootregion. Das Android-Kombipaket installiert auch Z20 und S112 7.3.0. [Android ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.80/Allmiibo_LCD_S112_7_3_0_Z20_DE3_80_653_KOMPLETT.zip) · [App ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.80/Allmiibo_LCD_DE3_80_653_NUR_APP.zip) · [Web 3.55.1](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.1)

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

## Dateimanager 3.53.0

**DE3.75 / App648 war die damalige stabile LCD-Firmware** für Geräte mit PFS1, Z19 und S112 7.3.0. Auf einem LCD gelangen die Rückkehr zur gewählten Figur und das Aufwachen in beiden Apps. Die Switch erkannte außerdem eine bekannte Figur. Wer die signierte App648 bereits geflasht hat, kann sie weiterverwenden. [App-ZIP fürs Handy](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_LCD_DE3_75_648_NUR_APP.zip) · [Android-Kombi für passende ältere Bootloader](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_LCD_S112_7_3_0_Z19_DE3_75_648_KOMPLETT.zip) · [Änderungen und Gerätetests](../docs/RELEASE_DE3_75.md) · [ChatGPT-Prüfpaket](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_DE3_75_App648_Z19_Web3_52_1_ChatGPT_Pruefpaket.zip)

Ordnersicherungen lassen sich mit einer früheren ZIP beschleunigen. Der Dateimanager vergleicht kleine Dateien mit der aktuellen Prüfsumme vom Gerät. Du kannst die ZIP komprimieren, die Dauer je Sicherungsphase sehen und einen gesicherten Figurenordner offline prüfen. Beim Umbenennen und vor dem ZIP-Import wird die verbleibende Pfadlänge angezeigt. Unter Gerät & Diagnose lassen sich MIFARE-Mini-Slots lesend prüfen. [Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.53.0)

## Dateimanager 3.52.0

Unter **Gerät & Diagnose** dokumentierst du die Rückkehr zur letzten Figur und das Aufwachen. Die Figurenauswahl bleibt nach einer Onlineprüfung alphabetisch. Der Dateimanager lädt die Werkzeuge für Sicherung, Update und Fernbedienung beim ersten Öffnen. [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.52.0)

## Dateimanager 3.51.1 · Figurenbild beim Scrollen

Wähle unter **Dateien** eine Figur aus. Am Laptop bleibt die **Auswahl** mit Bild und Figurendaten rechts sichtbar, während du durch einen langen Ordner scrollst. Klickst du eine andere Figur an, erscheint dort ihre Vorschau. [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Windows und Quellcode](https://github.com/bluecyber81/pixl.js/releases/tag/web3.51.1)

Ordner stehen oben. Tippe eine Figurendatei an, um ihr Bild und ihre Informationen zu öffnen. Am Handy stehen Dateityp und Größe unter dem Namen, die Aktionen findest du rechts. Ist ein lokaler Name für das Allmiibo ungeeignet, kannst du den Zielnamen vor dem Hochladen korrigieren oder den Eintrag überspringen.

## Getestete LCD-Finalversion DE3.74 (App647) · Dateimanager 3.50.1

Das Displayfoto der Fernbedienung wurde mit Dateimanager 3.50.0 am LCD-Allmiibo getestet. Version 3.50.1 führt DE3.74 als stabile App für LCD-Geräte mit Packed LittleFS, Bootloader Z19 und S112 7.3.0. Wer DE3.74 schon verwendet, kann sie weiter nutzen. [Gerätetest](../docs/validation/DE3_74_LCD_ACCEPTANCE.json)

[Signierte LCD-App](https://github.com/bluecyber81/pixl.js/releases/tag/de3.74) · [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Windows-ZIP](https://github.com/bluecyber81/pixl.js/releases/download/web3.50.1/Allmiibo_Dateimanager_3_50_1_Portable.zip) · [Quellcode](https://github.com/bluecyber81/pixl.js/releases/download/web3.50.1/Allmiibo_Dateimanager_3_50_1_Quellcode.zip)

## DE3.74 / App647 und Dateimanager 3.50.0

Unter **Fernbedienung → Displaybild aktualisieren** zeigt das Handy das aktuelle Gerätemenü. Du kannst das Bild drehen, als PNG speichern und nach dem nächsten Tastendruck erneut aufnehmen. Aktiviere dazu am wachen LCD-Allmiibo die BLE-Fernbedienung und verbinde **Pixl.Remote**. DE3.74 fügt die Fotoaufnahme hinzu. Auch auf DE3.73 kannst du mit **Verbindung prüfen** die Uhrzeit der letzten angeforderten Geräteantwort sehen. Ein abgebrochener Verbindungsversuch kann eine neu aufgebaute Dateiübertragung nicht mehr versehentlich trennen.

[Signierte Android-DFU-ZIP für LCD mit PFS1, Z19 und S112 7.3.0](https://github.com/bluecyber81/pixl.js/releases/download/de3.74/Allmiibo_LCD_DE3_74_647_NUR_APP.zip) · [Dateimanager 3.50.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.50.0)

## Dateimanager 3.49.0

Auf dem iPhone erklärt der Dateimanager die Möglichkeiten für Katalog und Bluetooth. Beim erneuten Ordnerabgleich lassen sich Änderungen auf beiden Seiten erkennen. Für Geräte mit cylin577s Firmware gibt es einen eigenen PixLink-Zugang. [Veröffentlichung und Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.49.0)

## Dateimanager 3.48.4

Bei der Online-Katalogprüfung zeigt der Dateimanager an, wenn Spielhinweise oder Schreibangaben in der Quelle fehlen. Die geprüften Spielhinweise bleiben verfügbar. Die Fernbedienung unterstützt die Tastatur und zeigt an, welchen Befehl das Gerät bestätigt hat. Für Dragoon und Hydra nennt die Dateiprüfung beide möglichen Maschinen, weil sie den gleichen Platinencode verwenden. [Veröffentlichung und Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.48.4)

## Version 3.48.3

954 Figuren im Offline-Katalog, darunter die zwei neuen Fahrer für Kirby Air Riders. Die deutsche Suche führt direkt zur jeweiligen Figurenkarte. Der Spielfilter zeigt sieben Fahrer. [Windows-Download](https://github.com/bluecyber81/pixl.js/releases/download/web3.48.3/Allmiibo_Dateimanager_3_48_3_Portable.zip) · [Quellcode](https://github.com/bluecyber81/pixl.js/releases/download/web3.48.3/Allmiibo_Dateimanager_3_48_3_Quellcode.zip) · [Start und Bedienung](LIESMICH_3_48_3.txt)

## Version 3.48.2

Beim Sichern unterscheidet der Dateimanager den Fortschritt im offenen Tab, die im Browser gespeicherte Sicherung und die heruntergeladene ZIP. Beim Schreiben erkennt er reservierte Pfade im Stammordner. Die lokale LittleFS-Platzprüfung unterstützt DE3.73/App646.

[Im Browser öffnen](https://bluecyber81.github.io/pixl.js/) · [Windows-Download](https://github.com/bluecyber81/pixl.js/releases/download/web3.48.2/Allmiibo_Dateimanager_3_48_2_Portable.zip) · [Quellcode](https://github.com/bluecyber81/pixl.js/releases/download/web3.48.2/Allmiibo_Dateimanager_3_48_2_Quellcode.zip) · [ChatGPT-Prüfpaket](https://github.com/bluecyber81/pixl.js/releases/download/de3.73-test646/Allmiibo_DE3_73_App646_Z19_Web3_48_2_ChatGPT_Pruefpaket.zip) · [Windows-Start und Bedienung](LIESMICH_3_48_2.txt)

## Allmiibo Dateimanager 3.48.1

Unter **Sicherung** lassen sich zwei ZIPs nach Pfad und Änderungsart vergleichen und die Treffer als CSV oder JSON speichern. Die **Figurensammlung** übernimmt bei schneller Auswahl die zuletzt gewählte Figur. Favoriten und gespeicherte Filter lassen sich auf einen anderen Browser übertragen. Für LCD-Allmiibo mit Z19, S112 7.3.0 und PFS1 steht die optionale signierte Testanwendung DE3.72/645 bereit.

[Im Browser öffnen](https://bluecyber81.github.io/pixl.js/) · [Windows-Download](https://github.com/bluecyber81/pixl.js/releases/download/web3.48.1/Allmiibo_Dateimanager_3_48_1_Portable.zip) · [Windows-Start und Bedienung](LIESMICH_3_48_1.txt)

## Dateimanager 3.47.0

Der Amiibo-Emulator sortiert die sichtbare Seite im Figurenordner einmal. Unter **Gerät & Diagnose → Alle Diagnosewerte auslesen** zeigt der Dateimanager mit DE3.70 die erkannten Mitteltastenereignisse bis zur ersten Auswahl im Hauptmenü und die Dauer des App-Aufrufs. Die Daten bleiben bis zum Neustart im RAM. [LCD DE3.70 (ZIP)](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_70_642_NUR_APP.zip) · [Web 3.47.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.47.0)

## Dateimanager 3.46.0

Unter **Sicherung** kannst du zwei gespeicherte Sicherungs-ZIPs auswählen. Die Ansicht zeigt neue, entfernte und geänderte Einträge. Der Vergleich läuft auch bei getrenntem Gerät. Unter **Update** öffnet „In nRF DFU öffnen“ das gewählte öffentliche LCD-Paket auf Android. Die LCD-Testversion DE3.69 zeigt die letzten fünf geöffneten Figuren in der Amiibo-Datenbank. [DE3.69 LCD (ZIP)](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_69_641_NUR_APP.zip) · [Web 3.46.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.46.0)

## Dateimanager 3.45.0 · LCD DE3.68 / 640 · 2026-11-09

Im Figurenkatalog kannst du ein Spiel auswählen und die passenden Figuren aus deiner Sammlung anzeigen. Unter Sicherung zeigt der Ordnervergleich auch die Dateien, die nur auf dem Gerät liegen. Die LCD-Testversion DE3.68 merkt sich beim Zurückkehren ins Hauptmenü die zuletzt geöffnete App. Im Dateimanager lässt sich jedem verbundenen Gerät ein eigener Name für diesen Browser geben. Beim Gerätewechsel erscheint der jeweils zugeordnete Name. [DE3.68 LCD (ZIP)](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_68_640_NUR_APP.zip) · [Web 3.45.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.45.0)

Beim Öffnen wählt der Dateimanager die erste unterstützte Sprache aus der Sprachliste des Browsers. Im Sprachmenü kannst du eine feste Sprache wählen oder wieder zur automatischen Auswahl wechseln. [Sprachauswahl](../docs/DATEIMANAGER_WEB.md#dateimanager-3440)

Die lokale LittleFS-Platzprüfung zeigt DE3.68 mit App-Zähler 640. Das vorausgewählte Profil passt für DE3.55 bis DE3.68. [Platzprüfung](../docs/DATEIMANAGER_WEB.md#dateimanager-3431)

Ordnersicherungen lassen sich nach einem Browserneustart fortsetzen. Der Figurenkatalog speichert Webfavoriten, benannte Filter und HTTPS-Linklisten. LCD-Displayfotos kannst du vor dem Speichern um 180° drehen. [Bedienung](../docs/DATEIMANAGER_WEB.md#dateimanager-3430)

- **3.48.1** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.48.1/Allmiibo_Dateimanager_3_48_1_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.48.1/Allmiibo_DE3_72_Z19_Web3_48_1_ChatGPT_Pruefpaket.zip)
- **3.48.0** · [Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.48.0/Allmiibo_Dateimanager_3_48_0_Quellcode.zip) · [Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.48.0/Allmiibo_DE3_71t1_Z19_Web3_48_0_ChatGPT_Pruefpaket.zip)
- **3.47.0** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.47.0/Allmiibo_Dateimanager_3_47_0_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.47.0/Allmiibo_DE3_70_Z19_Web3_47_0_ChatGPT_Pruefpaket.zip)
- **3.46.0** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.46.0/Allmiibo_Dateimanager_3_46_0_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.46.0/Allmiibo_DE3_69_Z19_Web3_46_0_ChatGPT_Pruefpaket.zip)
- **3.45.0** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.45.0/Allmiibo_Dateimanager_3_45_0_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.45.0/Allmiibo_DE3_68_Z19_Web3_45_0_ChatGPT_Pruefpaket.zip)
- **3.44.0** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.44.0/Allmiibo_Dateimanager_3_44_0_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.44.0/Allmiibo_DE3_67_Z19_Web3_44_0_ChatGPT_Pruefpaket.zip)
- **3.43.1** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.43.1/Allmiibo_Dateimanager_3_43_1_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.43.1/Allmiibo_DE3_67_Z19_Web3_43_1_ChatGPT_Pruefpaket.zip)
- **3.43.0** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.43.0/Allmiibo_Dateimanager_3_43_0_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.43.0/Allmiibo_DE3_67_Z19_Web3_43_0_ChatGPT_Pruefpaket.zip)
- **3.42.2** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.42.2/Allmiibo_Dateimanager_3_42_2_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.42.2/Allmiibo_DE3_66_Z19_Web3_42_2_ChatGPT_Pruefpaket.zip)
- **3.42.1** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.42.1/Allmiibo_Dateimanager_3_42_1_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.42.1/Allmiibo_DE3_66_Z19_Web3_42_1_ChatGPT_Pruefpaket.zip)

Auf dem Handy führen die bebilderten Schaltflächen direkt zu Figurenimport und Firmwareupdate. Die sechs Bereiche haben eigene Farbakzente. „Dein Gerät“ zeigt den aktuellen Ordner und die Speicherbelegung mit einem breiten Verlaufsbalken. Der Figurenimport öffnet sich jetzt auch beim ersten Klick, wenn der Browser die Ansicht noch lädt. Die Anleitung beschreibt zusätzlich Nordics PC-Weg für Bluetooth-DFU mit einem passenden Adapter. [Bedienung](../docs/DATEIMANAGER_WEB.md#dateimanager-3421)

Die Startseite führt direkt zum Figurenimport oder zum Firmwareupdate. Bei blockierten Downloads kannst du die Quelle separat öffnen und die gespeicherte BIN prüfen. Treffer in der Gerätesuche lassen sich direkt herunterladen. Den geprüften Bestand kannst du als CSV für Excel speichern. [Funktionen seit 3.42.0](../docs/DATEIMANAGER_WEB.md#dateimanager-3420)

3.40.1 übernimmt die Paketauswahl beim Wechsel in den Updater und zeigt bei der fertigen Sicherung die frisch gelesenen und wiederverwendeten Dateien an. Im Serienfilter sind auch die drei Serien mit ausschließlich angekündigten Figuren auswählbar. [Bedienung](../docs/DATEIMANAGER_WEB.md#dateimanager-3401)

Seit 3.40.0 gibt es die direkte Figurenvorschau in der Gerätesuche, neun Ankündigungen und die Wiederaufnahme einer Sicherung mit frischem Inhaltsvergleich. Mit der LCD-Testversion DE3.66 lässt sich unter **Gerät & Diagnose** das aktuelle Display als PNG speichern. [Änderungen und Handy-Update](https://github.com/bluecyber81/pixl.js/blob/main/docs/RELEASE_DE3_66.md) · [Alle dokumentierten Web-Versionen](https://github.com/bluecyber81/pixl.js/blob/main/docs/VERSIONEN_WEB.md)

Der Dateimanager erklärt Namenskollisionen, für Windows ungeeignete Dateinamen und abweichende Unicode-Schreibweisen direkt beim Vergleich. Im Figurenkatalog gibt es alle 54 vorhandenen englischen Nutzungshinweise auch auf Deutsch. Auf der DFU-Seite kann der Browser während des Updates das Display wach halten.

In Version 3.45.0 standen unter **Update** und auf der DFU-Seite für LCD mit vorhandenem PFS1 und S112 7.3.0 die stabile DE3.65/637 und die damalige Testversion DE3.68/640 zur Auswahl. Der Versionsvergleich erkennt den passenden App-Zähler und Z19. [Startanleitung 3.45.0](LIESMICH_3_45_0.txt).

Dateimanager 3.39.3 meldet nach einem bestätigten Firmwaretransfer ausdrücklich, wenn der Browser die Bluetooth-Trennung angefordert hat. Beim Hochladen, Synchronisieren oder Umbenennen nennt die Fehlermeldung jetzt den zu langen Namen oder Pfad, seine Größe in UTF-8-Bytes und die zulässige Länge. [Bedienung und Grenzen](../docs/RELEASE_WEB3_39_3.de.md).

**3.39.2** zeigt neben **Kataloghinweise** den Datenstand aus dem tatsächlich eingebauten Katalog. Die Beschriftung bricht auf schmalen Displays um; andere Sprachen verwenden den englischen Fallback. Die Daten und persönlichen Notizen werden dadurch nicht verändert. [Änderungen und Prüfgrenzen](../docs/RELEASE_WEB3_39_2.de.md).

**3.39.1** ergänzt während laufender Sicherungen, Dateiübertragungen und längerer Geräteabfragen eine sichtbare Display-Wachhaltehilfe. Unterstützte Browser fordern bei sichtbarem Tab eine Screen Wake Lock an. Die Anzeige zeigt den tatsächlichen Zustand, lässt sich abschalten und bietet bei Ablehnung oder Freigabe einen erneuten Versuch. Nach Ende oder Trennen wird die Sperre freigegeben.

Den Tab im Vordergrund lassen: manuelles Sperren, Energiesparen oder Browser-Suspend können Bluetooth weiterhin unterbrechen. Die Hilfe garantiert keine Hintergrundübertragung. Die Funktionen aus 3.39.0 bleiben enthalten. [Bedienung und Prüfgrenzen](../docs/RELEASE_WEB3_39_1.de.md).

**Der vorherige Stand 3.39.0** ist ein am Rechner und in Chrome geprüfter Browserstand. Unter **Figurenkatalog → Details und Bild** und in der **Dateivorschau** erscheinen Kataloghinweise zu 952 Figuren und 1.344 Zuordnungen. Acht redaktionelle deutsche Teilübersetzungen decken 13 Zuordnungen ab; weitere vorhandene Texte bleiben gekennzeichnet englisch. Eine Zuordnung bestätigt keine Spielkompatibilität oder Belohnung.

**Figurensammlung → Prüfung: Dateiinhalte prüfen (empfohlen) → Sammlung prüfen → Anzeigen → Gleiche Figuren-ID / Dateiinhalte** trennt gleiche IDs von SHA-256-Inhaltsgruppen. Verwendet werden bereits gelesene Dateibytes; zusätzliche Bluetooth-Lesezugriffe entfallen. Die Schnellprüfung vergleicht keine Inhalte. Kein Eintrag wird automatisch gelöscht. Nach einem Schreibvorgang den als veraltet markierten Bericht erneut prüfen.

**Gerät & Diagnose → Karten-Slot lokal prüfen** verarbeitet eigene lokale Dateien: erst die vollständige v8-Konfiguration `chameleon/slots/config.bin`, dann den Slot und seine passende `NN.bin`. Unterstützt sind MF0ICU1, MF0ICU2, MF0UL11 und MF0UL21. Nur bei bekanntem altem UID-Kopiermuster und gültigen BCCs wird eine erneut geprüfte `NN.uid-corrected.bin` angeboten. Höchstens vier UID-Bytes ändern sich; Quelle und übrige Bytes bleiben erhalten. Die gemeinsame Herkunft der Dateien ist nicht automatisch beweisbar. Es erfolgt kein Schreiben auf das Gerät und keine Bestätigung der Karten-/Lesegerätfunktion.

**Sicherung → ZIP importieren → Sicherungs-ZIP auswählen → Vergleichen** schließt im normalen Schema-1-Restore die exakten inaktiven Stammdateien `.pixl_txn_old` und `.pixl_txn_new` sichtbar aus, erhält sie aber im Archiv. Aktive/unklare Stamm-Transaktionseinträge sperren den gesamten Import. Quelle, I:/-/E:/-Zielumleitung und frischer Zielzustand werden geprüft. Gleichnamige Dateien in gewöhnlichen Unterordnern bleiben normale Nutzdaten. Schema-2-Restores verwenden weiterhin den Migrationsassistenten.

Die DFU-Seite enthält **DE3.65 / 637** als reines Anwendungsupdate für LCD-Geräte mit PFS1 und S112 7.3.0. Nach der Auswahl prüft der Dateimanager die ZIP-Datei. Die Bluetooth-Übertragung startet durch die Geräteauswahl in Schritt 2. [Startanleitung 3.44.0](LIESMICH_3_44_0.txt).

Seit **3.38.1** bleibt unter **Sicherung** der Fehler beim Öffnen eines Laufwerks
auch dann sichtbar, wenn anschließend die Laufwerksliste erfolgreich neu gelesen
wird. Das Laufwerk lässt sich direkt erneut auswählen. Ein erfolgreicher neuer
Öffnungsversuch oder ein Verbindungswechsel entfernt den alten Hinweis. Die
Korrektur benötigt kein Firmwareupdate und verändert keine Gerätedateien.

Die RAM-Ansicht erklärt jetzt direkt, wie viele Speicherstichproben vorliegen:
keine, eine, wenige, viele oder unbekannt. Eine fehlerfreie Einzelaufnahme gilt
damit nicht als Belastungstest. Der Hinweis erscheint in Einzel- und Gesamtdiagnose.

Ab **DE3.62** zeigt **Gerät & Diagnose → Startzeiten lesen** zusätzlich die Zeit
für Flash-/Geometrievorbereitung und den PackedFS-Scan. Unter
**Laufwerk einbinden: Zeit und Lesezugriffe** stehen Cachetreffer, geeignete
Cachefehlschläge, Zugriffe ohne Cache und physische Lesefehler. Das Profil gehört
zum letzten tatsächlich ausgeführten Mount; erneutes Lesen startet keinen neuen
Mount. Fehlende Messungen bleiben unbekannt, gesättigte Zähler sind Untergrenzen.
Ältere Firmware nutzt weiterhin die bisherigen Diagnoseformate.

Im Bereich **Sicherung** bleibt ein fehlgeschlagener Laufwerksaufruf sichtbar und
kann wiederholt werden. Während des Öffnens erscheint ein Wartehinweis. Erst
**Ordner sichern (ZIP)** startet die Sicherung; der aktivierte Knopf ist farblich
hervorgehoben. Das Öffnen des Laufwerks schreibt keine Dateien.

Die reproduzierbare [Browserprüfung](BROWSER_TESTS.md) prüft den gebauten
Dateimanager und die App-DFU-Seite auf Desktop und Mobilgröße. Sie verwendet
synthetische Zustände und ersetzt keinen Test am Allmiibo.

Unter **Sicherung** kannst du das erkannte Laufwerk direkt öffnen. Steht bei „Geöffneter Ordner“ das Hauptverzeichnis **E:/**, sichert **Ordner sichern (ZIP)** die Dateien auf dem ganzen Laufwerk. Bei DE3.8 ist das der erste Schritt vor der späteren Sicherung aller 128 Metadatenbytes für die Speicherumstellung.

Unter **Gerät & Diagnose** zeigt die Gesamtdiagnose die von der Firmware gemeldete ATT-MTU. Die Transportübersicht führt die vom Dateimanager genutzte GATT-Wertgröße getrennt auf. Ab DE3.61 schlüsselt „Startzeiten lesen“ den Speicherstart in Einbinden des Laufwerks, Journalprüfung und übrige Initialisierung auf. Frühere Berichte lassen sich weiterhin anhand der gemeinsamen Startmarken vergleichen. Der Versionsabgleich erkennt Z15 am vollständigen Bereichshash und am Zähler 15.

Wenn Bluetooth beim Hochladen einer Figur abbricht, zeigt der Dateimanager den betroffenen Speicherort und die ursprüngliche Sitzung an. Steht der Abschluss noch aus, verbinde dasselbe Gerät erneut und prüfe den Zielordner, bevor du den Upload wiederholst. Halte den Browsertab dafür geöffnet. Beim Gerätewechsel verschwinden die Erfolgs- und Fehlermeldungen des vorherigen Geräts. Hinweise auf zu prüfende Dateien bleiben bei ihrer ursprünglichen Sitzung.

Bei der Sammlungsprüfung und der ZIP-Sicherung zeigt die Ordnersuche ihren Fortschritt. Sobald genug Dateien gelesen sind, zählt eine Schätzung für den laufenden Schritt herunter. Bei ausbleibender Geräteantwort erscheint ein Wartehinweis. Die Gerätediagnose zeigt zusätzlich den aktuellen Diagnosebereich. Orange Figurenkarten erklären den jeweiligen Prüfhinweis.

[Online-Seite (separater Veröffentlichungsstand) öffnen](https://bluecyber81.github.io/pixl.js/) · [DFU-Seite](https://bluecyber81.github.io/pixl.js/dfu/web.html) · [Version 3.45.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.45.0) · [Startanleitung](LIESMICH_3_45_0.txt)

Auf dem Allmiibo **Bluetooth-Dateiübertragung** öffnen und das Gerät im Browser über **Verbinden** auswählen. Wer die Seite lokal nutzt, entpackt das portable ZIP und startet unter Windows **Start-Dateimanager.cmd**. Der Standardport ist **8765**.

## Firmwarepaket vor der Übertragung prüfen

Bei **Gerät & Diagnose → Versionsabgleich** vergleicht der Dateimanager den SHA-256-Wert des Bootloaderbereichs mit dem zugehörigen Zähler. Die gespeicherten Referenzen sind BL8 (11), Z13 (13), Z15 (15) und Z17 (17) sowie Z19 (19). Z13-Code mit Zähler 16 wird als bekanntes Z16-Rückkehrpaket bezeichnet; Z18 ist das Rückkehrpaket mit unverändertem Z15-Code und Zähler 18. Andere Kombinationen werden getrennt als Abweichung angezeigt. Der Paketkatalog beschreibt die mitgelieferte Anwendung und ihre Voraussetzungen separat. Bei einer aktuellen Gerätediagnose warnt die DFU-Seite vor einem niedrigeren App-Zähler. Z15 kann eine ältere, gültig signierte Anwendung installieren. Für Bootloader-Pakete gilt ein eigener Versionszähler.

In Schritt 1 der DFU-Seite zeigt die Dateiauswahl den Anwendungszähler, das Hardwarefeld und die erlaubten SoftDevice-FWIDs. Eine höchstens zehn Minuten alte Bootdiagnose aus dem Dateimanager ermöglicht einen Vergleich. Ein Hinweis auf einen niedrigeren Zähler oder eine abweichende FWID ist vor der Geräteauswahl sichtbar. Vermischte oder widersprüchliche Startdaten werden vor Bluetooth abgewiesen.

Unter **Gerät & Diagnose → Alle Diagnosewerte auslesen → Gesamtdiagnose speichern** lässt sich die Diagnose als JSON sichern. Der Abschnitt zum Speicher nennt konfigurierte Cachegrößen. Der kleinste freie Stack ist nur verfügbar, wenn ihn die Firmware tatsächlich gemessen hat.

## Galerie und Bestandsfilter

**Figurenkatalog → Bilder anzeigen** aktiviert die optionale Galerie der aktuellen
Seite. Vor dem Einschalten gibt es keine Galerie-Bildabrufe. Bilder verwenden die
aktive Katalogrevision; eine feste Fläche und ein Platzhalter halten die Karten
bei Ladefehlern stabil. GitHub erhält beim Bildabruf die öffentliche Figuren-ID
und IP-Adresse, keine Gerätedateien.

**Bestand filtern** zeigt vorhandene, nicht gefundene, auffällige oder
unbestätigte/veraltete Einträge. Grundlage ist weiterhin „Sammlung prüfen“:
Grün = ID gefunden, Orange = Prüfhinweis, Rot = nach vollständiger Inhaltsprüfung
von ganz E: nicht gefunden. Teilprüfungen oder fehlende Metadaten belegen keine
Abwesenheit. Ein Ergebnis nach Trennung bleibt als frühere Beobachtung markiert.
Neue Verbindung, Änderungen oder Neuladen verwerfen den alten Bestand.

Ein bewusster Seitenwechsel führt zum Anfang der Ergebnisse. Eingaben in der
Suche verschieben den Fokus nicht. Alte Details schließen beim Blättern.

## Aktualisierte Katalogdaten

Über „Nach neuen Figuren suchen“ übernommene Metadaten gelten jetzt auch für
Gerätesuche, Auswahlvorschau, Dateieigenschaften und lokale Figurendateiprüfung.
Ein Katalogwechsel beendet eine laufende Gerätesuche; sie kann mit dem neuen
Stand neu gestartet werden. Verspätete alte Ergebnisse/Bildfehler überschreiben
nicht die aktuelle Auswahl. Diese Verbindungen werden mit tatsächlichen
Vue-Komponenten und synthetischen BIN-Dateien getestet.

Der gebündelte Katalog umfasst weiterhin 952 öffentliche IDs. Metadaten/Bilder
sind keine spielfertigen Figurendateien. Eigene BIN-Dateien oder direkte
HTTPS-Quellen können geprüft und übertragen werden; vorhandene Dateien werden
dabei nicht automatisch überschrieben. Grundstruktur und ID-Prüfung ersetzen
keine kryptografische Prüfung oder Erkennung an der Konsole.

## Startzeit und Speicherprofil

Über **Gerät & Diagnose → Startzeiten lesen → Früheren Startbericht vergleichen** einen früheren Start- oder Gesamtdiagnosebericht auswählen. Für einen aussagekräftigen Vergleich Berichte desselben Geräts mit vergleichbarer Sammlung verwenden. Die Datei wird lokal gelesen. Für die Phasen Speicher und Anwendung bedeutet ein negativer Unterschied eine kürzere Zeit.

Das aktuelle PFS1-Profil für die lokale Platzprüfung umfasst 19 geprüfte Paare. Zugelassen sind DE3.55/627 bis DE3.70/642, DE3.71t1/644, DE3.72/645 und der lokale LCD-Teststand DE3.73/646. Für DE3.71/643 fehlt die Freigabe in diesem Profil. Die Speicherumstellung prüft das genaue Paar, die Geometrie und den Fingerabdruck der Speicher-Engine. Bei einem bereits passenden PFS1-Gerät genügt das Anwendungsupdate. Der Browser prüft den SHA-256 der vollständigen Anwendung anhand der Init-Daten ihrer DAT-Datei. [DE3.65-Anwendungsquellen](https://github.com/bluecyber81/pixl.js/archive/3a5ea8a3662a942cb4ed9ea56a9a68939c07b5a9.zip).

## Bauen, testen und veröffentlichen

Node/npm gemäß [Mitarbeit und Werkzeuge](https://github.com/bluecyber81/pixl.js/blob/main/CONTRIBUTING.md) verwenden:

```sh
npm ci
npm test
npm run build
npm run build:pages
```

Der lokale Build liegt in `dist/`, der Pages-Build für `/pixl.js/` in
`dist-pages/`. Beide führen ihre Produktionsprüfungen aus und enthalten dieselben
gebundenen Lizenztexte unter „Quellen & Lizenzen“. Für Pages nur den Inhalt von
`dist-pages/` veröffentlichen, keine Quellen, Serverzustände oder private Dateien.
Eine andere Projektadresse benötigt einen passenden Basis-Build mit Tests.

Die früheren Handy-Links im Verzeichnis `downloads/` öffnen weiterhin das
jeweilige Archiv. Der Pages-Build erzeugt für diese Lesezeichen kleine
Downloadseiten. Große Quellcode- und Prüf-ZIPs gehören in die GitHub-Releases.
Für Skripte und „Link speichern unter“ die direkte Release-Adresse verwenden.
Auf jeder Downloadseite gibt es zusätzlich einen Link zur bytegleichen Datei
im archivierten Git-Stand.

Der isolierte native Test
`scripts/check-pfs-compatibility.py --output <neuer Ordner>` benötigt GCC und
prüft einen synthetischen Datenträger mit beiden Kernständen: alt erstellen,
neu lesen/ändern, alt lesen/ändern, neu erneut lesen. Er vergleicht Inhalte,
Pfade, Raw128-Metadaten und Importidentität.
`scripts/build-capacity-simulator.py --profile current` reproduziert den
beibehaltenen aktuellen WASM mit clang 23.1.4; `--profile de354` den vorherigen.
Historische Verzeichnis-/Artefaktnamen wie `packed-simulator-de355` identifizieren
den unveränderten Speicherkern und werden nicht nur wegen DE3.59 umbenannt.

Abhängigkeiten sind in `package-lock.json`, Quellen und Lizenzen in
`third-party/npm/SOURCES.json` gebunden. Ältere nicht referenzierte Lizenzkopien
sind historische Hinweise, keine zusätzlich installierten Bibliotheken.
Das [Web-Quellpaket 3.44.0](https://github.com/bluecyber81/pixl.js/releases/download/web3.44.0/Allmiibo_Dateimanager_3_44_0_Quellcode.zip)
enthält Quellen und Tests, keine privaten Sicherungen oder Figurendateien.

## Verbindung und Grenzen

Web Bluetooth erfordert einen unterstützenden Browser sowie HTTPS oder localhost.
Die normale Betriebssystem-Paarung ist nicht erforderlich. Bluetooth läuft
direkt zwischen dem Browsergerät und Allmiibo; Pages ist keine Funkbrücke zum
heimischen Laptop. Sicherungen, Diagnosen und Sammlungen werden nicht automatisch
an GitHub gesendet.

Informationslinks funktionieren lokal als `/?amiibo=01010000000e0002` oder
`/#/a/01010000-000e0002`, auf Pages mit `/pixl.js/` davor. Sie sind öffentliche
Figureninformationen, keine Gerätebefehle. Die ältere lokale Route
`/a/<8Hex>-<8Hex>` benötigt einen lokalen Server und ist kein Pages-Routeersatz.

Die Web-Tests verwenden simuliertes Bluetooth und reale lokale WASM-Kerne. Für die stabile App DE3.65 sind Bluetooth-Auslesung, NFC, Scrollbalken und Aufwachen am LCD bestätigt. Mit DE3.66 und Web 3.40.0 wurden das Displayfoto sowie die Fortsetzung einer Sicherung mit zwei Dateien über Windows-Bluetooth bestätigt. [Geräteprüfung und Testumfang](https://github.com/bluecyber81/pixl.js/blob/main/docs/validation/DE3_66_LCD_READBACK.md). [Gerätebefund DE3.65](https://github.com/bluecyber81/pixl.js/blob/web3.39.5/docs/validation/DE3_65_LCD_READBACK.json) · [Prüfnachweise DE3.66](https://github.com/bluecyber81/pixl.js/blob/de3.66/docs/validation/DE3_66.json)

Gerät & Diagnose: DE3.59 meldet den unberührten Stack ab Anwendungseinstieg. Bei älteren Versionen ist das Feld unbekannt. Unter Startzeiten lassen sich 3 bis 20 gespeicherte Berichte unterschiedlicher Neustarts derselben Firmware bei gleicher Sammlung vergleichen (Median und Minimum–Maximum). Mehrfache Abrufe desselben Starts zählen nicht mehrfach.
