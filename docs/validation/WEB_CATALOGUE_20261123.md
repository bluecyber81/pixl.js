# Web-Katalog: Quellenprüfung und konsistente Spielhinweise — 23.11.2026

## Tatsächliche Änderung

Die erste Prüfung verglich die neuen AmiiboAPI-Daten mit `figure-usage.json`. Das war für eine Aussage über die ganze Oberfläche zu eng: `game-guides.js` enthielt bereits die zehn Fatal-Fury-Zuordnungen und alle 35 Ocarina-Zuordnungen einschließlich der beiden angekündigten jungen Figuren. Spielefilter und Spielhinweise waren vorhanden. Es fehlten die entsprechenden **figurbezogenen Kataloghinweise**.

Die geprüften Zuordnungen liegen jetzt in einer gemeinsamen Web-Ergänzung. Filter, Spielhinweise und Figurendetails verwenden dieselben exakten ID-Listen. Die Suche findet diese Figuren auch über den dokumentierten Spieltitel. Im Figurendetail wird der gleiche Spielhinweis nicht nochmals als eigener Guide wiederholt. Vorhandene Maskenhinweise für Junger Link/Junge Zelda bleiben erhalten.

Hinzu kommen **15 weitere Spielzuordnungen für Sword Kirby und Noir Dedede**. Die zwei Air-Riders-Zuordnungen samt Training seit Version 1.3.3 waren bereits vorhanden.

## Herstellerbelege

- [Nintendo: Ocarina of Time, Verwendung von amiibo](https://en-americas-support.nintendo.com/app/answers/detail/a_id/71861/~/how-to-use-amiibo-figures-%28the-legend-of-zelda%3A-ocarina-of-time%29): Zelda-Charakterfiguren geben Gegenstände; die beiden jungen Ocarina-Ausgaben schalten Masken frei. Scannen wird nach dem ersten Besuch der Hylianischen Steppe verfügbar. Die bereits geprüfte Liste von 33 normalen Figuren wird unverändert mit den Detailhinweisen verbunden.
- [Nintendo: Fatal Fury](https://www.nintendo.com/jp/hardware/amiibo/game/abfua/index.html): Avatare, Titel und EOST-Erfahrung; bei den Street-Fighter-6-Karten sind ausdrücklich Ken, Chun-Li, Terry und Mai genannt. Die offizielle Matrix führt außerdem die Smash-Figuren Ken (`aadg`) und Terry (`aadq`).
- [Nintendo-Kompatibilitätsmatrix](https://www.nintendo.com/jp/hardware/amiibo/data/amiiboID_list.csv), verwendet vom [Skript der öffentlichen Spielseiten](https://www.nintendo.com/jp/hardware/amiibo/game/js/detail.js): 109.326 Bytes, CP932, SHA-256 `45ce06118fe9a89ac5356b35e4b3baa21f1266de2b9816df88ea6a2266cf04ea`.
- Die Nintendo-Figurenseiten binden [`caaf` an Sword Kirby](https://www.nintendo.com/jp/hardware/amiibo/lineup/caaf/index.html) und [`caag` an Noir Dedede](https://www.nintendo.com/jp/hardware/amiibo/lineup/caag/index.html). Die Matrix führt beide für Mario Kart 8 Deluxe, Kirby Star Allies, Smash Ultimate, Super Kirby Clash, Forgotten Land, Return to Dream Land Deluxe und Forgotten Land Switch 2 Edition. Für Miitopia ist nur Sword Kirby in der hier verwendeten Kostümgruppe gelistet.

Die acht zugehörigen Nintendo-Spielseiten stehen mit ihren URLs und der genauen Zuordnung in `WEB_CATALOGUE_20261123.json` und `web/src/data/usage-nintendo-supplement.json`. Japanische Herstellertexte erhalten eigene deutsche und englische redaktionelle Fassungen; die Oberfläche bezeichnet sie entsprechend.

## Bewusste Grenzen

Nicht übernommen wurden unbestätigte Mengen und Gegenstandslisten aus der Communityquelle, etwa 10–20 Fragmente oder konkrete Star-Allies-Belohnungszahlen. Nintendo belegt auf den geprüften Seiten zusätzliche hilfreiche Gegenstände; diese engere Aussage steht im Katalog. [Miitopia](https://www.nintendo.com/jp/hardware/amiibo/game/aw8sa/index.html) schließt Air-Riders-Figuren für Nintendo 3DS ausdrücklich aus; die Ergänzung gilt für Switch.

Der AmiiboAPI-Pin bleibt `master` / `855a0ff4308278de756bed01de1eca89936f456b`. Der neuere Defaultbranch heißt `dev`, nicht `main`. Er ist kein geradliniges Update und verliert gegenüber der gespeicherten Referenz zehn Nutzungshinweise und fünf Schreibkennzeichnungen. Es gibt keinen automatischen Wechsel. Der Onlineprüfer aktualisiert Figurenmetadaten und prüft Spielhinweise auf Verlust; die kuratierten Spielzuordnungen werden als Offline-Daten ausgeliefert. Die Wahl von `master` ist kein nachgewiesener Programmfehler.

## Umfang und Prüfungen

- 954 Upstream-IDs und 956 lokale Katalog-IDs bleiben unverändert.
- 58 figurbezogene Zuordnungen ergänzt: 33 Ocarina, zehn Fatal Fury, 15 weitere Kirby-Spielzuordnungen.
- Insgesamt 1.414 Zuordnungen: unverändert 1.348 aus dem Firmwarekatalog und 66 Web-Ergänzungen; 86 Gruppen und 64 unterschiedliche zweisprachige Notizen.
- Alle bestehenden Sprachfassungen werden vom Exporter gegen Löschung und ungeprüfte Ersetzung geschützt. Gemeinsame identische Notizen werden einmal gespeichert.
- 93 gezielte Node-Tests bestanden, darunter echte Vue-Komponenten für Suche, Filter, Karte, Figurendetails, Quellen und Plattformen in DE/EN nach einem Metadatenwechsel. Keine doppelten Guide-Texte und kein benötigter Bildabruf.
- 13 Exporter-Tests bestanden; `amiibo_usage_export.py --check` bestätigt die reproduzierbare Ausgabe.
- Bestehende Onlineprüfungen für Größenlimits, Abbruch, Zeitlimit, unveränderliche Commits und Notiz-/Schreibverlust sind grün. Kein weiterer konkreter Laufzeitfehler wurde dabei belegt.

Es wurden keine Firmware-CSV-Dateien, Figuren-IDs, Schlüssel oder Figurendateien verändert. Diese Prüfung ersetzt keinen eigenen Spiel- oder Gerätetest. Nächster Schritt ist die gemeinsame Web-Gesamtprüfung und Paketierung durch die Releaseintegration.
