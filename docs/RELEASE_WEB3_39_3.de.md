# Dateimanager 3.39.3

## Firmwareupdate abschließen

Unter **Update** bestätigt die DFU-Seite die Übertragung, sobald der Bootloader den Abschluss quittiert. Danach zeigt sie die beobachtete Trennung oder meldet, dass der Browser die Trennung angefordert hat. Der tatsächliche Neustart lässt sich am Hauptmenü erkennen. Die installierte Version kannst du nach dem erneuten Verbinden unter **Gerät & Diagnose** lesen.

Bricht die Verbindung vorher ab, wähle dasselbe Anwendungspaket und Gerät erneut. Der Übertragungsstand wird anhand der vom Gerät gemeldeten Position und Prüfsumme abgeglichen. Je nach gespeichertem Stand müssen Daten erneut übertragen werden.

## Lange Namen und Pfade kürzen

Beim Hochladen, Synchronisieren von Ordnern und Umbenennen zeigt die Meldung den betroffenen Namen oder Gerätepfad, die benötigte Bytezahl und die Grenze. Für einen neuen Namen sind 47 UTF-8-Bytes verfügbar. Beim Gerätepfad zählen bis zu 63 Bytes einschließlich des ersten Schrägstrichs nach dem Laufwerksbuchstaben. Ein Umlaut wie „ü“ belegt zwei Bytes. Bei einem zu langen Pfad kannst du auch einen Ordnernamen kürzen oder einen kürzeren Zielordner wählen.

## Version öffnen

Die Browser-Software-Version steht oben im Dateimanager. Eine laufende Übertragung bitte beenden, bevor du die Seite neu lädst. Für diese beiden Korrekturen genügt das Webupdate. Die DFU-Seite bietet weiterhin die separate LCD-Anwendung DE3.63 / 635 an. [Online-Dateimanager](https://bluecyber81.github.io/pixl.js/) · [Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.39.3) · [Prüfnachweise](validation/WEB3_39_3.json)
