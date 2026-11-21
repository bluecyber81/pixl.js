# Allmiibo LCD DE3.98 / App671

Normale Anwendung für LCD/ST7567 mit Packed LittleFS (PFS1), Z21 und Nordic S112 7.3.0. Das Anwendungsupdate enthält weder Bootloader noch SoftDevice. Das bestehende PFS1-Format bleibt erhalten.

## Aus dem geprüften Stand übernommen

App670 enthielt bereits revisiongebundenes Sammellesen und SHA-256-Abfragen für bis zu vier kleine Dateien, die CRC-Schleifenoptimierung und die zugehörigen Fehler- und Lebensdauerprüfungen. App671 übernimmt diese Implementierungen. Speicherfreigabe, Save/Retry/Discard, 2M-Anforderung mit getrennter Ergebnismeldung und Schutz vor abgebrochenen lokalen Upload-Lesern waren ebenfalls bereits vorhanden.

Der Webfehler „Teststatus lesen“ beruhte auf vier veralteten Versionsabfragen im Test-1-Dateimanager. Er wurde bereits in 3.60.0-test.2 behoben. Die normale Ausgabe 3.61.0 trennt die normalen Diagnoseformate von den ausschließlich für App669/App670 verfügbaren Versuchsfunktionen.

## Änderungen dieser normalen Ausgabe

- PackedFS trennt Planung, Neubau und Veröffentlichung einer Transaktion in eigene Aufrufphasen. Das senkt die gleichzeitig belegten Stackrahmen, ohne neue statische Arbeitskopie oder zusätzliche Heapallokation.
- AmiiboLink beendet einen ausstehenden Speichervorgang, bevor der große lokale Puffer für den nächsten Tag angelegt wird.
- Die gespeicherte Speicherfreigabediagnose PXGC bleibt im normalen LCD-Build verfügbar. Das zusätzliche Mount-Profiling und die experimentellen Funk-Schalter werden nicht einkompiliert.
- Ein erfolgreicher Chameleon-Kartenimport speichert über den vorhandenen Save/Retry/Discard-Pfad und kehrt zur ausgewählten Hauptkarte zurück. Ein Speicherfehler lässt die Wiederholungs- und Verwerfenauswahl erhalten.
- Die Einstellungsseite zeigt die bereits bekannte Ladebasis an. Die Anzeige verursacht keine zusätzliche Dateiabfrage und verwechselt offene Änderungen nicht mit einem Ladefehler.
- Temporäre AmiiboDB-Tags können nach Schlafen und Aufwachen bytegleich aus dem vorhandenen CRC-geschützten RAM-Cache weiterverwendet werden. Herkunft und Figurenkennung werden geprüft; gespeicherte Slots werden weiterhin aus dem Speicher gelesen.
- Nach einer tatsächlich genutzten und beendeten NFC-Sitzung führt der Rückweg zur passenden Auswahl mit erhaltenem Fokus. Automatischer UID-Wechsel behält seinen bisherigen Ablauf. Ungespeicherte NFC-Änderungen eines temporären Tags bleiben zugänglich, auch bei einer weiteren Lesesitzung und nach Schlafen/Aufwachen.

## Prüfung und Grenzen

Die verbindlichen Build-, Quellen-, Paket- und Prüfsummen stehen in `RELEASE_INFO.json` und `docs/validation/DE3_98.json`. Der Stackvergleich beschreibt ausgewählte tatsächlich gleichzeitig aktive ARM-Aufrufketten, keine vollständige Höchstlast einschließlich aller Interrupts und indirekten Aufrufe. Der Speicherbedarfssimulator verwendet exakt die mitgelieferte Engine; seine Host- und ARM-Prüfungen ersetzen keine Gerätebeobachtung.

Der erste physische Durchlauf dieser neuen App671 bleibt separat zu bestätigen. Die vorherigen App670-Gerätebelege werden erhalten und nicht als Beobachtung des neuen Binaries ausgegeben. Die abgeschlossenen vollständigen Backup-, Funkvergleichs- und kleinen Speicherfunktionstests müssen nicht pauschal wiederholt werden.

## Installation

Im normalen Dateimanager **Update → LCD DE3.98 / App671** wählen oder die ZIP `Allmiibo_LCD_DE3_98_671_NUR_APP.zip` in nRF Device Firmware Update öffnen. Danach werden Firmware `2.22.0-DE3.98`, App-Zähler `671` und Dateimanager `3.61.0` erwartet. Bei bestehendem PFS1 ist keine neue Speicherumstellung erforderlich.

OLED-Pakete und das historische S112/Z21/App662-Komplettpaket behalten ihre eigenen Voraussetzungen. Das neue App-Paket hebt deren Zähler- oder Layoutgrenzen nicht auf.
