# Geräteprüfung mit DE3.66 am 7. November 2026

Geprüft wurde ein LCD-Allmiibo mit DE3.66 (App638), Bootloader Z19, Nordic S112 7.3.0 und eingerichtetem Packed LittleFS PFS1.

| Prüfung | Beobachtung |
| --- | --- |
| Auslesung über Bluetooth am Windows-Laptop | Der Bootbereich stimmt mit dem Z19-Referenzhash überein. Die Prüfsumme der Boot-Einstellungen ist gültig. Laufwerk E war eingebunden. |
| Start und RAM | Vom Beginn der Speicherinitialisierung bis zum ersten Durchlauf der Ereignisverarbeitung vergingen 2.252 ms, davon 2.083 ms im Speicherscan. Der Heap hatte beim Auslesen 10.668 Byte frei. Die Startmessung beginnt nach dem Bootloader. |
| Displayfoto | Acht Teilbilder ergaben ein 128 × 64 Pixel großes Bild mit passender Gesamtprüfsumme. Der Nutzer bestätigte am Display „BLE Dateitransfer“ und „Dateisitzung aktiv“. |
| Unterbrochene Sicherung | Nach der ersten von zwei 540-Byte-Dateien wurde die Bluetooth-Verbindung getrennt. Nach der Wiederverbindung prüfte das Sicherungsmodul von Web 3.40.0 die erste Datei und verwendete sie erneut. Die zweite Datei wurde frisch gelesen. ZIP-Prüfsummen, Inhalte und SHA-256 stimmten mit der Referenz überein. Der Test las ausschließlich vom Gerät. |
| Bedienung und NFC | Der Nutzer bestätigte funktionierenden Tastendruck, Display und Menü sowie die NFC-Erkennung an seiner Switch. |

Der Nutzer bestätigte zusätzlich eine unterbrochene Ordnersicherung auf einem Android-Handy. Im selben Chrome-Tab verband er dasselbe Allmiibo erneut, setzte die Sicherung fort und speicherte die fertige ZIP. Die genaue Webversion dieses Handytests wurde nicht erfasst. Der unabhängige bytegenaue Vergleich mit der Referenz-ZIP erfolgte beim Windows-Test.

[Build- und Paketprüfung](DE3_66.json)
