# Allmiibo LCD DE3.75 / App648

## Installation

DE3.75 ist die stabile Geräte-App für das kompatible Allmiibo LCD mit eingerichtetem Packed LittleFS PFS1, Bootloader Z19 und Nordic S112 7.3.0 (FWID 0x0126). Die signierte App648 der bisherigen Testausgabe und der Finalausgabe ist bytegleich. Wer die signierte App648-Test-ZIP bereits installiert hat, kann diese weiterverwenden. Für den Dateimanager 3.52.1 genügt es, die Website neu zu laden. [App-ZIP fürs Handy](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_LCD_DE3_75_648_NUR_APP.zip) · [Installationswege](INSTALLATION.md) · [Dateimanager](https://bluecyber81.github.io/pixl.js/)

Für unterstützte LCD-Geräte mit Bootloaderzähler unter 19 gibt es eine separate Android-ZIP. Prüfe vorher Platine, Speicherlayout, DFU-Schlüssel und S112-Kennung anhand der Installationsanleitung. In nRF Device Firmware Update installiert die erste Phase S112 7.3.0 und Z19, die zweite App648. Der Größen- und Signaturtest sowie die Prüfung der App648-Annahme durch Z19 liefen am Rechner. Für eine vollständige Übertragung dieses Kombipakets am Gerät steht der Praxistest aus. [Android-Kombi herunterladen](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_LCD_S112_7_3_0_Z19_DE3_75_648_KOMPLETT.zip) · [Voraussetzungen und Speicherumstellung](INSTALLATION.md)

## Änderungen gegenüber DE3.74

- Wechselt die Fernbedienung erfolgreich zur Dateiübertragung, gibt die App den 1.024-Byte-Puffer eines begonnenen Displayfotos frei. Bei einer ausstehenden oder abgelehnten Übergabe bleibt das Foto für einen erneuten Versuch verfügbar.
- Die App verwendet die kompakteren AES-Tabellen. Der Katalog enthält 954 Figuren, darunter Kirby mit Schwert und Dedede Noir. Insgesamt ist die App-BIN 6.156 Byte kleiner als bei App647. Die Flashreserve beträgt 14.432 Byte.

## Nachweise

Das Prüfarchiv für die unabhängige Prüfung enthält die zugehörigen Quellen und Buildartefakte. [ChatGPT-Prüfpaket für DE3.75 / App648, Z19 und Web 3.52.1](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_DE3_75_App648_Z19_Web3_52_1_ChatGPT_Pruefpaket.zip)

Zwei Neubauten lieferten dieselben BIN- und HEX-Dateien wie der App648-Prüfstand. Die signierte ZIP umfasst 246.554 Byte, die enthaltene BIN 358.304 Byte.

| Artefakt | SHA-256 |
| --- | --- |
| Signierte ZIP | `603d99133331fdb425647e27106b043f9f7f3347e889475153bfe7e828f1dafd` |
| Android-Kombi, 338.815 Byte | `b52bd3511e4ab3ff3f4dddff6af029ff56f1124a1f2e28b3eff7748df125ad96` |
| App-BIN | `3593cfc6e2dfc517a14e76f1802adf580148818cb41ba86a5739fc3c9ca41867` |
| Source-ID | `9bc7578a46f27d54088ddd222198ce582f9cc3fdcf45a8e9a7da6d596b47c62c` |

Ein Besitzer prüfte mit DE3.75 auf seinem LCD die Rückkehr zur markierten Figur und das Aufwachen mit derselben aktiven Figur. Beides klappte im Datei-Emulator und in der Amiibo-Datenbank. Der Export stammt aus Dateimanager 3.52.0. Die Gerätesprache war Deutsch, „App fortsetzen“ war eingeschaltet, die Animationseinstellung blieb offen. Separat bestätigte der Besitzer, dass die Switch eine bekannte Figur erkannte. Für einen NFC-Dauertest, die Spielscans von Dragoon und Hydra, die weiteren Einstellungskombinationen und einen physischen DFU-Abbruch mit Wiederaufnahme stehen eigene Nachweise aus. [Geräteprüfung](validation/DE3_75_LCD_CHECK.json)

Bei einem Start vergingen vom Beginn der Speicherinitialisierung bis zur ersten Ereignisverarbeitung 2.197 ms. Der Speicherscan dauerte 2.036 ms mit 3.966 Lesezugriffen und null Lesefehlern. Bootloader und früher SDK-Start liegen vor diesen Messpunkten. [Startmessung](validation/DE3_75_LCD_CHECK.json)

## English

DE3.75 / App648 is the stable application for compatible LCD units with PFS1, Z19 and S112 7.3.0. The final package contains the same signed bytes as the App648 test package. If App648 is installed, no additional firmware update is needed. This application releases the display-photo buffer after a successful handoff to file transfer, uses smaller AES tables and includes 954 figure names. On one LCD, the owner verified list return and wake in both apps with German selected and resume enabled. The Switch also recognized one known figure. The animation setting was unrecorded. The four observations were exported with file manager 3.52.0. [Installation guide](https://bluecyber81.github.io/pixl.js/guide/en.html) · [Device check](validation/DE3_75_LCD_CHECK.json)

For qualified LCD devices with an older bootloader, the Android package installs S112 7.3.0 and Z19 first, then App648. Check hardware, key, counters and storage requirements before selecting the ZIP. [Two-stage Android package](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_LCD_S112_7_3_0_Z19_DE3_75_648_KOMPLETT.zip) · [Prerequisites](INSTALLATION.md)
