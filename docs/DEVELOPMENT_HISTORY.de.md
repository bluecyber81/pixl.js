# Entwicklung der DE-Firmware und des Dateimanagers

## Dateimanager 3.39.1

Abwählbare Screen Wake Lock während laufender Vorgänge mit Statusanzeige, explizitem Wiederholungsversuch und Freigabe bei Abschluss, Trennung oder Unmount. Keine BLE- oder Geräteänderung; manuelles Sperren bleibt außerhalb der Zusage.


## Dateimanager 3.39.0

Der lokal vorbereitete Browserstand ergänzt Kataloghinweise in Figurendetails und Dateivorschau: 952 Figuren, 1.344 Zuordnungen, acht deutsche Teilübersetzungen für 13 Zuordnungen und englischer Rückfall. Die Hinweise sind keine Spielprüfung. Die Sammlungsprüfung trennt gleiche IDs von SHA-256-Inhaltsgruppen ohne zusätzliche BLE-Lesezugriffe. Eine lokale MF0-Slotprüfung bietet bei passender v8-Konfiguration, Slotdatei, altem UID-Kopiermuster und gültigen BCCs eine korrigierte Kopie an. Normale ZIP-Restores schließen inaktive OLD/NEW-Journale sichtbar aus; aktive/unklare Transaktionen sperren den ganzen Import. App DE3.62/634, Z17 und S112 bleiben unverändert. Geräteprüfung, Veröffentlichung und eigene neue Sicherung sind separate Schritte. [Bedienung und Grenzen](RELEASE_WEB3_39_0.de.md).

## Dateimanager 3.38.1

Ein fehlgeschlagenes Öffnen des Sicherungslaufwerks behält seinen Fehlerhinweis auch nach erfolgreicher Rückkehr zur Laufwerksauswahl. Wiederholung und neue Verbindungen bereinigen den passenden Zustand. Der Browser-Test bildet die bisher übersehene Rücksetzung des Listenfehlers nach. App634/DE3.62, Bootloader Z17 und S112 bleiben unverändert. Die Kartenpuffer-Prüfung zählt jetzt alle 5.150 bereits vorhandenen Assertions; es ist keine weitere Firmwarekorrektur. [Nachprüfung](RELEASE_WEB3_38_1.de.md).

## DE3.62 / 634 und Dateimanager 3.38.0

Der Kartenemulator fängt fehlende, unbekannte und verkürzte Puffer vor dem
Import/Export ab. Eigene C-Module werden auf kritische Typfehler streng geprüft;
Docker und Linux erzeugen dieselben Firmwarebytes. Die Startdiagnose zeigt
zusätzliche Mountzeiten und Lesezähler. RAM-Stichproben sowie Laufwerksfehler
unter „Sicherung“ werden verständlicher angezeigt.

Der getrennte Z17-Teststand ergänzt „Pruefen…“/„Speichern…“ am tatsächlichen
DFU-Abschluss und die fehlenden Schriftzeichen. S112 bleibt Nordic 7.3.0.
Weitere Startbeschleunigung wird nicht behauptet; ungünstigere Cachevarianten
wurden verworfen. Der neue Gerätetest steht aus.
[Änderungen und Grenzen](RELEASE_DE3_62.md) · [Nachbau](BUILD_DE3_62.md).

## DE3.59 / 631

**DE3.59 / 631** ist ein Anwendungsupdate für das Allmiibo LCD mit nRF52832 und bestehendem Packed LittleFS (PFS1). **Dateimanager 3.37.0** funktioniert auch mit älteren Diagnoseberichten. Bootloader BL8, Nordic S112 7.3.0, Dateiformate und Katalog bleiben erhalten.

* **Schneller lesen beim Start.** Vier bereits vorhandene RAM-Seiten werden jetzt nach dem letzten Zugriff wiederverwendet. Beim Einbinden derselben nachgebildeten Sammlung (1.131 Dateien, 77 Ordner) sank die Anzahl der SPI-Lesezugriffe von 4.802 auf 4.712. Der temporäre Cache bleibt 1.032 Byte groß. Das ist ein Vergleich der Zugriffe, keine Stoppuhrmessung am Gerät.
* **Kartenemulator → Steckplätze → Anzahl der Plätze.** Scheitert die Speicherung, zeigt „Platzanzahl im RAM“, dass die Änderung noch nicht dauerhaft gesichert ist. Kurz Mitte versucht das Speichern erneut. Lang Mitte geht zurück und behält die ausstehende Änderung für einen späteren regulären Speichervorgang.
* **Gerät & Diagnose → Laufzeitdiagnose.** DE3.59 meldet den bisher unberührten Teil des reservierten Stacks. Unter **Startzeiten → Mehrere Kaltstarts auswerten** berechnet der Browser Median und Spannweite aus 3–20 Berichten derselben Firmware.
* **Einstellungen → Versionsinfo.** Die zwölfstellige Quellkennung für diesen Build lautet `7b4822b045b4`. Beide unabhängigen Builds ergeben dasselbe Anwendungsprogramm. Der Katalogabgleich der fertigen Firmware umfasst 952 Figuren-IDs, 82 Spiele und 1.344 Zuordnungen.

Stand: **4. November 2026**. Aktueller Anwendungsstand:
**2.22.0-DE3.58 / DFU-Zähler 630**; Dateimanager **3.36.0**.

Diese Übersicht beginnt mit den frühen Änderungen von **DE1 bis DE3.16** und
erklärt anschließend ausführlich die Weiterentwicklung bis **DE3.58**. Sie
verbindet den [historischen Änderungsbericht](../CHANGELOG_DE3_SERIES.md)
mit den inzwischen veröffentlichten Quellen und Regressionstests. Die Angaben
„vorher“ beziehen sich auf den jeweils untersuchten älteren DE-Stand. Sie bedeuten
nicht automatisch, dass derselbe Fehler im heutigen Originalprojekt oder in
einem anderen Fork vorhanden ist.

Einige Fehler entstanden oder wurden erst nach unserer eigenen Speicherumstellung
sichtbar. Auch diese Korrekturen gehören zur Entwicklungsgeschichte. Wo der genaue
erste Einführungsschritt nicht eindeutig belegt ist, wird ein Versionsbereich
oder der spätestens dokumentierte Stand genannt. Eine vollständige Aussage über
jeden möglichen Gerätefehler lässt sich daraus nicht ableiten.

Bootloader und Nordic-Stack werden getrennt in
[Bootloader- und SoftDevice-Änderungen](BOOTLOADER_SOFTDEVICE_CHANGES.md)
erklärt. Ein Anwendungsupdate ersetzt diese Komponenten nicht.

## DE3.58 und Dateimanager 3.36.0

Im Kartenemulator werden Speicher- und Lesefehler getrennt angezeigt. Die App sichert beim Verkleinern der Slotanzahl den bisherigen Slot einmal. Die DFU-Seite zeigt die Paketfelder und kann sie mit einer aktuellen Bootdiagnose vergleichen. Der Besitzer bestätigte den Platzwechsel und die NFC-Erkennung an der Switch 2. Die Bluetooth-Abfrage ergab DE3.58/630. [Geräteprüfung](validation/DE3_58_READBACK.json) · [Bedienung und Prüfstand](../RELEASE_NOTES_DE.md).

## Neu in DE3.57 / Dateimanager 3.35.1

Das kleine feste Zeichen links neben der Akkuspannung wird durch eine echte **Bluetooth-Statusanzeige** ersetzt: durchgestrichen = inaktiv, Funkwellen = sichtbar, offener Punkt = Funkverbindung ohne bereiten Datenkanal, gefüllter Punkt = Datenkanal bereit, Minus = Trennung oder Moduswechsel läuft. Die Anzeige gilt auch bei aktivierter Fernbedienung. Sie aktiviert Bluetooth nicht selbst und blinkt nicht.

Der Status wird bei Änderungen aus den vorhandenen Firmwarezuständen übernommen. Es gibt keine zusätzlichen Funkabfragen, Timer oder Schreibzugriffe. Die Dateiübertragungsanzeige behält ihre eigenen Statusmeldungen. [Symbole, Bedienung und Grenzen](BLUETOOTH_STATUS_DE3_57.md).

Dateimanager **3.35.1** aktualisiert das passende DFU-Paket und den erwarteten Anwendungsstand auf DE3.57. Die Diagnosefunktionen aus 3.35.0 bleiben erhalten. **BL8, Nordic S112 7.3.0, PFS1 und vorhandene Amiibos bleiben unverändert.** Die sichtbaren Funkwellen wurden anschließend am Allmiibo bestätigt. [DE3.57-Geräteprüfung](validation/DE3_57_READBACK.json).

## Dateimanager 3.35.0: gemeinsame Lesediagnose

Acht vorhandene Diagnosebereiche werden auf einen Klick nacheinander gelesen und mit einzelnen Abrufzeiten exportiert. Startzeiten, zusätzliche RAM-Werte, Firmware-MTU, LittleFS-Geometrie/Cachekonfiguration und letzte Einstellungs-Tastensitzung sind zusammen sichtbar. Fehlende Akkumessungen und nicht unterstützte Speicherbefehle erzeugen keine irreführenden Werte. Alte Freispeicherwerte werden nach fehlgeschlagener Aktualisierung verworfen.

Firmware DE3.56, BL8, S112 und PFS1 bleiben unverändert. [Bedienung und Grenzen](DIAGNOSTICS_3_35.md).

## DE3.56 / Dateimanager 3.34.0: Eingabe, Galerie und konsistenter Katalog

Diese Ergänzungen ändern weder BL8 noch Nordic S112 7.3.0, das PFS1-Datenlayout oder den Speicherkern. Eine vorhandene passende Sammlung benötigt keine erneute Migration. Eine direkte Geräteprüfung von DE3.56 steht noch aus; ein zusätzlicher Startzeitgewinn wird nicht behauptet.

| Vorher | Änderung und Bedienung |
| --- | --- |
| Bei leerem Texteingabefeld konnte die Tastatur einen Großbuchstaben anzeigen, der kurze Mitteldruck schrieb aber klein. | Beim Suchen und Umbenennen stimmen Anzeige und Kurzdruck überein. `q/Q` erklärt kurz/lang; `_/SP` Unterstrich/Leerzeichen. Die Schreibfunktion wird nicht geändert. Lange, auch breite Unicode-Titel werden von der Hilfe ferngehalten. |
| Die Listenmarkierung konnte auf einen kaum sichtbaren Pixel schrumpfen; ihre Endposition war nicht exakt. | Mindestens drei Pixel hoher Marker auf dem LCD, beide Enden korrekt, Ganzzahlberechnung und kein Marker bei leerer Liste. |
| Bilder mussten über einzelne Details geöffnet werden. | Figurenkatalog → Bilder anzeigen lädt optional Bilder der aktuellen Seite, mit festen Flächen und Fehlerplatzhalter. Ohne Einschalten kein Galerieabruf; Adressen sind an die aktive Katalogrevision gebunden. |
| Farbige Bestandskarten ließen sich nicht nach ihrem Prüfstatus eingrenzen. | Bestand filtern: vorhanden, nicht gefunden, Prüfhinweis, unbestätigt/veraltet. Teilprüfungen begründen keine rote Fehlanzeige; getrennte Sitzungen behalten die Kennzeichnung als frühere Beobachtung. |
| Beim Blättern musste man zurück zum Ergebnisanfang scrollen. | Weiter/Zurück führt zum Anfang der neuen Ergebnisse und schließt die alten Details. Tippen in der Suche verschiebt den Fokus nicht. |
| Nach einer Katalogaktualisierung konnten Suche, Vorschau und Dateiprüfung noch den gebündelten Stand verwenden. | Gerätesuche, Auswahlvorschau, Eigenschaften und lokale Dateiprüfung erhalten denselben aktiven Katalog. Laufende Suchen stoppen bei Katalogwechsel; verspätete Ergebnisse/Bildfehler des alten Stands ersetzen nicht den neuen. |

Praktische Gerätewege: **Amiibo-Datenbank → Suche** oder **Amiibo-Emulator → Dateibrowser-Aktionsmenü → Umbenennen / Neuer Ordner / Neuer Tag**. Die Tastaturhilfe benötigt keinen zusätzlichen Heap-Speicher. Die Scrollanzeige gilt für die vorhandenen Listen-/Ordneransichten.

Gezielte Host-Regressionen prüfen die tatsächliche Text-/Scrollzeichnung, die Vue-Komponenten und deren Verbindung über App, einschließlich Katalogwechsel während einer laufenden Suche, Bildfreigabe/-fehler, Filter, Pagination und lokaler BIN-Prüfung. Testdateien: [Gerätegrafik](../fw/tests/de3/test_ui_comfort_de356.py), [Katalogkomfort](../web/tests/catalogue-comfort.test.mjs), [aktiver Katalog](../web/tests/active-catalogue.test.mjs), [Figurendetails](../web/tests/figure-components.test.mjs), [Gerätesuche](../web/tests/device-search-ui.test.mjs) und [Auswahlvorschau](../web/tests/selection-preview-ui.test.mjs). Abschließende Release-Ergebnisse und physische Geräteprüfungen bleiben getrennte Nachweise.

Der Katalog umfasst weiterhin 952 IDs. Bildabrufe geben öffentliche ID und IP-Adresse an den Bildanbieter weiter, keine Gerätedateien. Metadaten/Bilder sind keine neuen Figurendumps. [Release-Hinweise](../RELEASE_NOTES_DE.md) und [Bauanleitung](BUILD_DE3_56.md).

## Frühere DE1–DE3.16

Schon vor der späteren LittleFS-Umstellung wurden Bedienung, Speicherzugriffe
und Fehlerbehandlung verändert. Die folgende Zusammenfassung ordnet die
belegten Gruppen ein; Einzelheiten und damalige Prüfgrenzen stehen im
[historischen Bericht DE1–DE3.16](../CHANGELOG_DE3_SERIES.md#historical-record-de1de316--historischer-stand-de1de316).

- **Sprache und Figurenkatalog, DE1/DE2 bis DE3.9:** Deutsch/Englisch mit deutschem
  Standard und Fallback, passende Schriftressourcen und abgesicherte
  Metadaten-Sprachauswahl. Namens- und ID-Suche, Spiel-/Kategoriefilter,
  begrenzte Ergebnislisten und korrigierte Favoritenpfade erleichtern die
  Auswahl. Ergänzte Katalogeinträge und Spielzuordnungen sind Metadaten;
  dadurch werden keine Figurendateien erzeugt oder auf das Gerät übertragen.
- **Bluetooth-Dateitransfer, DE2–DE3.15:** Begrenzte Befehle, Pfade und
  Metadaten, Ablehnung unvollständiger Schreibvorgänge sowie eine kopierte Ereignisqueue
  mit Sitzungszuordnung ersetzen unsichere Arbeiten im Funkinterrupt.
  Kleine MTUs, aufgeteilte Antworten und lange Befehle werden berücksichtigt.
  Fehlgeschlagenes Schließen bleibt wiederholbar; Abbruch räumt auf, und
  offene Dateien blockieren unzulässiges Löschen beziehungsweise Remote-DFU.
  Ab DE3.14 darf nur ein akzeptierter Leseauftrag weitere Daten senden.
  Der ausdrücklich aktivierte MTU23-/MTU250-Diagnosemodus kam mit DE3.15;
  **der damalige echte MTU23-Gerätetest gehört zu DE3.15**, nicht zu einer
  später behaupteten Wiederholung unter DE3.16.
- **SPI, Flash und damaliges SPIFFS, DE2–DE3.16:** Ganze Display-/Flashtransaktionen
  werden geordnet, Wartezeiten begrenzt und Fehler weitergegeben. Mountfehler
  lösen keine automatische Formatierung aus. Namen, Pfadsegmente und
  gepackte Indexzugriffe sind begrenzt beziehungsweise ausrichtungssicher.
  Fehlgeschlagene Cachezugriffe dürfen keine falschen Daten zurückschreiben;
  ein fehlgeschlagener Flush behält wiederholbare Daten. DE3.16 verhindert,
  dass ein Header-Lesefehler eine belegte Objekt-ID als frei erscheinen lässt.
- **Einstellungen und Speichern, DE2–DE3.13:** Ältere Einstellungen werden
  kontrolliert übernommen; ungelesene beziehungsweise fehlerhafte Werte
  nicht einfach durch Standardwerte überschrieben. Begrenzte CRC32-Journale
  sichern die dafür vorgesehenen Einstellungs-/Tagtransaktionen, nicht
  beliebige große Dateien. DE3.11/DE3.12 speichern vor dem Menü-DFU und zeigen
  Fehler an. **DE3.13 zeigt vor dem synchronen Speichern sofort eine Wartemeldung**
  und vermeidet nach erfolgreichem Hauptmenü-Speichern die doppelte Prüfung
  beim Freigeben der App. Der erste Speichervorgang bleibt nötig; eine feste
  Zeitersparnis ist damit nicht gemessen.
- **Tasten, Aufwachen und Lauftext, DE2–DE3.12:** Richtige Retain-RAM-Bereiche,
  Aufräumen vor dem Schlafen und getrennte Long-/Repeat-Zustände verhindern
  veraltete Eingaben. DE3.5 richtet den Mitteltasten-Pin vor der Aufweckerkennung
  korrekt ein. DE3.6 verlangsamt Lauftext und ergänzt Lesepausen. In der Gruppe
  DE3.9–DE3.12 werden gehaltene Tasten und Szenenwechsel bereinigt; insbesondere
  verarbeitet der Player einen abgeschlossenen kurzen oder langen Mitteldruck
  nur einmal. Das ist kein Beleg dafür, dass jede heutige Hauptmenü-Tastenlogik
  erst in einer einzelnen dieser Versionen eingeführt wurde.
- **RAM, Zeichnen und Player, DE3.10–DE3.16:** Geprüfte Allokationen und
  vollständiges Aufräumen ersetzen unvollständige Listen-/Dialogpfade.
  Kürzere Rückkehrpfade und begrenzte Ansichten reduzieren unnötige Arbeit.
  QR-Puffer werden auf die unterstützte Maximalversion begrenzt;
  überlange Inhalte werden abgewiesen. DE3.12 korrigiert Canvas-Abmessungen,
  Wiederherstellung, Glyphenbreiten und abgeschnittenes UTF-8. PIXV-Dateien
  werden auf passende Header, Maße, Bildrate und vollständige Frames geprüft;
  DE3.16 behandelt Pfad-Speichermangel, EOF und Lesefehler getrennt.
- **NFC und Karten, DE2–DE3.13:** Empfangs-/Sendelängen und Seitenzugriffe sind
  begrenzt, FAST_WRITE berücksichtigt den Schreibschutz, unterstützte
  Dateigrößen und Signaturenden bleiben erhalten. Ausstehende Änderungen
  werden dem richtigen Tag zugeordnet, Lese-/Savefehler nicht als Erfolg
  ausgegeben. NTAG215-FAST_READ schützt Passwortbereiche wie READ.
  Konfigurations-/Slotgrenzen und fehlgeschlagene Karteninitialisierung werden
  geprüft; fehlgeschlagenes Speichern darf den alten RAM-Inhalt nicht verlieren.
- **Browser-Dateimanager, spätestens 3.12.0:** Die Vue-3-/Vite-Umstellung war
  bereits in diesem frühen Stand enthalten. Geordnete Schreibvorgänge,
  sitzungsgebundene Rückmeldungen, erhaltene unbekannte Metadaten und
  UTF-8-Notizgrenzen verbessern Transfers. DE3.12 korrigiert das Pfadbudget
  mit Laufwerkspräfix und verwirft fehlerhafte Verzeichnisantworten, ohne
  einen späteren gesunden Abruf zu verhindern. Quellen, Tests und Pakete
  werden getrennt nachvollziehbar gebunden.

Die damaligen Hosttests, Gerätemeldungen und Grenzen bleiben historische
Beobachtungen. Sie ersetzen keine neue Prüfung der heutigen Firmware.
Für den tatsächlichen Hauptmenü-Speicherablauf siehe zusätzlich den
[Test von Home-Rückkehr, sofortiger Wartemeldung und Save-Wiederholung](../fw/tests/de3/test_settings_home_save_lifecycle.py).

## 1. Bedienung, Anzeige und RAM

### Figureninformationen und QR-Code: DE3.23, DE3.25 und DE3.52

**Vorher:** Die zusätzlichen Figureninformationen waren nicht in dieser Form
erreichbar. In der Datenbank konnte der Beschreibungslauftext die QR-Darstellung
beeinträchtigen; der Code blieb nicht zuverlässig lange genug zum Scannen stehen.

**Danach:** Die Figurenansicht bietet Informationen und eine QR-Seite mit
Rückkehr zur vorherigen Ansicht. DE3.25 trennt die QR-Fläche von der
Beschreibung und deren Scrollbewegung. Der Code bleibt stehen, während der
Beschreibungstext läuft. Geprüft werden der tatsächliche Zeichencode,
Schrift, QR-Encoder und Eingaben.

DE3.52 korrigiert zusätzlich die öffentlichen Informationsziele für
**MyMario Mario (Melody Car)** und **Toad**. Deren Figuren-IDs und Dateiinhalte
werden dadurch nicht verändert; andere IDs behalten den bisherigen
Nachschlageweg.

Quellen: [Figureninformation](../fw/application/src/amiibo_info_draw.c),
[Datenbankansicht](../fw/application/src/app/amiidb/view/amiibo_view.c),
[Informationstest](../fw/tests/de3/test_amiibo_info_de323.py),
[QR-/Scrolltest](../fw/tests/de3/test_amiidb_qr_de325.py),
[DE3.52-Änderungen](../fw/docs/DE352_FIXES_AND_TESTS.txt).

### Große Datenbanken, Ordner und Favoriten: DE3.32–DE3.35

**Vorher:** Nach der Umstellung auf Packed LittleFS reichte der verbleibende
Anwendungs-Heap für manche vollständig aufgebauten Listen nicht mehr aus.
Datenbanknavigation und größere Amiibo-Ordner konnten deshalb unmittelbar
„Speicher voll“ anzeigen, obwohl die Dateien auf dem Flash vorhanden waren.

**Danach:** Begrenzte und seitenweise Listen ersetzen diese großen gleichzeitigen
Allokationen. Datenbank-, Datei- und Favoritenpfade räumen Teillisten bei
Fehlern auf. Favoriten und deren Zielordner laden höchstens 24 Dateneinträge
pro Seite. Lesefehler dürfen eine unvollständige Liste nicht als vollständig
ausgeben. Die Sortierung unterscheidet wiederholte Figuren in verschiedenen
Spielen.

DE3.35 gibt unbenötigte Detailkapazität beim Verlassen frei, bearbeitet
UTF-8-Löschungen im vorhandenen Puffer und verwendet für interne Katalogbezüge
Indizes statt wiederholter Daten. Die physische RAM-Größe wurde nicht erhöht.

Quellen: [historischer Speicherabschnitt](../CHANGELOG_DE3_SERIES.md),
[Amiibo-Navigation](../fw/tests/de3/test_amiibo_navigation_memory.py),
[Datenbanknavigation](../fw/tests/de3/test_amiidb_navigation_memory.py),
[Favoriten](../fw/tests/de3/test_favorites_navigation_memory.py).

### Karten-Dateiauswahl: DE3.50 und DE3.51

**Vorher:** Auch der Dateiimport des Kartenemulators konnte bei großen Ordnern
zu viel Listenspeicher benötigen. Wiederholtes Vor- und Zurückblättern
verursachte erneute Verzeichnissuchen.

**Danach:** DE3.50 begrenzt auch diesen Browser auf Seiten. DE3.51 ergänzt einen
optionalen Cache für zwei sortierte Seiten zu je 24 Einträgen. Bei wenig
freiem RAM bleibt der langsamere Einseitenweg verfügbar. Der Cache wird vor
dem Laden der Kartendaten und beim Verlassen freigegeben. Eine andere
Einbindung oder eine geänderte Verzeichnisgeneration macht ihn ungültig;
fehlerhafte Teilergebnisse werden nicht zwischengespeichert.

Quellen: [Karten-Dateibrowser](../fw/application/src/app/chameleon/scene/chameleon_scene_menu_card_data_file_load.c),
[Speichertest](../fw/tests/de3/test_chameleon_browser_memory_de350.py),
[Cachetest](../fw/tests/de3/test_chameleon_browser_cache_de351.py),
[DE3.51-Protokoll und Verhalten](../fw/docs/DE351_PROTOCOL_AND_TESTS.txt).

### Kurze Mitteldrücke und überlastete Ereigniswarteschlange: DE3.43

**Vorher:** Ein kurzer Impuls konnte im übernommenen Tastenpfad einen aktiven
Pinzustand zurücklassen. Außerdem konnten Eingaben bei voller
Ereigniswarteschlange verloren gehen. Das äußerte sich unter anderem als
mehrfach nötiger Mitteldruck.

**Danach:** Der lokale Tastertreiber bereinigt den aktiven Zustand beim
Zurückkehren nach IDLE. Der Entprellparameter wurde von 50 auf 20 ms angepasst.
Bei Platzmangel darf eine alte Animations-/Neuzeichnungsnachricht zugunsten
einer Eingabe entfallen; eine andere Eingabe wird dafür nicht verdrängt.
Eine vollständig mit Eingaben gefüllte Warteschlange bleibt begrenzt und
diagnostizierbar. Kurz-, Lang- und Wiederholdrücke sowie Abbau und Neustart des
Eingabesystems sind gesondert geprüft.

Dies behebt nachgewiesene Softwarepfade. Ein verschlissener physischer
Tasterkontakt wäre damit nicht ausgeschlossen.

Quellen: [DE3.43-Beschreibung](../fw/docs/DE3_43_BUILD.txt),
[Treiber](../fw/application/src/mod/app_button_de343.c),
[Entprelltests](../fw/tests/de3/test_button_debounce_de343.py),
[Warteschlangentests](../fw/tests/de3/test_button_queue_pressure_de343.py).

### Einstellungsmenüs und Reaktionszeit: DE3.34 und DE3.40

**Vorher:** Wiederholtes Ermitteln des Speicherzustands verursachte unnötige
Arbeit. Beim Zurückkehren aus Untermenüs ging die gewohnte Auswahl beziehungsweise
Listenposition verloren; Sprache und Schlafzeit markierten nicht zuverlässig
den aktuell gespeicherten Wert.

**Danach:** Der Speicherstatus wird innerhalb der Einstellungssitzung
wiederverwendet und nach Speicheraktionen, auch fehlgeschlagenen, verworfen.
DE3.40 merkt Auswahl und sichtbaren Ausschnitt für die Sitzung. Sprache und
Schlafzeit öffnen mit dem aktuellen Wert; das bloße Öffnen schreibt nichts.

Quellen: [Einstellungsmenü](../fw/application/src/app/settings/scene/settings_scene_main.c),
[DE3.34 im historischen Bericht](../CHANGELOG_DE3_SERIES.md),
[Menü-Rückkehrtests](../fw/tests/de3/test_settings_return_focus_de340.py).

### Beleuchtung und Namenseditor: DE3.43–DE3.44

**Vorher:** Das Synchronisieren der PWM-Beleuchtung konnte unbeschränkt warten.
Bei langen UTF-8-Namen passten Messung, sichtbarer Text und Cursorplatz nicht
zuverlässig zusammen.

**Danach:** Die Beleuchtungssynchronisierung hat eine feste Versuchsgrenze.
Ein fehlgeschlagener Helligkeitswechsel wird nicht als Erfolg bestätigt.
DE3.44 misst und zeichnet Namen mit derselben Schrift, kürzt nur die
Darstellung an vollständigen Zeichengrenzen und reserviert Cursorplatz.
Der gespeicherte Name bleibt unverändert; zum Zeichnen wird kein zusätzlicher
Textpuffer benötigt.

Quellen: [Beleuchtungstest](../fw/tests/de3/test_backlight_busy_de343.py),
[Textdarstellungstest](../fw/tests/de3/test_text_input_render_de344.py),
[DE3.44-Beschreibung](../fw/docs/DE3_44_BUILD.txt).

## 2. Dateisystem, Start und Flashzugriffe

### Getrennte Migration mit vollständigen Metadaten: DE3.30-PREP / DE3.31

**Vorher:** Der für die Sammlung untersuchte einfache Umstellungsweg bot nicht
genügend Zwischenspeicher. Ein reines Firmwareflashen hätte die bisherigen
SPIFFS-Dateien nicht automatisch in unser Ziellayout übertragen.

**Danach:** Eine Vorbereitungsversion ermöglicht die externe Sicherung der
Dateien samt aller 128 Metadatenbytes. Die anschließende, ausdrücklich
bestätigte Umstellung verwendet **Packed LittleFS/PFS1**, gefolgt von
Wiederherstellung und Vergleich. Ein fehlgeschlagenes Einbinden führt nicht
zu einem stillen Formatieren.

PFS1 ist unsere zusätzliche Speicherung kleiner Dateien auf LittleFS.
Normales Upstream-LittleFS und SPIFFS sind andere Layouts. Bereits passende
PFS1-Geräte brauchen für DE3.55 keine erneute Migration.

Quellen: [Migrationsbeschreibung](MIGRATION_PFS1.md),
[Installationswege](INSTALLATION.md),
[PackedFS](../fw/application/src/mod/vfs/packed_fs.c),
[Versionsgeschichte](../CHANGELOG_DE3_SERIES.md).

### Weniger doppelte Startarbeit: DE3.34, DE3.38 und DE3.41

**Vorher:** Index-, Kopf- und Inhaltsprüfungen lasen Teile des Datenträgers
mehrfach. Nach der Migration war die Speicherinitialisierung ein wesentlicher
Anteil der Startverzögerung.

**Danach:** DE3.34 verwendet den beim Einbinden geprüften Index weiter und
vermeidet unnötige Metadatenabfragen. DE3.38 erzeugt den erwarteten Index schon
bei der Inhaltsprüfung; ein zweiter zufälliger Durchlauf über alle
Recordköpfe entfällt. Ein temporärer Puffer wird anschließend freigegeben;
bei Speichermangel bleibt ein vollständiger Prüfweg ohne ihn verfügbar.
DE3.41 liest Kopf, Namen, Metadaten und Inhalt in einem zusammenhängenden
Durchlauf.

Daten-, Index- und Abschlussprüfsummen sowie Pfad-/Größenprüfungen bleiben
aktiv. Die Optimierung schaltet keine Integritätsprüfung ab. Die zusätzlich
auslesbaren Startmarken erfassen Anwendungsphasen ab Speicherinitialisierung,
nicht die komplette Zeit vom Tastendruck bis zum sichtbaren Menü.

Quellen: [PackedFS](../fw/application/src/mod/vfs/packed_fs.c),
[Streaming-Mounttests](../fw/tests/de3/test_packed_mount_stream_de341.py),
[Startdiagnose](../fw/tests/de3/test_startup_diagnostics.py),
[historischer Bericht](../CHANGELOG_DE3_SERIES.md).

### Prüfsummen schneller berechnen: DE3.45 und DE3.55

**Vorher:** CRC-Berechnung erzeugte vermeidbare Rechenarbeit; zwei benötigte
CRC-Zustände durchliefen dieselben Bytes getrennt.

**Danach:** DE3.45 verwendet eine Tabelle mit 256 Einträgen im schreibgeschützten
Flash und verarbeitet ein Byte pro Schritt. DE3.55 berechnet die beiden
CRC-Zustände gemeinsam in einem Durchlauf. Polynom, Startzustände, Abschluss
und gespeicherte Werte bleiben gleich. Es entsteht kein zusätzlicher
dauerhafter RAM-Cache.

Quellen: [DE3.45-Beschreibung](../fw/docs/DE3_45_BUILD.txt),
[CRC-Regressionen](../fw/tests/de3/test_packed_crc_de345.py),
[CRC-Paar-Regressionen](../fw/tests/de3/test_packed_crc_pair_de355.py).

### Weniger wiederholte Speicherbereinigung und Statusabfragen: DE3.46 / DE3.50

**Vorher:** Ein exklusiver Schreibvorgang wiederholte eine bereits erledigte
Bestandsbereinigung. Aufeinanderfolgende reine Flash-Lesezugriffe fragten den
Bereitschaftsstatus unnötig oft erneut ab.

**Danach:** DE3.46 spart den zusätzlichen Bereinigungslauf, wenn die reservierte
Kapazität ausreicht. Bei Platzmangel bleibt die erneute Bereinigung mit
Reservierungsversuch erhalten; nach späten Fehlern werden unveröffentlichte
Ausgaben weiter aufgeräumt. DE3.50 merkt einen erfolgreich geprüften
Lesebereitschaftszustand. Fehler, Programmieren/Löschen, Schlafen/Aufwachen
und konkurrierende Änderungen entwerten ihn. Die erforderlichen
Schreib-/Löschabschlussprüfungen bleiben bestehen.

Quellen: [DE3.46-Beschreibung](../fw/docs/DE3_46_BUILD.txt),
[Schreibstufen-Tests](../fw/tests/de3/test_packed_stage_gc_de346.py),
[Flash-Bereitschaftstests](../fw/tests/de3/test_flash_read_ready_de350.py),
[Flash-Treiber](../fw/application/src/hal/hal_spi_flash.c).

### Konkrete LittleFS-Korrekturen: DE3.36 und DE3.55

**Vorher:** Bestimmte LittleFS-Lesefehler beziehungsweise ein ungültiger
Lesecache nach einem Seek am Blockende konnten falsch behandelt werden.
Eine spätere Untersuchung fand außerdem einen ungünstigen Auswahlpfad für
Metadaten-Verschleißverteilung.

**Danach:** DE3.36 übernimmt gezielt die FCRC-Lesefehlerweitergabe und die
Cachekorrektur nach Blockende. DE3.55 korrigiert den
Metadaten-Verschleißpfad. NOR-Modelle prüfen Belegung, Relokation,
unterbrochene Schreibvorgänge und erneutes Einbinden.

Im betreffenden Modell mit 10.000 Transaktionen sank die höchste Löschzahl
eines Blocks von 313 auf 250; dafür wurden vier statt zwei Blöcke genutzt.
Diese Expansion benötigt dort zusätzlich 8 KiB Flash. Das ist keine gemessene
Lebensdauerverlängerung des realen Geräts. PFS1-Geometrie und logisches
Dateiformat bleiben erhalten; geänderter Quellcode bekommt dennoch einen
eigenen Engine-Fingerabdruck.

Quellen: [LittleFS](../fw/components/littlefs/lfs.c),
[Backporttests](../fw/tests/de3/test_lfs_backports.py),
[NOR-/Verschleißtests](../fw/tests/de3/test_lfs_wear_de355.py).

### Weitere Grenzen und Fehlerpfade: DE3.36, DE3.42 und DE3.46

- DE3.36 normalisiert abschließende Trennzeichen beim Wechsel zum Elternordner.
- DE3.42 weist ungültige Laufwerksnummern ab, bevor die Laufwerkstabelle
  indiziert wird.
- DE3.46 vereinfacht die Fehlerbehandlung: keine geratenen
  Exception-Frame-Adressen, keine UI-Aufrufe oder formatierten Meldungen im
  kritischen Fehlerpfad. Ungültige Wiederaufnahmedaten werden verworfen;
  Release startet neu, Debug bleibt zur Untersuchung stehen.
- Kleine Korrekturen betreffen einen uninitialisierten Vergleichswert in
  Tiny Lander, explizite Bytezeiger bei SPI-DMA-Offsets und passende
  Formatangaben für Slotnummern.

Quellen: [Laufwerksgrenzen](../fw/tests/de3/test_vfs_drive_bounds_de342.py),
[Fehler-/Resettests](../fw/tests/de3/test_fault_reset_de346.py),
[DE3.46-Beschreibung](../fw/docs/DE3_46_BUILD.txt).

## 3. NFC, Kartenemulator und gespeicherte Änderungen

### Fehlgeschlagene Speicherung nicht verlieren: DE3.37

**Vorher:** Eine fehlgeschlagene Speicherung konnte beim Wechsel von Figur,
Slot, Anwendung oder beim Schlafengehen verlorene Änderungen im RAM
hinterlassen beziehungsweise deren Verlust verdecken.

**Danach:** Der betroffene Amiibo-Speicherpfad behält den Änderungszustand und
die ungespeicherten Bytes. Ein Dialog erlaubt erneutes Speichern oder ein
gesondert bestätigtes Verwerfen; die Bestätigung startet mit Nein.
Bewusstes Verwerfen betrifft die ungespeicherte RAM-Änderung, nicht die
vorherige gespeicherte Datei. Der Hauptloop wiederholt Schreibversuche nicht
unbegrenzt. Diese Zusage ist keine RAM-Erhaltung bei Akkuverlust oder Reset
und kein pauschales Versprechen für jeden Kartenemulator-Ausgang.

Quellen: [Speicherwiederholung](../fw/tests/de3/test_nfc_save_retry_de337.py),
[Dialogtests](../fw/tests/de3/test_nfc_save_dialog_de337.py),
[App-/Dateiwechsel](../fw/tests/de3/test_nfc_file_persist_handoffs_de337.py).

### NFC wirklich abschalten: DE3.39

**Vorher:** Beim Verlassen eines kritischen Abschnitts konnten NFCT- und
TIMER4-Interrupts wieder aktiviert werden, obwohl die Anwendung NFC gerade
abgeschaltet hatte.

**Danach:** Das Abschalten aktualisiert auch die vom SDK gespeicherte
Interruptmaske. Der Test verwendet die tatsächlichen SDK-Inlinefunktionen
mit modellierten NVIC-Registern. Dies ist eine Korrektur des Anwendungs-
und Headerzusammenspiels, kein neu gebauter Nordic-Stack.

Quellen: [DE3.39-Beschreibung](../fw/docs/DE3_39_BUILD.md),
[NFC-NVIC-Test](../fw/tests/de3/test_nfc_nvic_de339.py).

### Karteninitialisierung und UID-Fehler: DE3.42, DE3.49 und DE3.50

**Vorher:** Factory-Daten konnten vom aktiven statt vom angeforderten
Kartentyp abhängen. Große temporäre Kartenobjekte belasteten den Stack.
Fehlgeschlagene Erstellung, erneutes Laden, Konfigurationsspeicherung
oder Zufalls-UID-Erzeugung konnten als erfolgreich erscheinen.

**Danach:** DE3.42 initialisiert passende Factory-Daten für den angeforderten
Typ und verwendet für große temporäre Daten einen begrenzten, danach
freigegebenen Heap-Puffer. Ein Allokationsfehler beendet den Vorgang vor
dem Schreiben. DE3.49 propagiert die Fehler von Erstellung/Laden/
Konfigurationsspeicherung bis zur Anzeige. DE3.50 meldet fehlgeschlagene
Zufalls-UID-Erzeugung als Fehler und verändert die Karte dann nicht.

Quellen: [DE3.42-Beschreibung](../fw/docs/DE3_42_BUILD.txt),
[MF1-Factorytest](../fw/tests/de3/test_mf1_factory_de342.py),
[MF0-Zieltyptest](../fw/tests/de3/test_mf0_factory_target_de342.py),
[Factory-Fehlerfälle](../fw/tests/de3/test_chameleon_factory_errors_de349.py),
[UID-Fehlerfälle](../fw/tests/de3/test_chameleon_uid_errors_de350.py).

### AmiLoop und Datenbankslots: DE3.44 / DE3.48

**Vorher:** AmiiboLink/AmiLoop konnte neue Tagdaten als gespeichert bestätigen,
obwohl die zuständige NFC-Anwendung noch einen fehlgeschlagenen Save offen
hatte. Im Datenbankslot-Pfad konnten normale NFC-Änderungen ursprüngliche
Metadaten oder das Dateiformat beeinträchtigen.

**Danach:** DE3.44 bestätigt einen abgewiesenen Commit nicht als Erfolg;
die neuen Bytes bleiben für den vorgesehenen Wiederholungsweg erhalten.
DE3.48 erhält beim Aktualisieren bestehender Datenbankslots die
128 Metadatenbytes und das unterstützte ursprüngliche Format beziehungsweise
dessen zusätzliche Daten. Konfigurierte Slotzahlen werden auf die tatsächliche
API-Kapazität begrenzt. Das ist keine neue kryptografische Signaturprüfung.

Quellen: [AmiLoop-Commit](../fw/tests/de3/test_amiibolink_commit_de344.py),
[Slot-Persistenz](../fw/tests/de3/test_amiidb_slot_persistence_de348.py),
[Slotzahlgrenzen](../fw/tests/de3/test_settings_slot_limit_de348.py).

### Ungültige NFC-Sektorauswahl: DE3.52

**Vorher:** Ungültige SECTOR_SELECT-Rahmen konnten den ausstehenden
Auswahlzustand verändern und den Folgeablauf stören.

**Danach:** Paket 1 muss C2 FF enthalten; Paket 2 muss nach Entfernen der
HAL-CRC genau vier Bytes haben. Ungültige Eingaben erhalten NACK und
beenden den ausstehenden Auswahlzustand, sodass ein gültiger Versuch
wieder möglich ist. Gültige Sektorzuordnungen bleiben erhalten.

Quellen: [DE3.52-Beschreibung](../fw/docs/DE352_FIXES_AND_TESTS.txt),
[Sektorauswahltests](../fw/tests/de3/test_nfc_sector_de352.py).

### Optionales Disney-Infinity-Profil: DE3.53

**Vorher:** Für eine passende eigene MiFare-Mini-Datei mussten die zugehörigen
Identitätseinstellungen manuell zusammenpassen.

**Danach:** Kartenemulator → aktueller Slot → **Disney Infinity** setzt
die vorgesehenen UID-/Custom-Mode-/SAK-/ATQA-Einstellungen nach Bestätigung.
Voraussetzung ist eine selbst bereitgestellte passende 320-Byte-Datei.
Die Dateidaten, der Name und fremde Optionen bleiben erhalten. Abbruch ist
voreingestellt; falscher Kartentyp und Shadow-Modus werden abgewiesen.
Fehlgeschlagenes Speichern stellt die vorige Identität wieder her.
Erneutes Anwenden eines identischen Profils schreibt nichts.

Das ist eine Konfigurationshilfe. Es liefert keine Figuren-Datei und
belegt keine Funktionsfähigkeit jeder Base oder Konsole.

Quelle und Bedienung: [Disney-Profil](../fw/docs/disney_profile_de353.txt),
[Profiltests](../fw/tests/de3/test_disney_profile_de353.py).

### Shadow-Wiederholung, CRC16-Kollision und Kartenende: DE3.54

**Vorher:** Ein fehlgeschlagener MIFARE-Shadow-Save konnte den ausstehenden
Speicherauftrag verlieren. Zwei unterschiedliche Datenstände mit gleicher
CRC16 konnten als unverändert behandelt werden. Beim direkten Beenden
der Kartenemulation konnte ein NFC-Schreibpfad noch aktiv sein, während
bereits gespeichert wurde.

**Danach:** Der ausstehende Shadow-Auftrag bleibt bei Längen-, Vergleichs-
oder Schreibfehler erhalten. Bei gleicher CRC16 werden gespeicherte Daten
und Konfiguration zusätzlich bytegenau in Abschnitten bis 128 Byte
verglichen. Gleiche Inhalte erzeugen keine Schreibvorgänge; Lesefehler
werden nicht als Gleichheit oder Erfolg ausgegeben. Vor dem Speichern
im initialisierten Beenden-Pfad werden Sensing und IRQ gestoppt.

Der Vergleichspuffer ist kein 128-Byte-Gesamtstackversprechen.
Der allgemeine Karten-App-Ausgang zeigt weiterhin nicht für jeden
fehlgeschlagenen Save einen eigenen Fehlerdialog; die Korrektur ist
kein vollständiger Umbau aller Shutdown-Fehlerpfade.

Quellen: [Speichertransaktionstests](../fw/tests/de3/test_card_save_transactions_de354.py),
[Kartenspeicherung](../fw/components/chameleon-ultra/firmware/application/src/rfid/nfctag/tag_emulation.c),
[App-Ende](../fw/application/src/app/chameleon/app_chameleon.c).

## 4. Bluetooth und Wiederherstellung

### Funkverbindung, Client und Sichtbarkeit auseinanderhalten: DE3.26–DE3.28

**Vorher:** Das Gerät konnte weiterhin „Verbunden“ anzeigen, obwohl der
Dateimanager keine nutzbare Dateisitzung mehr hatte. Ein Host konnte die
Funkverbindung halten, ohne die Anmeldung vollständig abzuschließen.

**Danach:** Physische BLE-Verbindung, initialisierter Dateiclient und
Advertising/Sichtbarkeit werden getrennt behandelt. Abbau, verspätete
Ereignisse und wiederverwendete Verbindungskennungen sind gegen alte
Sitzungen abgegrenzt. Die Frist für einen unvollständigen Client wurde
in DE3.27/DE3.28 von 90 auf 30 Sekunden verkürzt. Danach wird die
Verbindung gezielt freigegeben; die normale Schlafzeiteinstellung bleibt
ein eigener Mechanismus.

Das ist keine Behauptung, dass „Trennen“ in jedem Betriebssystem sofort
auch die physische Funkverbindung beendet.

Quellen: [BLE-Sitzungscode](../fw/application/src/mod/ble/ble_main.c),
[Sitzungstests](../fw/tests/de3/test_ble_session_de326.py),
[Statusanzeige](../fw/tests/de3/test_ble_status_de320.py),
[historischer Bericht](../CHANGELOG_DE3_SERIES.md).

### Kleine MTU und alte Clients bleiben berücksichtigt

Die bereits vor DE3.16 vorhandene ausgehandelte Dateiübertragung und der
MTU-Diagnosemodus wurden erhalten und in späteren Änderungen weiter
geprüft. Sie sind kein erst in DE3.55 eingeführtes Feature.
Anforderungs-/Antwortgrößen, Offsets, Reihenfolge und Abbruch müssen auch
bei ATT-MTU 23 funktionieren. Der normale Wunschwert bleibt größer;
der tatsächlich ausgehandelte Wert ist entscheidend.

Am 2. November wurden am passenden DE3.55-Gerät Datei-/Metadatenoperationen
mit tatsächlicher MTU 250 und 23 geprüft. Das ist ein begrenzter
Gerätenachweis, keine universelle Bluetooth-Geschwindigkeitsgarantie.

Quellen: [MTU-Tests](../fw/tests/de3/test_ble_mtu.py),
[Diagnosetests](../fw/tests/de3/test_mtu_diagnostic.py),
[datierte Geräteprüfung](validation/DE3_55.json).

### Freiwillige Fernbedienung und direkter Wechsel: DE3.47 / DE3.51

DE3.47 ergänzt die am Gerät ausdrücklich eingeschaltete
**Fernbedienung bis zum Ausschalten**. Sie erlaubt Links, Rechts,
Mitteldruck, Zurück und den Wechsel zur Dateiübertragung. Die Freigabe
ist flüchtig; lokale Eingaben haben Vorrang, NFC-/Speicher-/UI-Konflikte
können einen Befehl ablehnen. Ein unklar bestätigter Befehl wird nicht
blind erneut ausgeführt.

DE3.51 kann eine geeignete laufende Fernbedienungsverbindung direkt zur
Dateiübertragung übergeben. Bestätigung und Empfängerwechsel sind
abgestimmt; alte Warteschlangenarbeit wird ungültig. Der ältere
Trenn-/Neuverbinden-Weg bleibt unterstützt.

Quellen: [Fernbedienung](../fw/application/src/mod/ble/ble_remote.c),
[Modus-/Lebenszyklustests](../fw/tests/de3/test_ble_remote_modes_de347.py),
[DE3.51-Erweiterung](../fw/docs/DE351_PROTOCOL_AND_TESTS.txt),
[Wechsel auf bestehender Verbindung](../fw/tests/de3/test_ble_same_link_de351.py).

### Raw128-Wiederherstellung: DE3.51 / Dateimanager 3.31.0

**Vorher:** Vollständige Wiederherstellungen benötigten zusätzliche getrennte
Schritte für Inhalt und Metadaten.

**Danach:** Unterstützte Clients können Inhalt und exakt 128 Metadatenbytes
in einer privaten Schreibstufe gemeinsam vorbereiten. Erst ein erfolgreicher
expliziter CLOSE veröffentlicht beides. Trennen oder ein ersetzender OPEN
bricht die private Stufe ab. Alte OPEN-Formate bleiben gültig.
Die Optimierung gilt für die gebundene vollständige Raw128-Wiederherstellung;
jede Datei bleibt eine eigene atomare Transaktion.

Quellen: [Protokollbeschreibung](../fw/docs/DE351_PROTOCOL_AND_TESTS.txt),
[atomare Metadatentests](../fw/tests/de3/test_packed_atomic_meta_de351.py).

## 5. Dateimanager: Sicherung, DFU, Suche und Sammlung

### ZIP, Sicherung und Speicherumstellung: dokumentiert bis 3.27.0

Die bereits vorhandene Vue-/Vite-Struktur wurde ausgebaut. Zusammengehörige
Bereiche für Dateien, Sicherung/Wiederherstellung und Updates sowie ausklappbare
Gerätedetails ersetzen die frühere verstreute Bedienung.

- ZIP-Import und -Sicherung erhalten logische Ordnernamen und Metadaten, ohne
  die Sammlung vorher unter Windows entpacken zu müssen.
- Fortsetzungsinformationen erlauben unterbrochene Sicherungen beziehungsweise
  Wiederherstellungen wiederaufzunehmen.
- Die Migration trennt Sicherung, Ziel-/Kapazitätsvorbereitung, Übertragung
  und einen abschließenden Inhalts-/Raw128-Vergleich. Ein zusätzlicher
  vollständiger Zielvergleich vorher ist optional.
- Schreibgeschützte Zielordner und Vorfahren werden vor Upload, ZIP-Import
  und Synchronisierung berücksichtigt.
- 3.27.0 liest vor dem abschließenden Setzen von ZIP-Ordnerattributen deren
  kleine Metadatensätze nochmals. Zwischenzeitliche Notiz-/Flagänderungen
  werden erhalten und gemeldet; ein erneutes Lesen aller Dateien entfällt.
- Wiederherstellungsdatenbanken werden nach ungültigen/veralteten
  IndexedDB-Verbindungen neu geöffnet. Ein fehlgeschlagener Schreibauftrag
  wird dabei nicht automatisch wiederholt.
- Diagnoseberichte bieten Vorschau, Kopieren, Speichern und Download.
  Das Anfordern eines Downloads wird nicht mit einer nachgewiesenen
  Dateispeicherung gleichgesetzt.

Quelle: [Browserabschnitt bis 3.27.0](../CHANGELOG_DE3_SERIES.md).
Die Kapazitätsprüfung ist an Firmwareversion, Zähler und Engine gebunden;
unbekannte Geräte erhalten dadurch keine pauschale Migrationsfreigabe.

### Browser-DFU und das längere alte Init-Paket: 3.30.1

**Vorher:** Ein im Bootloader verbliebenes Init-Paket eines früheren Updates
konnte länger als das neu ausgewählte sein. Der Browser wertete dessen
gültigen Offset dann fälschlich als unzulässig für das neue Init-Paket
und brach unnötig ab.

**Danach:** Der Command-Offset wird gegen die tatsächliche
Command-Objektgrenze geprüft. Ein längeres oder nicht passendes Init wird
neu angelegt. Die Firmwaredaten werden weiterhin anhand von Offset und CRC
geprüft; unpassende bereits übertragene Firmwaredaten werden nicht blind
überschrieben.

Die allgemeine DFU-Behandlung prüft außerdem Objektgrenzen, CRC,
Bestätigung, Zeitüberschreitung und Abbruch. „Übertragung geprüft“,
„Execute bestätigt“ und beobachteter Neustart sind getrennte Zustände.
Dies ist eine **Dateimanagerkorrektur**, kein neuer Bootloader- oder
SoftDevice-Build.

Quellen: [Secure-DFU-Code](../web/public/dfu/secure-dfu.js),
[Tests einschließlich 3.30.1-Regression](../web/tests/dfu-secure-dfu.test.cjs).

### Gerätesuche, Vorschau und gemeinsamer Upload: 3.32.0–3.32.2

**Vorher:** Suche und Auswahl waren stärker auf den aktuell angezeigten
Ordner begrenzt; für Figuren ohne gespeicherte Metadaten-ID fehlte die
direkte Zuordnung.

**Danach:** 3.32.0 ergänzt Suche über Geräteordner, eine direkte Bild-/
Figurenvorschau und gemeinsame Einstiegspunkte für Datei-, Ordner- und
ZIP-Uploads. Ohne ausdrückliche Inhaltsprüfung werden nur Ordner und
Metadaten gelesen; für eine angeklickte unterstützte Datei kann die
Vorschau deren Inhalt gezielt lesen.

3.32.1 verwirft veraltete Vorschauaktionen nach Ordnerwechsel oder Löschen.
3.32.2 ergänzt die freiwillige Option **„Figuren auch ohne gespeicherte ID
finden“**. Diese zusätzliche Suche liest höchstens 128 unterstützte Dateien
beziehungsweise 256 KiB und zeigt Begrenzung/Teilergebnis an.

Ein Abbruch wird auch zwischen Upload-Vorprüfungen beachtet: Nach einem
abgebrochenen Ordnerlesen öffnet sich kein verspäteter Überschreibdialog.
Ein bereits begonnener Commit wird weiterhin geordnet abgeschlossen.

Quellen: [Web-Beschreibung](../web/README.md),
[Gerätesuche](../web/src/lib/device-search.js),
[Auswahlvorschau](../web/src/components/SelectionPreview.vue).

### Passendes Firmwarepaket auswählen

Der Dateimanager bietet eine mitgelieferte Liste eigener geprüfter
Anwendungspakete. Laden, Paketidentität prüfen und tatsächlich übertragen
bleiben getrennte Schritte. Größe und SHA-256 werden vor Verwendung
geprüft; eine veraltete oder abgebrochene Auswahl darf kein neues Paket
ersetzen. Der Benutzer wählt das DFU-Gerät ausdrücklich.

Ein passender Paket-Hash belegt die Paketidentität, nicht allein
Hardwarekompatibilität oder exklusive Herausgeberauthentizität. Das
angebotene Anwendungs-ZIP enthält weder BL/S112 noch eine Sammlung.

Quellen: [Paketauswahl](../web/src/components/FirmwarePackages.vue),
[DFU-Paketladen](../web/public/dfu/bundled-packages.js),
[Web-Beschreibung](../web/README.md).

### Bibliotheken und getrennte Speicherprofile: 3.32.3–3.32.4

3.32.3 aktualisiert kompatible Patchstände unter anderem der Babel-Werkzeuge,
tinycolor, PostCSS, Rolldown und vue-component-type-helpers. Die erforderlichen
Build-Typen und Plattformbindungen werden passend mitgeführt. Die
widersprüchliche nanoid-Versions-/URL-Angabe wurde auf das bereits tatsächlich
verwendete, bytegleiche 3.3.20-Artefakt korrigiert. Das ist kein nachgewiesener
Bluetooth-Geschwindigkeitsgewinn.

3.32.4 ergänzt den echten DE3.55-Speicherkern als siebten WASM-Simulator.
Die sechs früheren Artefakte bleiben erhalten. Kapazität und Migration
verwenden damit den passenden Kern, statt alte Ergebnisse nur mit einer
neuen Versionsnummer zu versehen.

Quellen: [Web-Beschreibung](../web/README.md),
[gesperrte Abhängigkeiten](../web/package-lock.json),
[Simulatorquelle DE3.55](../web/third-party/packed-simulator-de355).

### GitHub Pages und Quellenzugang: 3.32.5

Ein separater Build berücksichtigt die Projektadresse `/pixl.js/`;
der lokale portable Build bleibt verfügbar. Informationslinks funktionieren
auch ohne die lokale Serverweiterleitung. Beide Builds enthalten die
zugehörigen Lizenz-/Quellenhinweise.

Die Online-Seite kommuniziert weiterhin direkt über Bluetooth mit dem
Gerät in Reichweite des benutzten Handys oder Computers. Sie ist keine
Funkweiterleitung zum heimischen Rechner. Dafür muss nichts auf dem
Allmiibo neu geflasht werden.

Quellen: [Web-Beschreibung](../web/README.md),
[Produktionspfadtests](../web/tests/dist/static-deployment.test.mjs).

### Online-Katalog, Sammlungsprüfung und eigene Dateien: 3.33.0

Neu sind drei ausdrücklich gestartete Werkzeuge:

1. **Nach neuen Figuren suchen:** Öffentliche GitHub-Metadaten werden mit
   begrenztem Abruf an einen konkreten Commit gebunden. Neue/geänderte Einträge
   werden angezeigt. Bestehende lokale IDs werden nicht einfach gelöscht;
   die Übernahme gilt für die Sitzung.
2. **Sammlung prüfen:** Inhaltsprüfung oder schnelle Metadatenübersicht für
   ganz E: beziehungsweise einen Ordner. Gefundene, doppelte und unbekannte
   IDs sowie unvollständige/auffällige Dateien werden unterschieden.
   Abbruch, Lesefehler und Grenzen erzeugen keinen angeblich vollständigen Scan.
3. **Figurendatei übernehmen:** Eine eigene BIN-Datei oder ein direkter
   HTTPS-Dateilink wird auf erwartete Katalog-ID und Grundstruktur geprüft.
   Vorhandene Namen werden nicht überschrieben; ein Geräteupload wird
   anschließend mit SHA-256 nachgelesen.

Die Katalogquelle liefert Metadaten und Bilder, keine vollständige Sammlung
spielfertiger Dateien. Bekannte ID und Grundstruktur sind weder
Kryptografieprüfung noch Funktionsnachweis an einer Konsole.

Quellen: [Katalogaktualisierung](../web/src/lib/catalogue-updates.js),
[Sammlungsassistent](../web/src/components/CollectionAssistant.vue),
[Sammlungsprüfung](../web/tests/collection-audit.test.mjs),
[3.33.0-Veröffentlichung](https://github.com/bluecyber81/pixl.js/releases/tag/web3.33.0).

### Verlässliche Farben und Ergebnisse nach dem Trennen: 3.33.1

**Vorher:** Fehlende Metadaten konnten als fehlende Figur missverstanden
werden. Kleine Statusmarkierungen waren leicht zu übersehen; ein
Verbindungswechsel erforderte eine klare Grenze zwischen alten und aktuellen
Prüfergebnissen.

**Danach:** Die gesamte Katalogkarte erhält eine verständlichere Umrandung:
**grün** für eine gefundene passende ID, **orange** für einen Prüfhinweis
und **rot** erst nach einer vollständigen Inhaltsprüfung von ganz E:,
wenn die Figur nicht nachgewiesen wurde. Eine reine Schnellübersicht oder
fehlende ID-Eigenschaft darf keine unbestätigte Abwesenheit behaupten.

Nach dem Trennen bleibt ein abgeschlossenes Ergebnis als datierte letzte
Beobachtung sichtbar. Neue Verbindung oder Bestandsänderung verwirft
diesen Stand. Er bleibt nur im Speicher der geöffneten Seite, nicht als
dauerhafte Zusage über das nächste verbundene Gerät.

Quellen: [Bestandsklassifizierung](../web/tests/collection-presence.test.mjs),
[Beobachtungs-/Sitzungstests](../web/tests/collection-observation.test.mjs),
[3.33.1-Veröffentlichung](https://github.com/bluecyber81/pixl.js/releases/tag/web3.33.1).

## 6. Was diese Änderungen nicht bedeuten

- Der mitgelieferte Katalog enthält **952 IDs**. Das ist eine Metadatenzahl,
  nicht die Zahl mitgelieferter Figurendateien und keine dauerhafte Garantie,
  dass weltweit keine neuere Figur angekündigt wurde.
- Hardware-RAM bleibt **64 KiB**, der Anwendungs-Heap **18.432 Byte**.
  Begrenzte Listen, temporäre Puffer und weniger Mehrfacharbeit verbessern
  die Nutzung; sie vergrößern den Chip nicht.
- DE3.55 benötigt **370.120 Byte** Anwendungsimage; die konfigurierte
  Anwendungsregion hat **2.616 Byte Reserve**. Optimierung ist auch eine
  Abwägung zwischen Rechenarbeit, Flash, RAM und zusätzlichem Code.
- Alle Änderungen seit dem Übergang zu passendem PFS1 sind kein Auftrag,
  vorhandene Sammlungen erneut zu formatieren. Eine andere Platine oder
  ein anderes Dateisystem braucht eine eigene Prüfung.
- Das öffentlich verfügbare Quellprojekt enthält keine privaten
  Figurensammlungen oder privaten Signierschlüssel.

## 7. Belege und noch offene Prüfgrenzen

Die archivierte DE3.55-Freigabe umfasst **136 Firmware-Hostprüfgruppen**
sowie gezielte Sanitizer-, ARM- und Speicherprüfungen. Dateimanager 3.33.1
bestand **1.057 Tests** und je **21 Prüfungen** des lokalen beziehungsweise
Pages-Produktionsbuilds. Diese Zahlen bezeichnen konkrete Prüfläufe,
nicht die Anzahl aller denkbaren Fehlerfälle.

Der auf dem passenden Gerät am **2. November 2026** ausgelesene Stand war
DE3.55 mit den dokumentierten Komponenten. Begrenzte Datei-/Raw128-/
Verbindungsprüfungen bei tatsächlicher MTU23/250 bestanden; die Testdateien
wurden entfernt. NFC-Erkennung, kurzer Mitteldruck und Aufwachen wurden vom
Besitzer bestätigt. Die Anwendungs-Startmarken lagen bei etwa **2,31 Sekunden**;
Bootloader und früher SDK-Start sind nicht enthalten.

Am **3. November** wurden öffentliche Anwendungs-/BL8-Quellen und deren
eigenständige Buildwege abgeglichen. Das ersetzt keinen weiteren Gerätetest.
Die CI prüft ihren ausdrücklich dokumentierten Umfang und ist nicht mit
der kompletten historischen Prüfumgebung gleichzusetzen.

Keine dieser Aussagen beweist maximale physische Stackreserve, jede
Platinenvariante, jeden NFC-Leser, dauerhafte Akkulaufzeit oder sämtliche
Stromausfall-/Verschleißsituationen. Aktuelle Quellen, datierte Messung und
Besitzerbeobachtung bleiben getrennte Nachweisarten.

Siehe [Prüfzusammenfassung](validation/DE3_55.json),
[Anwendungsbau](BUILD_DE3_55.md), [Mitarbeiten/CI](../CONTRIBUTING.md),
[Installation](INSTALLATION.md) und [Komponenten](COMPONENTS.md).
