# DE3.63 / 635: persönliche Notizen und Spielhinweise

Für das Allmiibo LCD mit bestehendem Packed LittleFS PFS1. Das Update enthält
nur die Anwendung. Bootloader, Nordic S112, Dateisystem und Sammlung werden
dadurch nicht ersetzt. Keine erneute Migration oder Formatierung erforderlich.

## Bedienung am Gerät

**Amiibo-Datenbank → Figur öffnen → kurz Mitte → Notiz / Hinweise** öffnet zwei
getrennte Textseiten. Dasselbe Menü ist in der Slotansicht der Datenbank verfügbar.

- **Links/rechts kurz:** zwischen eigener Notiz und Spielhinweis wechseln.
- **Links/rechts halten:** längeren Text zurück/vorwärts lesen.
- **Mitte:** ins vorherige Menü zurück.

Der normale Figuren-/Slotwechsel bleibt unverändert. Die Textseiten ändern
weder die Figur noch ihre Notiz, Schreibschutz oder Spielstand. Eine leere Notiz
ist erlaubt. Der Spielhinweis bezieht sich auf die ausgewählte Katalogzuordnung;
bei fehlendem Hinweis wird dies angezeigt. Er bestätigt keine Spielkompatibilität.

Für acht vorhandene englische Hinweistexte werden die bereits im Dateimanager
verwendeten redaktionellen deutschen Übersetzungen eingebunden. Diese decken
13 Katalogzuordnungen ab. Andere Texte bleiben Englisch. Die Quellen und die
ausführliche Übersetzungseinordnung sind im Dateimanager einsehbar. Es werden
keine neuen Figuren-IDs, Belohnungen oder Texte aus persönlichen Notizen abgeleitet.

## LCD-Schrift korrigiert

Im Produktionsfont fehlten bisher die Großumlaute **Ä, Ö und Ü**. Diese drei
Zeichen sind ergänzt, damit unter anderem persönliche Notizen mit großen
Umlauten lesbar sind. Die übrigen vorhandenen Zeichen bleiben erhalten. Das
ist keine vollständige Unicode-Erweiterung; andere fehlende Zeichen können
weiterhin nicht dargestellt werden.

## Prüfung und Grenzen

Die Nachweise zu Hosttests, tatsächlichem ARM-Build, LCD-Pixeln und Speichergrenzen
stehen in [DE3_63.json](validation/DE3_63.json). Die aktuellen Änderungen betreffen
die Anzeige; es wird kein schnellerer Gerätestart behauptet. Die neue Ansicht,
NFC, Tasten, Aufwachen und die Integration mit dem installierten Bootloader
müssen nach dem Flashen noch am eigenen Gerät bestätigt werden.

Die vollständige neue Hardwareprüfung ist offen. Frühere positive Gerätemeldungen
werden nicht als Nachweis für diesen Build übernommen.

[Buildanleitung](BUILD_DE3_63.md) · [Dateimanager 3.39.2](RELEASE_WEB3_39_2.de.md)
