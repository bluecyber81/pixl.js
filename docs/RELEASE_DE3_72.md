# Allmiibo LCD

## DE3.72 / App645 und Dateimanager 3.48.1

Die LCD-Testanwendung merkt sich bei der Rückkehr den gewählten Datenplatz und die im Detail zuletzt angezeigte Figur. Vier deutsche und englische Spielhinweise zu Mipha und Urbosa wurden korrigiert. Im Dateimanager ist App645 jetzt auch für die lokale Platzprüfung auswählbar. [Änderungen und Prüfnachweise](https://github.com/bluecyber81/pixl.js/releases/tag/de3.72) · [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/)

| Ausgangslage beim LCD-Allmiibo | Passender Download |
| --- | --- |
| Packed LittleFS ist eingerichtet, Z19 und Nordic S112 7.3.0 sind vorhanden | [Nur die neue Gerätesoftware DE3.72](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_DE3_72_645_NUR_APP.zip) |
| Passendes nRF52832-LCD mit bekanntem Flashlayout und funktionierendem, signaturkompatiblem Secure DFU. Bootloaderzähler unter 19, S112-FWID 0x0103 oder 0x0126 | [Komplettpaket mit S112 7.3.0, Z19 und DE3.72](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_S112_7_3_0_Z19_DE3_72_645_KOMPLETT.zip). Am Android-Handy mit **nRF Device Firmware Update** beide Phasen abschließen. |
| Altes SPIFFS-Laufwerk steht vor der Umstellung | [Vorbereitungsfirmware DE3.30-PREP / 600](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_SPIFFS_DE3_30_PREP_600.zip). Zuerst die Originaldateien sichern. Vor dem Systemwechsel die vollständige Raw128-Sicherung frisch vergleichen und die Platzprüfung bestehen. [Schritt für Schritt zu LittleFS](https://bluecyber81.github.io/pixl.js/guide/#littlefs) |

Die Anleitung nennt die Geräte- und Zählervoraussetzungen. Die Einrichtung von LittleFS löscht das alte Laufwerk E:. Anschließend die bestätigte Sicherung wiederherstellen und vollständig am Ziel vergleichen. [Alle Installationswege](https://bluecyber81.github.io/pixl.js/guide/) · [Windows, Quellen und ChatGPT-Prüfpaket](https://github.com/bluecyber81/pixl.js/releases/tag/web3.48.1)

## Firmware nachbauen

Vom Quellstand `de3.72` mit dem im Projekt festgelegten Nordic SDK und ARM-Compiler `python tools/build_lcd.py --mode release --stack-report` ausführen. Die ELF-, MAP-, HEX- und BIN-Dateien liegen in `build/lcd-de372/`. `python tools/check_release_ota.py` prüft die signierte Anwendung. Mit `python tools/verify_lcd_combo.py --combo PFAD_ZUR_KOMPLETT_ZIP` lassen sich die beiden Phasen des Komplettpakets prüfen.

## Was geprüft wurde

Die signierte Anwendung hat 363.340 Byte. Zwei ARM-Builds erzeugten dieselben BIN- und HEX-Dateien. Der SHA-256-Wert der Anwendungs-BIN ist `000651a423e35821e529815a87930137f2d56277941b1b900fccb699d51ecb88`. Die Bootloader-Systemphase und die App-Phase haben jeweils eine eigene signierte Nordic-Init-Datei. Das Komplettpaket und die App-ZIP liefern dieselben Anwendungsbytes.

Für die vier geänderten Spielzuordnungen wurden die bisherigen und die neuen Katalogdaten nach Figuren- und Spiel-ID verglichen. Die übrigen 1.340 Einträge behielten ihre vorhandenen Hinweise. Die Bildschirmprüfungen liefen mit der Produktionsschrift. Der Platzsimulator passt zum Speicherformat PFS1 und zu den sechs geprüften Quelldateien der Speicherimplementierung.

Für diesen Stand sind die Tests von DE3.72 am physischen LCD und eine komplette zweistufige Bluetooth-Übertragung auf einem Altgerät noch offen. Die früheren Bestätigungen zu App644 stehen im historischen Bericht.

[Firmware-Prüfdaten](validation/DE3_72.json) · [Komplettpaket](validation/DE3_72_COMBO.json) · [Speicherprofil](validation/DE3_72_PFS.json) · [Vorbereitungsfirmware](validation/DE3_30_PREP_600.json) · [Dateimanager](validation/WEB3_48_1.json) · [Bestätigte App644-Geräteprüfung](RELEASE_DE3_71T1.md)
