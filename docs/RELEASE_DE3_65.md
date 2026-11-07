# Allmiibo LCD DE3.65 · Anwendung 637

Im Menü **Amiibo-Datenbank** eine Figur öffnen und ihre Spielhinweise oder eigenen Notizen anzeigen. Auf der Notizseite wechselt ein kurzer Druck nach links oder rechts die Seite. Beim Halten blättert der Text weiter. Ein kurzer Mitteldruck führt zurück. Die deutsche Bedienhilfe verwendet jetzt Umlaute und passt in zwei Zeilen.

Am Ende einer mehrzeiligen Notiz erreicht der Scrollbalken jetzt die untere Position. Bei einer dreizeiligen Notiz wanderte er im Test der 128 × 64 Pixel großen Anzeige von Zeile 12 bis Zeile 26. Buchstaben mit Unterlängen behalten ihren Platz.

Die Anwendung benötigt **2.672 Byte weniger Flash** als DE3.64/636. Die 1.344 Zuordnungen von Figuren zu Spielen und Hinweisen verwenden im aktuellen Katalog vier Byte je Verknüpfung. Der Generator wählt bei einem größeren Hinweisbestand automatisch breitere Indizes. Alle 952 Figuren und die verfügbaren Sprachtexte sind erhalten. Auf dem LCD stehen acht deutsche Nutzungshinweise mit englischem Rückfall bereit. Der Web-Dateimanager 3.39.5 enthält alle 54 deutschen Hinweise.

| Messung | DE3.64/636 | DE3.65/637 |
| --- | ---: | ---: |
| Größe der LCD-Anwendung | 364.236 Byte | 361.564 Byte |
| Freier Flashbereich laut Linker | 8.492 Byte | 11.164 Byte |
| Abstand zwischen Heap und Stack | 1.840 Byte | 1.840 Byte |

## Installation

Für ein passendes LCD-Allmiibo mit eingerichtetem **Packed LittleFS PFS1** enthält die signierte ZIP ausschließlich die Anwendung. Sie behält Bootloader, SoftDevice und Figurensammlung bei. Die geprüfte Ausgangskonfiguration war DE3.64/636 mit Z19 und Nordic S112 7.3.0. Bei Geräten mit SPIFFS oder einem anderen LittleFS-Layout muss zuerst die passende Speichermigration geklärt sein.

Am Handy das Gerät in den DFU-Modus bringen und die ZIP unverändert in der Nordic-DFU-App auswählen. Nach dem Neustart lässt sich die Versionsnummer im Dateimanager unter **Gerät & Diagnose** prüfen. [Signierte Anwendungs-ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.65/Allmiibo_LCD_DE3_65_637_NUR_APP.zip)

**SHA-256 der ZIP** `01df3896f73cc5776e0a72318742fd44803e2899625c26de5a33fee15c535fb2`

## Nachweise

148 Firmware-Testsuiten bestanden. Der Bildschirmtest erzeugte 554 Bilder mit dem tatsächlichen C-Zeichencode und verglich 531 QR-Darstellungen. Beide Indexbreiten und die 1.344 Zuordnungen wurden gegen die Quelldaten geprüft. Die ARM-Prüfung mit dem Z19-ELF bestätigte die Annahme der signierten App, die Integrität des Inhalts und die Startprüfsumme für das Update von App 636 sowie für eine leere App-Bank. Die Geräteauslesung bestätigte DE3.65/637, Z19, S112 7.3.0 und das eingebundene PFS1. Am Gerät funktionierten der Scrollbalken, eine bekannte Figur an der Switch und das Aufwachen nach automatischem Abschalten. Das gemessene App-Startfenster betrug 2,376 Sekunden. [Gerätenachweis](validation/DE3_65_LCD_READBACK.json) [Reproduzierbarer Build](BUILD_DE3_65.md) · [Prüfdaten mit Hashes](validation/DE3_65.json)
