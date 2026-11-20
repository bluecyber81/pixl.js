# Allmiibo LCD DE3.93 / App666

Stand: 20. November 2026. Diese signierte Anwendung liegt als **Vorschau auf
`test/lcd-de393-app666`** vor. Die bisherige stabile LCD-Freigabe bleibt
DE3.89 / App662. Geräteabnahme und physische Durchsatzmessungen für App666
stehen noch aus.

[Signiertes Anwendungspaket](../../fw/releases/Allmiibo_LCD_DE3_93_666_NUR_APP.zip)
· [Maschinenlesbare Prüfnachweise](DE3_93.json)

Das Paket ist für den geprüften LCD-Pfad mit Nordic S112 7.3.0 / FWID
`0x0126` und Z21 bestimmt. Es enthält ausschließlich die Anwendung.
Vorhandenes PFS1 bleibt kompatibel; eine Formatierung ist dafür nicht nötig.
OLED sowie die getrennten Bootloader- und SoftDevice-Pakete sind eigene
Komponenten und erhalten durch dieses Anwendungspaket keine neuen Bytes.

## Änderungen gegenüber App665

**Verbindung behalten.** Eine abgelehnte Anfrage nach bevorzugten
BLE-Verbindungsparametern löste bislang trotz gültiger Verbindung eine
Trennung aus. Dieser zusätzliche Disconnect wurde entfernt. Das Telefon
kann seine gültigen Parameter behalten, auch ein schnelleres Intervall.
Das ist eine Fehlerkorrektur; ein höherer physischer Durchsatz ist damit
noch nicht gemessen.

**Speicher mit weniger Lesezugriffen freigeben.** Die vorhandene automatische
Freigabe nach erfolgreichem Commit beziehungsweise nach Schließen des
letzten alten Lesers bleibt erhalten. Der Garbage Collector führt jetzt
einen zusammenhängenden LittleFS-Verzeichnisdurchlauf aus. Der eingebundene
LittleFS-Code führt den registrierten Iterator bei Löschungen und Änderungen
der Metadatenkette nach. Alte Daten, die noch ein Datei- oder
Verzeichnissnapshot benötigt, bleiben bis zu dessen Schließen erhalten.

**Speicherfehler in den Menüs sichtbar machen.** Amiibo-Automatik,
AmiiboDB-Automatik/QR-Einstellung und AmiiboLink-Modus prüfen nun den
Speichererfolg und ermöglichen einen erneuten Versuch mit derselben Auswahl.
Eine noch nicht gespeicherte RAM-Einstellung wird entsprechend angezeigt.
AmiiboDB speichert vor dem normalen Verlassen seiner Einstellungen und
bleibt bei einem Fehler dort. Die Chameleon-Namenseingabe bleibt nach einem
fehlgeschlagenen Speichern geöffnet.

**Mehr Flashreserve.** Nicht verwendete MD5-/SHA-512-Implementierungen werden
im LCD-Build nicht mehr über den generischen MbedTLS-Dispatcher mitgezogen;
ein ausdrücklich aktivierter SHA-512-Backendpfad bleibt berücksichtigt.
Der benötigte SHA-256-/HMAC-SHA-256-Pfad wurde im tatsächlich gelinkten
Programm geprüft. Die Anwendung ist 6.560 Byte kleiner als App665.
Die Linkerreserve wächst von 8.192 auf 14.752 Byte; die vorgeschriebenen
Budgets werden nicht abgesenkt.

## Messbare Host-Ergebnisse

Beide Speicherimplementierungen wurden auf demselben wiederhergestellten
NOR-Modell verglichen. Der Korpus enthielt 1.084 Dateien, 57 Ordner und
661.294 Nutzdatenbytes. Nutzdaten und alle 128 Metadatenbytes je Eintrag
wurden nach den Änderungen vollständig geprüft. Private Korpusdateien sind
nicht Bestandteil dieses Quellenzweigs.

| Vorgang | Leseaufrufe App665 | Leseaufrufe App666 | Änderung |
|---|---:|---:|---:|
| Sammlung umbenennen | 48.884 | 47.255 | −3,33 % |
| Umbenennung zurück | 48.529 | 46.879 | −3,40 % |
| Letzten alten Verzeichnissnapshot schließen | 9.110 | 7.481 | −17,88 % |
| 20 kleine Slotdateien neu schreiben | 90.967 | 81.398 | −10,52 % |

Beim letzten Snapshot sinkt die Anzahl der GC-Verzeichnisscans von 28 auf 1.
Program- und Erase-Zahlen bleiben jeweils gleich. Diese Werte beschreiben
physische Leseaufrufe des Host-NOR-Modells, **keine Gerätezeiten oder
Bluetooth-Übertragungsraten**. Die Mount-Startzeit wurde dadurch nicht neu
vermessen.

## Bindung des gelieferten Pakets

| Merkmal | Wert |
|---|---|
| Firmware / Zähler | `2.22.0-DE3.93` / `666` |
| Board | LCD |
| Anwendung | 357.964 Byte |
| Signiertes ZIP | 358.565 Byte |
| SourceID | `415e85895e35e4f06cede89d6efbbe7e905290205723f0b31e9ddda9f05ac12a` |
| BIN SHA-256 | `bc08b79455d525667c03a1c03193bfb8d11a2e0416331dcc0d8ed90381550652` |
| ZIP SHA-256 | `b2a2f5f13659ef8ca5ebc7d53e320951a6cee3691fcb7054e7d513cde9caa81e` |
| PFS1-Engine SHA-256 | `7c7f2d25b90892980e9ce76e18cdaaa3782f18b940d95b8e37be6eb40831318e` |

Alle 709 Produktionseingaben dieses Quellenstands entsprechen dem geprüften
Build. Zwei unabhängige Builds lieferten bytegleiche BIN- und HEX-Dateien.
Die ELF-Dateien unterscheiden sich in ihren Debugpfaden. Das signierte ZIP
enthält genau das geprüfte BIN. Native Signaturprüfung und drei
Manipulationskontrollen bestanden.

## Ausgeführte Prüfungen

- Vollständige Firmwareprüfung: **177 von 177 Skripten bestanden**.
- Neun Prüfungen am gelinkten ARM-Programm: Stack-Wasserzeichen, erster
  Menüaufruf, AES, Flash-ID, Displayprofil, Rotation, LCD-Gerätetestlogik,
  Fehlerdiagnose und Chameleon-Speicherbildschirm; Hardware dabei modelliert.
- Zusätzlich 32 SHA-256-, 16 HMAC-SHA-256- und acht Puffer-/Wiederholungsfälle
  am gelinkten Programm bestanden.
- PackedFS: 36 Lifecycle-Fälle, vier Read-only-Fälle, zwei Wartungsfehler,
  243 NOR-Fehlerpunkte und 1.306 physische Lesefehlerpunkte bestanden.
- Die neue GC-Regression entfernt 160 beziehungsweise 400 Altgruppen über
  reale Metadaten-Splits/Drop hinweg. Aktuelle und gepinnte Inhalte sowie
  fremde Dateien bleiben erhalten. Zwei Teilfehler nach bereits sechs
  Löschungen schließen den Iterator und erlauben die vorgesehene Erholung.
- ASan/UBSan bestanden. LeakSanitizer ist unter der verwendeten
  `ptrace`-Umgebung nicht ausführbar; die zusätzliche Allokationsbilanz
  der Fixtures endet bei null.
- Der unveränderte Z21-Bootloader prüft in ARM-Emulation sieben tatsächliche
  Signatur-/Hash-/CRC-Fälle. Seine Init-/Bankauswahl akzeptiert das Paket
  sowohl bei vorhandener App665 als auch bei leerer Anwendungsbank.

Die Prüfungen greifen auf kein physisches Gerät zu. Sie bestätigen weder
Funkgeschwindigkeit noch einen tatsächlich abgeschlossenen DFU-Vorgang.

## Build wiederholen

`RELEASE_INFO.json` behält die stabilen App662-Daten und enthält eine
getrennte `firmware_preview` für App666. Der vorhandene Offline-Builder
verwendet dafür die gepinnten Toolchain- und SDK-Versionen:

```sh
python3 tools/build_lcd.py --mode preview --backend native \
  --sdk-archive /pfad/nRF5_SDK_17.1.0.tar.gz \
  --toolchain /pfad/arm-gnu-toolchain-12.2.rel1-x86_64-arm-none-eabi \
  --output /pfad/neuer-leerer-buildordner
```

Der Builder prüft BIN-Hash und SourceID gegen die Vorschau. Alternativ
akzeptiert der Entwicklungsmodus die expliziten Werte
`--mode development --version 2.22.0-DE3.93 --counter 666`.
Lokale Wiederholungsbuilds sind unsigniert; im Quellenzweig befindet sich
kein privater Signierschlüssel.

## Nächster Gerätetest

Mit demselben Handy einen entbehrlichen Testsatz übertragen, vollständig
prüfen und die Dauer festhalten. Den freien Speicher vor dem Schreiben,
nach dem Schreiben und unmittelbar nach dem Löschen messen; einen noch
geöffneten alten Leser schließen und dabei keinen Neustart einfügen.
Anschließend Einstellungen mit Wiederholung speichern, nach Neustart
kontrollieren und Chameleon-Namen, NFC sowie Schlafen/Aufwachen prüfen.
Physische Android-DFU-Unterbrechung und Wiederaufnahme bleiben ebenfalls
offen.
