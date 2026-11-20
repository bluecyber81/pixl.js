Allmiibo LCD DE3.94 / App667 – qualifizierte signierte Vorschau
Stand: 20.11.2026

Paket: Allmiibo_LCD_DE3_94_667_NUR_APP.zip
Umfang: 361633 Byte, ausschließlich Anwendung für LCD/ST7567.
Anwendung: 361032 Byte, Firmware 2.22.0-DE3.94, DFU-Zähler 667.

OTA SHA-256:
f00ddc2c86225d86e5c9ef50bad9d45b84250b287a4f3df4d2f169357a9688c4

App-BIN SHA-256:
99aa4dbe6f2bba9771b8b51d9e80cc26b4f38a96ad09ee3391ab13ed5fdf676f

Kompilierte SourceID:
1f5864e1279b7378d3cc685b73d80a3257aad8f6a29db27d1c880800b30c4e90

Die beiden unabhängigen Builds sind BIN/HEX-identisch. Die vollständige
isolierte Suite besteht mit 178/178 Skripten; neun gelinkte ARM-Prüfungen,
SHA256/HMAC sowie die native Signaturprüfung mit drei Manipulationskontrollen
sind bestanden. Auch die tatsächliche Z21-ARM-Prüfung besteht: sieben Signatur-/Hash-/CRC-Fälle
und zwei Init-/Bankannahmefälle (App665 vorhanden beziehungsweise leere Bank).

App667 ergänzt einen bestätigten Verwerfen-Ausgang für die allgemeinen
Einstellungen und behebt die neue AmiiboDB-Sortierblockade des zurückgestellten
App666-Zwischenstands. Weitere betroffene Optionen verwenden denselben
Erneut/Verwerfen/Zurück- und Ja/Nein-Ablauf. Frühere offene Änderungen und
spät geladene gültige Einstellungen bleiben feldweise erhalten.

Automatische PackedFS-Freigabe nach Commit und letztem Leser war bereits in
App665 enthalten. Der effizientere App666-Collector, vorhandene Diagnosen und
Chameleon/NFC-Schutzmechanismen bleiben erhalten. Ein neuer physischer
Bluetooth-Durchsatz oder eine Hardwareabnahme für App667 wird nicht behauptet.

Vorgesehener Systemstand: Nordic S112 7.3.0 / FWID 0x0126 und Z21.
Dieses ZIP ersetzt weder Bootloader noch SoftDevice. Es ist kein OLED-Paket
und kein neues Komplettupdate. Bestehendes PFS1 bleibt formatkompatibel.

Die stabile Freigabe bleibt DE3.89/App662. Das historische App666-OTA bleibt
als zurückgestellter Zwischenstand dokumentiert und wird nicht umbenannt.
Separater neuer Quellenzweig: test/lcd-de394-app667.

Details und Nachweise:
docs/validation/DE3_94.md
docs/validation/DE3_94.json

Nächster Schritt: physische LCD-/Handyprüfung des neuen Pakets. Gerätetests,
insbesondere Fehler→Verwerfen→Ausgang und DFU-Unterbrechung/Wiederaufnahme,
bleiben offen. Ein privater Signierschlüssel ist nicht Bestandteil der Quellen.
