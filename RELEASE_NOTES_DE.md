# DE3.37 — Allmiibo LCD mit Packed LittleFS

**Anwendung 2.22.0-DE3.37 / Zähler 609 · Dateimanager 3.27.0**

Community-Veröffentlichung auf Grundlage von cylin577/pixl.js, ursprünglich solosky/pixl.js. Kein offizielles Upstream-Update.

**Vor dem Flashen:** Dieses Anwendungspaket ist für passende LCD-Geräte vorgesehen, die bereits unser **Packed LittleFS (PFS1)** verwenden. Von DE3.16/SPIFFS oder dem normalen Upstream-LittleFS ist es kein direktes, datenbewahrendes Update. Zuerst [Speicherlayout und Migrationsweg prüfen](https://github.com/bluecyber81/pixl.js/blob/de3.37/docs/MIGRATION_PFS1.md). Ein bestehendes PFS1-Gerät muss für DE3.37 nicht erneut formatiert werden.

## Die wichtigsten Änderungen

- Ein fehlgeschlagener NFC-Speichervorgang behält die Änderung im RAM. App-/Figurenwechsel und Schlafen dürfen sie nicht still verwerfen. Der Fehlerdialog ermöglicht erneutes Speichern oder getrennt bestätigtes Verwerfen mit vorausgewähltem Nein. Die bisher gespeicherte Datei bleibt bei bewusstem Verwerfen bestehen. Ungesicherter RAM ist weiterhin nicht stromausfallsicher.
- AmiLoop meldet eine abgewiesene Tagübernahme nicht mehr als Erfolg.
- Der Dateimanager schützt zwischenzeitlich geänderte Ordnernotizen und Schreibschutz beim ZIP-Import.
- Die lokale Wiederherstellungsablage öffnet nach einer browserseitigen Schließung bei der nächsten Aktion erneut. Fehlende/unpassende Belege werden verständlicher gemeldet.
- Unbekannte Speicherfähigkeiten lösen keine falsche Empfehlung zur SPIFFS-Vorbereitungsfirmware auf einem bereits umgestellten Gerät aus.
- Absichtliches Trennen im Leerlauf erscheint als Information; echte Verbindungsfehler bleiben Fehlermeldungen. Nicht unterstützte optionale Diagnoseabfragen erzeugen keinen falschen Gerätefehler.

Die früheren Verbesserungen für Darstellung, QR-Seiten, Bluetooth/MTU23, große Listen, RAM-Nutzung, PFS1 und gezielte LittleFS-Korrekturen sind enthalten. [Kumulative Änderungen](https://github.com/bluecyber81/pixl.js/blob/de3.37/CHANGELOG_DE3_SERIES.md).

## Dateien

- **Flashen:** `Allmiibo_LCD_DE3_37_609.zip` unverändert im Secure-DFU-Programm auswählen.
- **Dateimanager:** `Allmiibo_Dateimanager_3_27_0_PUBLIC.zip` am PC entpacken und `Start-Dateimanager.cmd` starten.
- **Quellen:** `Allmiibo_DE3_37_Quellcode_PUBLIC.zip`.
- **Alles zusammen:** `Allmiibo_DE3_37_Gesamtpaket_PUBLIC.zip` entpacken; die äußere ZIP ist nicht flashbar.
- **Optionaler Bootloader:** `BL6_CODE_ZAEHLER7_BOOTLOADER_ONLY.zip`, gespeicherter Zähler 7. [Kompatibilitätsanleitung und Quellen](https://github.com/bluecyber81/pixl.js/blob/de3.37/bootloader-bl6/README.md). Bei vorhandenem BL6 nicht erneut nötig. Für dieses Paket einen Nordic-Secure-DFU-Client verwenden; der integrierte Browser-Flasher ist für Anwendungen. Nach einem Bootloader-Update kann eine erneute Anwendungsinstallation erforderlich sein.
- Prüfsummen: `SHA256SUMS.txt`.

Die Anwendungs-OTA ersetzt **weder Bootloader noch SoftDevice**. Sie enthält keine Figurensammlung, privaten Sicherungen oder Signierschlüssel. BL6/S112 sind getrennte Komponenten und kein notwendiges erneutes Update für ein bereits passendes Gerät. Keine Freigabe für beliebige OLED-/LCD-Platinen allein anhand des Namens Allmiibo.

Ein SoftDevice-Binärpaket ist nicht enthalten.

## Prüfstand

Die öffentliche Quelle wurde frisch neu gebaut: Anwendungs-BIN und separat der vollständige 28-KiB-BL6-Bereich sind bytegleich mit den zugeordneten Release-Binärdaten.

102 Firmware-Hostprüfreihen, fünf gezielte ASan/UBSan-Prüfreihen, ARM-Build, Quellbindung, Speichergrenzen und OTA-Signatur bestanden. Dateimanager: 659 Tests und 7 Tests des gebauten Workers/WASM bestanden. BL6-DFU-Abschluss, Einstieg und Transport wurden zusätzlich im Host geprüft.

Der Besitzer bestätigte am **26.10.2026**, dass DE3.37 geflasht wurde und die ausprobierten Funktionen laufen. Das ist kein vollständiger neuer instrumentierter Hardware-/NFC-/MTU23- oder Fehlerfalltest. Keine Zusicherung vollständiger Fehlerfreiheit. Anwendungs-BIN 358.880 Byte, Flashreserve 13.856 Byte, Anwendungsheap weiterhin 18.432 Byte.

Der geerbte Upstream-DFU-Schlüssel ist öffentlich bekannt; die Signatur ist kein Nachweis einer geheimen Herausgeberidentität. Quellen, Bauanleitung, Prüfsummen und Lizenzen ermöglichen die Zuordnung der veröffentlichten Dateien.
