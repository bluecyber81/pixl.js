# Downloads für Firmware, Bootloader und Nordic S112

## Aktuelle Downloads

| Gesucht | Download |
| --- | --- |
| Stabile Geräte-App für ein kompatibles LCD mit eingerichtetem PFS1, Z19 und S112 7.3.0 | [DE3.75 / App648 – App-ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_LCD_DE3_75_648_NUR_APP.zip) |
| Android-Testversion für ein LCD mit PFS1 und Z19 | [Kombi mit S112 7.3.0, Z20 und DE3.80 / App653](https://github.com/bluecyber81/pixl.js/releases/download/de3.80/Allmiibo_LCD_S112_7_3_0_Z20_DE3_80_653_KOMPLETT.zip). ZIP in der Android-App auswählen und beide Phasen abschließen lassen. |
| DE3.80 auf kompatiblem LCD mit Z19 oder Z20, S112 7.3.0 und PFS1 | [Nur App653](https://github.com/bluecyber81/pixl.js/releases/download/de3.80/Allmiibo_LCD_DE3_80_653_NUR_APP.zip) |
| Flash-Kennung auf einem LCD mit PFS1, Z19 und S112 7.3.0 auslesen | [DE3.79 / App652 – signierte App-ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.79/Allmiibo_LCD_DE3_79_652_NUR_APP.zip). Die Geräte-App liefert die beim Einrichten des Speichers gelesene JEDEC-Kennung. [Prüfstand](validation/DE3_79.json) |
| Neue Akkuanzeige auf einem LCD mit PFS1, Z19 und S112 7.3.0 | [DE3.77 / App650 – signierte App-ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.77/Allmiibo_LCD_DE3_77_650_NUR_APP.zip). Größere Ziffern, acht Akkusegmente und Ladeblitz. [Prüfstand](validation/DE3_77.json) |
| Neue LCD-Funktionen auf einem Gerät mit PFS1, Z19 und S112 7.3.0 erproben | [DE3.76 / App649 – signierte App-ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.76/Allmiibo_LCD_DE3_76_649_NUR_APP.zip). Die Gerätedatenbank enthält die Figuren „Junger Link“ und „Junge Zelda“. Alle sieben Kirby-Air-Riders-Figuren haben ein LCD-Bild. [Prüfstand](validation/WEB3_54_0.json) |
| Dateimanager für Windows oder dessen Quellcode | [Dateimanager 3.55.1](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.1) |
| Kompatibles LCD mit älterem Bootloader und erfüllten [Systemvoraussetzungen](INSTALLATION.md) | [Android-Kombipaket für S112 7.3.0, Z19 und DE3.75 / App648](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_LCD_S112_7_3_0_Z19_DE3_75_648_KOMPLETT.zip) |
| Systempaket für ein kompatibles LCD mit älterem Bootloader oder Umstellung von SPIFFS | [Voraussetzungen und Paketauswahl](https://bluecyber81.github.io/pixl.js/guide/index.html#bootloader) · [Vorbereitung und Wiederherstellung](https://bluecyber81.github.io/pixl.js/guide/index.html#littlefs) |
| Geräteprüfung zu DE3.75 / App648 | [Prüfumfang und Prüfsummen](RELEASE_DE3_75.md) |
| Gesamtübergabe für ChatGPT oder eigene Prüfung | [Prüfpaket für App648, Z19 und Dateimanager 3.52.1](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_DE3_75_App648_Z19_Web3_52_1_ChatGPT_Pruefpaket.zip) |

## Archiv · DE3.72 / App645 and file manager 3.48.1

The LCD test application restores the selected data slot and the figure last viewed in the detail screen. Four English and German game notes for Mipha and Urbosa have been corrected. File manager 3.48.1 adds App645 to the local capacity check. [Changes and validation](https://github.com/bluecyber81/pixl.js/releases/tag/de3.72) · [Open the file manager](https://bluecyber81.github.io/pixl.js/)

| Starting point on the LCD device | Download |
| --- | --- |
| Packed LittleFS is set up and Z19 and Nordic S112 7.3.0 are installed | [DE3.72 application only](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_DE3_72_645_NUR_APP.zip) |
| Compatible nRF52832 LCD, matching flash layout and working Secure DFU with the matching key. Bootloader counter below 19 and S112 FWID 0x0103 or 0x0126 | [Full S112 7.3.0, Z19 and DE3.72 package](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_S112_7_3_0_Z19_DE3_72_645_KOMPLETT.zip). Complete both stages with **nRF Device Firmware Update** on Android. |
| Older SPIFFS device to be migrated | [DE3.30-PREP / 600 preparation application](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_SPIFFS_DE3_30_PREP_600.zip). Back up existing files. Before switching the system, verify the complete Raw128 backup against the source device and run the local capacity check. [LittleFS migration guide](https://bluecyber81.github.io/pixl.js/guide/en.html#littlefs) |

The guide lists board and counter requirements. Initializing LittleFS erases the old E: drive. Restore the verified backup and complete the final comparison against the device. [Installation guide](https://bluecyber81.github.io/pixl.js/guide/en.html) · [Windows, sources and ChatGPT review kit](https://github.com/bluecyber81/pixl.js/releases/tag/web3.48.1)

## Archiv · Komponentenstand vom 9. November 2026

| Gesucht | Paket oder Quelle |
| --- | --- |
| Firmware für ein bereits passendes LCD-Allmiibo mit PFS1, Z19 und S112 7.3.0 | [DE3.65 / 637, gerätegeprüft](https://github.com/bluecyber81/pixl.js/releases/tag/de3.65). Die ZIP aktualisiert die Anwendung. |
| Damalige LCD-Testversion für die Rückkehr zur Figur | [DE3.71t1 / 644, Testversion](https://github.com/bluecyber81/pixl.js/releases/tag/de3.71t1) mit verbesserter Rückkehr und Schlafmodus. [Signierte App-ZIP](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_DE3_71t1_App644_NUR_APP_SIGNIERT.zip). |
| Frühere LCD-Testversion DE3.67 / 639 | [Archivierte App-ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.67/Allmiibo_LCD_DE3_67_639_NUR_APP.zip) · [Versionshinweise und Geräteprüfung](RELEASE_DE3_67.md). |
| Dateimanager oder Prüfpaket für die Entwicklung | [Web 3.48.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.48.0) enthält die portable Version, den Webquellcode und ein separates Prüfarchiv mit App- und Bootloader-Artefakten. |
| Z19 nachbauen oder den DFU-Wiederanlauf prüfen | [Z19-Quellen, Bauanleitung und Tests](../bootloader-z19/README.md). Die Diagnose kann den eingebauten Stand über den Zähler und die Prüfsumme des Bootbereichs zuordnen. |
| Nordic S112 7.3.0 | [Referenzdistribution und Lizenz](../softdevice-s112/README.md). Das Nordic-Archiv enthält die HEX-Datei, die Programmierschnittstelle und die Herstellerhinweise. |

Für ein Gerät mit SPIFFS oder anderem Speicherlayout gilt die [Migrationsanleitung](MIGRATION_PFS1.md). Für die Wahl zwischen den App-Paketen siehe [Installation](INSTALLATION.md).

## Historisches Komponentenrelease BL8 und S112 7.3.0

[GitHub-Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/bl8-s112-7.3.0) · [Unsere Änderungen](BOOTLOADER_SOFTDEVICE_CHANGES.md) · [Gesamte Softwarehistorie](DEVELOPMENT_HISTORY.de.md)

Die bereits geprüften Komponenten sind öffentlich verfügbar. Diese Veröffentlichung ändert keine Firmwaredatei und erzeugt weder einen neuen Signierschlüssel noch einen neuen Versionszähler.

| Datei | Inhalt / Zweck | Installation |
| --- | --- | --- |
| `BL8_CODE_ZAEHLER9_BOOTLOADER_ONLY_TESTSTAND.zip` | Unverändertes signiertes BL8-OTA, 28.136 Byte Bootloadercode | Nur passend qualifizierte LCD-Platine, kompatibler Schlüssel/SoftDevice und bisheriger Bootloaderzähler **kleiner als 9**. Kein Update für bereits installierte Zähler 9 oder 11. |
| `s112_nrf52_7.3.0.zip` | Nordic-Original mit SoftDevice-HEX, API, Release Notes und Lizenz | Herstellerarchiv zur Referenz. Ein Systemupdate benötigt ein für das konkrete Gerät geeignetes Secure-DFU-Paket. |
| `Allmiibo_BL8_Quellen_und_Nachweise.zip` | Passender BL8-Quellcode, SDK-Korrekturen, öffentlicher Prüfschlüssel, Bauanleitung und Nachweise | Für Entwickler; der Build erzeugt unsignierte Artefakte und flasht nichts. |
| `Allmiibo_BL8_S112_7_3_0_Komponentenpaket.zip` | Die drei Dateien zusammen mit Hinweisen, Lizenzen, Änderungsübersicht und Prüfsummen | Download-/Referenzarchiv; **das äußere Archiv nicht flashen**. |
| `SHA256SUMS.txt` | SHA-256 aller Release-Dateien | Downloads vor Weitergabe vergleichen. |

## Wichtige Unterschiede

**BL8 ist die Codeversion.** Zähler 9 und 11 sind signierte Paket-/Updatezähler; sie enthalten in den geprüften Paketen denselben BL8-Code. Das hier veröffentlichte eigenständige Paket hat Zähler 9. Der Zähler darf nicht umgangen oder zurückgesetzt werden, um es auf ein neueres Gerät zu zwingen.

Die Bootloader-ZIP enthält **weder Anwendung noch SoftDevice noch eine Sammlung**. Nach einem passenden Bootloaderupdate kann die Wiederinstallation der kompatiblen Anwendung erforderlich sein. Ein vorhandenes SPIFFS wird dadurch nicht in PFS1 umgestellt. Die integrierte Browser-DFU-Seite unterstützt ihren Anwendungspfad; für getrennte Systemkomponenten ist ein entsprechend geeigneter Nordic-Secure-DFU-Client erforderlich.

Eine ältere DE3.8-Anzeige oder der Produktname Allmiibo alleine bestätigt nicht Platine, Schlüssel, Bootloaderzähler und Speicherlayout. Diese Komponentenveröffentlichung gibt deshalb nicht jedes ältere Gerät pauschal zum Flashen frei. Das vorbereitete gerätespezifische Z11-Mischpaket ist kein allgemeines Release-Asset.

## Herkunft und Nachweise

BL8 ist unsere Weiterentwicklung der Pixl.js-/Nordic-Bootloaderbasis. [Hier stehen die konkreten behobenen Fehler](BOOTLOADER_SOFTDEVICE_CHANGES.md). Die veröffentlichten Quellen reproduzieren den geprüften Bootloaderbereich bytegenau; Originalpaket und Signatur wurden geprüft. Der öffentlich bekannte geerbte Schlüssel beweist Paketkompatibilität, keine exklusive Herausgeberidentität.

S112 ist das unveränderte Nordic-Original. Unsere Arbeit umfasst Integration, SDK-Workaround, Diagnose und Prüfungen. Die vollständigen Nordic-Bedingungen bleiben im Originalarchiv und im Komponentenpaket enthalten; sie sind zusätzlich unter [softdevice-s112](../softdevice-s112/README.md) dokumentiert.

## English

These are **separate component/reference downloads**, not a universal system updater. The unchanged signed BL8-only package uses counter **9** and cannot upgrade devices already at 9/11. The original Nordic S112 ZIP contains vendor HEX/API/release notes/license and is **not a Secure DFU package**. BL8 source and SDK changes are published with reproducible-build evidence. The outer bundle is not flashable. Hardware, installed key/counters, SoftDevice transition and storage migration require individual qualification. No fresh signing, format, flash or device operation is performed by this publication.
