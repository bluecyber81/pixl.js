# Bootloader und Nordic S112 beim LCD-Allmiibo

## Z19, Z17 und frühere Stände

| Stand | Änderung und Nutzen | Nachweis |
| --- | --- | --- |
| Z19 | Vor dem Abschluss eines Datentransfers prüft der Bootloader den Updateauftrag und die Bildgröße. Nach einem Verbindungsabbruch prüft er den gespeicherten Auftrag erneut. Das Handy kann den bestätigten Stand abfragen und fehlende Daten senden. | [Z19-Code, Wiederaufnahmetests und Messwerte](../bootloader-z19/README.md) |
| Z17 | Das Display zeigt beim Update „Pruefen...“ und „Speichern...“ für die jeweiligen Phasen. Die Bootloader-Bauanleitung beschreibt die zusätzlichen Compilerprüfungen und den bytegleichen Nachbau. | [Z17-Änderungen und Prüfnachweise](../bootloader-z17/README.md) |
| Z18-Rückkehrpaket | Enthält den Z15-Code mit Paket-Zähler 18. Der höhere Zähler ermöglicht den vorgesehenen Rückweg von Z17. | [Zähler und geprüfte Paket-Hashes](validation/Z17.json) |
| Z13 und Z15 | Die historischen Gerätebelege und Bootbereich-Prüfsummen ordnen die installierten Codefassungen zu. | [Komponentenübersicht](COMPONENTS.md#historical-z13-z15-and-z17-components) |

Am LCD-Gerät wurden DE3.64 und später die stabile DE3.65 mit Z19 und S112 7.3.0 ausgelesen. Für DE3.66 belegen die Rechnerprüfungen die Wiederaufnahme am bestätigten Objektende und das erneute Senden ab dem gemeldeten Offset. Installation, Displayfoto und Fortsetzung einer unterbrochenen Sicherung am Gerät sind für diese Testversion offen. Die Sicherung im Dateimanager und die DFU-Wiederaufnahme im Bootloader sind zwei getrennte Vorgänge. [Gerätebeleg DE3.65](validation/DE3_65_LCD_READBACK.json) · [Z19-Transfermodell](../bootloader-z19/README.md) · [DE3.66 und Web 3.40.0](RELEASE_DE3_66.md)

Nordic stellt die Funksoftware S112 7.3.0 bereit. Unsere Änderungen betreffen den Bootloader und die Einbindung des Nordic-SDK. [S112-Herkunft, Version und Lizenz](../softdevice-s112/README.md)

## Entwicklung bis BL8

**Zusätzlich am 4. November 2026 geprüft.** Alle 98.068 SoftDevice-Bytes des archivierten BL8/S112-Pakets stimmen mit dem Nordic-HEX für S112 7.3.0 überein. Die MBR-Seite und der Bootloaderanteil gehören nicht zu diesem Vergleich. [Bereiche und SHA-256](validation/S112_7_3_0_ARCHIVE_COMPARISON.json).


[Komponenten-Downloads und Installationsgrenzen](COMPONENT_DOWNLOADS.md) ·
[S112-Herkunft und Lizenz](../softdevice-s112/README.md)

Der folgende historische Bericht vom **3. November 2026** beschreibt BL8. BL8 umfasst die über mehrere Prüfstände entwickelten
Verbesserungen an Anzeige, Nordic Secure DFU, Fehlerbehandlung und Updateabschluss.
Der letzte BL8-Fix ist nur ein Teil davon. **Nordic S112 7.3.0 selbst wurde nicht
von uns entwickelt oder verändert**; unsere Arbeit betrifft seine Integration,
Kompatibilitätsprüfung und einen dokumentierten SDK-Header-Workaround.

Der dazugehörige Bootloadercode liegt in
[`bootloader-bl8/`](../bootloader-bl8/README.md), nicht im geerbten
`fw/bootloader`-Unterverzeichnis der Anwendung. Der
[Quellnachweis](../bootloader-bl8/SOURCE_BINDING.json) bindet den exportierten
Code an das BL8-Bild; [Buildprüfung](../bootloader-bl8/BUILD_VERIFICATION.json)
und [Prüfzusammenfassung](../bootloader-bl8/EVIDENCE.json) dokumentieren die
Reproduktion und die Grenzen der Nachweise.

## Was wir im Bootloader verbessert haben

Die Tabelle beschreibt die kumulative Entwicklung. Die frühen Stände wurden
als Stand 1/2, spätere Codefassungen als BL4 bis BL8 bezeichnet. Ein signierter
Updatezähler ist keine verlässliche Bezeichnung dieser Codefassungen: Auch ein
unveränderter Rückkehr-Bootloader konnte unter einem höheren Zähler verpackt sein.

| Bereich / Entwicklungsstand | Früheres Problem → unsere Korrektur | Öffentlicher Quellbeleg |
| --- | --- | --- |
| LCD-Speicher und Zeichnen, frühe Stände | Temporäre dynamische Bildpuffer sowie fehleranfällige Randfälle beim Zuschneiden und bei langen Texten → direktes Zeichnen im vorhandenen Framebuffer, korrekter Quellzeilenabstand, begrenzte Koordinaten und Textausgabe. Unbenutzte Schriftzeichen wurden später entfernt; die tatsächlich verwendeten Meldungen blieben pixelgleich. | [`lcd_drv.c`](../bootloader-bl8/fw/bootloader/src/lcd_drv.c#L85), [`bitmap.h`](../bootloader-bl8/fw/bootloader/src/bitmap.h) |
| LCD-Initialisierung und SPI, frühe Stände | Ein Software-Timeout konnte EasyDMA weiterlaufen lassen, während der Puffer bereits wiederverwendet wurde; Initialisierungsfehler wurden nicht ausreichend berücksichtigt → SPI-Transfer vor Wiederverwendung abbrechen, Fehlerzustand bis zur Neuinitialisierung beachten und Chip-Select inaktiv vorbereiten. Nach dem LCD-Softreset wird die benötigte Wartezeit eingehalten. | [`lcd_comm.c`](../bootloader-bl8/fw/bootloader/src/lcd_comm.c), [`lcd_drv.c`](../bootloader-bl8/fw/bootloader/src/lcd_drv.c#L56) |
| DFU-Anzeige und Lebenszyklus, frühe Stände bis BL4 | Nach Fehlern war die Anzeige für einen erneuten Versuch nicht zuverlässig verfügbar; IRQ-Ereignisse konnten Display-Abbau oder veraltete Anzeigen auslösen → Fehleranzeige bleibt initialisiert, benötigte Display-Aktionen laufen verzögert im Hauptkontext und berücksichtigen den aktuellen Zustand. Eine volle Scheduler-Warteschlange für eine kosmetische Anzeigeaktion blockiert DFU nicht. | [`main.c`](../bootloader-bl8/fw/bootloader/src/main.c#L95) |
| Eingaben und Aktivierung, frühe Stände bis BL4 | Zu kurze DFU-Pakete, ungültige Offsets und fehlende/überlaufende Imagegrößen wurden nicht durchgängig vor der Verarbeitung abgefangen. Eine fehlerhafte Kopier-CRC oder ein Aktivierungsfehler konnte durch einen späteren erfolgreichen Aufräumschritt verdeckt werden → Grenzen vor Zugriff/Kopie prüfen und den ursprünglichen Fehler zurückgeben. | [`nrf_dfu_ble.c`](../bootloader-bl8/fw/bootloader/src/sdk/nrf_dfu_ble.c), [`nrf_dfu_validation.c`](../bootloader-bl8/fw/bootloader/src/sdk/nrf_dfu_validation.c#L427), [`nrf_bootloader_fw_activation.c`](../bootloader-bl8/fw/bootloader/src/sdk/nrf_bootloader_fw_activation.c#L182) |
| BLE-Antworten und Sitzungen, BL4/BL5 | Volle BLE-Puffer konnten Antworten verlieren; alte Rückrufe konnten einer neuen Verbindung zugeordnet werden. Ein bereits per ATT angenommener Auftrag konnte bei voller Scheduler-Warteschlange verschwinden → begrenzte Antwortwarteschlange, erneutes Senden bei freiem Puffer, getrennte Sitzungsgenerationen und definierter Verbindungsabbruch bei nicht mehr abarbeitbarem Auftrag. CCCD-Lesefehler, nicht unterstützte Prepare Writes und Pairing-Anfragen werden korrekt behandelt. | [`nrf_dfu_ble.c`](../bootloader-bl8/fw/bootloader/src/sdk/nrf_dfu_ble.c#L285), [Scheduler-Fehlerpfad](../bootloader-bl8/fw/bootloader/src/sdk/nrf_dfu_ble.c#L1050) |
| Abschluss und Neustart, BL6/BL7 | Ein Neustart oder eine Erfolgsmeldung konnte dem tatsächlichen Abschluss der Flash-/Settings-Arbeit bzw. der letzten BLE-Antwort vorgreifen → finale Settings und Sicherung vollständig zurücklesen und vergleichen; Erfolg erst nach erfolgreicher Prüfung. Der Neustart wartet auf ruhenden Flash und eine begrenzte Antwortphase, einschließlich bereits an den Stack übergebener Notifications. Zeitüberschreitungen werden nicht als erfolgreicher Commit behandelt. | [`nrf_dfu_req_handler.c`](../bootloader-bl8/fw/bootloader/src/sdk/nrf_dfu_req_handler.c#L108), [`nrf_bootloader.c`](../bootloader-bl8/fw/bootloader/src/sdk/nrf_bootloader.c#L133), [`nrf_dfu_ble.c`](../bootloader-bl8/fw/bootloader/src/sdk/nrf_dfu_ble.c#L316) |
| Pufferbesitz und unnötige Arbeit, BL7 | Abgewiesene Datenaufträge konnten ihre reservierten Puffer behalten; ein späterer zusätzlicher Settings-Backup war nach geprüftem Abschluss redundant → Puffer auf den betroffenen Fehlerpfaden freigeben und den unnötigen zweiten Backup-Schritt vermeiden. | [`nrf_dfu_req_handler.c`](../bootloader-bl8/fw/bootloader/src/sdk/nrf_dfu_req_handler.c), [`nrf_bootloader.c`](../bootloader-bl8/fw/bootloader/src/sdk/nrf_bootloader.c#L226) |
| Erneutes Einreihen von Execute, BL8 | Ein bereits angenommener Execute-Auftrag wartete bei beschäftigtem Flash. Scheiterte sein erneutes Einreihen am vollen Scheduler, blieb zuvor nur ein Logeintrag → genau eine Fehlerantwort `OPERATION_FAILED` an die ursprüngliche Sitzung und ein Fehlerereignis. Flashinhalt und Fortschritt bleiben erhalten; ein späterer Execute-Versuch kann wieder erfolgreich sein. | [`nrf_dfu_req_handler.c`](../bootloader-bl8/fw/bootloader/src/sdk/nrf_dfu_req_handler.c#L595) |

Die Abschlussprüfung ist **keine automatische Rückkehr zum alten Image**. Bei
einem Fehler kann beispielsweise bereits eine gültige erste Settings-Kopie
vorliegen. Ebenso beweist die Sendebestätigung des BLE-Stacks nicht, dass eine
Handy-App die Antwort verarbeitet hat. Die Begrenzungen verhindern unbegrenztes
Warten; sie machen nicht jedes Unterbrechungsszenario wiederherstellbar.

## Start, rechte Taste und Hintergrundbeleuchtung richtig zuordnen

Die Erkennung „beim Start etwa drei Sekunden nach rechts halten“ stammt aus
**Upstream 2.16** ([ursprünglicher Commit](https://github.com/solosky/pixl.js/commit/e5f1132cf9ffb56535b599e1af040725404b1a10))
und wurde mit dem neueren Ausgangscode übernommen. Sie ist
keine eigene BL8-Erfindung. Im aktuellen
[`main.c`](../bootloader-bl8/fw/bootloader/src/main.c#L194) läuft die Warteschleife
nur, solange der aktive Low-Eingang gedrückt ist; es gibt dadurch keine
pauschale zusätzliche Drei-Sekunden-Verzögerung bei jedem Start. Die Zuordnung
ist [`Pin 7 / stick RIGHT`](../bootloader-bl8/fw/bootloader/config/sdk_config.h#L319).
Diese Beschreibung ist quellgeprüft; ein eigener physischer Nachweis genau
dieser Drei-Sekunden-Geste liegt in den veröffentlichten Prüfbelegen nicht vor.

Unsere Änderungen betreffen die Anzeigeinitialisierung, DMA-Fehlerbehandlung
und den DFU-Anzeigezustand. **LCD-/Tasten-/Backlight-Pins und deren Polarität
wurden dafür nicht geändert.** Damit ist keine bestimmte Ursache eines früher
beobachteten schwarzen Displays oder eines Einschaltproblems bewiesen.

Auch das Überspringen der App-CRC bei vorgesehenem System-Off-Wakeup bzw.
GPREGRET2 war bereits vorhanden und wurde beibehalten
([Konfiguration](../bootloader-bl8/fw/bootloader/config/sdk_config.h#L237)).
Es wird hier nicht als neue Startbeschleunigung verkauft. Die veröffentlichten
2.309 ms Startzeit der DE3.55-Anwendung schließen Bootloader und frühen SDK-Start
aus ([Messgrenze](validation/DE3_55.json)).

## Was die S112-Integration umfasst

Verwendet wird das **unveränderte Nordic S112 7.3.0** für die passende
nRF52832-Hardware, FWID `0x0126`; der vorherige S112-7.2.0-Stand hatte FWID
`0x0103`. Herkunft und exakte ZIP-/HEX-Hashes stehen im
[Bootloader-README](../bootloader-bl8/README.md#nordic-s112-and-licensing);
Herstellerdistribution und Release Notes kommen von
[Nordic](https://www.nordicsemi.com/Products/Development-software/S112/Download).
Die vom Hersteller gelieferten Änderungen, insbesondere an Advertising- und
Disconnect-Ereignissen, sind **Nordics Verbesserungen**, nicht unsere eigenen
Funkstack-Patches. Mehr Reichweite oder eine pauschale Behebung aller
Bluetoothprobleme wird daraus nicht abgeleitet.

Unsere Integrationsarbeit umfasst:

- Die Prüfung von Familie/FWID, Signaturen, Imagegrößen und Update-Reihenfolge.
  Der Anwendungsstart bleibt bei `0x19000`; der reservierte Bereich wird durch
  eine kleinere SoftDevice-Nutzlast nicht verkleinert. MBR, Bootloadergrenzen
  und vorhandene Datenbereiche wurden nicht für diese Änderungen verschoben.
- Den **Nordic-Workaround DRGN-10613** im tatsächlich benutzten SDK-Header von
  App- und Bootloaderbuild: Die IRQ-Maske reserviert MWU korrekt für den
  SoftDevice. Die Änderung ist in
  [`nrf_nvic.h`](../bootloader-bl8/sdk-overrides/nrf_nvic.h#L103) sichtbar;
  [BL8-Build](../bootloader-bl8/build.py) und
  [App-Buildanleitung](BUILD_DE3_55.md) binden den geprüften Header ein.
  Dies ändert den kompilierten SDK-Helfercode, nicht die Nordic-S112-Binärdatei.
- Eine getrennte Behandlung von **Systemteil und Anwendung**. Bei einem
  kombinierten Update müssen beide Phasen fertig werden. Der alte Appbereich
  kann als Zwischenablage verwendet werden; es existiert dabei keine garantierte
  unangetastete zweite Appkopie. Die externe SPI-Sammlung ist ein anderer
  Speicherbereich. Ein neuer Bootloader ersetzt außerdem keine erforderliche
  SPIFFS-zu-PFS1-Migration der Anwendung.

Die vorhandene Signaturprüfung und die Schutzbereiche bleiben wirksam
([Signaturpflicht](../bootloader-bl8/fw/bootloader/config/sdk_config.h#L1240),
[Flashschutz](../bootloader-bl8/fw/bootloader/src/main.c#L181)). Ein geprüftes
Paketformat oder HW-Feld `52` allein beweist keine passende Platine.

## Release, Codefassung und Updatezähler

Die separate Komponentenveröffentlichung heißt **`bl8-s112-7.3.0`**. Sie trennt
BL8-Quellcode, das vorhandene signierte **BL8-only-OTA mit Zähler 9** und die
**Original-Nordic-S112-ZIP**. Das Vendor-ZIP ist eine Herstellerdistribution,
**kein für dieses Gerät signiertes Secure-DFU-Updatepaket**. Seine Beilage
verwandelt das BL8-only-Paket nicht in ein kombiniertes Systemupdate.

Dasselbe BL8-Codebild wurde für einen separat geprüften kombinierten
S112/BL-Pfad auch mit **Zähler 11** verpackt. Zähler 9 kann keinen installierten
Zähler 9 oder höher aktualisieren; insbesondere ist es kein Upgrade über
Zähler 11. Ein höherer Paket-Zähler bedeutet umgekehrt nicht automatisch neuen
Bootloadercode. Die getrennte Veröffentlichung ist keine neue allgemeine
Freigabe des gerätespezifischen kombinierten Pakets.

Der Browser-Dateimanager führt weiterhin **nur Anwendungsupdates** aus. Ein
BL-/SoftDevice-Wechsel benötigt einen passenden Nordic-Secure-DFU-Ablauf und
vorher geprüfte Geräte-, Zähler-, Schlüssel- und Speicherkompatibilität. Ein
funktionierendes App-Menü allein bestätigt keinen Systemwechsel. Nordic-Lizenz
und GPL-Zuordnung bleiben getrennt; siehe
[Lizenzen und Herkunft](../bootloader-bl8/README.md#nordic-s112-and-licensing).

## Was nachgewiesen ist — und was nicht

Die öffentlichen [BL8-Prüfbelege](../bootloader-bl8/EVIDENCE.json) trennen die
historischen Hosttests von der aktuellen Quell-/Buildprüfung: unter anderem
35 Execute-/Commit-Szenarien jeweils nativ und mit ASan/UBSan, 23
Ownership-Assertions und fünf Regressionsgruppen. Die historischen Harnesses
benötigten zusätzliche SDK-/Prüfbäume und werden nicht als vollständig im
Export enthaltene Tests ausgegeben. Der öffentliche Neubau reproduziert das
BL8-Bild bytegleich. Der Bootloader belegt **28.136 Byte** mit **536 Byte**
Reserve im unveränderten Codebereich.

Der [datierte Gerätebericht vom 2. November](validation/DE3_55.json) dokumentiert
BL8/S112 7.3.0 zusammen mit DE3.55 sowie begrenzte BLE-Transferprüfungen bei
MTU 250 und 23. Das ist keine neue Geräteprüfung durch diese Dokumentation und
kein physischer Nachweis sämtlicher DFU-Fehlerpfade, der Rechts-Haltegeste oder
einer Wiederherstellung nach Stromausfall. Hosttests und Binärgleichheit belegen
weder alle Platinenvarianten noch maximale Laufzeit-Stackbelegung oder eine
garantierte Funk-Recovery.

## English summary

BL8 contains cumulative project fixes for bounded LCD drawing without temporary
heap allocations, SPI/DMA error handling, deferred DFU display updates, input and
activation validation, session-aware bounded BLE replies, buffer ownership, and
verified settings/backup completion before reset. Its final incremental fix
returns an explicit error when an accepted Execute request cannot be requeued.

The three-second right-hold startup gesture is inherited from upstream 2.16,
not a project invention or a physically verified gesture in these published
tests. Display/backlight wiring and the existing wake CRC policy are preserved.
Nordic S112 7.3.0 is the unchanged vendor binary; our contribution is the checked
integration and DRGN-10613 SDK NVIC-mask workaround. Standalone BL8 counter 9,
the separate combined counter-11 path, and the vendor S112 distribution are
different artifacts. The web updater remains application-only. Public source,
reproducible builds, historical host tests and dated device observations are
linked above; none establishes universal board compatibility or guaranteed
power-loss recovery.
