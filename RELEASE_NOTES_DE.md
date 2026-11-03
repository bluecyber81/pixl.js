# DE3.56 und Dateimanager 3.34.0: bessere Eingabe und Bildergalerie

**Anwendung 2.22.0-DE3.56 / ZÃ¤hler 628 Â· Dateimanager 3.34.0 Â· BL8 Â· Nordic S112 7.3.0 Â· Packed LittleFS PFS1**

Diese Version verbessert die Bedienung am LCD und im Browser. Sie korrigiert auÃŸerdem eine Inkonsistenz nach der Katalogaktualisierung: GerÃ¤tesuche, Auswahlvorschau, Dateieigenschaften und lokale DateiprÃ¼fung verwenden jetzt denselben aktualisierten Sitzungskatalog wie der Figurenkatalog.

## Am Allmiibo

- **Beim Suchen und Umbenennen:** Die Tastatur zeigt auch bei leerem Feld das Zeichen, das ein kurzer Mitteldruck tatsÃ¤chlich einfÃ¼gt. Zuvor konnte sie einen GroÃŸbuchstaben anzeigen, obwohl ein Kleinbuchstabe eingefÃ¼gt wurde.
- **Kurzer oder langer Mitteldruck:** Oben zeigt beispielsweise `q/Q` die Eingaben fÃ¼r kurz/lang an; `_/SP` bedeutet Unterstrich kurz und Leerzeichen lang. Die bestehende Eingabefunktion bleibt erhalten. Lange Titel werden so begrenzt, dass sie diese Hilfe nicht Ã¼berdecken. DafÃ¼r wird kein zusÃ¤tzlicher Heap-Speicher angefordert.
- **Listenposition:** Der Scrollbalken ist auch in groÃŸen Ordnern mindestens drei Pixel hoch und erreicht den Anfang bzw. das Ende der Leiste. Die Berechnung verwendet Ganzzahlen statt FlieÃŸkomma; leere Listen zeigen keinen irrefÃ¼hrenden Positionsmarker.

## Im Dateimanager

1. **Figurenkatalog â†’ Bilder anzeigen:** Eine optionale Galerie lÃ¤dt Bilder nur fÃ¼r die aktuelle Seite. Vor dem Einschalten erfolgt kein Galerie-Bildabruf. Fehlende Bilder erhalten einen Platzhalter mit fester FlÃ¤che, damit die Karten nicht springen. Die Bildadressen sind an die aktive Katalogrevision gebunden. Der Abruf von GitHub Ã¼bermittelt die Ã¶ffentliche Figuren-ID und die IP-Adresse, keine GerÃ¤tedateien.
2. **Figurenkatalog â†’ Bestand filtern:** Nach â€žSammlung prÃ¼fenâ€œ lassen sich vorhandene, nicht gefundene und auffÃ¤llige Figuren sowie unbestÃ¤tigte/veraltete EintrÃ¤ge gezielt anzeigen. GrÃ¼n/Orange/Rot behalten ihre bisherigen PrÃ¼fregeln. Insbesondere wird eine TeilprÃ¼fung nicht als Nachweis fehlender Figuren behandelt; ein Ergebnis nach dem Trennen bleibt als frÃ¼here Beobachtung gekennzeichnet.
3. **Weiter/ZurÃ¼ck:** Ein bewusster Seitenwechsel fÃ¼hrt zum Anfang der neuen Ergebnisse. Die Sucheingabe verschiebt weder Fokus noch Ansicht. Beim Seitenwechsel schlieÃŸen sich alte Details, wÃ¤hrend die Galerieauswahl erhalten bleibt.
4. **Nach neuen Figuren suchen:** Ãœbernommene Katalogdaten gelten jetzt auch unter â€žAuf dem GerÃ¤t suchenâ€œ, in der Auswahlvorschau, den Dateieigenschaften und â€žEigene Figurendatei lokal prÃ¼fenâ€œ. Eine laufende GerÃ¤tesuche wird beim Katalogwechsel beendet und kann mit dem neuen Stand neu gestartet werden. VerspÃ¤tete Ergebnisse/Bildfehler des alten Stands Ã¼berschreiben nicht die neue Auswahl.

Der gebÃ¼ndelte Katalog enthÃ¤lt weiterhin **952 IDs**. Bilder und Katalogangaben sind keine Figurendateien; ein ID-Treffer bestÃ¤tigt weder SignaturgÃ¼ltigkeit noch SpielunterstÃ¼tzung. Es wurde keine neue private BIN-Sammlung ergÃ¤nzt.

## Downloads und Installation

- [Allmiibo_LCD_DE3_56_628_TESTSTAND.zip](https://github.com/bluecyber81/pixl.js/releases/download/de3.56/Allmiibo_LCD_DE3_56_628_TESTSTAND.zip): flashbare **Anwendung** fÃ¼r passende LCD/PFS1-GerÃ¤te. Das ZIP unverÃ¤ndert verwenden.
- [Allmiibo_Dateimanager_3_34_0.zip](https://github.com/bluecyber81/pixl.js/releases/download/de3.56/Allmiibo_Dateimanager_3_34_0.zip): portabler Dateimanager mit lokalem Startprogramm.
- [Allmiibo_DE3_56_Quellcode.zip](https://github.com/bluecyber81/pixl.js/releases/download/de3.56/Allmiibo_DE3_56_Quellcode.zip): Firmware-/Projektquellen und Entwicklerdokumentation.
- [Allmiibo_Dateimanager_3_34_0_Quellcode.zip](https://github.com/bluecyber81/pixl.js/releases/download/de3.56/Allmiibo_Dateimanager_3_34_0_Quellcode.zip): Browserquellen und Tests.
- [Allmiibo_DE3_56_Web3_34_0_Gesamtpaket.zip](https://github.com/bluecyber81/pixl.js/releases/download/de3.56/Allmiibo_DE3_56_Web3_34_0_Gesamtpaket.zip): Gesamtdownload mit Anleitung und PrÃ¼fsummen. **Das Ã¤uÃŸere Archiv ist nicht flashbar.**
- `SHA256SUMS.txt`: PrÃ¼fsummen der verÃ¶ffentlichten Dateien.

[Online-Dateimanager](https://bluecyber81.github.io/pixl.js/) Â· [DFU-Seite fÃ¼r Anwendungen](https://bluecyber81.github.io/pixl.js/dfu/web.html) Â· [Bauanleitung](https://github.com/bluecyber81/pixl.js/blob/de3.56/docs/BUILD_DE3_56.md)

Die neuen Browserfunktionen benÃ¶tigen kein GerÃ¤teupdate. FÃ¼r die neue Tastaturdarstellung und Scrollleiste ist DE3.56 erforderlich. **BL8, Nordic S112 7.3.0 und das PFS1-Datenlayout bleiben unverÃ¤ndert.** Eine vorhandene passende Sammlung benÃ¶tigt keine Formatierung oder Wiederherstellung. Alte DE3.8/DE3.16-SPIFFS-GerÃ¤te und normales Upstream-LittleFS benÃ¶tigen weiterhin einen getrennten, passenden Migrationsweg; dieses ZIP stellt deren Speicher nicht um. Die [separaten BL8-/S112-Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/bl8-s112-7.3.0) behalten ihre eigenen Installationsvoraussetzungen.

## PrÃ¼fung und Grenzen

Gezielte Regressionen prÃ¼fen die tatsÃ¤chlichen Vue-Komponenten mit Katalogwechseln, Bildfreigaben, Filtern und Seitenwechseln sowie die GerÃ¤te-Texteingabe und Scrollanzeige in Host-Tests. Die abschlieÃŸenden Ergebnisse gehÃ¶ren zum versionsgebundenen PrÃ¼fbericht; frÃ¼here DE3.55-GerÃ¤tebeobachtungen gelten nicht als GerÃ¤tetest von DE3.56. **Eine direkte GerÃ¤teprÃ¼fung dieser neuen Version steht noch aus.** Ein schnellerer Start oder neue Funk-/NFC-Funktionen werden fÃ¼r dieses Update nicht behauptet.

Die bisherigen Speicher-, Tasten-, Bluetooth-/NFC-, DFU-, Sicherungs- und Migrationsfunktionen bleiben Teil der Quellen. Private SchlÃ¼ssel, GerÃ¤tesicherungen und Figurendateien sind nicht enthalten. Herkunft und Lizenzen von solosky, cylin577 und den Komponenten bleiben erhalten. [AusfÃ¼hrlicher Verlauf](https://github.com/bluecyber81/pixl.js/blob/de3.56/docs/DEVELOPMENT_HISTORY.de.md).

## Vorschau

Browseraufnahme ohne verbundenes Gerät; LCD-Darstellung aus Produktionscode und Originalschriften, keine Gerätefotografie.

![Galerie](https://raw.githubusercontent.com/bluecyber81/pixl.js/de3.56/docs/images/de356-gallery.png)

![LCD-Tastatur](https://raw.githubusercontent.com/bluecyber81/pixl.js/de3.56/docs/images/de356-keyboard.png)
