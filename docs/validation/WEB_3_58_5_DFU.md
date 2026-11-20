# Web 3.58.5: App667 direkt auf dem Handy laden

## Anlass und belegter Befund

Der Besitzer konnte die heruntergeladene Firmware-ZIP am Handy weder für den
Browser-Updater noch in seiner DFU-App öffnen beziehungsweise auswählen. Die
konkrete Meldung und der lokale Dateianbieter wurden nicht beobachtet; eine
bestimmte Android-Ursache ist damit nicht bewiesen.

Die veröffentlichte `Allmiibo_LCD_DE3_94_667_NUR_APP.zip` wurde erneut über HTTPS
gelesen: HTTP 200, 361633 Byte, bytegleich mit dem signierten Paket, ZIP-CRC
gültig. Sie enthält genau `manifest.json`, `app_667.dat` und `app_667.bin`.
Der Server liefert `application/x-zip-compressed`; der bisherige Dateifilter
enthielt nur `.zip,application/zip`. Der Firmwareparser prüft den Inhalt und
verlangt keinen bestimmten MIME-Typ oder äußeren Dateinamen.

Die bestätigte Bedienlücke war ein anderer Punkt: App667 wurde zwar als
Download und als private Prüfreferenz angeboten, fehlte aber im Laufzeitkatalog
des vorhandenen direkten Paketladers. Dadurch war die lokale Dateiauswahl für
dieses Paket bisher erforderlich.

## Änderung

- **„App667 direkt laden und prüfen“** lädt das unveränderte LCD-Testpaket vom
  eigenen Seitenursprung. Ein vorheriger Download oder lokaler Dateipicker ist
  nicht erforderlich.
- App667 ergänzt nur den Laufzeitkatalog der DFU-Seite als Testpaket. Die
  gespeicherten öffentlichen Stable-Kataloge bleiben unverändert; App662 ist
  weiterhin die stabile LCD-Referenz. OLED behält seine eigenen Pakete.
- Es bleibt eine gemeinsame `Loader`-Instanz mit Größenlimit, vollständiger
  Längen- und ZIP-SHA-256-Prüfung, echten ZIP-/Init-/BIN-Prüfungen sowie
  gemeinsamem Abbruch- und Sequenzzustand.
- Displaykonflikte, abweichende frische Bootdaten, niedrigere App-Zähler und
  laufende Lade-/Übertragungsvorgänge sperren den neuen Weg genauso wie die
  bisherige Katalogauswahl.
- Das Laden fordert kein Bluetooth-Gerät an. Erst **„DFU-Gerät auswählen und
  übertragen“** startet die separate Geräteauswahl.
- Der bestehende Android-Link **„In nRF DFU öffnen“** wird nun auch für den
  ausgewählten App667-Eintrag erzeugt. Seine Annahme durch eine installierte
  Handy-App bleibt ein physischer Test.
- Der lokale Dateifilter berücksichtigt zusätzlich
  `application/x-zip-compressed` und `application/octet-stream`. Die
  Inhaltsprüfungen bleiben unverändert.

Direkter Einstieg:
<https://bluecyber81.github.io/pixl.js/dfu/web.html?v=3.58.5&package=de3.94-lcd-app>

Der Link wählt das Paket vor, lädt und flasht aber nicht automatisch.

## Unveränderte Firmwarebindung

| Merkmal | Wert |
|---|---|
| Board | LCD / ST7567 |
| Firmware | 2.22.0-DE3.94 / App667 |
| Voraussetzungen | PFS1, Z21, S112 7.3.0 / FWID 294 |
| Firmwarecommit | `22d5c92cc566fb7da9d43a538f2818d28bfb72a6` |
| OTA-Größe | 361633 Byte |
| OTA-SHA-256 | `f00ddc2c86225d86e5c9ef50bad9d45b84250b287a4f3df4d2f169357a9688c4` |
| BIN-SHA-256 | `99aa4dbe6f2bba9771b8b51d9e80cc26b4f38a96ad09ee3391ab13ed5fdf676f` |

Es wurde keine neue Firmware gebaut oder signiert. Bootloader, SoftDevice und
die vorhandenen Firmware-/Simulatorbelege bleiben unverändert.

## Prüfung und nächster Schritt

Die gezielten Tests führen den neuen Seitenhandler und die tatsächliche
signierte App667-ZIP durch den bestehenden Loader, Updater und Parser aus.
Ein gleich langes, um ein Byte verändertes Paket muss vor dem Parser abgewiesen
werden. Beide zusätzlichen MIME-Typen werden mit den echten ZIP-Bytes geprüft.

Am 20.11.2026 abgeschlossene Prüfungen:

| Prüfung | Ergebnis |
|---|---|
| Gesamte Web-Suite | 1908 Tests, 1905 bestanden, 0 Fehler, 3 bestehende Auslassungen |
| Tatsächliche DFU-Seitenhandler | 26/26 bestanden |
| App667-Paket-/Identitätsprüfungen | 8/8 bestanden |
| Produktionsbuild für `/pixl.js/` | Erfolgreich, 31/31 Auslieferungsprüfungen bestanden |
| Unveränderte Firmware und Kataloge | Acht relevante Paket-, Katalog-, Parser- und Quellarchivdateien bytegleich zum Web3.58.4-Ausgangsstand |

Die drei bestehenden Auslassungen betreffen zwei Windows-Prüfungen und optionale
historische Firmware-/Recoveryfixtures. Die neuen Direktladefälle wurden nicht
ausgelassen. Der vollständige Seitentest verwendet weiterhin den realen
begrenzten Loader; die zusätzliche Paketintegration führt echte signierte Bytes
durch den tatsächlichen Updater und Parser. Ein separater Review fand keinen
konkreten Blocker im neuen UI-Ladepfad.

Ausgangspunkt der Webquelle ist Commit
`2bc666db3a6af51ee19752df084f4eb5d7906c12`, Branch `web-app667-mobile`.
Die Veröffentlichung wird auf diesem Branch und `gh-pages` fortgesetzt.
Der Firmware-Testzweig und der stabile Hauptzweig werden nicht geändert.

Eine Prüfung im Cloud-Browser ersetzt keinen Gerätetest. Die letzte vorliegende
physische Diagnose bleibt DE3.92 / App665. Nach Veröffentlichung soll der
Besitzer die neue Seite am Handy öffnen, das Paket direkt laden, sein Allmiibo
in den DFU-Modus bringen und die Übertragung ausdrücklich starten. Erst danach
folgen Versions-/SourceID-Abgleich und die bereits dokumentierte App667-Abnahme.
