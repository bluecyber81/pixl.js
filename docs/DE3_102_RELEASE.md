# LCD App675 – DE3.102

Stand: 23. November 2026. Normaler LCD-Anwendungsstand. Die lokale Softwarequalifizierung und der unabhängige GitHub-Lauf sind abgeschlossen. Die echte Geräteabnahme bleibt offen.

## Was sich ändert

**BLE-Bildempfang:** Jedes vereinbarte Datenteilstück wird weiterhin sofort bestätigt. Ein neues Zeichnen wird erst bei einem vollständigen Bild oder geänderter Bildgültigkeit angefordert. Teilbilder bleiben unsichtbar. Verbindungswechsel, Fehler beim späteren Senden einer Bestätigung, HUD und Inversion behalten ihre Aktualisierung. Die bestehende MUI-Ereigniswarteschlange fasst wartende Neuzeichnungen weiterhin zusammen.

Der gezielte Test mit echtem Codec, echten Callbacks und echter MUI-Warteschlange bestätigt für ein Rohbild in 52 Teilstücken: 52 Bestätigungen, ein ausgelöster Zeichenlauf. Das ist ein kontrollierter Softwaretest; daraus wird weder eine 52-fache Beschleunigung noch eine bestimmte Akkulaufzeit abgeleitet.

**Animationsplayer:** Im Dateimenü stehen vor den Clips die Optionen **Endlosschleife** und **Bildzähler**. Beide sind zunächst aus und gelten nur für die aktuelle Player-Sitzung. Eine Auswahl schaltet die betreffende Option um und behält den Menüfokus. Der ausgeschaltete Zähler lässt die Bildfläche frei. Die bisherigen kurzen und langen Beenden-Gesten bleiben unverändert.

Die Schleife öffnet die Datei nur lesend erneut. Jede Runde verlangt denselben erneut validierten Header und dieselbe Framepuffergröße; Änderungen an Abmessungen, Bildrate, Framezahl, Dateilänge oder ungültige Header beenden die Wiedergabe sauber. Fehler beim Schließen, Öffnen oder Lesen lassen weder einen Dateideskriptor noch einen laufenden Player zurück. Der Player behält einen einzigen Framepuffer und seinen vorhandenen Timer.

## Verwendung

PIXV-Dateien liegen auf dem Gerät in `/player` beziehungsweise im Web-Dateimanager unter `E:/player/`. Das vorhandene Format bleibt unverändert: 16-Byte-Header, anschließend zeilenweise aufgefüllte XBM-Bilder. Bei 128 × 64 Pixeln benötigt jedes Bild 1.024 Byte. Ein Clip mit 50 Bildern und 5 FPS umfasst deshalb 51.216 Byte. Die Datei wird nacheinander gelesen, nicht vollständig in den RAM geladen.

Der Browser-Bildsender und das vorhandene PIXV-Format funktionieren weiterhin mit App673/App674. App675 ergänzt die gezielte Neuzeichnung, die Endlosschleife und den ausblendbaren Bildzähler. Wer diese Firmware-Neuerungen nutzen möchte, benötigt App675. Die vorherigen beiden Menüsymbole bleiben enthalten.

## Paket und Geltungsbereich

Nur für **LCD/ST7567 mit bestehendem PFS1, Z21 und S112 7.3.0**. Das signierte Paket enthält ausschließlich App675; Bootloader und SoftDevice werden nicht ersetzt. Die PFS-Engine bleibt bytegleich zum Vorgänger. Die getrennte OLED-Testfirmware ist unverändert.

- Version: `2.22.0-DE3.102`, DFU-Zähler `675`, Hardware `52`, SoftDevice-FWID `0x0126`.
- Paket: `Allmiibo_LCD_DE3_102_675_NUR_APP.zip`, 362.493 Byte.
- ZIP-SHA256: `2d40717123741d58f357c2c146c29c1b29ea907e184346c9defa7a3c85e75746`.
- BIN: 361.892 Byte; SHA256 `28050b4e64400586f1a9d9aff94266887291c7be07c65ba32c390fec60ea2c06`.
- SourceID: `9f60aa974f975a552762605d68d0f0e32ad6676f392b12173856177535a5ba46`.
- Produktionsquellstand: `658d43a7fe2777778d8efa8439f73aa48210e033`.

## Durchgeführte Prüfungen

- Zwei isolierte LCD-Builds mit identischen BIN- und HEX-Dateien; BIN entspricht dem signierten Paket.
- Finaler vollständiger Hostlauf lokal und auf GitHub jeweils **198/198 Prüfskripte**, keine Auslassung, unveränderter Quellen-/Testsnapshot während des jeweiligen Laufs.
- Lokal **13/13 Prüfgruppen** am tatsächlich gelinkten ARM-Programm; zusätzlich tatsächliche ARM-Player-/Listen-/TLSF-Allokation und vollständige Freigabe.
- Stream: **146** UI-/ACK-/Redraw-Prüfungen mit echtem Codec und echter MUI-Zusammenfassung; außerdem die bestehenden Radio-, Schlaf- und Exit-Prüfungen.
- Player: **160** Pfad-/Listenfälle mit Mlib/TLSF, **21** Loop-/Zähler-/Grenz-/Reopen-Fälle und drei Eingabesequenzgruppen. Dazu zwölf Lebenszyklusgruppen unter ASan/UBSan, darunter tatsächliche Nordic-Timerfunktionen.
- Signatur, exakte Paketstruktur, Web-/Firmwarepaketgleichheit und drei manipulierte Negativkontrollen.
- Unverändertes Z21 aus gebundenen Quellen bytegleich reproduziert. Aktuelles App675: sieben tatsächliche ARM-Signatur-/Hash-/CRC-Fälle und Annahme des signierten INIT mit vorhandener App674 sowie leerer Bank.
- Aktuelle vollständige App675-Datenphase: Wiederaufnahme bei 0, 131.072 und 327.680 Byte, 455 modellierte Stromunterbrechungen an Checkpoints, fünf Verbindungsunterbrechungen sowie acht Annahme-/Abschlussfehler unter lokalem ASan/UBSan.

Der originale lokale LSan-Vortest meldet ausdrücklich, dass LeakSanitizer unter der verwendeten ptrace-Umgebung nicht arbeitet. Der lokale Wiederaufnahmetest ist deshalb als ASan/UBSan-Lauf ohne LSan gekennzeichnet. Der aktuelle [GitHub-Lauf 45169716170](https://github.com/bluecyber81/pixl.js/actions/runs/45169716170) hat denselben App675-Datenpfad dagegen mit ASan/UBSan und positiver LSan-Kontrolle bestanden. Der aus seinem LCD-Artefakt geladene Nachweis bindet die vollständigen 361.892 Byte ausdrücklich an den aktuellen BIN-Hash. Der unabhängige Build liefert dieselben BIN-/HEX-Dateien und dieselbe Liste von 720 Produktionseingaben wie beide lokalen Builds; zusätzlich bestehen seine acht verknüpften ARM-Prüfgruppen. Fünf aktive Workflow-Jobs sind erfolgreich, der optionale BL8-Job ist übersprungen. Historische Paketprüfungen der anderen Bootloader-Jobs werden nicht als neue App675-Prüfungen gezählt.

## Speicherbedarf und Grenzen

Gegenüber App674 kommen **540 Byte Firmware** hinzu. Die interne Flashreserve beträgt **10.832 Byte**, der statische Abstand zwischen Heap- und Stackgrenze bleibt **1.672 Byte**; der reservierte Stack umfasst **8.192 Byte**. Diese Linkerwerte sind keine Messung des freien Laufzeitheaps.

Die gelinkte ARM-Playerstruktur wächst von 52 auf 120 Byte, also um 68 Byte einschließlich begrenztem Dateipfad. Im konkret geprüften Menümodell mit einem Clip benötigen Player und Liste zusammen 104 Byte mehr Heap; nach dem Beenden wird der gesamte Speicher zurückgegeben. Andere Dateianzahlen können andere Listenkapazitätsschritte auslösen. Es gibt keinen zusätzlichen Framepuffer und keine neuen persistenten Einstellungsdateien.

## Offene Geräteabnahme und nächster Schritt

Auf einem echten LCD-Gerät stehen noch Bild-/Videostream, Verbindungstrennung und erneute Verbindung, Wechsel und Beenden der Miniapps, Loop/Bildzähler sowie Switch-2-Scan/Wecken aus. Eine konkrete Steigerung von Bildrate oder Akkulaufzeit wurde nicht gemessen. Nach der Web-Veröffentlichung folgt eine kurze Geräteabnahme mit vorhandener Laufzeitdiagnose vor und nach normaler Nutzung.

Die maschinenlesbare Zusammenfassung steht in `docs/validation/DE3_102.json`; die einzelnen öffentlichen Nachweise liegen unter `docs/validation/DE3_102_evidence/`. Private Schlüssel, persönliche Backups und Figurendumps sind nicht enthalten.
