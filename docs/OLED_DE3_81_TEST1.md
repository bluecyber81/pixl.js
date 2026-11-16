# DE3.81 OLED Test 1 · Deutsch / English

## Deutsch

Diese signierte App ist für ein Pixl.js-OLED mit nRF52832, SH1106 (128 × 64), kompatiblem Pixl.js-DFU-Bootloader und Nordic S112 7.2.0 (FWID `0x0103`) gebaut. Die Referenzpakete sind cylin577 OLED v2.21.0 und v2.27.11. Die allgemeine Nordic-Hardwarekennung 52 unterscheidet die Displaytypen nicht. Die ZIP gehört ausschließlich auf ein passendes OLED-Gerät.

1. Sichere die vorhandenen Dateien und halte die bisherige OLED-App-ZIP bereit. Geeignet sind ein intaktes SPIFFS oder ein natives LittleFS mit geprüftem Bestand. Die Testversion unterstützt externe Flashchips mit passender Kennung und 2, 4, 8 oder 16 MiB. Geräte mit 32 MiB liegen außerhalb dieses Tests.
2. Lade `Allmiibo_OLED_DE3_81_Test1_APP.zip` in den Downloadordner des Handys. Öffne am Gerät **Einstellungen → Firmware-Update**. Wähle in **nRF Device Firmware Update** die ZIP als Paket und `pixl dfu` als Gerät. Die ZIP bleibt gepackt. Sie aktualisiert ausschließlich die Anwendung.
3. Prüfe die Versionsanzeige `2.22.0-DE3.81-OLEDt1`. Wähle unter **Einstellungen → Sprache** erst Deutsch, dann English. Beende die Einstellungen normal und kontrolliere nach dem Aufwachen die Auswahl.
4. Öffne eine bekannte Figur, vergleiche Dateibestand und Spielhinweis, teste die Figur an der Konsole und die Dateiübertragung über Bluetooth. Bei fehlenden Dateien brich den Test ab und bewahre die Sicherung auf. Die Firmware verwendet das vorhandene Speicherformat.

**Unterschiede zur LCD-App DE3.81.** Beide enthalten den Katalog mit 956 Figuren, deutsche und englische Spielhinweise, die Funktion „App fortsetzen“ und die Bluetooth-Fernbedienung für die Tasten. Displayfotos, RAM- und Startzeitdiagnose sowie der Akkuverlauf im Dateimanager sind Funktionen der LCD-App. Die Akkuanzeige am OLED-Gerät ist vorhanden. Dieses OLED-Paket verwendet App-Zähler 81 und S112 7.2.0. Der Test am physischen OLED-Gerät steht aus.

## English

This signed application targets the nRF52832 Pixl.js OLED with the 128 × 64 SH1106 display, a compatible Pixl.js DFU bootloader and Nordic S112 7.2.0 (FWID `0x0103`). The reference releases are cylin577 OLED v2.21.0 and v2.27.11. Nordic hardware version 52 is shared with other boards. Use this package only on the matching OLED.

1. Back up the existing files and keep the previous OLED application ZIP. Start with a healthy SPIFFS or a native LittleFS volume with a verified collection. Supported external flash chips have a recognized ID and a capacity of 2, 4, 8 or 16 MiB. The trial excludes 32 MiB boards.
2. Download `Allmiibo_OLED_DE3_81_Test1_APP.zip` to the phone. Select **Settings → Firmware Update** on the device. In **nRF Device Firmware Update**, select the intact ZIP and the device named `pixl dfu`. The ZIP updates only the application.
3. Check the displayed version `2.22.0-DE3.81-OLEDt1`. In **Settings → Language**, switch between English and Deutsch. Exit Settings normally and check the selection after waking the device.
4. Open a familiar figure, check the collection and a game hint, scan the figure on the console and try Bluetooth file transfer. Stop the test if expected files are missing. Keep the backup. The application uses the existing storage format.

**Differences from the DE3.81 LCD app.** Both builds include the 956-figure catalog, German and English game hints, app resume and Bluetooth remote button controls. Display capture, RAM and startup diagnostics, and battery history in the file manager are LCD app features. The OLED device itself displays the battery level. This OLED package uses app counter 81 and S112 7.2.0. Physical OLED testing is pending.
