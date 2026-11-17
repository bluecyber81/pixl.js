# Firmware für Allmiibo LCD und Pixl.js OLED

[English](README.md) · [Bluetooth-Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/)

## LCD DE3.84 / App657 · am Gerät erprobte Testversion

Die Spiele übernehmen die 180°-Drehung und haben eine deutsche und englische Bedienhilfe. Unter **Einstellungen** lassen sich das automatische Dimmen sowie der Display- und Tastentest aufrufen. Der Besitzer eines LCD meldete am 17. November 2026 erfolgreiche praktische Tests mit installiertem Z21. Welche Einzelfälle er getestet hat, ist offen. Die Wiederaufnahme nach einem echten Android-DFU-Abbruch ist gesondert zu prüfen.

Für ein Allmiibo LCD mit ST7567, Packed LittleFS (PFS1), Z21 und S112 7.3.0 die ZIP gepackt in **nRF Device Firmware Update** auswählen. [App-ZIP fürs Handy](https://github.com/bluecyber81/pixl.js/releases/download/de3.84-lcd-test1/Allmiibo_LCD_DE3_84_657_NUR_APP.zip) · [Prüfpaket mit Quellen, ELF und Maps](https://github.com/bluecyber81/pixl.js/releases/download/de3.84-lcd-test1/Allmiibo_LCD_DE3_84_App657_Pruefpaket.zip) · [GitHub-Prüflauf](https://github.com/bluecyber81/pixl.js/actions/runs/44047724527)

## Dateimanager 3.55.7

Version 3.55.7 erkennt das OLED-Profil von App84, zeigt die Firmwarekennung und führt zur passenden Handy-ZIP. Unter **Gerät & Diagnose** kann der Dateimanager bei App657 die Buildkennung der laufenden App, eine gegebenenfalls erhaltene Fehlernotiz vom vorigen Start und die beim letzten Mount belegten Cache-Seiten anzeigen. Der zweisprachige Prüfassistent bietet 40 zusätzliche LCD-Prüffälle. [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Windows-Paket und Quellcode](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.7)

## Aktuelle LCD-Firmware · DE3.81 / App654

| Was möchtest du aktualisieren? | Download und Voraussetzungen |
| --- | --- |
| Nur die Geräte-App | [DE3.81 / App654 herunterladen (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_DE3_81_654_NUR_APP.zip). Für LCD mit Packed LittleFS (PFS1), Z19, Z20 oder Z21 und S112 7.3.0. Bootloader und SoftDevice bleiben installiert. |
| App, Bootloader und SoftDevice | [Komplettpaket für Android herunterladen (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_S112_7_3_0_Z21_DE3_81_654_KOMPLETT.zip). Enthält DE3.81 / App654, Bootloader Z21 und Nordic S112 7.3.0. Für passende LCD-Geräte mit Bootloader-Zähler unter 21, passendem Schlüssel und Speicherlayout sowie S112-FWID 0x0103 oder 0x0126. |

Sichere deine Dateien und lass die ZIP gepackt. Übertrage das Komplettpaket in **nRF Device Firmware Update** und warte beide Phasen ab. Die Diagnose eines LCD meldet App654, Z21 und S112 7.3.0. Die Wiederaufnahme nach einem tatsächlichen Android-DFU-Abbruch auf Z21 steht als Einzeltest aus. [Flash-Anleitung](https://bluecyber81.github.io/pixl.js/guide/index.html#flash) · [Umstellung von SPIFFS](docs/MIGRATION_PFS1.md) · [Prüfpaket mit Quellen](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_DE3_81_Z21_Pruefnachweise.zip)

## OLED-Testversion

**OLED · DE3.84 Test 4 / App84.** Die Handy-ZIP enthält die App für Pixl.js mit nRF52832, SH1106 (128 × 64), kompatiblem DFU-Bootloader und S112 7.2.0 (`0x0103`). Die App nutzt das vorhandene SPIFFS oder native LittleFS. Der Praxistest für Test 4 steht aus. Ein Nutzer hatte den Start von Test 1 bestätigt und ein weiterer Bericht wies auf Schwierigkeiten mit der Fernbedienung hin. [OLED-App fürs Handy](https://github.com/bluecyber81/pixl.js/releases/download/de3.84-oled-t4/Allmiibo_OLED_DE3_84_Test4_APP.zip) · [OLED-Anleitung](https://bluecyber81.github.io/pixl.js/guide/index.html#oled)

Beide DE3.81-Apps enthalten deutsche und englische Menüs, den Katalog mit 956 Figuren, Spielhinweise, „App fortsetzen“ und die Bluetooth-Fernbedienung für die Tasten. Displayfotos, Startzeit- und RAM-Diagnose sowie den Akkuverlauf im Dateimanager gibt es auf dem LCD.

## Dateimanager 3.55.5 · Archiv

Auf der Startseite findest du beide LCD-Downloads und den eigenen OLED-Einstieg. [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Windows-Paket und Quellcode](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.5)

<details>
<summary>Frühere Veröffentlichungen und damalige Downloads</summary>

## Dateimanager 3.55.4

Auf der Startseite findest du je nach Display den passenden Handy-Download und die Anleitung. Die OLED-ZIP enthält ausschließlich die Geräte-App. [Startseite öffnen](https://bluecyber81.github.io/pixl.js/) · [Windows-Paket und Quellcode](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.4)

## Dateimanager 3.55.3

Auf einem unterstützten LCD siehst du unter **Gerät & Diagnose → Akkuverlauf** Messdauer, Spannweite und Unterbrechungen. Der erste neue Messwert nach einer Pause markiert die Fortsetzung. Der CSV-Export enthält den Pausengrund in der fünften Spalte `pause_reason`. [Windows-Paket und Quellcode](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.3)

## LCD-Vorschau fürs Android-Handy

DE3.81 / App654 hält die markierte Figur bei einem abgelehnten Wechsel und ermöglicht einen neuen Versuch, wenn AmiiboLink keine Tagdaten erzeugen kann. Z21 zeigt beim Fortsetzen einer DFU-Übertragung wieder den Empfang an. Auf einem LCD hat der Besitzer den Flash und die erste Funktion bestätigt. Die Wiederaufnahme nach einem echten Funkabbruch ist offen. [App654](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_DE3_81_654_NUR_APP.zip) · [Android-Kombi mit S112 7.3.0 und Z21](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_S112_7_3_0_Z21_DE3_81_654_KOMPLETT.zip) · [Quellen und Prüfnachweise](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_DE3_81_Z21_Pruefnachweise.zip) Die vollständige ZIP lässt sich auf einem passenden LCD mit Packed LittleFS über nRF Device Firmware Update installieren. [Stabile DE3.75](https://github.com/bluecyber81/pixl.js/releases/tag/de3.75)

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

**DE3.75 / App648 ist die stabile LCD-Firmware** für Geräte mit PFS1, Z19 und S112 7.3.0. Auf einem LCD gelangen die Rückkehr zur gewählten Figur und das Aufwachen in beiden Apps. Die Switch erkannte außerdem eine bekannte Figur. Wer die signierte App648 bereits geflasht hat, kann sie weiterverwenden. [App-ZIP fürs Handy](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_LCD_DE3_75_648_NUR_APP.zip) · [Android-Kombi für passende ältere Bootloader](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_LCD_S112_7_3_0_Z19_DE3_75_648_KOMPLETT.zip) · [Änderungen und Gerätetests](docs/RELEASE_DE3_75.md) · [ChatGPT-Prüfpaket](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_DE3_75_App648_Z19_Web3_52_1_ChatGPT_Pruefpaket.zip)

Ordnersicherungen lassen sich mit einer früheren ZIP beschleunigen. Der Dateimanager vergleicht kleine Dateien mit der aktuellen Prüfsumme vom Gerät. Du kannst die ZIP komprimieren, die Dauer je Sicherungsphase sehen und einen gesicherten Figurenordner offline prüfen. Beim Umbenennen und vor dem ZIP-Import wird die verbleibende Pfadlänge angezeigt. Unter Gerät & Diagnose lassen sich MIFARE-Mini-Slots lesend prüfen. [Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.53.0)

## Dateimanager 3.52.0

Unter **Gerät & Diagnose** dokumentierst du die Rückkehr zur letzten Figur und das Aufwachen. Die Figurenauswahl bleibt nach einer Onlineprüfung alphabetisch. Der Dateimanager lädt die Werkzeuge für Sicherung, Update und Fernbedienung beim ersten Öffnen. [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.52.0)

## Dateimanager 3.51.1 · Figurenbild beim Scrollen

Wähle unter **Dateien** eine Figur aus. Am Laptop bleibt die **Auswahl** mit Bild und Figurendaten rechts sichtbar, während du durch einen langen Ordner scrollst. Klickst du eine andere Figur an, erscheint dort ihre Vorschau. [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Windows und Quellcode](https://github.com/bluecyber81/pixl.js/releases/tag/web3.51.1)

Ordner stehen oben. Tippe eine Figurendatei an, um ihr Bild und ihre Informationen zu öffnen. Am Handy stehen Dateityp und Größe unter dem Namen, die Aktionen findest du rechts. Ist ein lokaler Name für das Allmiibo ungeeignet, kannst du den Zielnamen vor dem Hochladen korrigieren oder den Eintrag überspringen.

## Getestete LCD-Finalversion DE3.74 (App647) · Dateimanager 3.50.1

Das Displayfoto der Fernbedienung wurde mit Dateimanager 3.50.0 am LCD-Allmiibo getestet. Version 3.50.1 führt DE3.74 als stabile App für LCD-Geräte mit Packed LittleFS, Bootloader Z19 und S112 7.3.0. Wer DE3.74 schon verwendet, kann sie weiter nutzen. [Gerätetest](docs/validation/DE3_74_LCD_ACCEPTANCE.json)

[Signierte LCD-App](https://github.com/bluecyber81/pixl.js/releases/tag/de3.74) · [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Windows-ZIP](https://github.com/bluecyber81/pixl.js/releases/download/web3.50.1/Allmiibo_Dateimanager_3_50_1_Portable.zip) · [Quellcode](https://github.com/bluecyber81/pixl.js/releases/download/web3.50.1/Allmiibo_Dateimanager_3_50_1_Quellcode.zip)

## DE3.74 / App647 und Dateimanager 3.50.0

Unter **Fernbedienung → Displaybild aktualisieren** zeigt das Handy das aktuelle Gerätemenü. Du kannst das Bild drehen, als PNG speichern und nach dem nächsten Tastendruck erneut aufnehmen. Aktiviere dazu am wachen LCD-Allmiibo die BLE-Fernbedienung und verbinde **Pixl.Remote**. DE3.74 fügt die Fotoaufnahme hinzu. Auch auf DE3.73 kannst du mit **Verbindung prüfen** die Uhrzeit der letzten angeforderten Geräteantwort sehen. Ein abgebrochener Verbindungsversuch kann eine neu aufgebaute Dateiübertragung nicht mehr versehentlich trennen.

[Signierte Android-DFU-ZIP für LCD mit PFS1, Z19 und S112 7.3.0](https://github.com/bluecyber81/pixl.js/releases/download/de3.74/Allmiibo_LCD_DE3_74_647_NUR_APP.zip) · [Dateimanager 3.50.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.50.0)

## DE3.73 / App646 und Dateimanager 3.49.0

Auf dem iPhone erklärt der Dateimanager die Möglichkeiten für Katalog und Bluetooth. Beim erneuten Ordnerabgleich lassen sich Änderungen auf beiden Seiten erkennen. Für Geräte mit cylin577s Firmware gibt es einen eigenen PixLink-Zugang.

Bei der Online-Katalogprüfung zeigt der Dateimanager an, wenn Spielhinweise oder Schreibangaben in der Quelle fehlen. Die geprüften Spielhinweise bleiben verfügbar. Die Fernbedienung unterstützt die Tastatur und zeigt an, welchen Befehl das Gerät bestätigt hat. Für Dragoon und Hydra nennt die Dateiprüfung beide möglichen Maschinen, weil sie den gleichen Platinencode verwenden.

Der Offline-Katalog umfasst 954 Figuren. Unter **Figurenkatalog → Spiel → Kirby Air Riders** findest du sieben Fahrer, darunter Kirby mit Schwert & Dragoon sowie Dedede Noir & Hydra. Beide lassen sich auch unter ihrem deutschen Namen finden. Der Firmware-Namensfilter umfasst die 952 IDs der veröffentlichten App646.

DE3.73 ist eine optionale LCD-Testversion. Ein langer Druck auf „Zurück“ in der Slotliste lässt die Slots unberührt. Bei der Rückkehr aus den Figurendetails bleibt die Auswahl auch über Favoritenseiten hinweg erhalten. Der Dateimanager 3.49.0 prüft die lokale Belegung für App646 und erkennt reservierte Speicherpfade bereits vor dem Schreiben.

| Ausgangslage beim LCD-Allmiibo | Passender Download |
| --- | --- |
| Packed LittleFS ist eingerichtet, Z19 und Nordic S112 7.3.0 sind vorhanden | [Nur die neue Gerätesoftware DE3.73](https://github.com/bluecyber81/pixl.js/releases/download/de3.73-test646/Allmiibo_LCD_DE3_73_App646_TEST_DFU.zip) |
| Passendes nRF52832-LCD mit bekanntem Flashlayout und funktionierendem, signaturkompatiblem Secure DFU. Bootloaderzähler unter 19, S112-FWID 0x0103 oder 0x0126 | [Komplettpaket mit S112 7.3.0, Z19 und DE3.73](https://github.com/bluecyber81/pixl.js/releases/download/de3.73-test646/Allmiibo_LCD_S112_7_3_0_Z19_DE3_73_646_KOMPLETT_TEST.zip). Am Android-Handy mit **nRF Device Firmware Update** beide Phasen abschließen. |
| Altes SPIFFS-Laufwerk steht vor der Umstellung | [Vorbereitungsfirmware DE3.30-PREP / 600](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_SPIFFS_DE3_30_PREP_600.zip). Zuerst die Originaldateien sichern. Vor dem Systemwechsel die vollständige Raw128-Sicherung frisch vergleichen und die Platzprüfung bestehen. [Schritt für Schritt zu LittleFS](https://bluecyber81.github.io/pixl.js/guide/#littlefs) |

Durch die Einrichtung von LittleFS wird das bisherige Laufwerk E: gelöscht. Spiele anschließend die geprüfte Sicherung zurück und vergleiche die wiederhergestellten Daten mit dem Gerät.

[Stabile LCD-Firmware DE3.65 / 637](https://github.com/bluecyber81/pixl.js/releases/download/de3.65/Allmiibo_LCD_DE3_65_637_NUR_APP.zip) · [Installationsanleitung](https://bluecyber81.github.io/pixl.js/guide/index.html) · [Windows-ZIP](https://github.com/bluecyber81/pixl.js/releases/download/web3.49.0/Allmiibo_Dateimanager_3_49_0_Portable.zip) · [Quellcode](https://github.com/bluecyber81/pixl.js/releases/download/web3.49.0/Allmiibo_Dateimanager_3_49_0_Quellcode.zip) · [ChatGPT-Prüfpaket](https://github.com/bluecyber81/pixl.js/releases/download/de3.73-test646/Allmiibo_DE3_73_App646_Z19_Web3_48_2_ChatGPT_Pruefpaket.zip)

## DE3.72 / App645 und Dateimanager 3.48.1

Die LCD-Testanwendung merkt sich bei der Rückkehr den gewählten Datenplatz und die im Detail zuletzt angezeigte Figur. Vier deutsche und englische Spielhinweise zu Mipha und Urbosa wurden korrigiert. Im Dateimanager ist App645 jetzt auch für die lokale Platzprüfung auswählbar. [Änderungen und Prüfnachweise](https://github.com/bluecyber81/pixl.js/releases/tag/de3.72) · [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/)

## Dateimanager 3.48.0 und LCD-Testfirmware DE3.71t1

Der Dateimanager schützt fertige Sicherungs-ZIPs vor versehentlichem Schließen. ZIP-Vergleiche lassen sich filtern und als CSV oder JSON exportieren. Favoriten und Suchfilter können in einen anderen Browser übernommen werden. Unter Windows funktioniert jetzt auch das Beenden des Hintergrundservers nach einer bestätigten Stoppanforderung.

Beim Gerätetest mit App644 kehrte die Auswahl auf den ausprobierten Wegen im Datei-Emulator und in der Amiibo-Datenbank zur richtigen Figur zurück, sowohl bei „Zurück zur Liste“ als auch nach dem Aufwachen. Die Testfirmware ist ein signiertes App-Update für passende LCD-Geräte mit Packed LittleFS. [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Versionshinweise und Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.48.0) · [LCD-Testfirmware](https://github.com/bluecyber81/pixl.js/releases/tag/de3.71t1)

## Dateimanager 3.47.0

Der Amiibo-Emulator sortiert die sichtbare Seite im Figurenordner einmal. Unter **Gerät & Diagnose → Alle Diagnosewerte auslesen** zeigt der Dateimanager mit DE3.70 die erkannten Mitteltastenereignisse bis zur ersten Auswahl im Hauptmenü und die Dauer des App-Aufrufs. Die Daten bleiben bis zum Neustart im RAM. [LCD DE3.70 (ZIP)](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_70_642_NUR_APP.zip) · [Web 3.47.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.47.0)

## Dateimanager 3.46.0

Unter **Sicherung** kannst du zwei gespeicherte Sicherungs-ZIPs auswählen. Die Ansicht zeigt neue, entfernte und geänderte Einträge. Der Vergleich läuft auch bei getrenntem Gerät. Unter **Update** öffnet „In nRF DFU öffnen“ das gewählte öffentliche LCD-Paket auf Android. Die LCD-Testversion DE3.69 zeigt die letzten fünf geöffneten Figuren in der Amiibo-Datenbank. [DE3.69 LCD (ZIP)](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_69_641_NUR_APP.zip) · [Web 3.46.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.46.0)

## Dateimanager 3.45.0 · LCD DE3.68 / 640 · 2026-11-09

Im Figurenkatalog kannst du ein Spiel auswählen und die passenden Figuren aus deiner Sammlung anzeigen. Unter Sicherung zeigt der Ordnervergleich auch die Dateien, die nur auf dem Gerät liegen. Die LCD-Testversion DE3.68 merkt sich beim Zurückkehren ins Hauptmenü die zuletzt geöffnete App. Im Dateimanager lässt sich jedem verbundenen Gerät ein eigener Name für diesen Browser geben. Beim Gerätewechsel erscheint der jeweils zugeordnete Name. [DE3.68 LCD (ZIP)](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_68_640_NUR_APP.zip) · [Web 3.45.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.45.0) · [Hardwarevarianten und Testmöglichkeiten](docs/ALLMIIBO_HARDWARE_OPTIONEN.md)

[Geräte-Firmware und Bootloader](docs/VERSIONEN_FIRMWARE.md) · [Alle dokumentierten Dateimanager-Versionen](docs/VERSIONEN_WEB.md)

[Online-Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Anleitung: Flashen, LittleFS und Bootloader](https://bluecyber81.github.io/pixl.js/guide/index.html) · [LCD-App DE3.65 für das Handy herunterladen](https://github.com/bluecyber81/pixl.js/releases/download/de3.65/Allmiibo_LCD_DE3_65_637_NUR_APP.zip) · [English](README.md)

**Dateimanager 3.44.0** · 8. November 2026. Beim Öffnen wählt der Dateimanager die erste unterstützte Sprache aus der Sprachliste des Browsers. Im Sprachmenü kannst du eine feste Sprache wählen oder wieder zur automatischen Auswahl wechseln.

- **3.48.0** · [Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.48.0/Allmiibo_Dateimanager_3_48_0_Quellcode.zip) · [Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.48.0/Allmiibo_DE3_71t1_Z19_Web3_48_0_ChatGPT_Pruefpaket.zip)
- **3.47.0** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.47.0/Allmiibo_Dateimanager_3_47_0_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.47.0/Allmiibo_DE3_70_Z19_Web3_47_0_ChatGPT_Pruefpaket.zip)
- **3.46.0** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.46.0/Allmiibo_Dateimanager_3_46_0_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.46.0/Allmiibo_DE3_69_Z19_Web3_46_0_ChatGPT_Pruefpaket.zip)
- **3.45.0** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.45.0/Allmiibo_Dateimanager_3_45_0_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.45.0/Allmiibo_DE3_68_Z19_Web3_45_0_ChatGPT_Pruefpaket.zip)
- **3.44.0** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.44.0/Allmiibo_Dateimanager_3_44_0_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.44.0/Allmiibo_DE3_67_Z19_Web3_44_0_ChatGPT_Pruefpaket.zip)
- **3.43.1** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.43.1/Allmiibo_Dateimanager_3_43_1_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.43.1/Allmiibo_DE3_67_Z19_Web3_43_1_ChatGPT_Pruefpaket.zip)
- **3.43.0** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.43.0/Allmiibo_Dateimanager_3_43_0_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.43.0/Allmiibo_DE3_67_Z19_Web3_43_0_ChatGPT_Pruefpaket.zip)
- **3.42.2** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.42.2/Allmiibo_Dateimanager_3_42_2_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.42.2/Allmiibo_DE3_66_Z19_Web3_42_2_ChatGPT_Pruefpaket.zip)
- **3.42.1** · [Web-Quellcode (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.42.1/Allmiibo_Dateimanager_3_42_1_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.42.1/Allmiibo_DE3_66_Z19_Web3_42_1_ChatGPT_Pruefpaket.zip)

**LCD-Testversion DE3.67 / 639.** Alle 54 unterschiedlichen Spielhinweise für 63 Spielzuordnungen lassen sich am Gerät auf Deutsch lesen. Lange Hinweise scrollen bis zum letzten Bildpunkt. Deutsche Spielhinweise und QR-Code wurden an einem LCD-Allmiibo mit DE3.67, Z19 und S112 7.3.0 bestätigt. [Praxistest](docs/RELEASE_DE3_67.md) · [Nachbau](docs/BUILD_DE3_67.md) · [Android-Download](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_67_639_NUR_APP.zip)

**Dateimanager 3.42.1.** Die sechs Arbeitsbereiche haben eigene Farbakzente. Auf dem Handy führen zwei bebilderte Schaltflächen direkt zum Figurenimport und zum Firmwareupdate. Bei verbundenem Allmiibo zeigt „Dein Gerät“ den geöffneten Ordner, die Zahl seiner Einträge und die Speicherbelegung. Der breite Balken am unteren Rand zeigt den belegten Anteil mit einem Verlauf von Petrol zu Indigo. Der Figurenimport öffnet sich jetzt auch beim ersten Klick, wenn der Browser die Ansicht noch lädt. Die Anleitung beschreibt zusätzlich Nordics PC-Weg für Bluetooth-DFU mit einem passenden Adapter.

Die Beispielansichten aus **3.42.1** zeigen eine simulierte Verbindung und simulierte Speicherwerte. [Handyansicht](docs/images/web-3.42.1/mobile.png) · [Desktopansicht](docs/images/web-3.42.1/desktop.png)

Beim Dateiabgleich zeigt die neue Fassung die betroffenen Namen und eine mögliche Korrektur an. Für alle 54 unterschiedlichen Spielhinweise mit englischem Ausgangstext gibt es eine deutsche Fassung. Bei Bluetooth-Updates kann die separate DFU-Seite den sichtbaren Handybildschirm während der Übertragung wach halten. Der Browser zeigt an, ob das Betriebssystem die Anfrage angenommen hat. [Web-Anleitung](web/README.md) · [Downloads, Quellen und Prüfpaket für 3.44.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.44.0)

Die Geräte-App **DE3.65 / 637** ist für das geprüfte LCD-Allmiibo mit Packed LittleFS PFS1 freigegeben. Bluetooth-Auslesung, Scrollbalken am Ende einer Notiz, Erkennung einer bekannten Figur an der Switch und Aufwachen per Mitteldruck sind am Gerät bestätigt. Der Dateimanager bietet dieselbe signierte App wie der Handy-Download. [Geräteprüfung](docs/validation/DE3_65_LCD_READBACK.json)

Unter **Amiibo-Datenbank → Figur öffnen → kurz Mitte → Notiz / Hinweise** erreicht der Scrollbalken bei dreizeiligen Notizen jetzt das Textende. Die kompaktere Katalogtabelle erhält alle 952 Figuren-IDs und 1.344 Zuordnungen und gewinnt gegenüber DE3.64 insgesamt 2.672 Byte Programmflash.

Für ein Gerät mit passendem Z19 und S112 reicht die oben verlinkte App-ZIP. In der Android-App **nRF Device Firmware Update** die ZIP so auswählen, wie sie heruntergeladen wurde. Im Web-Updater unter **Update** die mitgelieferte LCD-Anwendung wählen. Wer schon DE3.65 mit Z19 verwendet, kann direkt den neuen Dateimanager öffnen. Für alte SPIFFS-Geräte gilt die gesonderte Migrationsanleitung. [App-Release und Prüfnachweise](https://github.com/bluecyber81/pixl.js/releases/tag/de3.65) · [Migration](docs/MIGRATION_PFS1.md)

</details>

## Quellen und Mitarbeit

Die Geräteanwendung, der Z21-Bootloader mit seinen SDK-Anpassungen und der Dateimanager sind jeweils aus ihrem passenden Quellstand nachbaubar. Der Funkstack S112 7.3.0 stammt von Nordic. Im Speichervergleich waren bei 100 Modellimporten 48,0 % weniger Programmier- und 42,7 % weniger Löschvorgänge nötig. Der bestehende Mountcache sparte im 952-Figuren-Modell 431 physische Lesezugriffe. [Speichermessungen](docs/validation/DE3_65_SPEICHER.md) · [Z21-Quellen](bootloader-z21/) · [S112](softdevice-s112/) · [Mitmachen](CONTRIBUTING.md)

Community-Fortführung durch bluecyber81 auf Grundlage von [solosky](https://github.com/solosky/pixl.js) und [cylin577](https://github.com/cylin577/pixl.js). [Komponenten](docs/COMPONENTS.md) · [Entwicklungsgeschichte](docs/DEVELOPMENT_HISTORY.de.md) · [Lizenzen](THIRD_PARTY_NOTICES.md)
