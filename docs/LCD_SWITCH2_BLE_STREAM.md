# Switch 2 wecken und BLE-Bildempfang für die LCD-Linie

Diese beiden Miniapps ergänzen die normale LCD-Firmware mit ST7567-Anzeige und S112. Der vorhandene Dateimanager, das PFS-Dateisystem, die NFC-Funktionen, die Fernbedienung und die bisherigen Verbindungseinstellungen bleiben die Grundlage. Versionsnummer, signiertes Paket und endgültiger Freigabestand stehen in der zugehörigen Releasebeschreibung.

Die Funktionen wurden aus [solosky/pixl.js PR479](https://github.com/solosky/pixl.js/pull/479), Head `b0ade162278d4fb4cced6d8b12aaaecb71d75539`, selektiv übernommen und an die lokale Foreground-/Speicherarchitektur angepasst. Die im PR genannte OLED-Erprobung ist kein Gerätetest dieser LCD-Firmware. Die aktuelle lokale Prüfung umfasst die tatsächlichen Parser, Zustandswechsel, Fehlerpfade und den ARM-Build; ein Switch-2-/LCD-Funktest muss zusätzlich am Gerät erfolgen.

## Switch 2 wecken

1. Im Hauptmenü **Switch 2 wecken** öffnen. Die Miniapp besitzt die Funkfunktion exklusiv; eine laufende Dateiverbindung wird über den bestehenden geordneten BLE-Abschluss beendet.
2. **Controller suchen** wählen und am eigenen, bereits mit der eigenen Switch 2 gekoppelten Controller die Home-Taste betätigen. Die Suche läuft höchstens 15 Sekunden tatsächliche Timerzeit. Sie prüft Nintendo-Werbedaten und übernimmt nur ein vollständig passendes Paket einschließlich Controlleradresse, Konsolenadresse und Produkttyp.
3. Bei erfolgreicher Erfassung speichert die App die Konfiguration über den vorhandenen atomaren VFS-Persistenzpfad in `/switch2_wake.txt`. Alternativ lassen sich Controller-/Switch-2-MAC und Typ im Menü bearbeiten. Die Dateiverbindung kann die Textdatei ebenfalls verwalten; die Miniapp formatiert oder mountet kein Dateisystem als Nebenwirkung.
4. **Switch 2 wecken** sendet bis zu drei Sekunden das konfigurierte Werbepaket. Die Meldung „Weckpaket gesendet“ bestätigt den lokalen Sendeablauf. Ob die Konsole dadurch tatsächlich aufwacht, ist am eigenen Gerät zu prüfen.

Die Einstellung **Beim Tastenstart** ist anfangs aus. Wenn sie eingeschaltet und gespeichert ist, startet ein bis zu zwei Sekunden langer Weckversuch ausschließlich nach einem System-off-Tastenstart und nur, wenn keine andere Hauptapp wiederhergestellt wurde. Ein Kaltstart, Reset oder stilles NFC-/LPCOMP-Aufwachen löst ihn nicht aus.

Suche und Senden dürfen nicht gleichzeitig laufen. Ein Druck auf die jeweils andere Aktion beendet zuerst die laufende Aktion und zeigt „Suche aus; erneut“ bzw. „Senden aus; erneut“. Ein zweiter Druck nach Abschluss startet die gewünschte Aktion. Solange S112 den Abschluss noch bestätigt, erscheint „Funk wird beendet“. Das Menü bleibt damit mit dem tatsächlichen Funkbesitzer synchron.

**Bei einem Speicherfehler** bleibt die Änderung im RAM erhalten. Beim Verlassen der App oder vor dem Einschlafen versucht das Gerät erneut zu speichern. Schlägt auch dies fehl, bleibt die App geöffnet. „Aenderung verwerfen“ stellt die im RAM gehaltene Kopie der zuletzt geladenen oder erfolgreich gespeicherten Einstellungen wieder her. Erst ein erfolgreicher App-Abschluss stoppt die laufende Funkaktion. Die gespeicherte Textdatei enthält Geräteadressen und gehört zum persönlichen Gerätebestand.

Seit DE3.104/App677 entfernt **Kopplung vergessen** das lokale Weckprofil. Dies gilt auch für die reguläre LCD-Version DE4.2/App680. „Abbrechen“ erhält die Einstellungen. Nach dem bestätigten Löschen ist der Tastenstart zum Wecken deaktiviert.

## BLE-Bildempfang

Am Gerät **BLE-Bildempfang** öffnen. Es empfängt monochrome Bilder mit 128 × 64 Pixeln. Links blendet Bildrate/Signal/Paketgröße ein bzw. aus, rechts invertiert die Darstellung, Mitte beendet die App. Die Invertierung verändert die Referenz für folgende Delta-Bilder nicht.

Der mitgelieferte PC-Sender liegt in `fw/scripts/stream_video_to_pixl.py`. Er benötigt Python 3.10 oder neuer und das Python-Paket `bleak`. Für die eingebaute Animation ist kein Videowerkzeug notwendig. Für eigene Videodateien muss `ffmpeg` im Suchpfad verfügbar sein.

```sh
python -m pip install bleak
python fw/scripts/stream_video_to_pixl.py --fps 5
python fw/scripts/stream_video_to_pixl.py eigenes_video.mp4 --fps 5 --scale fit
```

In der Grundeinstellung erscheinen dunkle Videopixel auf dem LCD dunkel, genau wie in der Vorschau des Dateimanagers. Mit `--invert` werden Schwarz und Weiß vertauscht.

Für die Wiedergabe ohne Bluetooth erstellt `python fw/scripts/video_clip_gen.py 10 frames clip.bin` aus dem Ordner `frames` eine Animation. Alle Bilder müssen gleich groß sein und in 128 × 64 Pixel passen. Zulässig sind 1 bis 60 Bilder pro Sekunde. Bei ungültigen Bildern bleibt eine vorhandene Zieldatei erhalten.

Bei mehreren erreichbaren Pixl.js-Geräten fordert der Sender eine konkrete Auswahl über `--mac`. Unter Plattformen, die statt einer MAC-Adresse eine Gerätekennung liefern, ist die entsprechende Kennung zu verwenden. Die am Gerät angezeigte Adresse hilft bei der Auswahl. `--invert`, `--threshold 0..255` und `--scale fit|stretch|crop` steuern die Darstellung. `--help` funktioniert auch ohne installierte BLE-Abhängigkeit. `Ctrl+C` beendet den Sender; interaktive Einzeltasten während der Wiedergabe sind wie im ursprünglichen Sender nur unter Windows verfügbar.

Die Ziel-FPS des Senders und die vom Decoder gezählten vollständigen Bilder sind keine gemessene physische LCD-Bildrate. Das Programm passt keine globalen Verbindungsintervalle, Sendepuffer oder Schlafzeitwerte an. Die Startvorgabe 5 FPS dient als zurückhaltender Bedienwert und ersetzt keinen Durchsatztest.

### Protokoll und kontrollierter Datenfluss

Das Frameformat bleibt `A5 5A`, Flag, Little-Endian-Payloadlänge und Payload. Es unterstützt RAW mit exakt 1024 Bytes, vollständige RLE-Bilder und RLE-komprimierte XOR-Deltas. Unbekannte Flags, unvollständige/überlaufende RLE-Daten oder ein Delta ohne gültiges vollständiges Vorgängerbild werden verworfen. Ein Fehler invalidiert die Delta-Referenz; ein neues vollständiges Bild stellt sie wieder her. Neue Verbindungen beginnen ohne alte Referenz.

Alle NUS-Eingaben laufen durch die vorhandene begrenzte Foreground-Queue. Der neue PC-Sender fordert vor dem ersten Bild mit der einzelnen Nachricht `PXSTREAM:ACK1\n` den quittierten Modus an. Die Firmware antwortet mit `ACK1\n` und nach jedem im Foreground verarbeiteten Chunk mit `OK\n`. Es ist jeweils nur ein unquittierter Chunk unterwegs. Die ACK-Antwort bestätigt die Chunkverarbeitung, keine physische LCD-Ausgabe.

Notwendige Quittungen haben Vorrang vor der optionalen RSSI-Meldung. Bei vorübergehend voller SoftDevice-Notificationqueue bleibt die Quittung bis zum tatsächlichen TX-ready-Ereignis erhalten. Ein Verbindungswechsel löscht sie. Bei fehlender Quittung beendet der Sender die Verbindung ohne blinden Wiederholungsversuch; ein wiederholter Teilchunk könnte sonst das aktuelle Bild verfälschen.

Clients ohne diesen Handshake erhalten weiterhin ausschließlich die bisherigen `RSSI:`-Meldungen. Der Aragamiz-Android-Client wurde anhand von `PixlBleManager.java` am Commit `451b1b3ec95e9a98e542d7c8143d53b2c1cef2e7` gelesen: Sein `handleTxData` verarbeitet nur `RSSI:` und ignoriert andere Texte; ungültige RSSI-Zahlen werden abgefangen. Dies ist eine Quellprüfung, kein Android-Gerätelauf. Dessen eigener GATT-Schreibtakt bietet keine Garantie für die Belegung unserer Foreground-Queue. Überläuft diese Queue, beendet die bestehende Firmware den Link ausdrücklich und verliert die alte Delta-Referenz, statt mit unbemerkt fehlenden Daten fortzufahren.

## Eigentum, Speicher und Schlaf

Die Miniapps verwenden vorhandene Symbole und Schriften. Der Streamcodec hält 1024 Bytes kanonisches Bild und 1024 Bytes begrenzten Eingabepuffer nur während der geöffneten App. Der S112-Empfang und das vorübergehende Werbepaket besitzen ebenfalls ausschließlich für ihre Laufzeit angeforderte Zustände. Allokationsfehler führen durch den bestehenden Launcherpfad zurück; bereits angelegte UI-Objekte werden freigegeben.

Der zusätzliche S112-Timeslotempfang berührt RADIO/TIMER0 nur im gewährten Timeslot. Seine Speicherfreigabe erfolgt erst nach `NRF_EVT_RADIO_SESSION_CLOSED` im Foreground. Bei temporärer Werbung bleiben die Paketbytes erhalten, bis der SDK-Werbesatz davon gelöst, die ursprüngliche Adresse wiederhergestellt und die vorübergehende Sendeleistung zurückgesetzt ist. Die lokale 20-ms-Werbeperiode ist keine Änderung der normalen BLE-Verbindungsintervalle.

Ein Schlafauftrag stoppt zunächst BLE. Solange einer dieser vorübergehenden Funkbesitzer noch auf die Abschlussbestätigung wartet, verarbeitet die Hauptschleife BLE/Scheduler weiter und setzt UI-Aktionen aus. Erst danach setzt sie den vorhandenen Shutdown fort. Flash, UI und Miniapp-Zustand werden nicht vorher abgebaut.

## Gezielte Nachweise

Die folgenden Tests kompilieren und verwenden tatsächliche lokale Produktionsfunktionen; SDK, Peripherie, UI-Allokatoren und VFS-Grenzen sind gezielt modelliert. Die Zahlen sind Assertions bzw. Hostfälle, keine Gerätezyklen.

| Test | Geprüfter Umfang |
| --- | --- |
| `fw/tests/de3/test_miniapps_protocol.py` | 2182 Assertions: RAW/RLE/Delta, Fragmentierung, defekte Frames, Nintendo-Pakete, MAC-/Konfigurationsgrenzen |
| `fw/tests/de3/test_miniapps_radio_lifecycle.py` | 106 Scanner- und 111 Raw-Advertiser-Assertions: Fehler, Stop/CLOSED, IRQ-Grenze, Timer-Wrap, Speicher-/Adressrückgabe |
| `fw/tests/de3/test_miniapps_ui.py` | 24 Stream- und 43 Switch-Assertions: ACK/TX-ready, Sessionwechsel, Invertierung, Speicherfehler, Rückkehr und Bootregeln |
| `fw/tests/de3/test_miniapps_sleep.py` | 3 tatsächliche Launcher-/Shutdown-Szenarien mit asynchroner Funkfreigabe |
| `fw/tests/de3/test_miniapps_startup.py` | Fehler an allen 9 Allokationsstufen der beiden neuen Konstruktoren und anschließende erfolgreiche Wiederholungen |
| `fw/tests/de3/test_stream_sender.py` | 11 Python-Fälle, einschließlich PC-Encoder gegen tatsächlichen C-Decoder und genau einem ausstehenden Chunk |

Die C-Prüfungen wurden zusätzlich mit ASan/UBSan ausgeführt. Lokales LeakSanitizer ist unter dem hiesigen ptrace-Lauf nicht verfügbar; die Sanitizerläufe nutzen hierfür ausdrücklich `ASAN_OPTIONS=detect_leaks=0`. Daraus wird kein LeakSanitizer-Nachweis abgeleitet. Bereits vorhandene Remote-/Queue-/SDK-Lifecycle-/Verbindungspräferenzprüfungen gehören zum ergänzenden Regressionsabgleich. Die vollständige Freigabesuite und Paketbindung dokumentiert der übergreifende Buildbericht.

## Nächster konkreter Gerätetest

Mit dem regulär qualifizierten und signierten LCD-Paket zunächst den normalen Geräte-/Dateimanagerbetrieb prüfen. Dann die Miniapps nacheinander nutzen: eigenen Controller erfassen und gespeichert erneut laden; tatsächliches Wecken der eigenen Switch 2 prüfen; Demo mit fünf Ziel-FPS starten, invertieren und beenden; erneut verbinden und ein vollständiges Startbild prüfen; während Suche/Streaming regulär schlafen und wieder aufwecken. Abschließend normale Dateiverbindung und NFC-Anwendung wieder öffnen. Diese physische Bedienungs-, Funk-, Energie- und Rückkehrprüfung steht noch aus; die Hosttests ersetzen sie nicht.
