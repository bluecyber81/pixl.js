# DE3.95 / App668: BLE-Änderungen und Komponentenprüfung

Stand: 21. November 2026. Basis ist LCD DE3.94/App667, Commit
`22d5c92cc566fb7da9d43a538f2818d28bfb72a6`. Dieser Bericht beschreibt den
BLE-Komponentenstand. Er ersetzt weder den vollständigen Build-/Paketnachweis
noch eine Gerätebeobachtung.

## Änderungen

### Tatsächliche Verbindungseigenschaften auslesen

INFO `0x05` behält für eine leere Anfrage und für `MTU!` seine bisherige
16-Byte-Antwort `MTUD` Version 1. Nur die neue Leseanfrage mit genau einem Byte
`01` liefert auf dem LCD-Profil die 32-Byte-Version 2. Vorhandene Clients und
die Einstellung der MTU für die nächste Verbindung behalten ihren Vertrag.

Version 2 ergänzt das tatsächlich vom Central gewählte Verbindungsintervall,
Slave-Latenz, Supervision-Timeout sowie die zuletzt erfolgreich gemeldete
RX-/TX-PHY. Die Werte stammen aus `CONNECTED`, `CONN_PARAM_UPDATE` und
`PHY_UPDATE`. Ein angeforderter Wechsel ist noch kein erfolgreicher Wechsel.
Fehlgeschlagene PHY-Ereignisse überschreiben die zuletzt bestätigte PHY nicht.
Vor dem ersten erfolgreichen PHY-Ereignis wird sie als unbekannt gemeldet.

MTU und Linkdaten werden unter derselben kritischen Region gelesen. Ein
Disconnect dazwischen darf keine Antwort mit zwei verschiedenen Linkständen
erzeugen. Ein tatsächlicher GAP-Disconnect oder neuer GAP-Connect setzt den
Linkzustand zurück; das bloße Abmelden von NUS-Notifications erfindet keinen
physischen Verbindungsabbruch. Alte Ereignisse mit anderem Handle werden
ignoriert. Die Leseabfrage löst keine neue Aushandlung und keine Flash-I/O aus.

| Byte | Inhalt |
|---|---|
| 0–13 | Wie MTUD v1; Version in Byte 4 ist 2 |
| 14 | Flags: 1 GAP verbunden, 2 Verbindungsparameter gültig, 4 PHY gültig, 8 lokaler PHY-Antrag noch offen |
| 15 | Letzter PHY-Update-HCI-Status; 255 bedeutet kein beobachtetes Ereignis |
| 16–17 | Tatsächliches Intervall, u16 LE in 1,25-ms-Einheiten |
| 18–19 | Slave-Latenz, u16 LE |
| 20–21 | Supervision-Timeout, u16 LE in 10-ms-Einheiten |
| 22–23 | RX-/TX-PHY: 0 unbekannt, 1 LE 1M, 2 LE 2M |
| 24 | Anzahl lokaler PHY-Anträge, 0–3 |
| 25–27 | Reserviert, null |
| 28–31 | Letztes lokales API-Ergebnis, u32 LE; `ffffffff` bedeutet kein Antrag |

Die vollständige gültige C-Antwort liegt als
[`ble_link_diagnostic_v2.json`](../../fw/tests/de3/fixtures/ble_link_diagnostic_v2.json)
vor. Der Web-Parser hat diese tatsächlichen Serializerbytes separat gelesen
und die erwarteten Felder bestätigt.

### 2M-Verbindung anfordern, wenn der Dateikanal bereit ist

Der vorhandene S112-Stack unterstützt LE 2M. Das ist sowohl in der
[offiziellen S112-Beschreibung](https://www.nordicsemi.com/Products/Development-software/s112/download)
als auch in der
[S112-Spezifikation](https://docs.nordicsemi.com/r/bundle/sds_s112/page/sds/s1xx/s112.html)
ausgewiesen. Die
[S112-7.3.0-API](https://docs.nordicsemi.com/r/bundle/s112_v7.3.0_api/page/group_b_l_e_g_a_p_f_u_n_c_t_i_o_n_s.html)
beschreibt den PHY-Antrag und die asynchrone Erfolgsmeldung.

Das LCD-Dateiprofil fordert nun nach einer bereiten NUS-Sitzung RX/TX 2M an.
Es verwendet den vorhandenen Foreground-Poll und keinen zusätzlichen Timer.
Ein `BUSY` erlaubt höchstens zwei Wiederholungen im Abstand von mindestens
250 ms. Andere API-Ablehnungen führen weder zum Reset noch zum Disconnect.
Nach einem angenommenen Antrag wird kein weiterer Antrag gesendet. Eine
anschließend gemeldete 1M-Verbindung bleibt benutzbar. Ist bereits beidseitig
2M bestätigt, entfällt der Antrag. Remote-/AmiiboLink-Modi, schließende
Sitzungen und laufende Moduswechsel lösen ihn nicht aus; ein tatsächlich
übernommener Remote→Dateimodus auf derselben Verbindung ist berücksichtigt.

Dies ändert keine bevorzugten Verbindungsintervalle, MTU-Obergrenze,
Queuegröße, Datenlänge oder Bootloader-/SoftDevice-Version. Der zusätzliche
zustandsbehaftete Bereich benötigt 24 Byte und keine Heapallokation.

### Fehlerkorrektur für einen abgelehnten PHY-Antwortversuch

Die bestehende Antwort auf einen vom Telefon angeforderten PHY-Wechsel rief
bei jedem Fehler `APP_ERROR_CHECK` auf. Damit konnte auch ein `BUSY` oder ein
bereits geschlossener Controller-Link zur fatalen Fehlerbehandlung führen.
Der optionale PHY-Antwortversuch ist jetzt an das aktuelle Handle gebunden
und behandelt eine Ablehnung ohne Reset. Ein gezielter negativer Kontrolllauf
setzt die alte fatale Reaktion wieder ein und wird vom Test abgewiesen.

## Durchgeführte Komponentenprüfungen

| Prüfung | Ergebnis |
|---|---|
| Neuer Test mit tatsächlichen C-Funktionen und echten S112-Ereignistypen | 19 Szenarien bestanden |
| Derselbe Test mit AddressSanitizer/UndefinedBehaviorSanitizer | 19 Szenarien bestanden; LeakSanitizer in dieser Umgebung deaktiviert |
| Gezielte negative Kontrollen | 5/5 erkannt, jeweils nativ und unter Sanitizern |
| Gelinkter ARM-Nachweis am vollständigen LCD-App668-ELF | 9 Fälle bestanden; Linkzustand im ELF genau 24 Byte |
| Bisherige MTUD-v1-/SDK-Lifecycle-Suite | 131.654 Wire-/Lifecycle-Prüfschritte bestanden |
| Bisherige SDK-Verbindungspräferenz-Suite | 15/15 Fälle bestanden |
| Bisherige DF-/MTU-Suite | 31 Szenarien und 5 negative Kontrollen bestanden |
| Bisherige NUS-Sitzungssuite | 28 Szenarien bestanden |
| Bisherige Same-Link-Suite | 12 Hauptszenarien, Remote-Bridge und 2 negative Kontrollen bestanden |
| SDK-Lifecycle und Statusansicht | Bestehende Lifecycle-Prüfung und 4 Status-Tests bestanden |
| Nachlauf der Runtime- und Build/Fault-Transport-Fixtures | 33 Runtime-Fälle und 5 Negativkontrollen sowie 2 Build/Fault-Tests bestanden |

Die neuen Fälle prüfen unter anderem: 7,5-ms-Intervall statt PPCP-Wunschwert,
NUS-Bereitschaft, gebundenen Foreground-Aufruf, nur beobachtete PHY-Werte,
1M-Rückfall, Peer-Ablehnung, Busy-Grenze, RTC-Überlauf, Verbindungswechsel,
malforme Anfragen, ein atomisches MTU-/Link-Abbild und reservierte Wirebytes.
Die fünf absichtlichen Regressionen betreffen Reset bei Peer-Busy, zusätzlichen
Busy-Versuch, fehlenden Connect-Snapshot, ungeprüfte Daten eines fehlgeschlagenen
PHY-Ereignisses und einen zwischen MTU und Linkdaten eingeschobenen Disconnect.

Die Buildumgebung verwendet den gepinnten nRF5 SDK 17.1.0, dessen SDK-Paket
die S112-7.2.0-Header/HEX enthält. Der installierte Gerätestack bleibt S112
7.3.0. Der Test pinnt das tatsächlich verwendete `ble_gap.h` auf SHA-256
`0ec9439c9e87a917cfbc65817bd8fb696060b4154919fee0f08ebbfefa84067c`;
der verwendete PHY-API-Vertrag wurde zusätzlich mit der offiziellen
S112-7.3.0-Dokumentation abgeglichen.

`check_ble_link_elf.py` führt den tatsächlich gelinkten Cortex-M4-Code in
Unicorn aus. Es prüft den registrierten INFO-Handler, v1-/v2-Wirebytes,
kurze/null Puffer, gültige und fehlerhafte Anfragen, tatsächliche GAP-
Ereignistypen, Modus-/Busy-Flags, kritische Regionen und Disconnect-Sentinels.
Flash, RAM und NVIC sind modelliert; Funk-, SPI-, GPIO- und Timer-MMIO sind
nicht eingeblendet. Die Prüfung führt keine physische PHY-Aushandlung aus.
Die alten Runtime-/Build-Fault-Fixtures ergänzen ausschließlich einen Stub
für die neue Linkfunktion. Dessen unerwarteter Aufruf ist ein Testfehler;
bestehende Assertions bleiben erhalten.

Der ARM-Nachweis ist an den vollständigen Build mit folgenden Werten gebunden:

| Buildmerkmal | Wert |
|---|---|
| Profil | LCD, `2.22.0-DE3.95`, App-Counter 668 |
| SourceID | `75dafc809b6e2c883062f7c52d6e418bbabb83d404fde562d057bfab5acf7fec` |
| Anwendungs-BIN | 361.992 Byte |
| BIN SHA-256 | `cf1a310059338da51bc4acdcfc2cb4dd97ddbe6fb63491db6ea7d0de41b59bc9` |
| Flashreserve / Mindestgrenze | 10.724 / 8.192 Byte |
| Abstand Heap–Stack / Mindestgrenze | 1.720 / 1.536 Byte |

Die gerätefreie ARM-Ausführung bestätigt Code und Wirevertrag dieses Builds.
Sie ist kein Nachweis der tatsächlichen Funkgeschwindigkeit oder der
Installation auf einem bestimmten Gerät.

## Grenzen und nächster Schritt

Die Testgrenze modelliert SoftDevice-Aufrufe, Timer und den GATT-Zustand.
Es ist kein Funkgerät angeschlossen. Weder die tatsächliche Annahme von 2M
durch ein bestimmtes Handy noch ein neuer Übertragungsdurchsatz werden daraus
abgeleitet. ATT-MTU 250 und LE 2M bedeuten insbesondere keine Data Length
Extension. Ein neues CRC-/Offset-Streamingprotokoll wurde nicht eingebaut;
die vorhandenen SmallRead-/SmallCreate-/SHA256-Pfade bleiben unverändert.

Der vollständige LCD-ARM-Build mit Ressourcenprüfung und der passende
Web-Parser liegen vor. Der nächste konkrete Geräteschritt nach Installation
des abschließend verifizierten Pakets ist eine Linkdiagnose vor und nach
einer Dateiübertragung. Sie zeigt das tatsächliche Intervall und die
ausgehandelte PHY. Ein Geschwindigkeitsvergleich muss dieselbe Datenmenge
und denselben Prüfumfang verwenden und danach die Dateiintegrität bestätigen.
