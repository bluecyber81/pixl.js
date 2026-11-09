# LCD DE3.70 / 642 und Dateimanager 3.47.0

Der Amiibo-Emulator sortiert die sichtbare Seite im Figurenordner einmal. Unter **Gerät & Diagnose → Alle Diagnosewerte auslesen** zeigt der Dateimanager mit DE3.70 die erkannten Mitteltastenereignisse bis zur ersten Auswahl im Hauptmenü und die Dauer des App-Aufrufs. Die Daten bleiben bis zum Neustart im RAM.

Für das LCD mit eingerichtetem Packed LittleFS, Z19 und S112 7.3.0 genügt das App-Update. Wähle die [signierte App-ZIP für Android](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_70_642_NUR_APP.zip) in nRF Device Firmware Update. Die stabile Alternative bleibt DE3.65.

## Erste Menüauswahl nach dem Update prüfen

1. Lass das Allmiibo nach dem Update bis ins Hauptmenü starten. Öffne dort mit einem kurzen Mitteldruck den Amiibo-Emulator.
2. Öffne anschließend die Bluetooth-Dateiübertragung im selben Gerätestart. Ein Aus- und Einschalten setzt die Aufzeichnung zurück.
3. Öffne im [Dateimanager](https://bluecyber81.github.io/pixl.js/) die vollständige Gerätediagnose. Die neue Anzeige nennt die erste ausgewählte App, erkannte Tastenvorgänge und die Zeit bis zur Rückkehr aus dem Startaufruf. Ein Start der Dateiübertragung als erste Auswahl erfasst entsprechend diese App.

Die Messung beginnt bei der bereits entprellten Eingabe. Der Zeitpunkt, an dem das LCD die erste sichtbare Liste zeigt, und elektrische Kontaktvorgänge vor der Entprellung bleiben offen. Der erste Hardwaretest mit DE3.70 steht aus.

## Nachweise

Für die erste Seite eines Ordners mit 1.000 simulierten Figurendateien lieferte der Emulator in beiden Firmwareständen dieselben 24 Einträge. Je nach Reihenfolge der vom Laufwerk gelieferten Namen änderte sich die Zahl der Sortieraufrufe.

| Namen im Verzeichnis | DE3.69 | DE3.70 |
| --- | ---: | ---: |
| Aufsteigend | 25 | 1 |
| Absteigend | 1.001 | 1 |
| Gemischt | 113 | 1 |

Beide Versionen fragten das Verzeichnis jeweils 1.001-mal ab, einschließlich der Meldung für das Verzeichnisende. Gemessen wurde die Sortierarbeit am Rechner. Die Zeit bis zur sichtbaren Liste auf dem LCD ist noch offen.

Alle 149 Firmware-Testskripte am Rechner bestanden. Die Navigation bestand zusätzlich auf drei Laufzeitumgebungen je 50 Fälle mit der Speicherverwaltung der Firmware, darunter ein Lauf mit Speicherfehlerprüfungen und einer mit emuliertem 32-Bit-ARM. Die Tests prüften auch das Zurückblättern, ausgeblendete Dateien und die Seitengrenze bei 24 und 25 sichtbaren Einträgen. Im emulierten Cortex-M4-Release-ELF blieben erste Auswahl und Zeitmessung auch beim erneuten Menüaufruf erhalten. Die Prüfung umfasste den Überlauf des Zeitgebers.

Der PFS1-Kompatibilitätstest begann mit 1.131 künstlichen Dateien und 77 Ordnern. Alte und aktuelle Speicherimplementierung lasen die Sammlung und die Änderungen der jeweils anderen Implementierung nach erneutem Einbinden korrekt zurück, einschließlich der 128 Metadatenbytes pro Eintrag. Alle reinen Lesephasen liefen ohne Programmier- oder Löschvorgang.

Der signierte App-Download enthält 359.212 Byte Anwendungsdaten. Im Z19-Modell wurde die Verbindung nach 4.136 Byte getrennt. Der Bootloader meldete beim erneuten Verbindungsaufbau den Fortsetzungspunkt 0. Der vollständige Neuversand endete mit korrekter Prüfsumme. Die Paketprüfung bestätigte die Signatur und erkannte drei absichtlich fehlerhafte Prüfvarianten.

Gegenüber DE3.69 belegt die App 464 Byte mehr Flash. Der Linker weist 13.516 Byte Flashreserve, 1.808 Byte Abstand zwischen Heap und Stack sowie 8.192 Byte reservierten Stack aus. Alle Mindestvorgaben sind erfüllt. [Firmwareprüfung und Messwerte](validation/DE3_70.json) · [Webtests](validation/WEB3_47_0.json) · [Quellbau](BUILD_DE3_70.md)
