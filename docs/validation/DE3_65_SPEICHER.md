# Packed LittleFS auf dem LCD-Allmiibo – Modellprüfung vom 7. November 2026

Ausgeführt gegen die gebundenen Quellen der geflashten DE3.64 / 636. Der hier geprüfte Speicherpfad ist anhand der Produktionsdateien mit der neuen App / 637 vergleichbar. Tests betreffen synthetische NOR-Medien. Jeder Dateivergleich umfasst den Inhalt und alle 128 Metadatenbytes.

1. Temporärer Lesecache beim Kaltstart

```text
Figuren   Ohne Cache   Vier Cache-Seiten   Eingesparte physische Lesezugriffe
   100           398                342       56 (14,1 %)
   500         1.858              1.603      255 (13,7 %)
   952         3.864              3.433      431 (11,2 %)

```

Ein Zugriff in diesen Versuchen liest 256 Byte. Jede Zählung wurde dreimal für denselben Medienstand nach einem erneuten Mounten ausgeführt. Pro Größe waren Minimum, Median und Maximum identisch. In jedem Durchlauf gab es beim Einbinden null Programmier- und Löschvorgänge. Nach jedem Durchlauf wurden sämtliche Testfiguren einschließlich ihrer Raw128-Daten zurückgelesen. Die Modellfigur hat 540 Byte, hinzu kommt die feste Referenzdatei der Prüffixture. Die Daten und die Ordnerstruktur unterscheiden sich von einer persönlichen Sammlung.

Die vier Cache-Seiten belegen während des Mounts 1.032 Byte für Daten und Kennungen und werden anschließend freigegeben. Ohne Speicher für den Cache funktioniert der geprüfte Lesepfad weiterhin. Ein Versuch mit fester Aufteilung der vier Plätze für Blockanfänge und übrige Metadaten ergab beim Nachspielen der Aufrufspur in allen drei Sammlungen mehr Zugriffe als die bestehende gemeinsame Verwaltung. Mit acht Nutzdatenseiten wären laut derselben Spur bei 952 Figuren 3.257 statt 3.433 Zugriffe nötig. Dafür würden mindestens weitere 1.024 Byte RAM allein für die zusätzlichen Nutzdaten und eine angepasste Verwaltung benötigt. Die App verwendet weiter den Vier-Seiten-Cache. Die Gerätestartzeit lässt sich aus den Modellzugriffen nicht ableiten.

2. Gemeinsames Schreiben von Figuren und Metadaten

```text
100 Modellimporte               Datei und Attribute separat    Gemeinsamer Abschluss
Programmieroperationen                        14.186                       7.372
Löschoperationen                               1.062                         608

```

Die gemeinsame Transaktion spart in diesem Ablauf 6.814 Programmieroperationen (48,0 %) und 454 Löschoperationen (42,7 %). Beide Varianten wurden auf denselben Ausgangszustand angewendet und nach erneutem Einbinden direkt verglichen. Dieser Pfad gehört bereits zur Ausgangsfirmware. Der Web-Migrationsimport wählt ihn für den eingebundenen Packed-Backendtyp mit den passenden Fähigkeiten und den exakten Raw128-Attributen. Bestätigte Dateidaten und Metadaten werden beim schließenden Gerätebefehl gemeinsam veröffentlicht. Bei fehlender Abschlussantwort bleibt der tatsächliche Zielzustand offen, bis er ausgelesen wird.

28 Fälle zur gemeinsamen Transaktion und 78 simulierte Unterbrechungen bestanden. Die ergänzende Persistenz-Prüfung deckte unter anderem neun Speicherzuteilungen, 26 Schreib-/Löschfehlerpositionen und 425 Lesefehlerpositionen des geprüften 2.048-Byte-Austauschs ab. 100 identische NFC-Speicherungen verursachten im Modell null Programmierungen und Löschungen. Separate externe Umbenennungen und spätere Attributänderungen bleiben einzelne Vorgänge. Beim einfachen erneuten Setzen identischer Raw128-Attribute verlässt der bestehende Code die Funktion vor einer Transaktion. Das gemessene Importergebnis lässt weder auf die Zahl der physischen Verschleißzyklen des gesamten Geräts noch auf Jahre zusätzlicher Lebensdauer schließen.

Nachvollziehen unter Linux/WSL, Python 3 und GCC, ohne Geräteverbindung

    PIXL_SANITIZE=1 ASAN_OPTIONS=detect_leaks=1 python3 -B <fw>/tests/de3/test_packed_vfs_persistence_de344.py
    PIXL_SANITIZE=1 ASAN_OPTIONS=detect_leaks=1 python3 -B <fw>/tests/de3/test_packed_atomic_meta_de351.py
    python3 -B mount_trace.py <fw> eigener_mountvergleich.json

Die zwei mitgelieferten Original-Testläufe und die neuen Aufrufspur-Vergleiche sind als JSON bzw. Protokoll beigelegt. Beim Spurvergleich laufen die echte C-Implementierung ohne Cache und mit vier Seiten sowie ein reiner Replay-Vergleich anderer Slotzahlen. Die Werte für null und vier im Replay müssen exakt den gezählten physischen Modellzugriffen entsprechen.
