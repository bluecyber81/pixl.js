# Allmiibo seit DE3.10

Die wichtigsten Verbesserungen bis zur LCD-Finalversion DE4.2 / App680 und Dateimanager 3.68.0-beta.3. [English](PROJECT_OVERVIEW.md)

- **Übertragung beschleunigt.** Kleine Figurendateien werden beim Lesen gebündelt. Beim Hochladen in neue Unterordner speichert App680 bis zu vier kleine Dateien zusammen. Im selben Ordner sank die Lesezeit für 26 kleine BINs von 20,85 auf 10,29 Sekunden.
- **Bluetooth-Fernbedienung eingebaut.** Das Gerätemenü lässt sich am Handy oder PC bedienen. Das Displayfoto kann man direkt ansehen, drehen und als PNG speichern.
- **Figuren leichter finden.** Bilder, Suche über mehrere Ordner, Spielfilter, QR-Codes und deutsche wie englische Spielhinweise ergänzen den Katalog. Er umfasst 956 Figuren-IDs.
- **Letzte Figur wiederfinden.** Nach „Zurück zur Liste“ bleibt die benutzte Figur markiert. Mit „App fortsetzen“ geht es nach dem Aufwachen an derselben Stelle weiter.
- **Backups und Wiederherstellung erweitert.** Ordner lassen sich als ZIP mit ihren Dateieigenschaften sichern, fortsetzen, vergleichen und wiederherstellen. Eine frühere ZIP beschleunigt Folgesicherungen, wenn viele kleine Dateien unverändert sind.
- **Speicher und Stabilität verbessert.** Packed LittleFS verwaltet Sammlungen mit vielen kleinen Dateien. Für den Umstieg von SPIFFS gibt es einen Assistenten mit Sicherung und Datenvergleich. Fehler beim Speichern von Einstellungen, NFC-Daten und Kartensteckplätzen wurden behoben.
- **Anzeige und Bedienung verbessert.** Dazu gehören eine besser lesbare Akkuanzeige, ein Akkuverlauf im Browser, automatisches Abdimmen am LCD, gedrehte Spiele und ein Display- und Tastentest.
- **Bilder, Clips und Lauftext ergänzt.** Eigene Bilder, kurze Clips und Text lassen sich vom Handy oder PC ans LCD senden. Bei „Switch 2 wecken“ kann man eine gespeicherte Kopplung entfernen.
- **Updates und Diagnose verbessert.** Der Dateimanager erkennt passende Pakete und zeigt Firmware, Bootloader und Verbindungsdaten. Die signierte LCD-App lässt sich am Handy oder im Browser flashen. Auf einem LCD dauerte die Übertragung unter Windows 50,2 Sekunden bis zur letzten Bestätigung.
- **Dateimanager und OLED-Unterstützung ausgebaut.** Den Dateimanager gibt es online und als Windows-Portable. Für das dreitastige OLED gibt es eigene Firmware, Anleitungen und einen eigenen Updateweg. Die aktuelle Finalfreigabe gilt für LCD.

Wer bereits **DE4.2-b2 / App680** auf dem LCD sieht, hat die Finalversion installiert. Beide Pakete enthalten dieselbe signierte App. [Finalrelease und Handy-ZIP](https://github.com/bluecyber81/pixl.js/releases/tag/de4.2) · [Dateimanager](https://bluecyber81.github.io/pixl.js/) · [Frühere Änderungen im Detail](DEVELOPMENT_HISTORY.de.md) · [Gemessene Übertragungszeiten](https://github.com/bluecyber81/pixl.js/releases/tag/web3.66.2)
