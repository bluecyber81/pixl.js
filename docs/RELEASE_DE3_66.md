# LCD-App DE3.66 und Dateimanager 3.40.0

## Gerät und Sicherung

Unter **Gerät & Diagnose → LCD-Displayfoto → Displayfoto aufnehmen** liest der Dateimanager die aktuelle LCD-Anzeige im Bluetooth-Dateimodus. Das PNG hat dieselben 128 × 64 Pixel wie das Display. Acht Teilbilder werden anhand der Prüfsumme des gesamten Bildschirms zusammengesetzt. Bei einem Bildwechsel versucht der Browser es einmal erneut. Die Aufnahme verwendet den vorhandenen Bildspeicher des Geräts.

Eine unterbrochene Ordnersicherung lässt sich nach dem erneuten Verbinden mit demselben Gerät im selben offenen Tab fortsetzen. Vor dem Wiederverwenden bereits gelesener Dateien vergleicht der Browser deren Inhalt. DE3.66 kann kleine Dateien auf Laufwerk E bis 572 Byte am Gerät mit SHA-256 prüfen. Geänderte Dateien werden frisch übertragen. Bei älterer Firmware und größeren Dateien liest der Browser den Inhalt erneut. Beim Schließen oder Neuladen des Tabs verfällt der Zwischenstand.

## Figuren

Unter **Figurenkatalog → Angekündigte Figuren** lassen sich neun Nintendo-Ankündigungen durchsuchen. Die Termine sind mit ihrer Region gekennzeichnet. Die beiden vorgeschlagenen Zelda-Kennungen erscheinen als unbestätigt. Für den Bestandsabgleich gelten weiterhin die 952 bestätigten Katalogeinträge. Zu den Ankündigungen gehören Produktinformationen. Der Download enthält keine Figurendateien. [Nintendo-Katalog](https://www.nintendo.com/us/amiibo/line-up/)

Ein Dateitreffer in der Gerätesuche öffnet das Figurenbild direkt im Ergebnis. Liegt eine gültige Figuren-ID vor, genügt der lokale Katalog zur Zuordnung. Bei fehlender ID kann der Klick eine einzelne BIN-Datei in unterstützter Größe vom eigenen Gerät lesen. **Im Ordner anzeigen** öffnet den zugehörigen Ordner. Für unterstützte 2048-Byte-Dateien aus Kirby Air Riders zeigt die lokale Prüfung auch mögliche Fahrzeugmodelle an. Teilen sich zwei Modelle dieselbe Kennung, zeigt sie beide Namen.

## Update am Handy

Das signierte Anwendungs-ZIP hat Zähler **638**. Es ist für das LCD-Allmiibo mit bereits eingerichtetem Packed LittleFS PFS1 vorgesehen. Mit Android die unveränderte ZIP in **nRF Device Firmware Update** auswählen und das eigene Gerät im Update-Modus als **pixl dfu** verbinden. Der DFU-Dateimanager bietet DE3.65 als gerätegeprüfte Version und DE3.66 als Testversion an. Bei einem Web-Update zeigt er aus tatsächlich bestätigten Bytes die Übertragungsrate und geschätzte Restdauer.

DE3.66 aktualisiert ausschließlich die Anwendung. Der vorhandene Z19-Bootloader, Nordic S112 und die Figurensammlung werden für dieses Update weiterverwendet. Am LCD sind Displayfoto, Tastendruck, Menü und NFC an der Switch bestätigt. Eine unterbrochene Sicherung wurde am Windows-Laptop und in Android-Chrome fortgesetzt. [Geräteprüfung DE3.66](validation/DE3_66_LCD_READBACK.md). [Build und Signaturprüfung](validation/DE3_66.json)
