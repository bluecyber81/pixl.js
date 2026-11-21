# DE3.95: begrenzter Katalog ohne gegenseitige Verdrängung

Quellbasis: LCD DE3.94/App667, Commit
`22d5c92cc566fb7da9d43a538f2818d28bfb72a6`. Die Produktionsänderung betrifft
`fw/application/src/mod/vfs/packed_fs.c`; die generierte Enginekennung steht in
`vfs_packed_identity.h`. Format, Geometrie und öffentliche PFS-API bleiben
unverändert. [Maschinenlesbare Nachweise](DE3_95_STORAGE.json).

## Problem und Änderung

PackedFS kann bis zu 64 aktive Gruppen verwalten, hält aber 32 Katalogeinträge
im RAM. Bei mehr als 32 Gruppen verdrängte eine vollständige Suche wiederholt
einen gültigen Eintrag durch den zugehörigen anderen. Jede solche Verdrängung
las den gesamten Gruppenindex erneut, selbst wenn nur ein nicht vorhandener
Dateiname gesucht wurde. Die Transaktionsplanung lud ebenfalls vollständige
Indizes, obwohl sie nur Anzahl und Länge der Datensätze benötigte.

Die neue Suche behält den gültigen Katalog einer anderen aktiven Gruppe bei.
Bei einer Kollision sucht sie direkt binär im unveränderlichen, beim Mount
vollständig geprüften Index. Ungültige oder veraltete Katalogeinträge werden
weiterhin normal gefüllt. Die Transaktionsplanung verwendet gültige gespeicherte
Maße oder liest ausschließlich den CRC-geprüften Gruppenheader. Dadurch bleiben
auch vorhandene Parentfilter anderer Gruppen erhalten.

Der Katalog bleibt bei **32 Einträgen**. Dies ersetzt den früher erwogenen
Catalog64-Versuch als gezielte Lösung für dessen wiederholte Indexlesevorgänge.
Es entstehen keine zusätzlichen dauerhaften Heap- oder BSS-Daten und keine
neuen Allokationen. Die Zahl der möglichen Dateien oder Gruppen ändert sich
nicht. Der temporäre Mountcache ist weiterhin ein unabhängiger Mechanismus.

Neue Engine-SHA-256:

```text
a9bdec38eaa41680e1c9fdebd5fd12995e9d38ff070560ff605fd387d471dabd
```

## Vergleich am tatsächlichen C-Code

Beide Varianten liefen mit demselben Testprogramm auf einem synthetischen
2-MiB-NOR und dem eingebetteten LittleFS 2.8. Die legalen PFS1-Gruppen wurden
vor den Messungen vollständig neu gemountet und geprüft. Je Gruppe gibt es
44 Datensätze; beim 64-Gruppen-Fall sind es 32, damit der Bestand mit Reserve
in die reale Geometrie passt. Jede Datei enthält 540 Byte und rohe 128-Byte-
Metadaten. Die Werte zählen physische Host-Leseaufrufe, keine Gerätezeit.

| Vorgang | Gruppen | App667 | Neuer Stand |
|---|---:|---:|---:|
| Wiederholter nicht vorhandener Dateiname | 28 | 0 | 0 |
| Wiederholter nicht vorhandener Dateiname | 32 | 0 | 0 |
| Wiederholter nicht vorhandener Dateiname | 33 | 52 | 26 |
| Wiederholter nicht vorhandener Dateiname | 54 | 1726 | 905 |
| Wiederholter nicht vorhandener Dateiname | 64 | 2284 | 1205 |
| Späte vorhandene Datei | 54 | 1727 | 910 |
| Späte vorhandene Datei | 64 | 2432 | 1243 |
| Metadatenänderung | 54 | 13829 | 11376 |
| Metadatenänderung | 64 | 15950 | 12489 |
| Unterordner vollständig entfernen | 54 | 13011 | 12368 |
| Unterordner vollständig entfernen | 64 | 11908 | 11052 |

Die geprüften 28-/32-Gruppen-Fälle bleiben auch bei den weiteren Such- und
Schreibvorgängen bei denselben Lesezahlen. Daraus folgt kein pauschaler
Geschwindigkeitsgewinn für den früher dokumentierten Nutzerbestand mit
28 Gruppen. Der Nutzen betrifft die tatsächlichen Katalogkollisionen größerer
Bestände sowie vermiedene Indexfüllungen während der Planung.

## Integrität und Ressourcen

- Alle ausgewählten Dateien und ihre rohen Metadaten stimmen überein. Nach
  Metadatenänderung und vollständiger Entfernung der ersten Gruppe bleiben
  alte Verzeichnis-Snapshots lesbar; aktuelle Namen und neue Metadaten stimmen
  nach Remount. Verschobene Manifestpositionen verwenden keine falschen Filter.
- 51 Fehler an tatsächlichen Leseaufrufen des neuen kalten Suchpfads wurden
  injiziert. Es blieben keine offenen LittleFS-Handles, zusätzlichen Allokationen
  oder Schreibzugriffe zurück; der nächste Zugriff konnte wieder erfolgen.
- Fünf beschädigte Fälle wurden sowohl bei der aktuellen Suche als auch beim
  vollständigen Remount abgewiesen: Header-CRC, CRC des aufgesuchten
  Indexeintrags, unzulässige Pfadlänge mit neu berechneter Header-CRC,
  abgeschnittener Footer und zu große Datensatzanzahl.
- Die vollständige Mountvalidierung ist unverändert. Wie im bisherigen warmen
  Suchpfad prüft eine einzelne Suche jeden tatsächlich besuchten Indexeintrag.
  Sie ist kein Vollintegritätsscan aller nicht besuchten Indexeinträge. Ein
  kalter Cache löst bei einer gültigen Kollision nicht mehr zufällig einen
  zusätzlichen Vollindexscan aus.
- ASan/UBSan für die neue Katalogsuite bestanden. LeakSanitizer war in dieser
  Umgebung deaktiviert; der separate Allokationszähler endete bei null.
- `sizeof(pfs_t)` bleibt auf dem Host 3112 Byte und mit dem tatsächlichen
  Cortex-M4-Compiler 3032 Byte. Der separate ARM-Objektvergleich mit den
  Produktionsoptimierungen zeigt dieselben 496 Byte für den lokalen
  `lookup`-Stackrahmen und 2208 Byte für `transact.part.0`. Dies ist keine
  vollständige Analyse aller verschachtelten Firmwarepfade.
- Der separate ARM-Objektvergleich vergrößert die erfassten Codesymbole um
  104 Byte. Die endgültige verlinkte Flash-/RAM-Reserve gehört in den
  vollständigen Buildbericht.

## Ausgeführte Regressionen

| Prüfung | Ergebnis |
|---|---|
| `test_packed_catalog_bounded_de395.py` | Fünf Gruppenzahlen, Referenzvergleich, Metadaten, Snapshots, Readfehler und Beschädigungen bestanden |
| Neue Katalogsuite mit ASan/UBSan | Bestanden |
| `test_packed_cleanup_de392.py` | 36 Lebenszyklen, 4 rein lesende Fälle, 2 Wartungsfehler, 243 NOR-Fehler und 1306 Lesefehler bestanden |
| `test_packed_vfs_persistence_de344.py` | Persistenz, acht Handles, OOM, alle geprüften Read-/Writefehler und Mountcache-Fallbacks bestanden |
| `test_packed_gc_iterator_de393.py` | 160/400 alte Gruppen, Iterator-/Metadatenübergänge und partielle Fehler bestanden |
| `test_packed_small_compat_de389.py` | App661 → neuer Stand → App661, Daten und Metadaten bestanden |
| `test_packed_atomic_meta_de351.py` | 28 atomare und 84 unterbrochene Abläufe; kleine Übertragungen und bedingtes Veröffentlichen bestanden |
| `test_packed_stage_gc_de346.py` | 20 Stage-/Snapshot-/Freiraum-/Retry-Lebenszyklen bestanden |
| `test_chameleon_packedfs.py` | Chameleon-Persistenz auf PackedFS bestanden |

Die erste Kompatibilitätsprüfung stoppte korrekt wegen der noch alten
generierten Enginekennung. Nach Erzeugung der zur neuen Quelle gehörenden
Kennung bestand sie; keine Formatprüfung wurde abgeschwächt.

Nächster Schritt für die Auslieferung: den gesamten LCD-Build mit seiner neuen
SourceID und dem signierten Paket binden und das getrennte Kapazitätsprofil
auf genau diese Engine verweisen lassen. Physische Gerätezeit, tatsächlicher
Bluetoothdurchsatz und Gerätelast werden durch diese Hostnachweise nicht gemessen.
