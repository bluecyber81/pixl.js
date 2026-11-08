# Historische Release Notes für BL8 und Nordic S112 7.3.0

Dieses Dokument gehört zur [Komponentenveröffentlichung vom 3. November 2026](https://github.com/bluecyber81/pixl.js/releases/tag/bl8-s112-7.3.0). Die aktuelle [Komponentenübersicht](COMPONENTS.md) führt Z19, die stabile LCD-App DE3.65, die Testversion DE3.66 und den Dateimanager 3.42.2 auf.

**Bootloader und SoftDevice gehören sichtbar zu diesem Projekt.** Hier stehen die geprüften Einzeldateien, zugehörigen Quellen, Lizenzen und die Beschreibung unserer Arbeit.

- [Bootloader-Änderungen und S112-Integration](BOOTLOADER_SOFTDEVICE_CHANGES.md) mit Fehlerkorrekturen, Herkunft und Prüfumfang.
- [Firmware-/Dateimanager-Historie](https://github.com/bluecyber81/pixl.js/blob/main/docs/DEVELOPMENT_HISTORY.de.md): RAM, Speicher, Bluetooth/NFC, Bedienung, DFU und Browser.
- [Dateien und Voraussetzungen](https://github.com/bluecyber81/pixl.js/blob/main/docs/COMPONENT_DOWNLOADS.md).

## Downloads

1. **BL8_CODE_ZAEHLER9_BOOTLOADER_ONLY_TESTSTAND.zip** — unverändertes signiertes Bootloader-OTA, ausschließlich für passend qualifizierte Geräte mit bisherigem Zähler unter 9. **Kein Upgrade für Zähler 9/11.**
2. **s112_nrf52_7.3.0.zip** — unverändertes Nordic-Original einschließlich Lizenz, Release Notes und API. **Kein direkt flashbares DFU-Paket.**
3. **Allmiibo_BL8_Quellen_und_Nachweise.zip** — genaue BL8-Quelle, SDK-Overrides und reproduzierbare Build-/Paketnachweise.
4. **Allmiibo_BL8_S112_7_3_0_Komponentenpaket.zip** — alle drei Dateien mit Dokumentation und Lizenzen. **Äußere ZIP nicht flashen.**
5. **SHA256SUMS.txt** — Prüfsummen.

BL8 enthält eigene Korrekturen an DFU-Abschluss, Flash-/Settings-Bestätigung, Antwortwarteschlangen und LCD-Pfaden. S112 selbst ist Nordic-Software; unsere Beiträge sind Integration, die dokumentierte SDK-NVIC-Korrektur, Diagnose und Validierung. Die Bluetooth-/Dateiübertragungsverbesserungen der Anwendung stehen separat im Änderungsverlauf.

Die ergänzende BL8-Veröffentlichung gehörte zur damaligen [Anwendung DE3.55/627 mit Dateimanager 3.33.1](https://github.com/bluecyber81/pixl.js/releases/tag/de3.55). Wer diesen Stand bereits nutzte, konnte die Dokumentation ohne erneutes Flashen verwenden.

## English

This release publishes the unchanged BL8 counter-9 OTA, original Nordic S112 7.3.0 distribution, matching BL8 source and detailed change history. It is a component/reference release, not a universal combined updater. BL8 counter 9 does not upgrade installed counter 9/11; the vendor S112 ZIP is not a DFU package. Project bootloader fixes and SoftDevice-integration work are credited separately from Nordic's own binary changes. Existing DE3.55/web3.33.1 payloads are unchanged. All original licenses and notices accompany the files.
