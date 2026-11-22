# Allmiibo LCD DE3.100 / App673

Normale signierte Anwendung für Allmiibo LCD/ST7567 mit vorhandenem Packed LittleFS (PFS1), Z21 und S112 7.3.0. Der passende Dateimanager ist 3.63.0. Der Produktionsquellstand ist unter `6039c163b3d4c52338e708fd0fb39e0606ce7fbf` gesichert; sein Dateibaum ist identisch zum lokal geprüften Commit `fe07e06dce6f1e9655dae7e7edf1b419b9eecf26`.

## Änderungen

**Switch 2 wecken** und **BLE-Bildempfang** ergänzen das LCD-Hauptmenü. Das Wecken verwendet einen bewusst erfassten eigenen Controller und eine gespeicherte Konfiguration. Die Option beim Tastenstart ist anfangs aus. Der Bildempfang verarbeitet monochrome 128 × 64-Bilder; der PC-Sender unterstützt vollständige Bilder und komprimierte Änderungen. Die [Bedienungs- und Protokollbeschreibung](https://github.com/bluecyber81/pixl.js/blob/release/lcd-de3100-app673/docs/LCD_SWITCH2_BLE_STREAM.md) erklärt Erfassung, Speichern, Senden und Rückkehr.

Funkwechsel und Schlafen warten auf die tatsächliche asynchrone Freigabe des bisherigen Funkbesitzers. Speicherfehler in der Weckkonfiguration erlauben Wiederholen oder bewusstes Verwerfen. Der PC-Bildsender hält höchstens einen unquittierten Chunk offen. Eine vorübergehend volle Notificationqueue verliert die notwendige Quittung nicht; das TX-ready-Ereignis setzt ihre Übertragung fort. Fehlerhafte Bilddaten und neue Verbindungen verwerfen eine unbrauchbare Delta-Referenz.

Der NFC-14A-Decoder liefert die entpackte Bitlänge mit 16 statt 8 Bit zurück. Das verhindert den vorherigen Überlauf bei längeren Frames. Die Grenze am letzten Eingabebyte wird geprüft; ein vollständig verbrauchter letzter 9-Bit-Block beendet die Schleife. Der frühere Fehler und die korrigierten Grenzen sind durch Host- sowie ASan-/UBSan-Fälle belegt.

Katalognamen werden platzsparend über einen gemeinsamen Namenspool verwaltet. Die Symbolschrift enthält die tatsächlich benötigten Zeichen; die vollständige Ausgangsschrift und der reproduzierbare Generator bleiben im Repository. Die Katalog- und Schriftprüfungen bestätigen die erforderlichen Inhalte. Die vorhandenen App672-Funktionen einschließlich Import-Wiederholung, Bereinigung, Sammellesen, Favoriten, NFC, Fernbedienung und Speicherfehlerbehandlung bleiben die Grundlage.

Die fünf neuen Miniapp-/Funkquellen werden ausschließlich für `BOARD=LCD` eingebunden. Es wird kein neues OLED-Paket geliefert. Gemeinsame Quelländerungen dieses LCD-Zweigs sind keine Abnahme eines anderen OLED-Builds; der separate OLED-Zweig behält seinen eigenen Prüfstand.

## Ressourcen

| Ressource | App672 | App673 | Mindestgrenze |
| --- | ---: | ---: | ---: |
| Anwendungs-BIN | 364.276 B | 361.080 B | — |
| Flashreserve | 8.440 B | 11.644 B | 8.192 B |
| Statischer Heap-/Stackabstand | 1.720 B | 1.672 B | 1.536 B |
| Reservierter Stack | 8.192 B | 8.192 B | 8.192 B |

Das BIN ist 3.196 Byte kleiner. Die Linkerreserve wächst um 3.204 Byte; BIN-Länge und Linkerbelegung sind unterschiedliche Größen. Der statische RAM-Abstand sinkt um 48 Byte und liegt weiterhin 136 Byte über seiner Mindestgrenze. Diese Werte beschreiben den Build, keinen gemessenen dynamischen Gerätespeicher oder Stromverbrauch.

## Softwareprüfung

Der endgültige Gesamtlauf besteht **196 von 196 Firmware-Testskripten**, ohne ausgelassene Skripte. Eine erneute Hashprüfung bestätigt 843 Quell-/Testdateien und sämtliche 720 Produktionsinputs. **13 von 13 Prüfgruppen** führen tatsächlich verknüpfte Cortex-M4-Funktionen aus. Zwei isolierte finale Builds liefern bytegleiche BIN und HEX; beide passen zum signierten Paket.

Die Z21-Prüfung verwendet genau die endgültigen App673-Bytes. Sie besteht sieben Signatur-/Hash-/CRC-Fälle einschließlich negativer Kontrollen, zwei Init-/Bank-Fälle und das vollständige Datenstrommodell mit Wiederaufnahme. Dazu gehören 455 modellierte Checkpoint-Stromabbrüche. ASan und UBSan bestehen; lokales LSan ist unter ptrace nicht verfügbar. Eine spätere unabhängige CI-Prüfung wird mit ihrem tatsächlichen Status in [DE3_100.json](https://github.com/bluecyber81/pixl.js/blob/release/lcd-de3100-app673/docs/validation/DE3_100.json) dokumentiert.

Der frühere Stand vor der LCD-Begrenzung ist ausdrücklich verworfen. Seine SourceID `902463…` und BIN-SHA `5cee147…` gehören nicht zu dieser Lieferung. Ein früherer Gesamtlauf mit 190/196 bestandenen Skripten wurde nach ausschließlich sieben Test-/Harnesskorrekturen vollständig wiederholt; der aktuelle 196/196-Lauf bindet die unveränderten finalen Produktionsinputs.

Alle [abschließenden Nachweise](https://github.com/bluecyber81/pixl.js/blob/release/lcd-de3100-app673/docs/validation/DE3_100_evidence/APP673_FIRMWARE_FINAL_VERIFICATION.json), die [finale Reproduzierbarkeit](https://github.com/bluecyber81/pixl.js/blob/release/lcd-de3100-app673/docs/validation/DE3_100_evidence/APP673_FINAL_REPRODUCIBILITY.json) und die [Zuordnung lokaler und öffentlicher Quellen](https://github.com/bluecyber81/pixl.js/blob/release/lcd-de3100-app673/docs/validation/DE3_100_SOURCE_PUBLICATION.json) bleiben nachvollziehbar.

## Dateimanager 3.63.0

Unter Figurenkatalog lässt sich ein lokaler BIN-/Ordner-/Backupbestand mit einer aktuellen Geräteprüfung vergleichen. Fehlende Figuren werden nur aus hinreichend vollständigen Prüfungen abgeleitet. Die bewusste Übergabe an den vorhandenen Ordnerabgleich führt zunächst zur Vorschau; sie startet keine automatische Geräteschreiboperation.

Zusätzliche quellengebundene Spielhinweise und acht ausschließlich im Web geführte Zuordnungen ergänzen den Katalog. Die bestehende PFS1-Engine und ihr Simulator-WASM sind bytegleich zu App672. Ein eigener App673-Nachweis bindet Paket, Produktionsquellen und vier frisch geprüfte ARM-Layoutfälle an das neue Profil.

Der vollständige lokale Weblauf meldet 2.145 bestandene Fälle, null Fehler und drei benannte Auslassungen. Root- und Pages-Build bestehen je 53/53; Python-Starter 26/26, Figurenexporter 12/12. Die reale Portable wird entpackt, per Hash geprüft, gestartet, wiederverwendet und beendet. Zwei native Windowsfälle und ein optionaler historischer OTA-Fixture-Fall sind im lokalen Nodeergebnis ausgewiesen. Der Browserprozess kann im lokalen Executor keine erforderlichen Sockets anlegen; daraus wird kein Browser-PASS abgeleitet. Finale Quellen-, Portable-, CI- und Auslieferungsbelege stehen auf dem separaten Zweig `web-app673`.

## Installation und noch offene Gerätebeobachtung

Für das bereits eingerichtete LCD/PFS1/Z21/S112-7.3.0-Gerät ist `Allmiibo_LCD_DE3_100_673_NUR_APP.zip` das reine App-Update. Die ZIP bleibt gepackt. Bootloader, SoftDevice und vorhandenes Dateisystem werden dadurch nicht ersetzt. Eine neue Speicherumstellung ist für dieses vorhandene PFS1 nicht erforderlich.

Erwartete Anzeige nach dem eigenen Update: **2.22.0-DE3.100**, App-Zähler **673** und Dateimanager **3.63.0**. Die neue Firmware wurde in dieser Arbeit nicht auf einem physischen Gerät installiert oder gemessen. Die vorausgehende App672-Diagnose bleibt eine Beobachtung des Vorgängerstands.

Als nächster konkreter Schritt genügt die normale Bedienung nach dem Update. Wer die neuen Miniapps nutzt, prüft zusätzlich Controllererfassung und gespeicherte Konfiguration, tatsächliches Wecken der eigenen Switch 2, Bildempfang mit Wiederverbindung sowie Rückkehr nach Schlafen zur normalen Dateiverbindung und NFC-App. Ein realer Verbrauchsvergleich erfordert eigene Messungen; aus Akku-Spannungswerten wird keine Laufzeit abgeleitet.
