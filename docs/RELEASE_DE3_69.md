# LCD DE3.69 / 641 – zuletzt geöffnete Figuren

In der Amiibo-Datenbank führt „Zuletzt geöffnet“ zu den bis zu fünf zuletzt geöffneten Figuren. Die neueste steht oben. Wählst du sie erneut, rückt sie nach vorn. Der Verlauf liegt im Arbeitsspeicher und beginnt beim Neustart leer.

Für das LCD mit eingerichtetem Packed LittleFS PFS1 und passendem Bootloader/S112 genügt die [signierte App-ZIP](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_69_641_NUR_APP.zip). Auf Android im [Dateimanager](https://bluecyber81.github.io/pixl.js/) unter „Update“ beim Paket DE3.69 „In nRF DFU öffnen (Android)“ wählen, dann in der Nordic-App das eigene Gerät auswählen und die Übertragung starten. DE3.65 bleibt die stabile LCD-Version.

**Am Gerät prüfen:** Öffne zwei verschiedene Figuren in der Amiibo-Datenbank. Öffne die erste erneut und schau unter „Zuletzt geöffnet“, ob sie genau einmal ganz oben steht. Öffne die zweite Figur aus der Liste. Der Vergleich am physischen Gerät steht für diese neue App aus.

Beim Anlegen eines Favoriten übernimmt die App die tatsächlich angezeigte Figur und ihren Spielkontext. Der LCD-Build für Deutsch und Englisch belegt 5.404 Byte weniger Flash als DE3.68. Alle 952 Figuren und 1.344 Spielzuordnungen wurden in beiden Katalogprofilen geprüft. Der Linker weist 13.980 Byte Flashreserve aus. Die fünf Verlaufseinträge belegen 25 Byte RAM. Der Abstand zwischen reserviertem Heap und Stack beträgt 1.808 Byte.

[Quellbau](BUILD_DE3_69.md) · [Prüfergebnisse](validation/DE3_69.json)
