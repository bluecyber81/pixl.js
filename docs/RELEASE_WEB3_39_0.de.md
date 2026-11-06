# Dateimanager 3.39.0: Figurenhinweise, Dateivergleich und lokale Slotprüfung

Stand: 6. November 2026. Dieser Browserstand ist am Rechner und in Chrome geprüft. Die
Nachweise stehen in [WEB3_39_0.json](validation/WEB3_39_0.json). Ein Test
am realen Allmiibo ist damit nicht nachgewiesen.

## Figurenhinweise öffnen

Unter **Figurenkatalog → Details und Bild** sowie in der **Dateivorschau**
erscheinen die Spiel-/Kategoriezuordnungen und vorhandenen Nutzungshinweise
aus dem gebündelten Katalog. Die Zuordnungen umfassen **952 Figuren und
1.344 Verknüpfungen**. Acht unterschiedliche redaktionelle deutsche
Teilübersetzungen werden bei 13 Zuordnungen verwendet. Weitere vorhandene
Hinweise erscheinen mit gekennzeichnetem englischem Quelltext. Der englische
Originaltext einer Übersetzung lässt sich aufklappen.

Der Katalog ist ein datierter Quellenstand. Zuordnung und Beschreibung sind
keine Bestätigung der Spielkompatibilität, einer Belohnung oder der Erkennung
einer konkreten Datei. Fehlende Hinweise belegen ebenso wenig fehlende
Spielunterstützung. Deutsche Eigennamen sind nicht als offizielle Spielbegriffe
bestätigt. Dafür werden keine zusätzlichen Gerätedateien gelesen.

## Gleiche ID und gleichen Dateiinhalt unterscheiden

**Figurensammlung → Prüfung: Dateiinhalte prüfen (empfohlen) → Sammlung prüfen → Anzeigen → Gleiche
Figuren-ID / Dateiinhalte** zeigt innerhalb einer ID getrennte Inhaltsgruppen.
Dateigröße und SHA-256 der bereits gelesenen Bytes bestimmen die Gruppen.
Zwei gleiche Dateien und eine abweichende Datei bleiben dadurch erkennbar.
Es entstehen keine zusätzlichen Bluetooth-Lesezugriffe für den Vergleich.

Die Schnellprüfung liest nur Dateieigenschaften und zeigt ausdrücklich, dass
Dateiinhalte nicht verglichen wurden. UID, Spielstand oder Varianten können
trotz gleicher Figuren-ID abweichen. Eigenschaften werden nicht auf Gleichheit
geprüft und es wird nichts automatisch gelöscht. Nach einem Schreibvorgang
bleibt der Bericht als veraltet markiert; für einen aktuellen Bestand erneut
prüfen. Der Vergleich gilt für beobachtete Bytes, nicht als atomarer Zustand
des gesamten Geräts, Signaturprüfung oder Spieltest.

## Karten-Slot lokal prüfen und eine Kopie herunterladen

1. **Gerät & Diagnose → Karten-Slot lokal prüfen** öffnen.
2. Aus derselben eigenen Sicherung zuerst `chameleon/slots/config.bin` auswählen.
   Unterstützt wird die vollständige Konfiguration v8.
3. Den Slot auswählen und seine zugehörige `NN.bin` laden. Die Anzeige nennt den
   erwarteten Dateinamen; Slot 1 entspricht beispielsweise `00.bin`.
4. Nur wenn die Prüfung das bekannte alte UID-Kopiermuster mit gültigem BCC0
   und BCC1 erkennt, erscheint **Korrigierte Kopie herunterladen**.

Unterstützt sind MF0ICU1, MF0ICU2, MF0UL11 und MF0UL21 mit exakt passendem
Layout und Dateiumfang. Die Slotdatei selbst enthält keine Typ-/Versionskennung;
die tatsächliche gemeinsame Herkunft der ausgewählten Dateien kann der Browser
nicht beweisen. Andere Typen, unbekannte UID-Abweichungen und ungültige BCCs
erhalten kein Reparaturangebot.

Die heruntergeladene `NN.uid-corrected.bin` übernimmt die UID aus den
Speicherpages in die Antikollisionsdaten. Höchstens vier UID-Bytes ändern sich;
alle übrigen Bytes und die Quelldatei bleiben erhalten. Die Kopie wird vor dem
Download erneut geprüft. Der Vorgang bleibt lokal und schreibt nichts auf das
Gerät. Karteninhalt, Authentifizierung und Lesegerätfunktion sind damit nicht
bestätigt; ein späteres Einspielen ist ein eigener Schritt.

## Interne Journale beim ZIP-Import

**Sicherung → ZIP importieren → Sicherungs-ZIP auswählen → Vergleichen** zeigt
in einem normalen Schema-1-Backup die exakten Dateien `.pixl_txn_old` und
`.pixl_txn_new` im Stamm von I:/ oder E:/ als gesperrte interne Journale.
Sie bleiben samt Bytes im Archiv erhalten und sind nicht auswählbar.
Andere sichere ausgewählte Dateien können weiterhin wiederhergestellt werden.

Ein aktiver oder unbekannter Eintrag mit dem Stammpräfix `.pixl_txn` sperrt den
gesamten Import. Dazu zählen `.pixl_txn_pending`, unbekannte Endungen und
Ordner mit einem Journalnamen. Quelle und umgeleiteter Zielpfad werden geprüft;
die Transaktionslage am Ziellaufwerk wird vor Schreibzugriffen erneut gelesen.
Legitime gleichnamige Einträge innerhalb gewöhnlicher Unterordner bleiben
normale Dateien. Es gibt keine automatische Journalbereinigung oder Löschung.
Schema-2-Sicherungen mit Raw128-Daten gehören weiterhin in den Migrationsassistenten.

## Firmware, Nachweise und Grenzen

**App DE3.62 / 634, Bootloader Z17 und Nordic S112 7.3.0 bleiben unverändert.**
Dieses Webupdate liefert kein neues Flashpaket und verlangt keine neue
Speicherumstellung. Die lokale Quell-/Testarbeit ersetzt keine Geräteprüfung.
Historische Prüfzahlen früherer Versionen werden nicht als neue 3.39.0-Ergebnisse
übernommen. Die aktuellen Belege dokumentieren Testumfang, Buildbindung und offene Hardwareprüfung.

[Benutzung](DATEIMANAGER_WEB.md) · [Web-Quellen und Build](../web/README.md) ·
[Vorheriger Browserstand 3.38.1](RELEASE_WEB3_38_1.de.md) ·
[Unveränderte App DE3.62](RELEASE_DE3_62.md)
