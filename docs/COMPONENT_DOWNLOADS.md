# Downloads für Firmware, Bootloader und Nordic S112

| Gesucht | Paket oder Quelle |
| --- | --- |
| Firmware für ein bereits passendes LCD-Allmiibo mit PFS1, Z19 und S112 7.3.0 | [DE3.65 / 637, gerätegeprüft](https://github.com/bluecyber81/pixl.js/releases/tag/de3.65). Die ZIP aktualisiert die Anwendung. |
| Neue LCD-Funktionen erproben | [DE3.67 / 639, Testversion](https://github.com/bluecyber81/pixl.js/releases/tag/de3.67) für die deutschen Spielhinweise. [App-ZIP fürs Handy](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_67_639_NUR_APP.zip). |
| Dateimanager oder Prüfpaket für die Entwicklung | [Web 3.43.1](https://github.com/bluecyber81/pixl.js/releases/tag/web3.43.1) enthält die portable Version, den Webquellcode und ein separates Prüfarchiv mit App- und Bootloader-Artefakten. |
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
