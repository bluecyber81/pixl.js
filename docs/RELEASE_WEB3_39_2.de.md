# Dateimanager 3.39.2: Katalogstand sichtbar

Unter **Figurenkatalog → Details und Bild** und in der Dateivorschau steht neben
**Kataloghinweise** jetzt der Datenstand aus dem tatsächlich eingebauten Katalog.
Die Anzeige bricht auf schmalen Bildschirmen um. Sie ist auf Deutsch und Englisch
verfügbar; andere Oberflächensprachen verwenden den englischen Fallback.

Der Katalogstand ist keine neue Geräteprüfung. Die Figuren-IDs und Katalogdaten
sind unverändert. Persönliche Notizen bleiben getrennt und werden nicht befüllt.
Die vorhandene Wachhaltefunktion aus 3.39.1 bleibt erhalten.

Auf der DFU-Seite liegt die neue Anwendung DE3.63/635 für LCD-Geräte mit PFS1.
Ein Webupdate allein verändert keine Gerätefirmware. Das Anwendungsupdate enthält
weder Bootloader noch SoftDevice und richtet den Speicher nicht neu ein.

Die lokale Prüfung umfasst die Vue-Komponente, Sprachfallbacks, beide
Produktionsbuilds und Browserdarstellung. Ein echter Handy-/Bluetooth-Langzeittest
bleibt offen. Details stehen in [WEB3_39_2.json](validation/WEB3_39_2.json).
