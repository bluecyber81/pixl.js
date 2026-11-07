# Allmiibo Dateimanager 3.39.4

Im Bereich **Dateien** nennt der Dateimanager beim Abgleich denselben Zielnamen in verschiedenen Schreibweisen, ungeeignete Namen und die entsprechende Unicode-Normalform. Die Meldungen erscheinen auf Deutsch und Englisch. Der Vergleich erkennt diese Probleme vor dem Zugriff auf die Datei.

Unter **Figurenkatalog → Details und Bild** gibt es für alle 54 englischen Nutzungshinweise deutsche Texte. Das betrifft 63 Zuordnungen. Der Katalog umfasst 952 Figuren und 1.344 Zuordnungen. Eine Spielzuordnung allein bestätigt weder eine bestimmte Belohnung noch einen Praxistest.

Unter **Update → DFU-Seite** kann der Browser während der Übertragung den Bildschirm wach halten. Die Seite zeigt an, wenn das Betriebssystem dies ablehnt. Lass den Tab während des Updates im Vordergrund. Nach einer Unterbrechung wählst du dieselbe ZIP und dasselbe Gerät erneut. Der Bootloader meldet seine Position und Prüfsumme.

Der eingebaute Download ist DE3.63/635 für Allmiibo LCD mit Packed LittleFS und S112 7.3.0. Der Bereich **Update → Testversion DE3.65** bietet zusätzlich die separat herunterladbare App DE3.65/637 an. Wähle sie auf der DFU-Seite ausdrücklich als eigene ZIP aus. Sie enthält nur die Anwendung; ihr Praxistest auf dem Gerät steht aus. [Firmware-Testversion DE3.65](https://github.com/bluecyber81/pixl.js/releases/tag/de3.65)

Der Diagnosevergleich kennt Z19 anhand des Bereichs-Hashes und des Zählers 19. Er ordnet DE3.64/636 und DE3.65/637 anhand von Versionsmeldung und Zähler mit gültiger Settings-Prüfsumme ein. Für eine unterbrochene Ordnersicherung zeigt die Oberfläche an, welche Daten noch im Arbeitsspeicher des geöffneten Tabs liegen.

Die automatisierten Prüfungen verwenden die beiden fertigen Webversionen für den lokalen Server und den GitHub-Pages-Pfad. Chrome prüft die Oberfläche in Desktop- und Handygröße; Bluetooth und Bildschirm-Wachhaltung sind im Test nachgebildet. Der Wiederaufnahmetest deckt einen verlorenen Empfangsbeleg über eine 4.096-Byte-Objektgrenze ab. [Prüfwerte dieser Ausgabe](validation/WEB3_39_4.json)

[Online-Dateimanager](https://bluecyber81.github.io/pixl.js/) · [Windows- und Quellpakete](https://github.com/bluecyber81/pixl.js/releases/tag/web3.39.4)
