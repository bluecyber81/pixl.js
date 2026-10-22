# Cumulative DE-series changes / Kumulative Änderungen der DE-Reihe

Scope: **DE1 through 2.21.0-DE3.16**, compared with the imported **cylin577/pixl.js v2.21.0**, commit `57a364329436745f780e70ac07a1642989a00d6f`. The original project is [solosky/pixl.js](https://github.com/solosky/pixl.js); the immediate base is [cylin577/pixl.js](https://github.com/cylin577/pixl.js).

This is a component-based summary of documented changes retained in DE3.16, not an exhaustive upstream **2.16.0 → 2.21.0** comparison, a claim about the latest upstream release, or proof that every possible defect has been eliminated. Milestones identify documented changes rather than inventing a separate feature for every intermediate version.

## English

### Interface, catalog and inherited applications

- **DE1/DE2:** German and English UI with German default/fallback; generated language/font resources and guarded use of metadata languages absent from this build. Names and IDs were added from a recorded upstream contribution, with corrected game/category grouping. These are catalog records, not supplied figure dumps.
- **DE3:** name or exact-ID search, game/category filters, 100-entry result pages and bounded streaming selection. Favorites gained checked names/paths/IDs, failure reporting and UTF-8-aware dialog byte limits. Later navigation fixes make favorites beyond the first page selectable and preserve the selected figure on return.
- **DE3.9:** metadata for Mario (Melody Car) and Toad from My Mario Wooden Blocks. The retained snapshot has **952 unique IDs and 1,344 game links**; this is not an automatically current or complete worldwide catalog.
- The base fork's four mini-games, animation player and existing tag applications remain included. They were not all newly implemented or universally hardware-qualified by the DE work.

### Bluetooth and file-transfer protocol

- **DE2–DE3.3:** validate request sizes, paths, metadata and unaligned integer fields; support the existing one-byte and four-byte OPEN flags; reject short writes and propagate I/O errors. File commands and disconnect cleanup move to a bounded foreground queue with copied events/session ownership, rather than running filesystem work from the Bluetooth interrupt. Sleep cleans up the old session. Device-name lengths, driver teardown and new-connection defaults are corrected.
- **DE3.8–DE3.10:** size file/directory responses to negotiated capacity and split oversized directory records. Capability negotiation opts into bounded request reassembly; legacy clients retain their previous write-stream behavior. Long version/drive/diagnostic replies also fragment. Sequence, overflow, incomplete request, timeout and reconnect handling protect session state. The existing transport buffer is reused rather than adding a second large static buffer.
- **DE3.11–DE3.13:** retain failed CLOSE state for an explicit retry; definitive abort frees owned resources without another write attempt. A failed abort isolates the abandoned handle. Reject REMOVE while a file transfer remains open/abandoned. Remote DFU is rejected with an active file; a rejected command's TX completion cannot accidentally enter DFU.
- **DE3.14:** only an accepted READ enables continuation after TX_READY. Wrong-handle or empty READ requests no longer send unsolicited file data or advance the offset; a valid write handle remains usable after rejection.
- **DE3.15:** explicit volatile diagnostic preference for MTU23 or MTU250 on the next connection, guarded by idle transfer state. Normal preference remains 250. Real MTU23 transfers were tested on DE3.15; that is not a new DE3.16 radio test.

### SPI, external flash, SPIFFS and paths

- **DE3.1–DE3.3:** serialize complete LCD/flash SPI chip-select transactions, release ownership on transfer failure and keep flash busy waits outside those critical regions. Flash operations have bounded busy waits, write-enable checking and address/error validation. Unsupported storage geometries, including more than 16 MiB for this format, are rejected rather than silently misaddressed.
- **DE2 onward:** a mount failure never silently formats external storage; drive listing does not mount it. Paths use explicit length checks and segment boundaries. Record/name decoding is bounded. Packed SPIFFS index fields use alignment-safe access; sentinel and checker error handling was corrected using synthetic images, without automatic filesystem repair.
- **DE3.6:** failed reads/writes invalidate affected read-cache entries without writeback, preventing those error paths from later presenting incomplete cached bytes as valid. Erase/GC failures propagate; unsuccessful erases are not recorded as successful. This is not a general GC rollback transaction.
- **DE3.7:** recognize only exact folder-marker names, check metadata-path boundaries and retain read errors encountered at the end of a lookup instead of turning them into ordinary absence.
- **DE3.11:** failed write-cache flushes retain data and return the failure; explicit close retry and abandonment have separate semantics. Directory rename checks predictable collisions, descendant destinations and path overflow before beginning. A late I/O failure can still interrupt a multi-file rename.
- **DE3.16:** free-object-ID allocation stops on a failed header read. The previous code could treat an occupied ID as available; the regression checks error propagation, no new write/erase, retained flash bytes and healthy retry.

### Settings, persistence and main-menu return

- **DE2:** migrate the older settings layout, normalize stored booleans and validate sort/slot bounds; do not overwrite unknown settings after read failures.
- **DE3:** bounded CRC32 journals for selected settings, active-tag and database-slot records, with readback before changing the target and coordinated recovery before filesystem mutations. Slot data and metadata are committed together. The protected payload limit is 2,048 bytes; arbitrary BLE streams and larger Chameleon files are not covered. A corrupt marker blocks automatic recovery rather than guessing.
- **DE3.11/DE3.12:** save settings before menu-initiated DFU; show a save failure instead of immediately rebooting. Successful factory reset applies the default display orientation immediately.
- **DE3.13:** show a waiting message before synchronous settings save; after a successful main-menu save, skip the redundant second save check during app destruction. Other exit paths retain their save attempt, and failure permits retry. This does not remove the first journal transaction or promise a measured save duration.
- After an initial settings-load failure, remounting alone still does not clear the save guard. Automatically saving defaults could overwrite settings that were never successfully loaded; a general reload/merge workflow is not implemented.

### Sleep, controls, battery and display

- **DE2–DE3.3:** retain and clear the correct cache RAM region; clean up application resources on sleep even when app restoration is disabled. Independent per-button long/repeat timers and orderly input shutdown avoid callbacks into freed UI state.
- **DE3.5:** restore the center-button GPIO input and pull-up before arming wake sensing. This repairs the software sequence that left the tested LCD device unable to wake normally after shutdown. Earlier device tests confirmed center-button wake; DE3.16 wake has not been rerun.
- **DE3.6:** LCD text advances one pixel every 500 ms with three-second endpoint pauses. Focus/size changes reset or recalculate scrolling; unchanged offsets do not require a redraw. This improves readability without claiming to eliminate LCD ghosting or changing the global animation/SPI clock.
- **DE3.9–DE3.12:** clear game key/repeat state at transitions, retain a held center key correctly and bound repeat/key indices. Player stop acts once on a completed short or long press, avoiding a second scene change from the same gesture. Animation iteration no longer skips the next element after removing a completed one.
- Battery UI gained voltage display, smoothing/hysteresis and bounded charging-state confirmation. ADC failures/timeouts do not reuse invalid measurements. These changes do not recalibrate the battery or provide a measured capacity/runtime estimate.
- Brightness/contrast controls remain within their valid ranges; invalid progress-bar ranges cannot divide by zero. Version diagnostics show build target, chip and validated SoftDevice information without inventing an installed bootloader version.

### UI memory, drawing and Player files

- **DE3.10:** checked construction and reverse-order cleanup in affected apps/components, bounded view registrations, fixed viewport slots, shortened return paths and an allocation-free memory-error screen. Freed dialogs, initialized callbacks and checked timer creation close specific lifecycle defects.
- **DE3.11:** checked file-list/detail growth, cleanup of partial lists, a fixed temporary-string leak and an explicit limit for the existing eight-bit detail index. QR scratch buffers are bounded to version 4, sufficient for current links, instead of version-40 buffers that exhausted the stack. Oversized input is rejected.
- **DE3.12:** correct canvas offsets/heights and nested restoration, return glyph widths, avoid NULL-pointer arithmetic at the end of multiline text, and step safely over truncated/invalid UTF-8 without reading beyond the terminator. Accepted scrolling timing is preserved.
- **DE2/DE3.16 Player:** validate PIXV header, dimensions, stride, rate, file size and full frame reads; release failed setup resources. DE3.16 also checks selected-path allocation, preserves the prior path on failure, discards incomplete directory results and distinguishes EOF from read/close errors.
- These are specific checked paths, not a guarantee that every allocation in every application is recoverable.

### NFC and Chameleon state

- **DE2–DE3.3:** bound receive bit/byte lengths and command/page access, copy actual transmit lengths, respect read-only mode for FAST_WRITE, and preserve supported tag sizes/signature tails. Reject generating V3 data from an ID alone; complete supported input files still use their existing path.
- Deliver pending tag writes to the correct owner before app/tag changes or sleep. Keep a stable snapshot during save; reject new writes during that callback rather than acknowledging data that could be lost. Apply standard NTAG215 READ rollover and cleanly release NFC timer/clock/events when changing drivers.
- **DE3.11:** standard NTAG215 FAST_READ masks PWD/PACK pages as READ does; backing data and separate N2/V3 paths remain unchanged.
- Chameleon gained bounded identity/nickname parsing and complete-read/write checks. **DE3.8** preserves the selected slot when changing write mode and correctly displays pending Shadow mode.
- **DE3.12/DE3.13:** validate supported configuration layouts and active indices, retain dirty CRC/state on failed saves, guard short/missing payloads and initialize RF only after successful load. Empty cards open type selection. Slot shrinking/changes preserve old RAM state if saving fails; reset-related slot-count changes no longer save an unreachable active index. Invalid old configurations are not silently repaired or overwritten.

### Browser companion and build tools

- The separate file manager was migrated to **Vue 3/Vite**. The retained release is **3.12.0**, with a declared Node.js minimum of **22.12.0** and pinned package versions.
- It supports negotiated transport, sequential writes and session-safe disconnect/reconnect handling; an early response cannot hide a late write failure. Metadata editing preserves unknown/system flags, enforces the UTF-8 note budget and rejects malformed records. Keyboard handling, storage display and German text were improved. The separate DFU page can be opened without a file-transfer connection.
- **DE3.12:** the drive prefix no longer incorrectly consumes the stored-path byte budget; malformed UTF-8 filenames are rejected while valid BOM characters remain part of the name. Invalid listings are discarded without preventing a later healthy request.
- Catalog generation defaults to local/offline data; an explicit refresh validates the response before replacing source data. Build/test provenance records source, generated files, test inputs, package metadata and hashes. An obsolete mass-erase helper is disabled; metadata-maintenance input checks avoid destructive empty-input updates.
- The application OTA never updates the public upstream website, an external DFU website, the PC Bluetooth driver, bootloader or SoftDevice. Public build instructions are in [docs/BUILD_DE3_16.md](docs/BUILD_DE3_16.md).

### Diagnostics and current evidence

Read-only UI/event and bounded storage diagnostics were added for investigation. The Tybalt extension captures the observed header before filtering, compares cache and direct HAL reads, and accepts only fixed diagnostic targets with generation/idle checks. Selection changes diagnostic RAM, not stored files. No general header filter or automatic repair is enabled.

DE3.16 passed **70 host suites** and the two new suites' **175 native + 175 sanitizer cases**; those are repeated runs of the same 175 focused cases, not 350 distinct cases. Source review and signed application-package validation complement them. One matching device completed DFU and returned the DE3.16 version with observed ATT MTU250. DE3.16 NFC, wake and real MTU23 were not retested. The unchanged companion reuses its original 84-test evidence.

The intermittent extra malformed **Tybalt** listing remains unresolved. Historical Sprocket observations are likewise not a general proof of repair across devices. No figure dumps or `key_retail.bin` are distributed. There is no whole-device, all-controllers, all-games, endurance or arbitrary-power-loss guarantee.

## Deutsch

### Oberfläche, Katalog und übernommene Anwendungen

- **DE1/DE2:** Deutsch/Englisch mit deutschem Standard und Fallback; erzeugte Sprach-/Schriftressourcen und abgesicherte Metadaten-Sprachauswahl. Dokumentierte zusätzliche Namen/IDs und korrigierte Spiel-/Kataloggruppen sind Metadaten, keine Figurendumps.
- **DE3:** Suche nach Name oder exakter ID, Spiel-/Kategoriefilter, 100er-Ergebnisseiten und begrenzte Auswahl ohne Zeigerliste für den gesamten Katalog. Favoriten prüfen Namen, Pfade, IDs und Schreibfehler; Dialoge begrenzen UTF-8-Eingaben. Spätere Navigation macht auch Favoriten hinter der ersten Seite erreichbar und behält die Auswahl beim Zurückgehen.
- **DE3.9:** Mario (Melody Car) und Toad aus My Mario Wooden Blocks als Metadaten. Der übernommene Stand umfasst **952 eindeutige IDs und 1.344 Spielverknüpfungen**; keine Zusage eines stets vollständigen oder aktuellen Weltkatalogs.
- Vier Minispiele, Animationsplayer und bestehende Tag-Anwendungen stammen aus der Basis. Nicht jede Funktion wurde durch die DE-Reihe neu geschaffen oder auf jeder Hardware geprüft.

### Bluetooth und Dateiübertragung

- **DE2–DE3.3:** Grenzen für Befehle, Pfade, Metadaten und unaligned Zahlen; ein- und vierbyteige OPEN-Flags; Fehlerweitergabe und Ablehnung kurzer Schreibvorgänge. Dateibefehle und Disconnect-Aufräumen laufen über begrenzte kopierte Ereignisse im Hauptprogramm statt im Funkinterrupt. Sitzungsprüfung, Aufräumen vor Schlafen, Gerätenamenlängen und Treiberübergänge wurden korrigiert.
- **DE3.8–DE3.10:** Antworten passen zur ausgehandelten Kapazität; auch große Verzeichniseinträge und einmalige Versions-/Laufwerks-/Diagnoseantworten werden geteilt. Neue Clients aktivieren begrenzte Anfragezusammensetzung ausdrücklich. Ältere Clients behalten ihre bisherigen Schreibstreams. Reihenfolge, Überlauf, unvollständige Daten, Timeout und Neuverbindung werden geprüft; ein bestehender Puffer wird wiederverwendet.
- **DE3.11–DE3.13:** Fehlgeschlagenes CLOSE bleibt gezielt wiederholbar. Endgültiges Aufgeben räumt eigene Ressourcen ohne weiteren Schreibversuch auf; ein fehlgeschlagener Abbruch isoliert den alten Handle. REMOVE und Remote-DFU werden bei noch offener/aufgegebener Datei abgewiesen. Die Sendebestätigung einer DFU-Fehlerantwort darf keinen Neustart auslösen.
- **DE3.14:** Nur ein tatsächlich angenommener READ erlaubt weitere Daten nach TX_READY. Falscher Handle oder leerer READ lösen keine unerwarteten Daten aus und verändern die Position nicht; ein gültiger Schreibhandle bleibt nutzbar.
- **DE3.15:** ausdrücklich aktivierter, flüchtiger MTU23-/MTU250-Diagnosemodus für die nächste Verbindung, nur ohne laufenden Transfer. Standard bleibt 250. Echte MTU23-Tests bestanden unter DE3.15; dies sind keine neuen DE3.16-Funktests.

### SPI, Flash, SPIFFS und Pfade

- **DE3.1–DE3.3:** vollständige LCD-/Flash-SPI-Transaktionen werden geschützt und bei Fehlern freigegeben; Busy-Warten liegt außerhalb dieser Abschnitte. Endliche Wartefristen, Schreibfreigabeprüfung und Adress-/Fehlerprüfung verhindern falsche Erfolgsrückgaben. Für das vorhandene Format ungeeignete Geometrien einschließlich mehr als 16 MiB werden abgewiesen.
- **Ab DE2:** Mountfehler formatieren nicht automatisch; Laufwerksauflistung hängt den Speicher nicht nebenbei ein. Begrenzte Pfade, Segmentgrenzen, Namen und Datensätze verhindern stille Abschneidung. Gepackte SPIFFS-Indexfelder werden ausrichtungssicher gelesen. Sentinel-/Checker-Korrekturen wurden synthetisch geprüft, ohne automatische Reparatur.
- **DE3.6:** Fehlerhafte Lese-Cacheinhalte werden ohne Writeback verworfen; unvollständige Bytes dürfen über diese Fehlerpfade nicht später als gültige Daten erscheinen. Erase-/GC-Fehler werden weitergegeben und nicht als erfolgreicher Löschvorgang verbucht. Kein vollständiges GC-Rollback.
- **DE3.7:** exakte Ordner-Marker-Erkennung, Metadaten-Pfadgrenzen und Erhalt von Lesefehlern am Suchende statt fälschlichem „nicht vorhanden“.
- **DE3.11:** fehlgeschlagener Schreibcache-Flush behält Daten und Fehler; Wiederholung und endgültiger Abbruch sind getrennt. Ordnerumbenennung prüft vorher Zielkollisionen, Unterziele und Pfadlängen. Späte I/O-Fehler können eine mehrteilige Umbenennung weiterhin unterbrechen.
- **DE3.16:** Fehler beim Headerlesen stoppen die Suche nach freier Objekt-ID. Der alte Pfad konnte belegte IDs erneut vergeben; Tests sichern Fehlerweitergabe, ausbleibende neue Schreib-/Löschzugriffe, unveränderte Flashbytes und regulären Wiederholungsversuch ab.

### Einstellungen, Persistenz und Hauptmenü

- **DE2:** Migration des älteren Einstellungsformats, normalisierte Boolwerte und Slot-/Sortiergrenzen; unbekannte Einstellungen werden nach Lesefehlern nicht überschrieben.
- **DE3:** begrenzte CRC32-Journale mit Rücklesen vor Zieländerung für ausgewählte Einstellungen, aktive Tags und Datenbankslots. Slotdaten und Metadaten werden zusammen behandelt; Wiederherstellung und externe Schreibzugriffe werden koordiniert. Schutzgrenze 2.048 Byte; beliebige BLE-Streams und größere Chameleon-Dateien sind nicht abgedeckt. Ein defekter Marker sperrt automatische Wiederherstellung.
- **DE3.11/DE3.12:** Speichern vor Menü-DFU, sichtbarer Fehler statt sofortigem Neustart; erfolgreicher Werksreset übernimmt die Standard-Displaydrehung sofort.
- **DE3.13:** sofortige Wartemeldung vor synchronem Speichern. Nach erfolgreichem Hauptmenü-Save entfällt die doppelte Prüfung beim Freigeben der App. Andere Ausstiege speichern weiterhin; Fehler bleiben wiederholbar. Die erste Journaltransaktion bleibt bestehen, eine feste Beschleunigung wird nicht versprochen.
- Die Speichersperre nach anfänglichem Ladefehler wird durch Remount allein weiterhin nicht aufgehoben. Ein allgemeiner Ablauf zum sicheren erneuten Laden/Zusammenführen unbekannter Einstellungen fehlt.

### Schlafen, Tasten, Akku und Display

- **DE2–DE3.3:** richtige RAM-Bereiche für Retaincache, vollständiges Aufräumen beim Schlafen auch ohne Appwiederherstellung, getrennte Long-/Repeat-Timer und geordneter Eingabestopp vor UI-Freigabe.
- **DE3.5:** Mitteltasten-GPIO und Pull-up werden vor der Aufwach-SENSE-Funktion wiederhergestellt. Frühere Geräteprüfungen bestätigten damit normales Aufwachen des geprüften LCD-Designs; kein erneuter DE3.16-Aufwachtest.
- **DE3.6:** Lauftext ein Pixel je 500 ms mit drei Sekunden Pause an den Enden; Fokus-/Breitenwechsel setzen ihn zurück bzw. berechnen ihn neu. Geänderte Lesbarkeit ohne behauptete Beseitigung des LCD-Nachziehens und ohne Änderung des allgemeinen Animations-/SPI-Takts.
- **DE3.9–DE3.12:** Spieltasten-/Repeat-Zustände werden beim Wechsel bereinigt; gehaltene Mitteltaste, Zähler und Indizes sind abgesichert. Player-Stop verarbeitet einen abgeschlossenen kurzen/langen Druck einmal. Der Animationsiterator überspringt nach dem Entfernen keinen folgenden Eintrag mehr.
- Akkuanzeige mit Spannung, Glättung/Hysterese und bestätigtem Ladezustand; ADC-Fehler/Timeout übernehmen keine ungültigen Messwerte. Keine neue Kapazitätskalibrierung oder gemessene Laufzeitprognose.
- Helligkeit/Kontrast bleiben innerhalb gültiger Grenzen; fehlerhafte Balkenbereiche teilen nicht durch null. Versionsdiagnose zeigt Buildziel, Chip und geprüftes SoftDevice, ohne eine Bootloaderversion zu erfinden.

### UI-Speicher, Darstellung und Player

- **DE3.10:** geprüfte Konstruktion und Aufräumen teilweise aufgebauter Apps, begrenzte Viewverwaltung, feste Viewports, gekürzte Rückwege und speicherlose Fehlermeldung. Dialogfreigabe, initialisierte Rückrufe und Timerprüfungen beheben konkrete Lifecycle-Lücken.
- **DE3.11:** geprüftes Listen-/Detailwachstum, Freigabe von Teillisten, behobener temporärer Stringverlust und Grenze des vorhandenen Achtbit-Detailindex. QR-Puffer für maximal Version 4 statt Version 40 sparen Stack; bestehende Links bleiben darstellbar, zu große Eingaben werden abgewiesen.
- **DE3.12:** richtige Canvas-Offsets/Höhen/Wiederherstellung, Glyphenbreite als Rückgabe, kein NULL-Zeigerrechnen am Mehrzeilenende und sichere Behandlung abgeschnittener/ungültiger UTF-8-Sequenzen. Akzeptiertes Lauftexttempo unverändert.
- **DE2/DE3.16:** PIXV-Header, Maße, Stride, Bildrate, Dateigröße und vollständige Frames werden geprüft; fehlgeschlagener Playerstart räumt auf. DE3.16 ergänzt Speicherprüfung des gewählten Pfades sowie klare Behandlung von Listen-Speichermangel, EOF und Verzeichnis-Lese-/Schließfehlern.
- Dies betrifft konkrete Pfade; keine Zusage einer wiederherstellbaren Speichererschöpfung in jeder Anwendung.

### NFC und Chameleon

- **DE2–DE3.3:** geprüfte Empfangslängen/Befehle/Seiten, tatsächliche Sendelängen, Schreibschutz bei FAST_WRITE und Erhalt unterstützter Dateigrößen/Signaturenden. V3-Erzeugung allein aus einer ID wird abgewiesen; vollständige unterstützte Dateien behalten ihren Pfad.
- Ausstehende Tag-Schreibdaten werden vor App-/Tagwechsel oder Schlafen dem richtigen Besitzer zugestellt. Ein Snapshot schützt den Speicher-Callback; neue Writes währenddessen werden abgewiesen. Standard-NTAG215-READ-Rollover sowie NFC-Timer-/Takt-/Ereignisabbau wurden korrigiert.
- **DE3.11:** Standard-NTAG215-FAST_READ maskiert PWD/PACK wie READ; gespeicherte Rohdaten und N2/V3 bleiben unverändert.
- Chameleon erhielt begrenzte Identitäts-/Namensparser und vollständige I/O-Prüfungen. **DE3.8:** Schreibmoduswechsel behält den aktiven Slot, ausstehender Shadow-Modus wird richtig dargestellt.
- **DE3.12/DE3.13:** unterstützte Konfigurationsgrößen/Indizes prüfen; CRC und schmutzigen Zustand bei Savefehler behalten; kurze/fehlende Daten und fehlgeschlagene Initialisierung stoppen ungültige RF-/Darstellungspfade. Leere Slots öffnen die Typauswahl. Slotwechsel/Verkleinerung bewahren alten RAM-Inhalt bei Speicherfehler; Slotzahländerung nach Reset speichert keinen unerreichbaren aktiven Index. Bereits defekte Daten werden nicht still repariert oder überschrieben.

### Dateimanager und Werkzeuge

- Separater Browser-Dateimanager mit **Vue 3/Vite**, übernommener Stand **3.12.0**, Node.js **ab 22.12.0**, festgelegte Paketversionen.
- Ausgehandelter Transport, sequenzielle Writes und sitzungsgebundene Rückrufe; frühe Antworten verdecken keine späteren Schreibfehler. Metadaten erhalten unbekannte/Systemflags, begrenzen UTF-8-Notizen und weisen defekte Datensätze ab. Tastaturbedienung, Speicheranzeige und deutsche Texte wurden verbessert. Die separate DFU-Seite ist ohne Dateiverbindung erreichbar.
- **DE3.12:** Laufwerkspräfix verbraucht nicht fälschlich das gespeicherte Pfadbudget; ungültige UTF-8-Namen werden abgewiesen, gültige BOM-Zeichen bleiben Namensbestandteil. Fehlerlisten werden verworfen, spätere gesunde Abrufe bleiben möglich.
- Katalogbuild standardmäßig offline; expliziter Refresh validiert vor Datenersatz. Quellen, Generatoren, Tests, Paketmetadaten und Hashes sind an den Build gebunden. Alter Mass-Erase-Helfer deaktiviert; Metadatenwerkzeuge prüfen Eingaben vor Änderungen.
- Das OTA aktualisiert weder öffentliche Upstream-Webseiten noch externe DFU-Seiten, PC-Treiber, Bootloader oder SoftDevice. Die öffentliche Anleitung steht in [docs/BUILD_DE3_16.md](docs/BUILD_DE3_16.md).

### Diagnose und Beleggrenzen

Lesende UI-/Ereignis- und begrenzte Speicherdiagnosen helfen bei der Fehlersuche. Tybalt-Diagnose erfasst Header vor Bewertung, vergleicht Cache/direkte HAL-Lesungen und akzeptiert nur feste Ziele mit Generation-/Idle-Prüfung. Die Auswahl verändert Diagnose-RAM, keine Dateien. Keine allgemeine Headerfilterung oder automatische Reparatur.

DE3.16: **70 Host-Suiten**, dazu dokumentierte **175 native + 175 Sanitizer-Fälle** der beiden neuen Suiten. Es sind dieselben 175 gezielten Fälle in zwei Ausführungen, keine 350 verschiedenen Fälle. Unabhängige Quellprüfung und signierte Paketvalidierung ergänzen die Tests. Ein passendes Gerät bestätigte DFU, normales Menü und DE3.16-Version bei ATT MTU250. NFC, Aufwachen und echte MTU23 wurden unter DE3.16 nicht neu geprüft. Die unveränderten 84 Webtests sind ursprüngliche Belege.

Der zusätzliche verstümmelte **Tybalt**-Eintrag bleibt ungeklärt. Auch historische Sprocket-Beobachtungen sind kein allgemeiner Reparaturnachweis für alle Geräte. Keine Figurendumps oder `key_retail.bin` werden verteilt. Keine Zusage für sämtliche Hardware, Controller, Spiele, Dauerbetrieb oder beliebige Stromausfälle.

## License / Lizenz

The original GNU GPL version 2 license and contributor credits are retained; see [LICENSE](LICENSE). Third-party notices remain with their components. Die ursprüngliche GPL-2-Lizenz und Urheberangaben bleiben erhalten; Drittkomponenten behalten ihre eigenen Hinweise.
