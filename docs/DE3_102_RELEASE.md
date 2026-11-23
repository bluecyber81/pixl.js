# LCD App675 – DE3.102

Stand: 23. November 2026. Normaler LCD-Anwendungsstand; die abschließende Softwarequalifizierung und Veröffentlichung laufen noch.

## Änderungen

Der BLE-Bildempfang bestätigt weiterhin jedes vereinbarte Datenteilstück sofort. Die Anzeige wird erst bei einem vollständigen Bild oder geänderter Bildgültigkeit neu angefordert. Verbindungswechsel, Fehler beim späteren Senden einer Bestätigung, HUD und Inversion behalten ihre Aktualisierung.

Im Animationsplayer stehen vor der Dateiauswahl die Optionen **Endlosschleife** und **Bildzähler**. Beide sind zunächst aus und gelten nur während dieser Player-Sitzung. Ein ausgeschalteter Bildzähler lässt die Bildfläche frei. Die bisherige Beenden-Bedienung bleibt erhalten.

Die Schleife öffnet die Datei nur lesend erneut. Jede Runde prüft Header, Abmessungen, Bildrate, Framezahl und exakte Dateilänge erneut; ein geändertes Format oder ein Dateifehler beendet die Wiedergabe sauber. Es gibt weiterhin einen einzigen Framepuffer. Das vorhandene PIXV-Format bleibt unverändert; Dateien gehören nach `/player`.

## Umfang

Nur für LCD/ST7567 mit bestehendem PFS1, Z21 und S112 7.3.0. Das signierte Paket enthält ausschließlich App675; Bootloader und SoftDevice werden nicht ersetzt. Die PFS-Engine bleibt bytegleich zum Vorgänger. Die getrennte OLED-Testfirmware ist unverändert.

Der Browser-Bildsender kann weiterhin mit App673 und App674 verwendet werden. App675 ergänzt die gezielte Neuzeichnung sowie die beiden Player-Optionen. Für diese Neuerungen ist das neue Firmwarepaket erforderlich.

## Aktueller Prüfstand

Ein isolierter Kandidatenbuild, die Paket-Signatur einschließlich drei Negativkontrollen, ein vollständiger 198/198-Hostlauf und 13/13 Gruppen am tatsächlich gelinkten ARM-Programm sind erfolgreich. Nach einer rein testseitigen Anpassung für die Sanitizer-Kompilierung wird der vollständige Host-Snapshot erneut geprüft. Unabhängiger Wiederholungsbuild, aktuelle Z21-App675-Qualifizierung und GitHub-CI werden im Abschlussnachweis ergänzt.

Der Kandidat umfasst 361.892 Byte BIN. Die interne Flashreserve beträgt 10.832 Byte, der statische Abstand zwischen Heap- und Stackgrenze 1.672 Byte; der reservierte Stack umfasst 8.192 Byte. Das sind Linkerwerte, keine Messung des zur Laufzeit freien Heaps.

## Offene Geräteabnahme und nächster Schritt

Auf einem echten LCD-Gerät stehen noch Bild-/Videostream, Wechsel und Beenden der Miniapps, Loop/Bildzähler sowie Switch-2-Scan/Wecken aus. Eine konkrete Steigerung von Bildrate oder Akkulaufzeit wurde nicht gemessen. Nach Abschluss der Softwarequalifizierung folgt eine kurze Geräteabnahme mit vorhandener Laufzeitdiagnose.
