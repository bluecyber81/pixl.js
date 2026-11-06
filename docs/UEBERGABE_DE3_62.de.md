# Abschluss und Übergabe: DE3.62 / App634, Z17, Dateimanager 3.38.0

Stand: 6. November 2026. Ausgangsbasis ist DE3.61 / App633, Z15 und Web 3.37.5. Die nachstehenden Rechnerprüfungen sind neu ausgeführt. Die neue Kombination wurde noch nicht am echten Allmiibo getestet; das Gerät war während der Arbeit nur am Handy verfügbar.

## Abgleich mit dem Auftrag

| Punkt | Ergebnis und Grenze |
| --- | --- |
| A – Bootloader-Makefile | Der falsche Heap-Zielname ist im neuen Z17-Quellstand korrigiert. Der eingefrorene Z15-Referenzstand bleibt erhalten. Quelle, Buildrezept und erzeugte Artefakte sind gebunden. |
| B – vollständige Webprüfung | Die zuvor fehlenden Vue-/Webprüfungen, beide Produktionsbuilds und isolierte mobile/Desktop-Browserprüfungen sind ausgeführt. Die Bluetooth-Antworten im Browserlauf sind simuliert. |
| C – RAM-Stichproben | Beide Diagnoseansichten erklären fehlende, null, eine, wenige und viele Stichproben. Eine einzelne Probe wird nicht als Belastungsnachweis dargestellt. |
| D – Warnungen und nativer Build | Drei kritische Warnungsklassen brechen die Übersetzung eigener C-Module ab. 19 zuvor verdeckte Typdiagnosen sind korrigiert. Der zusätzliche native Linux-Build verwendet denselben geprüften Compiler und SDK; BIN und HEX stimmen mit Docker überein. |
| E – Start und Cache | Neue Mountmesswerte zeigen Konfiguration, Scan, physische Leseversuche, Bytes und Cachetreffer. Gleich große Cachealternativen wurden am gleichen Bestand verglichen und waren schlechter. Die bisherige Cachepolitik bleibt erhalten; kein zusätzlicher Geschwindigkeitsgewinn behauptet. |
| F – Bootloaderanzeige | Z17 zeigt „Pruefen“ bei der tatsächlichen abschließenden Validierung und „Speichern“ vor dem tatsächlichen Settings-Abschluss. Fünf fehlende Schriftzeichen ergänzt. Anzeige bleibt außerhalb ungeeigneter IRQ-Pfade; keine zusätzliche Wartezeit. |
| G – spätere Diagnose | Der verlangte Architekturentwurf für Startkennung und echtes Probenalter ist dokumentiert. Diese spätere Protokollerweiterung ist noch nicht implementiert. |
| H – Gerätequalifikation | Offen: neue Firmware und Z17 am Gerät, Dateiübertragung mit Rücklesen, Wiederverbinden, Tasten/Fokus/QR, NFC, Schlaf/Aufwachen und mehrere vergleichbare Starts. Frühere Geräteberichte ersetzen diese Prüfung nicht. |

## Zusätzlich behobener Fehler

Der Kartenhelfer konnte bei fehlendem, unbekanntem oder verkürztem Kartenpuffer einen unzulässigen Speicherzeiger liefern, bevor der Dateidialog den Zustand prüfte. Er prüft jetzt Typ, Zeiger und vollständige Puffergröße. Ungültige Zustände liefern NULL beziehungsweise Größe 0 und werden von den vorhandenen Dialogen abgewiesen. Gültige Kartenformate bleiben unverändert.

Der Fehler ist gegen App633 mit bereits bereinigten Typübergaben reproduziert. Die korrigierte Fassung besteht 4.700 Prüfungen mit echten Kartenstrukturen auf dem Host, unter ARM32 und mit ASan/UBSan. Ein eigener negativer Kontrolllauf scheitert ohne den Fix.

Im Dateimanager erscheinen Fehler beim Öffnen eines Sicherungslaufwerks jetzt im sichtbaren Sicherungsbereich. Während des Öffnens wird ein Wartezustand angezeigt. Eine laufende neue Gesamtdiagnose zeigt keinen alten Abschlusszeitstempel.

## Nachweise und Nachbau

- [App-Build und vollständige Tests](BUILD_DE3_62.md): 145 bestandene Firmware-Suiten, Quellbindung, Signatur, Vektoren, tatsächliche ELF-Speichergrenzen und Katalogabgleich. 952 Figuren, 82 Spiele und 1.344 Verknüpfungen entsprechen der Referenz.
- [App-Prüfmanifest](validation/DE3_62.json), [Web-Prüfmanifest](validation/WEB3_38_0.json), [Z17-Prüfmanifest](validation/Z17.json): konkrete Artefakte, Hashes und Grenzen.
- [Speicherprofil und Cachevergleich](diagnostics/DE3_62_STORAGE.md): synthetischer Bestand mit 1.131 Dateien und 77 Ordnern, alle 128 Metadatenbytes verglichen. Beide Versionen benötigen 4.531 physische Leseaufrufe, ohne Schreiben, Löschen oder Sync. Dies ist kein erneutes Auslesen der persönlichen Sammlung.
- [Z17-Quellen und Build](../bootloader-z17/): eigene Quellen, lokale SDK-Anpassungen, gemeinsame Header, Compilerbindung und Tests; ELF und Linker-Map zusätzlich im vollständigen Prüfarchiv.
- [Browserprüfung](../web/BROWSER_TESTS.md): 1.180 Gesamttests vor der letzten Z18-Profilregistrierung, danach 24 betroffene Abschlussprüfungen. Beide fertigen Builds bestehen jeweils 21 Produktions- und 57 Browserprüfungen mit je 28 Screenshots. Ein vollständiger CI-Lauf des veröffentlichten Commits ist zusätzlich in GitHub Actions sichtbar.

Die Z17-Prüfung umfasst die festen Reset-, Flashabschluss-, Sitzungs-, Paketannahme-, IRQ-, Tasten- und LCD-Fälle sowie 69 ARM-Kryptofälle. Beide Phasen des Android-Kombipakets und negative Signatur-/Kompatibilitätsfälle wurden am Rechner geprüft. Daraus folgt keine Garantie gegen jeden Hardware- oder Stromausfallfehler.

Die App hat 10.396 Byte Linker-Flashreserve und 1.840 Byte Abstand zwischen Heap- und Stackgrenze; Z17 hat 2.060 Byte Boot-Flashreserve. Die reservierten Stacks und der 18-KiB-App-Allokator wurden nicht verkleinert. Die neuen Messfelder benötigen 40 Byte; der gesamte statische RAM-Abstand verringert sich einschließlich Ausrichtung um 64 Byte.

## Verwendung am Handy

Für das eigene passende LCD-Allmiibo mit bereits vorhandenem Packed LittleFS und S112 7.3.0 ist `Allmiibo_LCD_Z17_DE3_62_634_ANDROID_DFU_TESTSTAND.zip` das gewünschte Kombipaket. In **nRF Device Firmware Update** zuerst die Bootloaderphase und anschließend die Anwendungsphase vollständig abschließen lassen. Die Appbank kann während der Bootloaderphase als Zwischenspeicher dienen; deshalb gehört die anschließende App-Installation zum Vorgang.

Das Kombipaket enthält **Z17 und App634**, kein SoftDevice und keine neue Dateisystemumstellung. Der Browser-Updater unterstützt weiterhin das getrennte App-ZIP. Z18 ist ausschließlich ein Rückkehrpaket mit unverändertem Z15-Code und höherem Versionszähler. Nach Z18 lässt sich Z17 nicht erneut als Downgrade installieren. Eine solche Rückkehr setzt einen noch erreichbaren DFU-Bootloader voraus.

Nach dem Flashen auf der Online-Seite unter **Gerät & Diagnose** die vollständige Diagnose lesen und exportieren. Erwartet werden DE3.62 / App634, Bootzähler 17, die Z17-Regionskennung aus dem Prüfmanifest sowie S112 7.3.0. Danach eine bekannte Figur, einen großen Ordner, kurzen/längeren Mitteldruck, Einstellungen, QR-Anzeige und Aufwachen prüfen. Die neue Mountdiagnose befindet sich in der Startdiagnose bei den technischen Details.

## Offene Arbeit für die nächste Sitzung

Den neuen Geräteexport dem exakt geflashten Paket zuordnen. Echte Startzeiten mehrfach unter vergleichbaren Bedingungen messen; aus Einzelwerten keinen sicheren Geschwindigkeitsgewinn ableiten. Den Dateitest in einem eigenen Testordner durchführen und anschließend entfernen. Ergebnisse mit Datum, Versions-/Bootbezug und tatsächlichen Schritten protokollieren.

S112 bleibt Nordics unverändertes 7.3.0-Binärpaket. Dessen vollständiger proprietärer Implementierungsquellcode liegt nicht vor. Die Startkennung und das echte Probenalter bleiben ein begründeter Entwurf für eine spätere, separat getestete Erweiterung.
