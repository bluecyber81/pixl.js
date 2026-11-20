# Allmiibo LCD: Was eingebaut ist und was noch fehlt

## Nachtrag vom 20. November 2026: DE3.94 / App667

Die ursprüngliche Bestandsaufnahme unten dokumentiert den historischen Stand **vor** der inzwischen abgeschlossenen Korrektur. In **DE3.94 / App667** sind der bestätigte Verwerfen-Ausgang der Haupt-Einstellungen und die fünf betroffenen Optionswege einschließlich des blockierenden AmiiboDB-Sortierausgangs korrigiert. Dauerfehler, Retry, Nein/Ja, fremde Exit-Vetos, Rücknahme ohne erneuten Kill-Save und spät geladene Settings wurden gezielt geprüft; die abschließende Firmware-Suite besteht mit **178/178** Skripten. Zwei unabhängige Builds, die signierte Anwendungsdatei und die Z21-ARM-Prüfungen sind ebenfalls bestanden. Die physische Geräteabnahme für App667 bleibt offen.

Der aktuelle Korrekturstand und seine genaue Paketidentität stehen in [DE3.94 / App667](DE3_94.md) und [DE3_94.json](DE3_94.json). App666 bleibt als unveränderter, zurückgestellter Zwischenstand erhalten. Die Aussagen unten über noch fehlende App667-Korrekturen gelten für den damaligen Auditstand; sie beschreiben nicht die korrigierte Firmware dieses Testzweigs. Der ursprüngliche Auditcommit `acc045575cac6a1e81a22bf2626f73194dd35034` bleibt unverändert. Dieser Nachtrag trifft keine neue Aussage über die Veröffentlichung des getrennten Web-Dateimanagers.

## Ursprüngliche Bestandsaufnahme vor der App667-Korrektur

Stand: 20. November 2026. Projekt `pixel.js`, Repository `bluecyber81/pixl.js`.

## Ergebnis

Der frühere Verwerfen-Fix ist erhalten. Der zentrale NFC-Speicherfehlerdialog besitzt ihn spätestens in **DE3.89 / App662**. Der ausdrücklich bestätigte Chameleon-Ausgang ins Hauptmenü kam mit **DE3.90 / App663**, erhielt in App664 weitere Korrekturen und ist in der zuletzt am Gerät beobachteten **DE3.92 / App665** enthalten.

Es bleiben zwei getrennte Probleme: Die **Haupt-Einstellungen** besitzen noch keinen allgemeinen bestätigten Verwerfen-Ausgang bei dauerhaftem Speicherfehler. Außerdem blockiert die neue Speicherprüfung der **AmiiboDB-Sortierung in App666** das normale Verlassen, wenn jeder Schreibversuch fehlschlägt. Diese neue Regression wurde beim Abgleich erkannt und ist noch nicht korrigiert.

**DE3.93 / App666 ist deshalb ein zurückgestellter Zwischenstand und wird derzeit nicht zur Installation empfohlen.** Die signierte Datei liegt bereits im Testzweig; sie wird als Nachweis erhalten. Es gibt keine abgeschlossene App667 und keinen veröffentlichten Web-Dateimanager 3.58.4. Der Online-Dateimanager bleibt 3.58.3, das zuletzt diagnostizierte Gerät App665.

## 1. Verglichene Stände und Identität

| Bereich | Tatsächlich vorhandener Stand |
|---|---|
| Referenzpaket | Hochgeladene komplette LCD-ZIP DE3.89 / App662, S112 7.3.0 und Z21; byteidentisch mit dem hinterlegten Paket. |
| App662-Produktionsquelle | Commit `fecc8b750288f1028f109067dad9694c9f2c3628`; dieselben 709 Produktionseingaben liegen auch im Firmwareteil des Web-Commits `e7989003be3679316c475fca307735ed1438e70d`. |
| Zuletzt am Gerät beobachtet | LCD / ST7567, DE3.92 / App665, Z21, S112 7.3.0, PackedFS/PFS1. Nutzerdiagnose vom 20.11.2026, 12:58 MEZ; Firmware meldet passende LCD-SourceID. |
| App665-Quellstand | Produktionscommit `73df4e3d16f0e51b3bbd3e9bf10387010ed32934`; Abschlusscommit `05028b679591e3d228f2b43c6057e3905f5cca88`. |
| Online-Dateimanager | Web3.58.3, Quellcommit `e7989003be3679316c475fca307735ed1438e70d`; Pages `8b89db7bb5a173be8562401411f457c03b9b3b7d`. |
| Neuer Firmware-Zwischenstand | DE3.93 / App666, lokaler Quellcommit `675e922d1b03029802dc587e1c9443dc5a245b3a`; öffentliches Quellen-/Paket-Snapshot `73415809be417f1242c9ca409f77ad61ab07d876`. Danach ergänzt dieses Audit nur Dokumentation. |
| Neuer Web-Zwischenstand | Lokaler, uncommitteter Web3.58.4-Entwurf mit App666-Unterstützung. Kein abschließender Web-Gesamtlauf, kein veröffentlichter Pages-Build. |
| OLED | Separater historischer Zweig DE3.85 Test 5 / App85. Dieser LCD-Abgleich ersetzt weder dessen Stand noch seine offenen Gerätetests. |

Die Versionsnummer allein wurde nicht als Quellenbeleg verwendet. Für App662 ergeben die 709 tatsächlichen Produktionseingaben erneut die dokumentierte SourceID `9596188378370a23812bb16e914dd7b47847e375cfd63e56279d8ffa9bbdf2e7` und den Manifest-SHA-256 `9901b676dfc535d0c0cece8a4537840454b13c0b52ec2b8c402b7c9f29f07318`. App665 und App666 sind ebenso an ihre jeweiligen Build-Manifeste gebunden.

Die aktuelle App665-SourceID lautet `49ed45a809f197c9d3b072bf1cb243fd8cf0b62fa55826d2cfeda841afe767b9`. Die App666-SourceID lautet `415e85895e35e4f06cede89d6efbbe7e905290205723f0b31e9ddda9f05ac12a`. Eine vom Gerät gemeldete SourceID ist kein vollständiger, auf dem Gerät gemessener Anwendungs-BIN-Hash.

### Angehängte DE3.89-Komplettdatei

`Allmiibo_LCD_S112_7_3_0_Z21_DE3_89_662_KOMPLETT.zip` enthält sowohl die Systemphase als auch App662:

| Bestandteil | Größe / Zuordnung |
|---|---|
| Gesamt-ZIP | 343.768 Byte; SHA-256 `2b2162693351e8d5ebd47b08b359cfffb1de3159d590da864b60934fbacb3e13`. |
| `sd_bl.bin` | 125.000 Byte; S112 7.3.0 und Z21. |
| `app_662.bin` | 363.752 Byte; SHA-256 `401e9517ad3c199b48122caadcec86a72e15bb3ada491cea1b3d1342b34983ec`. |
| Archivprüfung | CRC ohne Fehler, alle fünf Einträge identisch zur hinterlegten Komplettdatei. |

Die Signatur-/Komponentenbelege des byteidentischen Pakets liegen bereits in [DE3_89_COMBO.json](DE3_89_COMBO.json) und [DE3_89_LCD_TEST1.json](DE3_89_LCD_TEST1.json). Dieses Audit hat das Paket nicht verändert, neu signiert oder am Gerät installiert. Das Paket ist eine historische Referenz; das aktuelle Gerät meldet bereits App665 und Z21.

## 2. Speichern, Verwerfen und Menüs

„Spätestens App662“ bezeichnet den frühesten in diesem Vergleich verifizierten Stand, nicht zwingend die ursprüngliche Einführung einer Funktion.

| Funktion | In App665 vorhanden? | Historie / aktueller offener Punkt |
|---|---|---|
| Zentraler NFC-Dialog: erneut speichern | Ja | Bereits App662. Fehler hält ungespeicherte Daten im RAM; Wiederholen bleibt möglich. |
| Zentraler NFC-Dialog: bestätigt verwerfen und Hauptmenü | Ja | Bereits App662; relevanter Overlay-, Discard- und Launcher-Code in App665/App666 erhalten. |
| Chameleon: Wiederholen oder zurück zur laufenden App | Ja | Bereits App662. Zurück behält RAM; es bedeutet nicht Verwerfen. |
| Chameleon: bestätigt verwerfen und Hauptmenü | Ja | App663, Einführungscommit `8516f6c9b974072c68c04e84083c8ff922e4d3ef`; in App665/App666 erhalten. |
| Alte Tasteneingaben dürfen die neue Chameleon-Entscheidung nicht auslösen | Ja | App664, Commit `d4d316b65033ee5f6fb784ea1ead29b865f3873e`; physische und Remote-Eingaben werden an der neuen Dialogseite abgegrenzt. |
| Explizit gewählte Standardwerte bei späterem Laden erhalten | Ja | App664, Commit `7ae4b623c76d7dc7a063fc3505cb433804350f6c`. |
| Später geladene Einstellungen auch auf Sprache, Standby und Display anwenden | Ja | App664, Commit `5a618cf4dc62b73303e79738a34cbdb14c656876`. |
| Haupt-Einstellungen: vor Home, Neustart und DFU speichern und Fehler anzeigen | Ja | Bereits App662; fehlgeschlagenes Speichern verhindert den jeweiligen normalen Wechsel. |
| Haupt-Einstellungen: bei dauerhaftem Fehler bestätigt verwerfen und Home verlassen | **Nein** | Alte Lücke, auch in App665 und bisherigem App666 vorhanden. „Zurück“ führt nur in dieselben Einstellungen. |
| AmiiboLink-Modus, Amiibo-Auto-UID, AmiiboDB-Auto-UID/QR: Speicherergebnis prüfen | Noch nicht in App665 | Neue App666-Dialoge zeigen Fehler und erlauben Retry; Zurück behält den geänderten RAM-Wert. Ein eigener bestätigter Options-Discard fehlt noch. |
| AmiiboDB-Sortierung: vor dem Wechsel auf erfolgreichen Save prüfen | Noch nicht in App665 | In App666 eingebaut, aber **mit neuer Blockade** bei permanentem Savefehler. Verwerfen und tatsächlicher Exit fehlen. |
| Chameleon-Spitzname: Eingabe nach Savefehler behalten | Noch nicht in App665 | App666 bleibt im Editor und erlaubt Retry. Der schon vorher vorhandene Abbrechen-Ausgang bleibt erhalten. |

### Bereits vorhandene Bedienung in App665

Beim **zentralen NFC-Speicherfehlerschirm** und beim **Chameleon-App-Speicherfehlerschirm** öffnet die rechte Taste die Verwerfen-Frage. Zunächst ist Nein ausgewählt. Erneut rechts wählt Ja; die mittlere Taste bestätigt. Die angezeigte Frage und Auswahl sind dabei maßgeblich.

Diese Bedienung gilt für diese beiden Bildschirme. Sie darf nicht auf den Haupt-Einstellungsdialog oder die neue App666-Sortierprüfung übertragen werden. „Zurück“ oder eine abgebrochene Bestätigung behalten die RAM-Daten. Bestätigtes Verwerfen gibt noch gehaltene RAM-Änderungen auf; bereits erfolgreich geschriebene Teiländerungen werden dadurch nicht pauschal rückgängig gemacht.

### Die zwei bestätigten offenen Fehler

**Haupt-Einstellungen:** Ein Host-Reproduktionslauf mit den tatsächlichen C-Callbacks bestätigt die Schleife sowohl im App662-Stand als auch im aktuellen Stand: fünf Home-Versuche nach jeweils quittiertem Fehler ergeben fünf Speicherversuche und keinen normalen Exit. Ein erzwungener technischer Kill versucht zusätzlich nochmals zu speichern. Dieser Fallback ist kein sichtbarer Verwerfen-Ausgang. Der nächste Fix muss deshalb auch die nachgelagerten Exit-/Kill-Callbacks und die Wiederherstellung der wirklich betroffenen Einstellungsfelder berücksichtigen.

**Neue App666-Sortierblockade:** App662/App665 verließen die Szene trotz ungeprüftem Speicherfehler. App666 prüft den Save vor dem normalen Wechsel und bleibt bei Fehler stehen. Ohne bestätigten Discard-Ausgang kann daraus eine dauernde Blockade werden. Dies ist eine Regression der neuen Änderung, keine alte bereits behobene Funktion. Die bestehenden grünen Tests deckten Retry, Fehlerbehalt und späteren Erfolg ab, nicht den noch fehlenden dauerhaften Fehler mit anschließendem Verwerfen und Exit.

Quellen: [NFC-Overlay](../../fw/application/src/mui/mui_core.c), [Chameleon-App](../../fw/application/src/app/chameleon/app_chameleon.c), [Haupt-Einstellungen](../../fw/application/src/app/settings/scene/settings_scene_main.c), [Settings-App-Lebenszyklus](../../fw/application/src/app/settings/app_settings.c), [AmiiboDB-Sortierung](../../fw/application/src/app/amiidb/scene/amiidb_scene_settings.c), [Options-UI-Tests](../../fw/tests/de3/test_app_settings_save_ui.py).

## 3. Speicher und Startverhalten

| Punkt | Bereits eingebaut / aktueller Status |
|---|---|
| PFS1 mit sicherer Veröffentlichung und geschützten alten Lesern | Bereits App662. Offene alte Datei-/Verzeichnissnapshots müssen ihre Daten weiter lesen können. |
| Automatische Bereinigung nach erfolgreichem Commit | **App665 enthält sie bereits.** Sie ist keine erst für App666 angekündigte Funktion. |
| Freigabe nach Schließen des letzten alten Lesers | **App665 enthält sie bereits.** Während ein alter Leser die Daten benötigt, bleibt deren Freigabe absichtlich zurückgestellt. |
| Saubere Zustände ohne redundante Bereinigung | App665. Normales Mounten und Lesen bleiben schreibfrei. |
| Bereits veröffentlichte Änderung nicht wegen nachgelagerter Wartung als fehlgeschlagen melden | App665. Ein unsicherer I/O-Zustand kann weitere Schreibzugriffe trotzdem schützen. |
| Chameleon-Namenscache und kleinere UI-/Leerstringoptimierungen | Bereits App665. |
| Bereinigung mit einem durchgehenden Verzeichnisiterator | Neu in App666, automatisiert geprüft. Es bleibt dasselbe PFS1-Format; keine Migration. |
| Temporärer PackedFS-Mountcache | Bereits im App662-Produktionsstand. Die Diagnosefelder allein beweisen keine spätere Cache-Vergrößerung. |
| Pauschal größerer Catalog64-Cache | Nicht übernommen. Die RAM-/Stackgrenzen werden nicht abgesenkt. |
| Kontrolliert am Gerät nachgewiesene Sofortfreigabe nach Upload/Löschen | Weiter offen. Das bestätigte Löschen und der vorhandene freie Speicher belegen nicht allein jeden Freigabezeitpunkt. |

Im reproduzierten Backup-Modell bleiben 1.084 Dateien, 57 Ordner, 661.294 Nutzbytes und die Rohmetadaten erhalten. Mit App665 konnte die Freigabe nach dem letzten alten Leser bereits gezeigt werden. App666 reduziert die dafür nötige Sucharbeit: Beim Schließen des letzten alten Verzeichnissnapshots sinken die Leseaufrufe von 9.110 auf 7.481 und die GC-Verzeichnisscans von 28 auf 1. Bei 20 kleinen Neuschreibvorgängen sinken die Leseaufrufe von 90.967 auf 81.398. Program-/Erase-Zahlen bleiben gleich.

Das sind Host-NOR-Modellwerte. Sie sind weder gemessene Handy-Übertragungszeiten noch eine gemessene Verkürzung des Gerätestarts.

Quellen: [PackedFS](../../fw/application/src/mod/vfs/packed_fs.c), [App665-Cleanup-Prüfung](../../fw/tests/de3/test_packed_cleanup_de392.py), [App666-Iteratorprüfung](../../fw/tests/de3/test_packed_gc_iterator_de393.py), [App666-Messnachweise](DE3_93_FIRMWARE.md).

## 4. Bluetooth und Web-Dateimanager

| Funktion | Stand und Abgrenzung |
|---|---|
| ATT-MTU 250 / GATT-Nutzwert 247 / DF-Nutzlast bis 243 Byte | Bereits App662 und in der App665-Gerätediagnose beobachtet. Kein neuer App666-Ausbau. |
| Chunking und serialisierte Datei-/Befehlswarteschlange | Bereits vorhanden. Keine neue unkontrollierte Parallelisierung von GATT-Schreibzugriffen. |
| SmallRead und schneller SmallCreate-Pfad bis 572 Byte | Bereits App662; gewöhnliche 540-Byte-Dateien passen in diesen Pfad. |
| SHA-256-Gerätebefehl | Bereits App662. |
| Gerätehash auch im sicheren Web-Uploadadapter verwenden | **Web3.58.3 enthält die neue Anbindung bereits online.** Der vorhandene Firmwarebefehl wird hier erst korrekt durchgereicht. |
| Downloadqueue nach ungültigem Pfad sauber abschließen | **Web3.58.3 enthält die Korrektur bereits online.** Nachfolgende gültige Downloads können weiterlaufen. |
| Wiederaufnahme, Inhaltsprüfung und versionsgebundene Kapazitätsprofile | Bereits im Web-Dateimanager vorhanden. Umfangreiche alte Tests sind keine neue Messung der aktuellen Handygeschwindigkeit. |
| Kleine RAM-Lesesnapshots und Schutz durch Mount-/Generationsprüfung | Vorhandene getrennte Mechanismen. Keine Behauptung einer atomaren Vollgerätesicherung oder eines zusätzlichen Befehls namens `vfsSnapshot`. |
| Gültige Verbindung trotz abgelehnter bevorzugter Verbindungsparameter behalten | Neu in App666, noch nicht am Gerät abgenommen. |
| Secure-DFU: Wiederaufnahme und inkrementelle CRC32 | Bereits im verfügbaren Web3.58.2-Stand vorhanden und bis zum Web3.58.4-Entwurf unverändert. |
| Eigener 2M-Wechsel, tatsächliches Intervall-/PHY-Reporting und neuer CRC-/Offset-Stream im normalen Dateiprotokoll | Nicht als neue fertige Funktion eingebaut. AUTO-Behandlung vorhandener PHY-Anfragen ist bereits vorhanden; ein Geschwindigkeitsgewinn ist nicht belegt. |
| DLE einfach einschalten | Kein passender Ein-Schalter-Fix für den verwendeten S112-Pfad; von der bereits vorhandenen großen ATT-MTU zu unterscheiden. |
| Physischer Durchsatzvergleich des aktuellen App665/Web3.58.3 beziehungsweise App666 | Offen. Größe, Dateizahl, Richtung, Dauer und Inhaltsvergleich müssen gemeinsam gemessen werden. |

Die App666-Verbindungskorrektur entfernt einen zusätzlichen Disconnect bei gescheiterter Aushandlung der bevorzugten Parameter. Die tatsächlich verwendete Nordic-SDK-Zustandsmaschine wurde mit verschiedenen gültigen Intervallen geprüft: vorher bestanden 9 von 15 Fällen, nach der Änderung 15 von 15, ebenso unter ASan/UBSan. Die gültige schnellere Verbindung durfte vorher nach wiederholten erfolglosen Präferenzanfragen getrennt werden. Das bedeutet nicht, dass jedes Telefon betroffen war oder dass App666 bereits einen gemessenen höheren Funkdurchsatz liefert.

Der Web3.58.3-Integrationstest reduziert bei zwei Inhaltsvergleichen einer 540-Byte-Datei die Antwort-Nutzdaten von zusammen 1.080 auf 64 Byte, die Inhaltsantwortpakete von sechs auf zwei. Die übrigen Schreib-, Prüf- und Verzeichnisarbeiten bleiben bestehen. Daraus folgt keine prozentuale Gesamtlaufzeitverkürzung.

Quellen: [Web3.58.3-Transferbericht](WEB_3_58_3_TRANSFER.md), [BLE-Verbindungslogik](../../fw/application/src/mod/ble/ble_main.c), [SDK-Regressionstest](../../fw/tests/de3/test_ble_conn_preferences.py), [Live-Dateimanager](https://bluecyber81.github.io/pixl.js/?v=3.58.3).

## 5. Diagnosen, Ressourcen und Bootloader

Die Laufzeit-, Boot-, Power-, MTU-, UI-/Menü- und Flashdiagnosen sowie die PXBI-Ausgabe mit LCD-SourceID und gegebenenfalls vorherigem Fehler sind bereits im verifizierten App662-Produktionsstand vorhanden. Die neuere Browserdiagnose kann zusätzliche vorhandene Firmwarefelder sichtbar machen. Ein fehlendes Feld in einem älteren Export beweist deshalb nicht, dass die Firmwarefunktion damals fehlte.

Die aktuelle App665-Diagnose enthält keine gemeldeten Laufzeit-/VFS-/Transportfehler. Sie ist eine Stichprobe mit wenigen Speichersamples, kein Dauerlasttest. Die Einstellungszähler enthalten keine aufgezeichnete Sitzung; daraus folgt keine Abnahme des Speicherfehler-/Verwerfen-Ablaufs. `applicationHashVerified: false`, `samePhysicalDeviceVerified: false` und eine noch ausstehende vollständige Hardwareabnahme bleiben korrekte Einschränkungen.

App666 entfernt im LCD-Build ungenutzte generische MD5-/SHA-384-/SHA-512-Einbindungen; benötigtes SHA-256/HMAC und AES bleiben geprüft. Die Anwendungsdatei wird gegenüber App665 6.560 Byte kleiner, die Linkerreserve steigt von 8.192 auf 14.752 Byte. **Das ist interner Programmflash und kein zusätzlicher Speicherplatz auf Laufwerk E:.** Der Heap-/Stackabstand bleibt 1.816 Byte bei unverändertem Mindestwert 1.536 Byte; der reservierte Stack bleibt 8.192 Byte.

App666 enthält ausschließlich die Anwendung. Z21 und S112 werden dadurch nicht neu geflasht. Die App666-Signatur und der tatsächliche Z21-Prüfpfad wurden automatisiert überprüft; eine erfolgreiche physische App666-Installation wird nicht behauptet.

## 6. Welche Tests wirklich vorliegen

| Stand / Prüfung | Vorliegender Nachweis | Grenze |
|---|---|---|
| App662 | 170/170 vollständige Firmware-Testskripte im damaligen Bericht; Quellen-/Paketbindung jetzt erneut lesend abgeglichen. | Historische Tests nicht als neuen Lauf gezählt. |
| App663 / App664 | Historische Berichte 171/171 beziehungsweise 172/172; zugehörige Änderungen in der Git-Historie vorhanden. | Frühere gezielte Fehler-/Gerätetests wurden dadurch nicht nachträglich erledigt. |
| App665 | 173/173 Firmware-Testskripte, neun gelinkte ARM-Prüfungen und signiertes Paket; passende Nutzerdiagnose vorhanden. | Gezielte Sofortfreigabe- und dauerhafte Speicherfehlerprobe offen. |
| App666 | 177/177 Firmware-Testskripte, neun gelinkte ARM-Prüfungen, zusätzliche SHA-256-/HMAC-Fälle, zwei gleiche BIN-/HEX-Builds, Z21 7/7 Kryptografie- und 2/2 Init-/Bankfälle. | Die später erkannte Sortier-Exit-Lücke war nicht als zu erfüllende Discard-Eigenschaft getestet. Kein physischer App666-Test. |
| App666 PackedFS | Reale Produktions-C-Implementierung mit NOR-Modell, I/O-/Allokationsfehlern, Iterator-/Snapshotfällen, ASan/UBSan; Kapazitätssimulator gebunden. | Keine physische Flash- oder Funkzeitmessung. |
| Web3.58.3 | 1.877 bestanden, drei vorhandene Auslassungen, null Fehler; Pages 26/26; acht zentrale öffentliche Dateien sowie sichtbare Oberfläche geprüft. | Keine neue physische Handyübertragung. |
| Web3.58.4-Entwurf | Mehrere gezielte Teilgruppen und App666-Simulatorprüfungen bestanden. | Kein abschließender Gesamt-Weblauf, kein neuer Pages-Build und keine Veröffentlichung. |
| Haupt-Settings-Schleife | Fünf dauernd fehlschlagende Home-Versuche ohne normalen Exit, mit tatsächlichen C-Callbacks reproduziert. | Hostmodell; kein absichtlich am Gerät erzeugter Speicherfehler. |

Eine bestandene Suite belegt die tatsächlich getesteten Eigenschaften. Sie ersetzt weder fehlenden Code noch nicht durchgeführte Gerätetests.

## 7. Konkreter nächster Entwicklungsschritt

Die laufende Produktänderung wurde für diesen Bestandsabgleich angehalten. Die folgenden Änderungen sind **noch nicht umgesetzt**:

1. Haupt-Einstellungen erhalten einen ausdrücklich bestätigten Verwerfen-Ausgang. Dabei nur die betroffenen ungespeicherten Werte zurücknehmen, korrekt auf das laufende Gerät anwenden und ohne erneuten Speicherversuch im Exit tatsächlich ins Hauptmenü wechseln.
2. Die neue AmiiboDB-Sortierblockade beheben. Der gewünschte Wechsel muss nach bestätigtem Verwerfen ohne weiteren Save möglich sein.
3. Die neuen Options-Fehlerdialoge um echtes Verwerfen ergänzen, ohne fremde oder erst später korrekt geladene Einstellungen zu überschreiben. Vorhandene NFC-/Chameleon-Ausgänge und die Cancel-Funktion des Spitznameneditors erhalten.
4. Für die betroffenen tatsächlichen Callback-/Dispatcherpfade prüfen: dauernder Savefehler, mehrere Retries, abgebrochene Bestätigung, bestätigtes Verwerfen, tatsächlicher Exit, kein versteckter nachträglicher Write und gegebenenfalls ein anderer Launcher-Veto.
5. Erst den korrigierten Stand neu bauen, prüfen, signieren und als eigene Version bereitstellen. Weil App666 bereits veröffentlicht wurde, soll ein korrigierter Firmwarestand eine neue eindeutige Version und einen höheren App-Zähler erhalten; App667 ist bisher nur das vorgesehene nächste Ziel.

Anschließend bleiben die realen Geräteproben getrennt offen: Verwerfen nach Speicherfehler, Speichern nach Neustart, NFC/Chameleon/Slotname, Schlaf/Aufwachen, mindestens zwei Minuten stabile BLE-Verbindung sowie eine kleine protokollierte Upload-/Löschprobe ohne Neustart. Für eine Geschwindigkeitsaussage zusätzlich dieselbe repräsentative Datenmenge mit Dateizahl, Richtung, Dauer und Rücklesevergleich messen.

## 8. Umfang dieses Abgleichs

Geprüft wurden die tatsächliche angehängte DE3.89-Datei, Produktionsmanifeste und Quellstände, die relevante Git-Historie, bestehende Testnachweise, die gemeinsame Übergabe, die gelieferten Gerätediagnosen sowie gezielt wiedergefundene frühere Projektberichte. Eine erneute vollständige Lektüre sämtlicher Projektchats oder eine vollständige Fehlerfreiheit aller Softwarebereiche wird nicht behauptet. Der Chat zum SV07-Plus-Drucker gehört nicht zu diesem Auftrag.

Dieser Dokumentationsnachtrag ändert keine Firmwaredatei, keine Produktionsquelle, keine Tests und keine Online-Webausgabe. Er korrigiert die Einordnung des bereits vorhandenen App666-Zwischenstands und hält die offenen Arbeiten fest.
