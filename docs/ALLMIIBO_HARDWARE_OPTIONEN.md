# Hardwarevarianten und Testmöglichkeiten

Stand 9. November 2026. Die LCD-App ist für das Allmiibo mit nRF52832 und Packed LittleFS PFS1 gebaut.

| Projekt | Verwendung | Was gesondert geprüft werden muss |
| --- | --- | --- |
| [Vier-Tasten-OLED](https://github.com/solosky/pixl.js/pull/466) | Platinenentwurf, Stückliste, separate Zurück-Taste | Eigene Variante für Pinbelegung, Displayausrichtung in App und Bootloader, NFC, Aufwachen und DFU auf genau der Platine. |
| [Odiin](https://github.com/cmdwtf/Odiin) und [Biifröst](https://github.com/cmdwtf/Biifrost) | Prototyp mit nRF52840, Farbdisplay, microSD und USB-Dateizugriff | Eigener Hardware- und Firmwarestand. Der nRF52840, das ILI9341-Display und die SD-Karte benötigen andere Treiber. |
| [Nordic nRF52 DK](https://www.nordicsemi.com/Products/Development-hardware/nRF52-DK) | nRF52832, NFC-Antenne und J-Link für Schlaf-, NFC- und Debugtests | Das DK hat eine eigene Pinbelegung. Display und Flash des LCD-Geräts müssen gesondert berücksichtigt werden. |
| [Nordic PPK2](https://www.nordicsemi.com/Products/Development-hardware/Power-Profiler-Kit-2) | Stromaufnahme bei Start, Bluetooth und Tiefschlaf messen | Erfordert einen geeigneten Messaufbau am Testgerät. Die Spannungsanzeige im Dateimanager liefert keine Strommessung. |
