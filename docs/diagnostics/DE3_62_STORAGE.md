# DE3.62: Speicherprofil und nächste Messschritte

DE3.62 ergänzt die Messbarkeit des Packed-LittleFS-Starts. Für die untersuchten
Cachevarianten ist **kein zusätzlicher Geschwindigkeitsgewinn nachgewiesen**.
PFS1, Dateiinhalte, Raw128-Metadaten und die bisherigen Prüfungen bleiben erhalten.

## Neue optionale Startdiagnose

`INFO_STARTUP` (`0x09`) akzeptiert zusätzlich den ein Byte langen Selector `02`:
Antwort `PXST`, Schema **3**, Länge **80 Byte**. Die leere Anfrage bleibt Schema 1
mit 32 Byte; Selector `01` bleibt Schema 2 mit 40 Byte. Der Dateimanager kann bei
älteren Geräten auf diese bisherigen Antworten zurückfallen.

Die ersten 40 Byte entsprechen Schema 2, mit aktualisierter Schema-/Längenangabe.
Alle folgenden Zahlen werden Little Endian übertragen:

| Offset | Typ | Bedeutung |
| --- | --- | --- |
| 40 | u32 | Profilflags |
| 44 | i32 | Ergebnis des Mounts als VFS-Status |
| 48 | u32 | Konfiguration/Initialisierung in Millisekunden |
| 52 | u32 | `pfs_mount()`-Scan in Millisekunden |
| 56 | u32 | Physische Leseversuche des Adapters |
| 60 | u32 | Erfolgreich gelesene Bytes |
| 64 | u32 | Cachetreffer |
| 68 | u32 | Verfehlungen bei cachefähigen Zugriffen, auch ohne zugewiesenen Cache |
| 72 | u32 | Nicht cachefähige Lesezugriffe |
| 76 | u32 | Fehlgeschlagene physische Leseversuche |

Flags: Bit 0 = Profil vorhanden, Bit 1 = erfolgreicher Mount (`result == 0`),
Bit 2 = temporärer Cache zugewiesen, Bit 3 = mindestens ein Zähler gesättigt,
Bit 4 = Zeitmessung gültig. Andere Bits sind reserviert. Ohne Bit 0 sind die
zusätzlichen 40 Byte null und das Profil unbekannt. Ohne Bit 4 sind die Dauern
unbekannt; sie dürfen nicht als gemessene Nullzeit dargestellt werden. Bei
Sättigung sind Zähler nur noch Untergrenzen.

Das Profil beschreibt den **letzten abgeschlossenen tatsächlichen Mount**.
Ein bereits eingebundenes Dateisystem und spätere Dateizugriffe überschreiben es
nicht. Ein laufender Mount wird nicht als vollständiges Profil veröffentlicht.
Die Konfiguration umfasst HAL-Initialisierung, Geometrieprüfung und PFS-Zuweisung;
der Scan umfasst die Prüfung durch `pfs_mount()`. Cachezuweisung/-freigabe und die
anschließende Persistence-Bindung liegen außerhalb dieser beiden Teilzeiten.

Die Lesezähler zählen HAL-Aufrufe des Adapters, nicht sämtliche internen
SPI-Transaktionen. Die RTC-Messung erkennt keinen vollständig verpassten
Zählerumlauf. Bootloader, früher SDK-Start und sichtbare Displayreaktion sind
weiterhin nicht Teil der gemessenen App-Startzeit.

## Cacheentscheidung und reproduzierbarer Vergleich

Verglichen wurden App633 (`e40ff73`) und DE3.62 mit demselben synthetischen
2-MiB-Image: **1.131 Dateien, 77 Ordner, 687.077 Nutzdatenbytes**.
Image-SHA-256:
`82ce8cda2ea4e005dd56b9c59b602bec4e663264526a78be52b492b2576c89ec`.

Beide Stände benötigten **4.531 physische Reads à 256 Byte** (1.159.936 Byte) für
den Mount. Der Spitzenwert der angeforderten Allokationen auf dem 64-Bit-Host
betrug in beiden Fällen **4.576 Byte**. Alle Nutzdaten und alle 128 Metadatenbytes
jedes Eintrags wurden verglichen. Das Image blieb bytegleich; es gab keine
Programmier-, Lösch- oder Syncoperation.

Der logische Lesetrace enthielt 5.181 Zugriffe; der bisherige Cache vermied davon
650. Gleich große Alternativen mit vier Seiten lieferten im Trace folgende Werte:

| Cachepolitik | Physische Reads |
| --- | ---: |
| Bestehender selektiver LRU | 4.531 |
| Alle Seiten im LRU | 4.930 |
| Nur LittleFS-Metadaten | 4.875 |
| Nur Blockanfänge | 4.712 |
| Feste Aufteilung zwischen Metadaten und Blockanfängen | 4.937–5.016 |
| FIFO | 4.618 |
| LFU-Varianten | 4.874–4.892 |
| Segmentierter LRU | 4.776–5.177 |

Deshalb bleibt der bestehende Cache erhalten: **1.032 Byte nur während des
Mounts**, danach freigegeben. Die neue Diagnose benötigt zusätzlich **40 Byte
statisches RAM**. Heap- und Stackreservierungen werden dafür nicht verkleinert.
Die Alternativen sind Trace-Auswertungen, keine Geräte-Zeitmessungen; insbesondere
ist Analyse-Buchhaltung wie LFU kein behauptetes gleich großes Firmwaredesign.
Der Host-Allokationswert ist keine Messung des gesamten Geräte-RAMs.

## Prüfbelege und Grenzen

Die gezielten Prüfungen umfassen 33 echte C-Diagnose-/Transportfälle bei MTU 23,
185 und 250, alte und neue Antwortformate, ungültige Anfragen, fehlende/laufende
Profile und Sättigung. Zusätzlich prüft der echte VFS-Adapter mit der echten
Diagnose seine Zähler gegen unabhängige NOR-Zähler: Cache-/Index-OOM,
Lese-/Konfigurationsfehler, Wiederholung und warme Mounts.

Die bestehende VFS-Suite durchlief 26 Programmier-/Löschfehlerpunkte und 425
Lesefehlerpunkte. Der Streamingparser wurde mit 8.448 Offset-/Größen-/Pfadfällen
und negativen Kontrollen geprüft. Diese Tests ersetzen keine Prüfung von NFC,
Bluetooth, Tasten, SPI-Timing oder Stromunterbrechungen am Gerät. Die tatsächliche
Startzeit dieser Version muss am Allmiibo gemessen werden.

Relevante Quellen und Tests:

- [Diagnoseserialisierung](../../fw/application/src/mod/runtime_diag.c)
- [PackedFS-Adapter](../../fw/application/src/mod/vfs/vfs_driver_packed.c)
- [Adapter-/Profiltest](../../fw/tests/de3/test_mount_profile_de362.py)
- [Diagnose-/Transporttest](../../fw/tests/de3/test_runtime_diag.py)
- [VFS-Fehlerprüfungen](../../fw/tests/de3/test_packed_vfs_persistence_de344.py)
- [Streamingparser](../../fw/tests/de3/test_packed_mount_stream_de341.py)

Die lokalen vollständigen Messbelege liegen im Arbeitsbericht unter
`outputs/allmiibo_de362_20261106/firmware/`, darunter
`collection-comparison/verified-collection.json`, `cache-policy-profile.json`,
`cache-policy-replay.json` und `startup3-wire-fixture.json`.

## Boot-ID und Probenalter: Entwurf, noch nicht implementiert

Eine Browser-Empfangszeit ist kein Alter einer ADC-, RAM- oder Startprobe.
Wiederverbinden beweist auch keinen Geräteneustart. Ein belastbarer Ausbau sollte:

1. Eine separate optionale, versionierte Abfrage verwenden und bestehende
   PXDG-/PXST-/PXPD-Antworten unverändert lassen.
2. Pro Start eine zufällige Nonce von mindestens 64 Bit erzeugen, sobald die
   vorhandene Zufallsquelle bereit ist. Keine Flash-Schreibvorgänge und kein
   dauerhafter Bootzähler. Fehlende Entropie ergibt „unbekannt“; die Nonce ist
   Kontext und kein Authentisierungsmerkmal.
3. Eine monotone Uptime über RTC-Umläufe führen. Vorher müssen periodische
   Nachführung, Kurzschlaf und Aufwachen geprüft werden; der 24-Bit-RTC-Wert
   allein reicht nicht zur Erkennung mehrerer verpasster Umläufe.
4. Zeitmarken getrennt für ADC, RAM-Probe, Start, Mountabschluss und letzte
   Einstellungssitzung speichern. Fehlende Proben bleiben `null`.
5. Im Web nur passende, gültige Boot-Nonces als gemeinsame Sitzung behandeln.
   Historische JSONs ohne diese Felder bleiben lesbar und klar datiert.

Notwendige Tests vor Einführung: mehrere RTC-Umläufe, fehlende RNG-Bereitschaft,
Schlaf/Aufwachen, Reset/Watchdog/DFU, fehlgeschlagene ADC-Proben und ein
Sitzungswechsel während eines mehrteiligen Reports. Der Start darf weder von der
Diagnose noch von der Bereitstellung einer Boot-Nonce abhängen.
