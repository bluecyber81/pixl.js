# Allmiibo LCD Z17 – separat geprüfter Bootloader-Kandidat

Stand: 6. November 2026. Basis ist der exakt gebundene Z15-Bootloader, nicht eine ältere BL8-Arbeitskopie. Für diesen funktionalen Kandidaten liegt ein optionales DFU-Paket mit Bootloader-Zähler **17** vor. Das vorhandene **Z18-Rückkehrpaket** enthält unveränderten Z15-Code mit dem höheren Bootloader-Zähler **18** und App634 als zweite Phase. Die Dateien in `_build` sind unsignierte Analyseartefakte, keine direkt auswählbare DFU-ZIP. Es wurde kein Gerät verändert und kein Hardwaretest durchgeführt.

## Änderungen und Nutzen

- `fw/bootloader/Makefile`: Die bereits separat nachgewiesene Zielkorrektur `bootloader: CFLAGS += -D__HEAP_SIZE=0` ist übernommen. Drei Compilerdiagnosen sind für die neun eigenen C-Module einschließlich lokaler SDK-Anpassungen jetzt Fehler: fehlende Funktionsdeklarationen, inkompatible Zeigertypen und Integer-/Zeigerkonvertierungen. Unveränderte SDK-Module erhalten diese zusätzlichen Optionen nicht.
- `fw/bootloader/src/main.c`, `dfu_completion.h` und `sdk/nrf_dfu_req_handler.c`: Der echte finale Execute-Ablauf zeigt **Pruefen...** unmittelbar vor der Abschlussvalidierung und **Speichern...** vor dem Schreiben und Sichern der Einstellungen. Der Hauptkontext zeichnet, nachdem `g_dfu_finalizing` konkurrierende Sitzungen sperrt. Es gibt keine künstliche Mindestanzeigezeit, keine Erfolgsbehauptung und keinen neuen SPI-Aufruf aus einem IRQ. Auch die nach einer abgelehnten Validierung notwendige Speicherung des ungültigen Bankzustands ist eine Speicherphase, kein Erfolg.
- `fw/bootloader/src/bitmap.h`: Fünf zusätzliche Originalglyphen `P`, `S`, `f`, `h`, `u` ergänzen die bisher gekürzte Schrift. Alle früheren Bildschirme bleiben im Modell pixelgleich. `tests/generate_boot_font.py` erzeugt die 27 Glyphen reproduzierbar aus der beigefügten Originalfont.
- `build.py`: Ein expliziter nativer Linux-Build ergänzt den gepinnten Docker-Build. SDK und GCC werden vor Verwendung per SHA-256 geprüft, das SDK wird nur in eine private temporäre Kopie entpackt. Hostvariablen wie `MAKEFLAGS`, `CFLAGS`, `GCC_EXEC_PREFIX` und `LD_PRELOAD` werden nicht an Compiler/Make weitergereicht. Vollständige Compiler- und Linkeraufrufe werden protokolliert. Der exportierte Payload enthält ausschließlich die Bootregion, keine UICR-/Settings-/MBR-Parameterseiten.

Boot- und Flashadressen, Tastenlogik, S112, Signaturprüfung, Versionierungs-/Rollbackregeln, Flash-Commit, Disconnect- und Resetlogik sind gegenüber Z15 unverändert. Bestehende Queue-Nachholung und terminaler LCD-Abbau bleiben erhalten. Die neuen Anzeigen beschleunigen den normalen Gerätestart nicht.

## Ergebnisbindung

| Eigenschaft | Z15 | Z17 |
|---|---:|---:|
| Bootloader-Payload | 26452 B | 26612 B |
| Freie physische Bootregion | 2220 B | 2060 B |
| Verbindlich reservierter Abstand | mindestens 1024 B | mindestens 1024 B |
| Initialisierte RAM-Sektionen | 72 B | 72 B |
| BSS | 11016 B | 11016 B |
| Heap / reservierter Stack | 0 / 4096 B | 0 / 4096 B |

Z17-Payload-SHA-256:
`5219e8abaab8cd8bd335116f6438dbb85ffe5d6b36467abef266e78b56e2e7cd`

Mit `0xff` auf 28672 B ergänzte Bootregion:
`5fec8c8495978afcd340e6b42db7fc9ba4fa9f216aad2b2a597cc7282877d584`

Docker und nativer Build erzeugen identische BIN- und HEX-Dateien. Die vollständigen ELF-/Map-Dateien dürfen sich aufgrund der Debugpfade unterscheiden. Die ARM-Anzeigetests binden ihre disassemblierten Einsprungstellen an die geladenen Bootregionbytes, nicht an irrelevante Debugpfade.

## Nachbauen

Die Originalnachweise und vorhandene `_build`-Ergebnisse bleiben erhalten. Für einen neuen Lauf ein neues, leeres Ausgabeverzeichnis verwenden:

```text
python3 build.py --check
python3 build.py --output /tmp/z17-docker-neu
python3 build.py --mode native --toolchain /pfad/arm-gnu-toolchain-12.2.rel1-x86_64-arm-none-eabi --sdk-archive /pfad/Nordic_SDK_Buildquellen_17_1_0.tar.gz --output /tmp/z17-native-neu
```

Docker bleibt Standard. Benötigt wird bereits vorhandenes Image:
`solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16`.

Native Voraussetzungen: Linux, Python >= 3.12, GNU make, Arm GNU Toolchain 12.2.Rel1. GCC-Version `12.2.1 20221205`, GCC-Datei-SHA-256 `a3c5b9d3b1d05160462b6c86e46f3a3471db314f6406f0e6a98973524ab00da3`. SDK-Archiv-SHA-256 `f726a4e717a0d8e00fe3de9f1e76b19a0c9646291de00097a75cda44c4bcd6d6`.

`--derive` ist ausschließlich für die ausdrückliche Ableitung eines neuen unsignierten Kandidaten gedacht. Der Standardmodus verlangt die bereits gebundenen Payloadbytes. Sourcehashes, Adressbereich und Mindestreserve werden in beiden Modi geprüft. Der Build signiert und flasht nichts.

## Wiederholbare Rechnerprüfungen

```text
python3 -B tests/run_offline.py --output /tmp/z17-tests-neu
```

Hierfür werden native GCC/ASan/UBSan, GNU nm und Unicorn 2.x benötigt. Der Prüflauf verwendet die ELF-/BIN-Dateien in `_build` und prüft:

- 11 Export-/Buildgrenzen: fremde und reservierte Adressen, UICR, Überlappung, Prüfsumme, EOF, 1024-B-Reserve, Quellenveränderung.
- 48 Transaktions-/Resetfälle und 19 SDK-Flashfälle jeweils nativ und mit ASan/UBSan. Die Phasen-Hooks prüfen zusätzlich Hauptkontext, Finalisierungssperre, Reihenfolge vor/nach Validierung und bereits gestarteten Commit-Watchdog.
- 26 Sitzungs-/Dispatchfälle und acht Ingress-Fälle jeweils nativ und mit Sanitizern.
- Bestehende C-Anzeige-/Clipping-/SPI-/Queue-Fälle für LCD128 und SH1106; zusätzlich vollständige neue Glyphen, mittige Texte, Reihenfolge, ausgefallene Queue, unveränderte Anzeige bei Wiederholungen und gesperrte Reaktivierung nach terminalem Zustand.
- Tatsächlich verlinkter ARM-Code: 44 IRQ-Schnittstellen, vier absichtlich erzwungene negative Kontrollen, vier Observer-Einstiege, sieben Tastenfälle, Queue-Nachholung und beide neuen Phasen.
- 69 ARM-Kryptoprüfungen am tatsächlich verlinkten Code, einschließlich ungültiger Signaturen/Schlüssel-/Hashfälle.

Jeder neue LCD-Phasenzustand braucht 32 modellierte SPI-Transfers und 1048 Drahtbytes; höchstens zwei zusätzliche Vollbilder fallen im finalen Updateabschluss an. Es wird keine künstliche Verzögerung eingefügt. Bei sehr schnellem Abschluss kann ein Zustand entsprechend kurz sichtbar sein. Reale Laufzeit und Sichtbarkeit sind noch nicht am Gerät gemessen.

Zusätzlich weist `tests/test_reserve.py` den echten Linkerfehler bei zusätzlichen 1200 bzw. 2048 zurückgehaltenen Bytes nach. Die Reserveprüfung wurde nicht nur an einer synthetischen HEX-Datei ausgeführt.

Die Größe `bss` aus `arm-none-eabi-size` enthält hier auch als NOBITS deklarierte Flashseiten und ist keine alleinige RAM-Verbrauchsangabe; maßgeblich sind die RAM-Sektionen der Map. Die üblichen Newlib-nosys-Linkerhinweise zu `_read/_write/_close/_lseek` und der LTO-Jobserverhinweis sind im Rohprotokoll sichtbar und werden nicht als neue Laufzeitfehler behauptet.

## Separat signierte optionale Android-Pakete

Die Auslieferung enthält ein gesondertes Android-Testpaket `Allmiibo_LCD_Z17_DE3_62_634_ANDROID_DFU_TESTSTAND.zip`. Es besteht aus dem Z17-Bootloader und App634; **kein SoftDevice** ist enthalten. Beide signierten Initpakete verlangen Hardware52 und das bereits installierte S1127.3.0/FWID0x0126. Bootloader und Anwendung werden in zwei Phasen übertragen, weil beim Bootloadertransfer die bisherige Appbank als Zwischenspeicher verwendet werden kann. Ein reines Bootloaderpaket ist deshalb nur als separat gekennzeichneter Labornachweis beigelegt.

Der Rückweg heißt `Allmiibo_LCD_Z18_RUECKKEHR_Z15_CODE_DE3_62_634_ANDROID_DFU.zip`. **Z18 bezeichnet ausschließlich den höheren DFU-Zähler18:** Der enthaltene Bootloader-Payload ist bytegleich zum früher geprüften Z15. Dieses Paket enthält ebenfalls App634 als zweite Phase und keinen SoftDevice. Nach Installation von Zähler18 wird das Z17-Paket mit Zähler17 erwartungsgemäß abgewiesen; der Rückweg ist kein beliebig wiederholbarer Umschalter.

Beide Pakete wurden unabhängig mit dem öffentlichen ECDSA-Schlüssel, Payloadhashes, Firmwaretypen, Größen, Countern und jeweils sechs negativen Kontrollen geprüft. Hinzu kommen 13 Fälle mit den tatsächlichen Z15-/Z17-ARM-Validierungsfunktionen und zwei App-Wiederherstellungsphasen: Update, Rückkehr, Countergrenzen, falsche S112-Version, defekte Signatur sowie ein gültig signierter, übergroßer Bootloader werden unterschieden. Ein Android-Funktransfer wurde nicht durchgeführt. Die privaten Signaturschlüssel sind nicht Teil dieser Quellen oder der Prüfpakete.

Der von Nordic veröffentlichte Android-Code behandelt `bootloader` und `application` als getrennte Manifestteile und trennt sie in zwei Phasen. Das Kombimanifest wurde aus zwei mit nrfutil6.1.7 signierten Teilpaketen zusammengesetzt; BIN und DAT blieben dabei unverändert. Quellstand und konkrete Stellen sind im Auslieferungsnachweis festgehalten: [Nordic BaseDfuImpl](https://github.com/NordicSemiconductor/Android-DFU-Library/blob/3ad004b12aeaa6df987af20224e05be710c9b11d/lib/dfu/src/main/java/no/nordicsemi/android/dfu/BaseDfuImpl.java#L343) und [ArchiveInputStream](https://github.com/NordicSemiconductor/Android-DFU-Library/blob/3ad004b12aeaa6df987af20224e05be710c9b11d/lib/dfu/src/main/java/no/nordicsemi/android/dfu/internal/ArchiveInputStream.java#L166).

## Noch offene Geräteabnahme

Der Rechnernachweis ersetzt keinen Test von Funk, Stromunterbrechung oder Displayhardware. Bei einer späteren getrennten Z17-Erprobung sind ein normales App-Update, DFU-Abbruch/Wiederverbindung, vollständiger Abschluss sowie die erwartete Bootregion-SHA und Zähler17 auszulesen. Z15-Originale und das höhere Z18-Rückkehrpaket bleiben getrennt. Eine App-Aktualisierung erfordert diesen optionalen Bootloader-Kandidaten nicht.
