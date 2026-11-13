# Allmiibo LCD – Firmware und Dateimanager

## DE3.72 / App645 und Dateimanager 3.48.1

Die LCD-Testanwendung merkt sich bei der Rückkehr den gewählten Datenplatz und die im Detail zuletzt angezeigte Figur. Vier deutsche und englische Spielhinweise zu Mipha und Urbosa wurden korrigiert. Im Dateimanager ist App645 jetzt auch für die lokale Platzprüfung auswählbar. [Änderungen und Prüfnachweise](https://github.com/bluecyber81/pixl.js/releases/tag/de3.72) · [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/)

| Ausgangslage beim LCD-Allmiibo | Passender Download |
| --- | --- |
| Packed LittleFS ist eingerichtet, Z19 und Nordic S112 7.3.0 sind vorhanden | [Nur die neue Gerätesoftware DE3.72](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_DE3_72_645_NUR_APP.zip) |
| Passendes nRF52832-LCD mit bekanntem Flashlayout und funktionierendem, signaturkompatiblem Secure DFU. Bootloaderzähler unter 19, S112-FWID 0x0103 oder 0x0126 | [Komplettpaket mit S112 7.3.0, Z19 und DE3.72](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_S112_7_3_0_Z19_DE3_72_645_KOMPLETT.zip). Am Android-Handy mit **nRF Device Firmware Update** beide Phasen abschließen. |
| Altes SPIFFS-Laufwerk steht vor der Umstellung | [Vorbereitungsfirmware DE3.30-PREP / 600](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_SPIFFS_DE3_30_PREP_600.zip). Zuerst die Originaldateien sichern. Vor dem Systemwechsel die vollständige Raw128-Sicherung frisch vergleichen und die Platzprüfung bestehen. [Schritt für Schritt zu LittleFS](https://bluecyber81.github.io/pixl.js/guide/#littlefs) |

Die Anleitung nennt die Geräte- und Zählervoraussetzungen. Die Einrichtung von LittleFS löscht das alte Laufwerk E:. Anschließend die bestätigte Sicherung wiederherstellen und vollständig am Ziel vergleichen. [Alle Installationswege](https://bluecyber81.github.io/pixl.js/guide/) · [Windows, Quellen und ChatGPT-Prüfpaket](https://github.com/bluecyber81/pixl.js/releases/tag/web3.48.1)

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

- **3.48.0** · [Quellcode (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.48.0/Allmiibo_Dateimanager_3_48_0_Quellcode.zip) · [Prüfpaket (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.48.0/Allmiibo_DE3_71t1_Z19_Web3_48_0_ChatGPT_Pruefpaket.zip)
- **3.47.0** · [Web-Quellcode (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.47.0/Allmiibo_Dateimanager_3_47_0_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.47.0/Allmiibo_DE3_70_Z19_Web3_47_0_ChatGPT_Pruefpaket.zip)
- **3.46.0** · [Web-Quellcode (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.46.0/Allmiibo_Dateimanager_3_46_0_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.46.0/Allmiibo_DE3_69_Z19_Web3_46_0_ChatGPT_Pruefpaket.zip)
- **3.45.0** · [Web-Quellcode (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.45.0/Allmiibo_Dateimanager_3_45_0_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.45.0/Allmiibo_DE3_68_Z19_Web3_45_0_ChatGPT_Pruefpaket.zip)
- **3.44.0** · [Web-Quellcode (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.44.0/Allmiibo_Dateimanager_3_44_0_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.44.0/Allmiibo_DE3_67_Z19_Web3_44_0_ChatGPT_Pruefpaket.zip)
- **3.43.1** · [Web-Quellcode (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.43.1/Allmiibo_Dateimanager_3_43_1_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.43.1/Allmiibo_DE3_67_Z19_Web3_43_1_ChatGPT_Pruefpaket.zip)
- **3.43.0** · [Web-Quellcode (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.43.0/Allmiibo_Dateimanager_3_43_0_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.43.0/Allmiibo_DE3_67_Z19_Web3_43_0_ChatGPT_Pruefpaket.zip)
- **3.42.2** · [Web-Quellcode (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.42.2/Allmiibo_Dateimanager_3_42_2_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.42.2/Allmiibo_DE3_66_Z19_Web3_42_2_ChatGPT_Pruefpaket.zip)
- **3.42.1** · [Web-Quellcode (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.42.1/Allmiibo_Dateimanager_3_42_1_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.42.1/Allmiibo_DE3_66_Z19_Web3_42_1_ChatGPT_Pruefpaket.zip)

**LCD-Testversion DE3.67 / 639.** Alle 54 unterschiedlichen Spielhinweise für 63 Spielzuordnungen lassen sich am Gerät auf Deutsch lesen. Lange Hinweise scrollen bis zum letzten Bildpunkt. Deutsche Spielhinweise und QR-Code wurden an einem LCD-Allmiibo mit DE3.67, Z19 und S112 7.3.0 bestätigt. [Praxistest](docs/RELEASE_DE3_67.md) · [Nachbau](docs/BUILD_DE3_67.md) · [Android-Download](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_67_639_NUR_APP.zip)

**Dateimanager 3.42.1.** Die sechs Arbeitsbereiche haben eigene Farbakzente. Auf dem Handy führen zwei bebilderte Schaltflächen direkt zum Figurenimport und zum Firmwareupdate. Bei verbundenem Allmiibo zeigt „Dein Gerät“ den geöffneten Ordner, die Zahl seiner Einträge und die Speicherbelegung. Der breite Balken am unteren Rand zeigt den belegten Anteil mit einem Verlauf von Petrol zu Indigo. Der Figurenimport öffnet sich jetzt auch beim ersten Klick, wenn der Browser die Ansicht noch lädt. Die Anleitung beschreibt zusätzlich Nordics PC-Weg für Bluetooth-DFU mit einem passenden Adapter.

Die Beispielansichten aus **3.42.1** zeigen eine simulierte Verbindung und simulierte Speicherwerte. [Handyansicht](docs/images/web-3.42.1/mobile.png) · [Desktopansicht](docs/images/web-3.42.1/desktop.png)

Beim Dateiabgleich zeigt die neue Fassung die betroffenen Namen und eine mögliche Korrektur an. Für alle 54 unterschiedlichen Spielhinweise mit englischem Ausgangstext gibt es eine deutsche Fassung. Bei Bluetooth-Updates kann die separate DFU-Seite den sichtbaren Handybildschirm während der Übertragung wach halten. Der Browser zeigt an, ob das Betriebssystem die Anfrage angenommen hat. [Web-Anleitung](web/README.md) · [Downloads, Quellen und Prüfpaket für 3.44.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.44.0)

Die Geräte-App **DE3.65 / 637** ist für das geprüfte LCD-Allmiibo mit Packed LittleFS PFS1 freigegeben. Bluetooth-Auslesung, Scrollbalken am Ende einer Notiz, Erkennung einer bekannten Figur an der Switch und Aufwachen per Mitteldruck sind am Gerät bestätigt. Der Dateimanager bietet dieselbe signierte App wie der Handy-Download. [Geräteprüfung](docs/validation/DE3_65_LCD_READBACK.json)

Unter **Amiibo-Datenbank → Figur öffnen → kurz Mitte → Notiz / Hinweise** erreicht der Scrollbalken bei dreizeiligen Notizen jetzt das Textende. Die kompaktere Katalogtabelle erhält alle 952 Figuren-IDs und 1.344 Zuordnungen und gewinnt gegenüber DE3.64 insgesamt 2.672 Byte Programmflash.

Für ein Gerät mit passendem Z19 und S112 reicht die oben verlinkte App-ZIP. In der Android-App **nRF Device Firmware Update** die ZIP so auswählen, wie sie heruntergeladen wurde. Im Web-Updater unter **Update** die mitgelieferte LCD-Anwendung wählen. Wer schon DE3.65 mit Z19 verwendet, kann direkt den neuen Dateimanager öffnen. Für alte SPIFFS-Geräte gilt die gesonderte Migrationsanleitung. [App-Release und Prüfnachweise](https://github.com/bluecyber81/pixl.js/releases/tag/de3.65) · [Migration](docs/MIGRATION_PFS1.md)

## Quellen und Mitarbeit

Die Geräteanwendung, der Z19-Bootloader mit seinen SDK-Anpassungen und der Dateimanager sind jeweils aus ihrem passenden Quellstand nachbaubar. Der Funkstack S112 7.3.0 stammt von Nordic. Im Speichervergleich waren bei 100 Modellimporten 48,0 % weniger Programmier- und 42,7 % weniger Löschvorgänge nötig. Der bestehende Mountcache sparte im 952-Figuren-Modell 431 physische Lesezugriffe. [Speichermessungen](docs/validation/DE3_65_SPEICHER.md) · [Z19-Quellen](bootloader-z19/) · [S112](softdevice-s112/) · [Mitmachen](CONTRIBUTING.md)

Community-Fortführung durch bluecyber81 auf Grundlage von [solosky](https://github.com/solosky/pixl.js) und [cylin577](https://github.com/cylin577/pixl.js). [Komponenten](docs/COMPONENTS.md) · [Entwicklungsgeschichte](docs/DEVELOPMENT_HISTORY.de.md) · [Lizenzen](THIRD_PARTY_NOTICES.md)
