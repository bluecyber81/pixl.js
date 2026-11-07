# Allmiibo LCD – Firmware und Dateimanager

[Online-Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [LCD-App DE3.65 für das Handy herunterladen](https://github.com/bluecyber81/pixl.js/releases/download/de3.65/Allmiibo_LCD_DE3_65_637_NUR_APP.zip) · [English](README.md)

**Dateimanager 3.39.4** läuft auf dieser GitHub-Seite. In Chrome oder Edge die Bluetooth-Dateiübertragung am Allmiibo öffnen und im Dateimanager **Verbinden** wählen. Die Website führt den Bestandsabgleich im Browser mit dem verbundenen Gerät aus. Öffne **Figurenkatalog** für die Spielhinweise oder **Figurensammlung → Bestand prüfen** zum Vergleichen der Gerätesammlung.

Beim Dateiabgleich zeigt die neue Fassung die betroffenen Namen und eine mögliche Korrektur an. Für alle 54 unterschiedlichen Spielhinweise mit englischem Ausgangstext gibt es eine deutsche Fassung. Bei Bluetooth-Updates kann die separate DFU-Seite den sichtbaren Handybildschirm während der Übertragung wach halten. Der Browser zeigt an, ob das Betriebssystem die Anfrage angenommen hat. [Web-Anleitung](web/README.md) · [Versionshinweise zum Dateimanager](docs/RELEASE_WEB3_39_4.de.md)

**Geräte-App DE3.65 / 637** ist ein separat wählbarer Teststand für LCD-Geräte mit bestehendem Packed LittleFS PFS1. Unter **Amiibo-Datenbank → Figur öffnen → kurz Mitte → Notiz / Hinweise** erreicht der Scrollbalken bei dreizeiligen Notizen jetzt das Textende. Die kompaktere Katalogtabelle erhält alle 952 Figuren-IDs und 1.344 Zuordnungen und gewinnt gegenüber DE3.64 insgesamt 2.672 Byte Programmflash.

Für ein Gerät mit passendem Z19 und S112 reicht die oben verlinkte App-ZIP. In der Android-App **nRF Device Firmware Update** die ZIP so auswählen, wie sie heruntergeladen wurde. Im Web-Updater ist sie über die eigene Firmware-Auswahl verwendbar. Die ARM-Prüfung mit Z19 und vorheriger App 636 bestand. Die praktische Geräteabnahme von DE3.65 steht bei Veröffentlichung aus. Für alte SPIFFS-Geräte gilt die gesonderte Migrationsanleitung. [App-Release und Prüfnachweise](https://github.com/bluecyber81/pixl.js/releases/tag/de3.65) · [Migration](docs/MIGRATION_PFS1.md)

## Quellen und Mitarbeit

Die Geräteanwendung, der Z19-Bootloader mit seinen SDK-Anpassungen und der Dateimanager sind jeweils aus ihrem passenden Quellstand nachbaubar. Der Funkstack S112 7.3.0 stammt von Nordic. Im Speichervergleich waren bei 100 Modellimporten 48,0 % weniger Programmier- und 42,7 % weniger Löschvorgänge nötig. Der bestehende Mountcache sparte im 952-Figuren-Modell 431 physische Lesezugriffe. [Speichermessungen](docs/validation/DE3_65_SPEICHER.md) · [Z19-Quellen](bootloader-z19/) · [S112](softdevice-s112/) · [Mitmachen](CONTRIBUTING.md)

Community-Fortführung durch bluecyber81 auf Grundlage von [solosky](https://github.com/solosky/pixl.js) und [cylin577](https://github.com/cylin577/pixl.js). [Komponenten](docs/COMPONENTS.md) · [Entwicklungsgeschichte](docs/DEVELOPMENT_HISTORY.md) · [Lizenzen](THIRD_PARTY_NOTICES.md)
