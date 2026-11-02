# Allmiibo LCD — DE3-Firmware und Dateimanager

[English](README.md) · [DE3.37 herunterladen](https://github.com/bluecyber81/pixl.js/releases/tag/de3.37) · [Änderungen](CHANGELOG_DE3_SERIES.md) · [Bauanleitung](docs/BUILD_DE3_37.md)

Firmware-Quellstand unter `fw/`: **2.22.0-DE3.37**, Anwendungszähler **609**. Der aktuelle Browser-Dateimanager unter `web/` ist **3.32.5**; die nachfolgende Firmwarebeschreibung dokumentiert weiterhin die Veröffentlichung DE3.37. Dieser Community-Fork verbindet die Grundlage von [cylin577/pixl.js](https://github.com/cylin577/pixl.js) mit den DE-Verbesserungen und einer eigenen Packed-LittleFS-Speicherung. Das ursprüngliche Projekt stammt von [solosky/pixl.js](https://github.com/solosky/pixl.js). Dies ist keine offizielle Veröffentlichung der beiden Upstream-Projekte.

**Das DE3.37-Anwendungspaket ist für passende LCD-Geräte bestimmt, die bereits unser Packed LittleFS (PFS1) verwenden.** Geräte mit SPIFFS, beispielsweise der bisher öffentlich angebotenen DE3.16, benötigen zuvor eine getrennte Sicherung und Umstellung. Auch das gewöhnliche LittleFS des Upstream-Projekts hat ein anderes Datenlayout. Das Flashen allein konvertiert oder restauriert diese Dateisysteme nicht. Dafür gilt die [Speicheranleitung](docs/MIGRATION_PFS1.md).

## Online-Dateimanager 3.32.5

**[Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [DFU-Seite](https://bluecyber81.github.io/pixl.js/dfu/web.html) · [Portable Pakete und zugehörige Quellen](https://github.com/bluecyber81/pixl.js/releases/tag/web3.32.5)**

Die Webseite funktioniert ohne laufenden PC-Server. Chrome auf Android oder einem
unterstützten PC verbindet sich direkt mit dem Allmiibo in Bluetooth-Reichweite.
Figurendateien und Sicherungen werden nicht auf GitHub hochgeladen. Hinweise zur
Nutzung, Aktualisierung, Speicherung und zu den Grenzen stehen in der
[Web-Anleitung](docs/DATEIMANAGER_WEB.md).

Der Dateimanager bietet optional **DE3.55 / 627** für das passende LCD-Gerät mit
**Packed LittleFS (PFS1), BL8 und S112 7.3.0** an. Es handelt sich um ein reines
Anwendungsupdate; der Dateimanager selbst benötigt kein Firmware-Update.
Die exakten DE3.55-Quellen liegen als separates Archiv bei der verlinkten
Web-Veröffentlichung. Der ältere `fw/`-Baum unten ist **nicht** dessen Quellstand.

## Welche Datei brauche ich?

| Datei | Verwendung |
| --- | --- |
| `Allmiibo_LCD_DE3_37_609.zip` | Flashbare Anwendung für das passende LCD/PFS1-Gerät. Im Secure-DFU-Programm unverändert auswählen. |
| `Allmiibo_Dateimanager_3_27_0_PUBLIC.zip` | Fertiger Dateimanager samt Quellen und Hinweisen. Auf dem PC entpacken, nicht flashen. |
| `Allmiibo_DE3_37_Quellcode_PUBLIC.zip` | Öffentlicher Quellcode, Bauanleitung und Regressionstests. |
| `Allmiibo_DE3_37_Gesamtpaket_PUBLIC.zip` | Alle getrennten Pakete und Anleitungen zusammen. Die äußere ZIP ist **kein** flashbares Firmwarepaket. |
| `BL6_CODE_ZAEHLER7_BOOTLOADER_ONLY.zip` | Optionales Bootloader-OTA für fortgeschrittene Anwender, gespeicherter Zähler 7. Vorher die getrennte Kompatibilitätsanleitung lesen. |
| `SHA256SUMS.txt` | Prüfsummen der veröffentlichten Dateien. |

Beim bereits umgestellten passenden Gerät genügt das Anwendungsupdate: aktuelle Dateien sichern, Dateiverbindung trennen, DFU öffnen und `Allmiibo_LCD_DE3_37_609.zip` übertragen. Danach normales Menü, DE3.37, Ordner, Mitteltaste/Aufwachen und eine bekannte Figur prüfen. **Nicht erneut formatieren.**

Dieses OTA ersetzt weder Bootloader noch SoftDevice und installiert auch keinen PC-Bluetooth-Treiber. BL6 und S112 7.3.0 sind eigenständige Bestandteile der getesteten Konfiguration. Figurendateien und `key_retail.bin` sind ebenfalls getrennt und nicht enthalten. Die Paketangaben HW52 und SoftDevice `0x0103`/`0x0126` sind technische Voraussetzungen, kein universeller Kompatibilitätsnachweis für jedes Allmiibo.

BL6 liegt separat mit [passenden Quellen, Tests und Kompatibilitätsanleitung](bootloader-bl6/README.md) vor. Bei bereits installiertem BL6 ist kein erneutes Flashen nötig. Der integrierte Browser-Flasher nimmt Anwendungspakete an; für das optionale Bootloader-Paket einen passenden Nordic-Secure-DFU-Client wie die Android-App nRF Device Firmware Update verwenden. Ein Bootloader-Update kann die Anwendung ungültig machen; das passende Anwendungs-OTA muss deshalb verfügbar sein. Ein SoftDevice-Binärpaket ist in dieser Veröffentlichung nicht enthalten.

## Neu und verbessert

- **DE3.37 / NFC-Speicherfehler:** Kann eine von der Konsole geänderte Figur nicht gespeichert werden, bleibt die Änderung im RAM. Figuren-/Appwechsel und Einschlafen dürfen sie nicht still verwerfen. Ein Dialog ohne zusätzliche Heap-Zuteilung bietet erneutes Speichern oder bewusstes Verwerfen an. Die getrennte Bestätigung steht zunächst auf **Nein**. Verwerfen lässt die bisher gespeicherte Datei unverändert; ungesicherter RAM übersteht keinen Stromausfall oder erzwungenen Neustart.
- **AmiLoop:** Eine abgelehnte Tagübernahme wird nicht mehr fälschlich als erfolgreich bestätigt.
- **ZIP-Import:** Zwischenzeitlich geänderte Ordnernotizen und Schreibschutz bleiben erhalten; der Import meldet den Konflikt.
- **Wiederherstellung:** Eine vom Browser geschlossene lokale Datenbank kann bei der nächsten Aktion wieder geöffnet werden. Fehlende Speicherangaben führen zu passender Diagnose statt zur falschen Aufforderung, eine alte SPIFFS-Vorbereitung auf ein bereits umgestelltes Gerät zu flashen.
- **Bedienung:** Verständlichere Fehlertexte, klare Trennungsmeldungen und Komponentenvergleich mit DE3.37/609, BL6 und S112 7.3.0. Dieser Vergleich nutzt einen lokalen Sollstand, keinen automatischen Internet-Updatedienst.

Die bisherigen Verbesserungen bleiben enthalten: deutsche/englische Oberfläche, langsamer Lauftext, stehende QR-Informationen, Suche/Favoriten, begrenzte Listen für größere Sammlungen, ausgehandelte MTU23-Dateiübertragung, getrennte Bluetooth-/Clientzustände, Diagnoseansichten und geprüfte Speicheroperationen. Packed LittleFS bündelt kleine Dateien samt 128 Metadatenbytes; spätere Optimierungen verwenden geprüfte Indizes wieder, sparen wiederholte Lesezugriffe und geben unbenutzte Listencaches frei. Zwei nachgestellte LittleFS-Lese-/Cachefehler wurden gezielt korrigiert. Mehr physischer RAM oder eine feste Geschwindigkeitssteigerung werden dadurch nicht zugesagt. Die [Änderungsübersicht](CHANGELOG_DE3_SERIES.md) beschreibt die Bereiche und Grenzen.

## Dateimanager starten

ZIP vollständig entpacken und `Start-Dateimanager.cmd` starten. Das fertige Paket verwendet einen lokalen Python-Server; Node.js wird nur zum Neubauen benötigt. `Start_8768.cmd` verwendet Port 8768. Auf demselben PC in einem Web-Bluetooth-fähigen Browser wie Chrome `http://127.0.0.1:8768/` öffnen, am Allmiibo die Bluetooth-Dateiübertragung öffnen und verbinden.

Die Bereiche **Dateien**, **Sicherung & Wiederherstellung** und **Gerät aktualisieren** führen zu den passenden Funktionen. Die Geräteübersicht zeigt aufklappbare Angaben zu Speicher, Heap, Bluetooth und Bootloader/SoftDevice. Sicherungen bleiben lokal. Eine unterbrochene Wiederherstellung lässt sich mit derselben ZIP fortsetzen; der vollständige Vergleich von Inhalt und Raw128-Metadaten erfolgt einmal beim Abschluss. Ein gestoppter Download gilt nicht als gespeicherte Sicherung. Für Diagnose-JSON stehen auch Vorschau und Kopieren bereit.

`127.0.0.1` meint immer das Gerät, auf dem der Browser läuft. Ein VPN verlängert die Bluetooth-Reichweite nicht. Browserunterstützung, sichere Webadresse und Netzwerkzugriff müssen zum verwendeten Gerät passen.

## Prüfung und Grenzen

Getestete Hardware: Allmiibo mit **128×64-Monochrom-LCD**, Rädchen/Mitteltaste, USB-C und **nRF52832 mit 512 KiB internem Flash und 64 KiB RAM**. Das Buildziel LCD deckt nicht automatisch alle Platinenrevisionen und keine beliebige OLED-Variante ab. DE3.37 verändert weder Pinbelegung noch Speicherpartitionen.

Die öffentliche Anwendungsquelle wurde frisch neu gebaut: Das Ergebnis ist bytegleich mit dem Anwendungs-BIN des signierten DE3.37-OTA. Auch die separate öffentliche BL6-Quelle reproduziert den mit Füllbytes auf 28 KiB ergänzten Bootloader-Bereich.

**102 Firmware-Hostprüfreihen**, fünf gezielte ASan/UBSan-Prüfreihen, ARM-Build, Speichergrenzen, Quellbindung und OTA-Signatur wurden geprüft. Beim Dateimanager bestanden **659 Tests plus 7 Tests des gebauten Workers/WASM**. BL6-DFU-Abschluss, Einstieg und Transport wurden erneut im Host geprüft.

Am **26.10.2026** bestätigte der Gerätebesitzer das Flashen von DE3.37 und funktionierende Bedienung. Das ist eine Rückmeldung zu den ausprobierten Funktionen, kein frisch instrumentierter vollständiger NFC-/Bluetooth-/MTU23-Test und kein absichtlich am Gerät ausgelöster Speicherfehler.

Die Anwendung belegt 358.880 Byte; im bestehenden Anwendungs-Flashbereich bleiben 13.856 Byte Reserve. Der Anwendungsheap bleibt 18.432 Byte. Heap, gesamter Chip-RAM und externer Figurenspeicher sind unterschiedliche Größen. Statische Stackpfade ersetzen keine physische Messung. Die Tests garantieren nicht alle Ereignisfolgen, Platinen, Stromausfälle oder vollständige Fehlerfreiheit.

Der geerbte Upstream-DFU-Schlüssel ist öffentlich bekannt. Die Signatur prüft Paket-/Schlüsselkompatibilität und bestätigt keine geheime Herausgeberidentität. Die veröffentlichten SHA-256-Prüfsummen identifizieren die angebotenen Dateien.

## Quellen und Lizenzen

Die Anwendung liegt unter `fw/`, der Dateimanager unter `web/`. Die [Bauanleitung](docs/BUILD_DE3_37.md) verwendet ein festgelegtes SDK-Image samt dokumentiertem Header-Override und baut ausschließlich die Anwendung. Der gewöhnliche Upstream-Aufruf `make all` ist nicht der Veröffentlichungsweg für diesen Stand.

Danke an solosky, cylin577 und die Mitwirkenden der Komponenten. Die ursprüngliche [GPL-2-Lizenzdatei](LICENSE) und die jeweiligen Drittanbieterhinweise bleiben erhalten: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), `LICENSES/`. Es werden keine Komponenten neu lizenziert. Private Sicherungen, Geräteberichte, Zugangsdaten, private Signierschlüssel und Figurendumps gehören nicht zu den öffentlichen Paketen. Katalogeinträge mit Namen und IDs ersetzen keine gültige Tagdatei und garantieren keine Unterstützung durch jedes Spiel.
