# LCD-Testversion DE3.67 / 639

Die Datenbank zeigt jetzt alle **54 verschiedenen Spielhinweise auf Deutsch**, verteilt auf 63 vorhandene Zuordnungen von Figuren zu Spielen. Bei manchen langen Hinweisen endete der Scrollbalken einen Pixel vor dem unteren Rand; auch das ist korrigiert. Die Katalog-IDs, die Spielzuordnungen und das Speicherformat sind unverändert.

**[App-Update für Android herunterladen](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_67_639_NUR_APP.zip)** · [Alternative: GitHub Release](https://github.com/bluecyber81/pixl.js/releases/tag/de3.67)

Das Paket ist für das LCD-Gerät mit bereits eingerichtetem Packed LittleFS (PFS1) gedacht. Den Dateimanager trennen, am Allmiibo **Firmware flashen** wählen und in der Android-App **nRF Device Firmware Update** die unveränderte ZIP sowie das eigene Gerät **pixl dfu** auswählen. Nach dem Neustart sollte **2.22.0-DE3.67** angezeigt werden. Das Paket aktualisiert ausschließlich die Anwendung. Ein neues Einrichten oder Wiederherstellen von E: ist nicht nötig.

**Praxistest:** In der Amiibo-Datenbank unter **Metroid Prime 4: Beyond** die Figur **Samus & Vi-O-La** öffnen. Der deutsche Text beginnt mit „Farbe von Vi-O-La ändern“. Bis zum Ende scrollen und die letzte Zeile sowie den unteren Anschlag des Balkens ansehen. In der Figurenübersicht bei eingeschaltetem QR-Code mit der Handykamera scannen und das Ergebnis mit der ausgewählten Figur vergleichen.

Prüfung vor dem Flashen: Release-Neubau und signierter Programminhalt stimmen bytegenau überein. Die Z19-Signaturprüfung und der Wechsel von 638 auf 639 wurden offline mit dem gebundenen Bootloader geprüft. 149 Firmware-Testskripte bestanden. Der echte Renderer lieferte 822 Testbilder; für 585 wurden die vollständigen QR-Pixel verglichen. Deutsche Spielhinweise und QR-Code wurden an einem LCD-Allmiibo mit DE3.67, Z19 und S112 7.3.0 bestätigt. Die Bluetooth-Leseprüfung vom 8. November 2026 ergab App-Zähler 639, eine passende Bootloader-Prüfsumme und nach drei Dateilesungen 4.968 Byte gemessene Stackreserve. Der untere Anschlag des Scrollbalkens wurde für diesen Stand am Rechner geprüft.

- Paket: **364.719 Byte**, SHA-256 `014ecc5cee9c01014c89c021fc22400a94d2e7e517134f4b3e3f06c004738e14`.
- Programm: **364.116 Byte**, SHA-256 `db1ec1258c05aacf6fcdea83d29ea5962424d50c56d28b6c7b249a7f0766a236`.
- Unverändert: Bootloader Z19, SoftDevice S112 und vorhandene Sammlung. DE3.65/637 bleibt das stabile LCD-Angebot. Nicht für OLED.

[Reproduzierbarer Build](BUILD_DE3_67.md) · [Maschinenlesbare Prüfergebnisse](validation/DE3_67.json)
