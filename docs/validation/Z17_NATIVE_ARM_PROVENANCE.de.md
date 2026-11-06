# Z17: Zuordnung der nativen ARM-Prüfnachweise

Nachtrag vom 6. November 2026. Dieser Nachtrag ergänzt die Nachweiszuordnung; App DE3.62/634, Bootloader Z17 und SoftDevice bleiben unverändert. Dafür ist kein erneutes Flashen erforderlich. Historische Berichte und Archive wurden nicht überschrieben.

## Was im früheren Gesamtpaket fehlte

Im Quell- und Nachweisteil des früheren Gesamtpakets, unter `03_Bootloader_Z17/`, verwies `Pruefung/native-arm-ui.json` auf eine andere ELF-Datei als die dort beigelegte Datei `Build_Nativ/bootloader.out`. Die SHA-256-Werte waren also tatsächlich verschieden. Der ursprüngliche Bericht war kein exakter Prüfnachweis für die beigelegte native ELF-Datei.

Die genau zum ursprünglichen Bericht gehörende ELF-Datei wurde im erhaltenen früheren nativen Build wiedergefunden. Das Ergänzungspaket `Allmiibo_Z17_Nativer_ARM_Nachweis_2026_11_06.zip` enthält sie zusammen mit ihrer Map, dem ursprünglichen Buildbericht und dem unveränderten ARM-Bericht. Zusätzlich wurde die tatsächlich im Gesamtpaket archivierte native ELF-Datei frisch geprüft.

| Zuordnung | SHA-256 der ELF-Datei | Nachweis im Ergänzungspaket |
| --- | --- | --- |
| Historischer nativer Lauf, jetzt exakt zugeordnet | `22b601b8a0254f63445f5278e709d558dc738115c15fde8223f5f665719c7da7` | `01_Historischer_Lauf/native-arm-ui.json` |
| Native ELF aus dem früheren Gesamtpaket | `a63ff7f3768e8243ce4dd05d4db917aaa3b778e1421b02fb5875f71a4add304b` | `02_Archivierter_Nativer_Lauf/archived-native-arm-ui.json` |
| Docker-ELF aus `Quellcode/_build/bootloader.out` | `0945c2847a37ced040a72f59b0a4608ad860fd3bb22fd966322211e1437117f1` | `03_Docker_Referenz/arm-ui.json` und `arm-crypto.json` |

## Was der Binärvergleich belegt

Alle drei ELF-Dateien ergeben denselben 26.612 Byte langen Bootloader-Nutzinhalt mit SHA-256 `5219e8abaab8cd8bd335116f6438dbb85ffe5d6b36467abef266e78b56e2e7cd`. Auch die mit `0xff` auf 28.672 Byte ergänzte Bootregion `0x77000` bis ausschließlich `0x7e000` stimmt überein: `5fec8c8495978afcd340e6b42db7fc9ba4fa9f216aad2b2a597cc7282877d584`.

Die 128 Vektorwörter, der Eintrittspunkt `0x77309`, die UICR-Inhalte und sämtliche mit `SHF_ALLOC` markierten Sektionen stimmen überein. Zwischen den beiden nativen ELF-Dateien sind zudem die vollständigen `PT_LOAD`-Beschreibungen und ihre Dateiinhalte gleich.

Für Docker gilt diese letzte Aussage nicht uneingeschränkt: Das erste Segment bildet auch einen ELF-Dateivorspann vor der Bootregion ab. Darin unterscheiden sich genau zwei Bytes an den physischen Adressen `0x70020` und `0x70021` im ELF-Headerfeld `e_shoff`. Beide liegen außerhalb des exportierten Bootloader-Nutzinhalts. Unterschiede bestehen außerdem in den nicht allozierten Sektionen `.debug_info`, `.debug_line`, `.debug_line_str`, `.debug_macro`, `.debug_str`, `.strtab` und `.symtab`. Daher wäre „nur unterschiedliche Debugpfade“ zu ungenau; auch Symbol- und Zeichenkettenmetadaten unterscheiden sich.

## Frische Prüfung der archivierten nativen ELF-Datei

Der unveränderte ARM-Prüflauf gegen die ELF-Datei `a63ff7f…` bestand mit 44 gezielten Unterbrechungspunkten, vier Negativkontrollen, vier Fällen am Observer-Eintritt und sieben Tastendruckfällen. Die Prüfungen bei voller Ereigniswarteschlange und der abschließenden Anzeigen „Checking“/„Saving“ bestanden ebenfalls. Der neue Bericht nennt den Hash genau dieser geprüften ELF-Datei.

Geprüft wurde der ARM-Maschinencode mit Unicorn 2.0.1 unter Python 3.12.3. MMIO, Hardwarezeit, Bluetooth-Zustellung, Scheduler und SPI sind nachgebildet. Der Lauf ersetzt weder einen Funk-/Displaytest am Gerät noch eine vollständige Prüfung aller denkbaren Zustände. Er erforderte keinen Gerätezugriff und keinen neuen Firmwarebau.

## Quellen und Wiederholung

Das Ergänzungspaket enthält die damaligen drei Buildverzeichnisse mit ELF, Map, Buildbericht und Compilerangabe sowie die zugehörigen finalen Z17-Quellen, Tests, Lizenztexte und das Buildrezept. Der Compiler ist Arm GNU Toolchain 12.2.Rel1, GCC 12.2.1; das SDK-Abbild ist im Rezept mit einem unveränderlichen Digest festgelegt.

Der historische native Buildbericht nennt den älteren Quellenmanifest-Hash `42d5d860170c24d7952b5a337efe9dd15b193fe0d0f66c1a97682961534021fe`. Dieses ältere Manifest liegt dem Nachtrag nicht bei. Es wird nicht durch das finale Manifest ersetzt. Die beiden final archivierten Builds sind an das enthaltene `SOURCE_BINDING.json` mit SHA-256 `ad8a6216eb0a2ce8e67adf5d1ec73e6febc70d3730b6263a6f89ced3926075f6` gebunden; dessen 23 Eingaben wurden erneut auf Übereinstimmung geprüft. Die Übereinstimmung des ausführbaren Nutzinhalts wurde für alle drei ELF-Dateien separat gemessen.

`PRUEFEN.py` überprüft nach dem Entpacken die Dateihashes, Buildberichte, Quellenbindung, Berichtzuordnung, Vektoren und Bootloader-Inhalte. Mit `--arm` wiederholt es zusätzlich den begrenzten ARM-Lauf gegen die archivierte native ELF-Datei. Dafür werden Python 3, Unicorn 2.x und ein GNU-`nm` mit ARM-Unterstützung benötigt. Die Nachweise erlauben eine eigenständige Wiederholung dieser Prüfung; das Paket ist kein DFU-Installationspaket.
