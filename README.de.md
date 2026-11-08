# Allmiibo LCD – Firmware und Dateimanager

[Geräte-Firmware und Bootloader](docs/VERSIONEN_FIRMWARE.md) · [Alle dokumentierten Dateimanager-Versionen](docs/VERSIONEN_WEB.md)

[Online-Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Anleitung: Flashen, LittleFS und Bootloader](https://bluecyber81.github.io/pixl.js/guide/index.html) · [LCD-App DE3.65 für das Handy herunterladen](https://github.com/bluecyber81/pixl.js/releases/download/de3.65/Allmiibo_LCD_DE3_65_637_NUR_APP.zip) · [English](README.md)

**Dateimanager 3.43.1** · 8. November 2026. Die lokale LittleFS-Platzprüfung zeigt DE3.67 mit App-Zähler 639 als neueste geprüfte Firmware. Das Speicherprofil gilt für DE3.55 bis DE3.67.

- **3.43.1** · [Web-Quellcode (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.43.1/Allmiibo_Dateimanager_3_43_1_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.43.1/Allmiibo_DE3_67_Z19_Web3_43_1_ChatGPT_Pruefpaket.zip)
- **3.43.0** · [Web-Quellcode (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.43.0/Allmiibo_Dateimanager_3_43_0_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.43.0/Allmiibo_DE3_67_Z19_Web3_43_0_ChatGPT_Pruefpaket.zip)
- **3.42.2** · [Web-Quellcode (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.42.2/Allmiibo_Dateimanager_3_42_2_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.42.2/Allmiibo_DE3_66_Z19_Web3_42_2_ChatGPT_Pruefpaket.zip)
- **3.42.1** · [Web-Quellcode (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.42.1/Allmiibo_Dateimanager_3_42_1_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.42.1/Allmiibo_DE3_66_Z19_Web3_42_1_ChatGPT_Pruefpaket.zip)

**LCD-Testversion DE3.67 / 639.** Alle 54 unterschiedlichen Spielhinweise für 63 Spielzuordnungen lassen sich am Gerät auf Deutsch lesen. Lange Hinweise scrollen bis zum letzten Bildpunkt. Deutsche Spielhinweise und QR-Code wurden an einem LCD-Allmiibo mit DE3.67, Z19 und S112 7.3.0 bestätigt. [Praxistest](docs/RELEASE_DE3_67.md) · [Nachbau](docs/BUILD_DE3_67.md) · [Android-Download](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_67_639_NUR_APP.zip)

**Dateimanager 3.42.1.** Die sechs Arbeitsbereiche haben eigene Farbakzente. Auf dem Handy führen zwei bebilderte Schaltflächen direkt zum Figurenimport und zum Firmwareupdate. Bei verbundenem Allmiibo zeigt „Dein Gerät“ den geöffneten Ordner, die Zahl seiner Einträge und die Speicherbelegung. Der breite Balken am unteren Rand zeigt den belegten Anteil mit einem Verlauf von Petrol zu Indigo. Der Figurenimport öffnet sich jetzt auch beim ersten Klick, wenn der Browser die Ansicht noch lädt. Die Anleitung beschreibt zusätzlich Nordics PC-Weg für Bluetooth-DFU mit einem passenden Adapter.

Die Beispielansichten aus **3.42.1** zeigen eine simulierte Verbindung und simulierte Speicherwerte. [Handyansicht](docs/images/web-3.42.1/mobile.png) · [Desktopansicht](docs/images/web-3.42.1/desktop.png)

Beim Dateiabgleich zeigt die neue Fassung die betroffenen Namen und eine mögliche Korrektur an. Für alle 54 unterschiedlichen Spielhinweise mit englischem Ausgangstext gibt es eine deutsche Fassung. Bei Bluetooth-Updates kann die separate DFU-Seite den sichtbaren Handybildschirm während der Übertragung wach halten. Der Browser zeigt an, ob das Betriebssystem die Anfrage angenommen hat. [Web-Anleitung](web/README.md) · [Downloads, Quellen und Prüfpaket für 3.43.1](https://github.com/bluecyber81/pixl.js/releases/tag/web3.43.1)

Die Geräte-App **DE3.65 / 637** ist für das geprüfte LCD-Allmiibo mit Packed LittleFS PFS1 freigegeben. Bluetooth-Auslesung, Scrollbalken am Ende einer Notiz, Erkennung einer bekannten Figur an der Switch und Aufwachen per Mitteldruck sind am Gerät bestätigt. Der Dateimanager bietet dieselbe signierte App wie der Handy-Download. [Geräteprüfung](docs/validation/DE3_65_LCD_READBACK.json)

Unter **Amiibo-Datenbank → Figur öffnen → kurz Mitte → Notiz / Hinweise** erreicht der Scrollbalken bei dreizeiligen Notizen jetzt das Textende. Die kompaktere Katalogtabelle erhält alle 952 Figuren-IDs und 1.344 Zuordnungen und gewinnt gegenüber DE3.64 insgesamt 2.672 Byte Programmflash.

Für ein Gerät mit passendem Z19 und S112 reicht die oben verlinkte App-ZIP. In der Android-App **nRF Device Firmware Update** die ZIP so auswählen, wie sie heruntergeladen wurde. Im Web-Updater unter **Update** die mitgelieferte LCD-Anwendung wählen. Wer schon DE3.65 mit Z19 verwendet, kann direkt den neuen Dateimanager öffnen. Für alte SPIFFS-Geräte gilt die gesonderte Migrationsanleitung. [App-Release und Prüfnachweise](https://github.com/bluecyber81/pixl.js/releases/tag/de3.65) · [Migration](docs/MIGRATION_PFS1.md)

## Quellen und Mitarbeit

Die Geräteanwendung, der Z19-Bootloader mit seinen SDK-Anpassungen und der Dateimanager sind jeweils aus ihrem passenden Quellstand nachbaubar. Der Funkstack S112 7.3.0 stammt von Nordic. Im Speichervergleich waren bei 100 Modellimporten 48,0 % weniger Programmier- und 42,7 % weniger Löschvorgänge nötig. Der bestehende Mountcache sparte im 952-Figuren-Modell 431 physische Lesezugriffe. [Speichermessungen](docs/validation/DE3_65_SPEICHER.md) · [Z19-Quellen](bootloader-z19/) · [S112](softdevice-s112/) · [Mitmachen](CONTRIBUTING.md)

Community-Fortführung durch bluecyber81 auf Grundlage von [solosky](https://github.com/solosky/pixl.js) und [cylin577](https://github.com/cylin577/pixl.js). [Komponenten](docs/COMPONENTS.md) · [Entwicklungsgeschichte](docs/DEVELOPMENT_HISTORY.de.md) · [Lizenzen](THIRD_PARTY_NOTICES.md)
