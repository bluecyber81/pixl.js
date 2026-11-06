# Dateimanager 3.38.1: Fehlerhinweis bei der Laufwerksauswahl

Scheiterte unter „Sicherung“ das Öffnen von E:/, lud der Dateimanager anschließend die Laufwerksauswahl neu. Eine erfolgreiche Rückkehr löschte den gemeinsamen Listenfehler und damit auch den gerade benötigten Hinweis. Ein eigener Zustand erhält diesen Hinweis jetzt. Beim erneuten Öffnen und bei einem Verbindungswechsel wird er passend zurückgesetzt. Die Ordnersicherung startet dadurch nicht automatisch.

Der ursprüngliche Browser-Ersatz für die Laufwerksaktualisierung hatte die Rücksetzung des Listenfehlers ausgelassen. Deshalb erkannte er diese Regression nicht. Der korrigierte Runner scheitert am unveränderten 3.38.0-Build genau am fehlenden Fehlerhinweis und besteht am korrigierten Kandidaten. Zusätzlich wurden die tatsächlichen Methodenabläufe, Komponenten und beiden Produktionsbuilds geprüft. Das ist keine reale Bluetooth-Prüfung.

## Stand der übernommenen Fortsetzung

Die eingereichte Übergabe `Allmiibo_DE3_62_Z17_Web3_38_0_CODEX_Integrationsstand_2026_11_06.zip` hat SHA-256 `f9685dc28fff4bbac2286b03fd5ce4f1cb5c2f836978aa8594fcbd84128a8269`. Alle 60 Übergabedateien und alle 2.188 rekonstruierten Quelldateien stimmten mit ihren Manifesten überein. Sie veränderte fünf Quelldateien sowie zwei Paketdokumentationen. Der hier veröffentlichte Stand ergänzt die echte Browserversionskennung 3.38.1 und passende Releasehinweise.

Der Kartenpuffertest führte die NTAG-Prüfung bereits aus, zählte sie jedoch nicht mit. Die Zählung lautet jetzt 5.150 statt 4.700 Assertions. Dieselbe Matrix bestand nativ, unter ARM32 sowie mit ASan/UBSan und aktiviertem LeakSanitizer. Diese Ausführungsarten werden nicht zu einer größeren Zahl unterschiedlicher Fälle addiert.

Die Z17-README beschreibt nun die bereits vorhandenen Z17-/Z18-Pakete korrekt. Z18 enthält unveränderten Z15-Code mit höherem Zähler und ist ein Rückkehrpaket. Die SDK-Anleitung im ergänzenden Prüfarchiv nennt den richtigen S112-Vendorpfad. Originalarchive und ihre Inventare bleiben als historische Nachweise unverändert.

Das zum zusätzlichen nativen ARM-Bericht gehörende ELF wurde lokal wiedergefunden und mitsamt Map, Buildbericht und Originalbericht gesichert. Ein neuer begrenzter ARM-Lauf prüfte außerdem das tatsächlich im früheren ZIP enthaltene native ELF. [Exakte Zuordnung und Binärvergleich](validation/Z17_NATIVE_ARM_PROVENANCE.de.md).

## Prüfung und Grenzen

Der integrierte 3.38.0-Kandidat bestand 180 Komponentenprüfungen, je 21 Produktionsprüfungen für Root und Pages sowie je 57 Browserprüfungen mit 28 Screenshots. Die Gegenprobe mit unverändertem Original reproduzierte den Fehler. Der finale 3.38.1-Stand hat eigene erneute Build-/Browsernachweise im [Prüfmanifest](validation/WEB3_38_1.json); die früheren Resultate werden nicht als neuer Versionslauf ausgegeben.

Die lokalen Browserprüfungen verwenden vorhandene, mit dem Lockfile abgeglichene Abhängigkeiten und simulierte Geräteantworten. Die protokollierten direkten Node/Vite-/Postbuild-Befehle sind vom eingereichten Python-Helfer zu unterscheiden. Dessen unveränderter Aufruf wird nicht nachträglich als erfolgreich ausgegeben. Eine komplette neue Transport-/Fuzzkampagne ist nicht Teil dieses Korrekturlaufs.

Die 696 App-Produktionsinputs und die 23 gebundenen Bootloader-Eingänge sind unverändert. App634/DE3.62, Z17, S112 7.3.0 und die Speicherformate benötigen hierfür kein neues Flashpaket. Startkennung und echtes Probenalter bleiben Entwurf (G); reale Gerätequalifikation bleibt offen (H). Andere Komfortideen aus der Übergabe sind weiterhin Vorschläge.

## Anwenden

Die [Online-Seite](https://bluecyber81.github.io/pixl.js/) nach Abschluss laufender Übertragungen neu laden. Oben muss „Browser-Software 3.38.1“ stehen. Bei einem fehlgeschlagenen Öffnen unter „Sicherung“ bleibt nun der Hinweis sichtbar und „Laufwerk E: öffnen“ bietet einen erneuten Versuch. Die Firmware des Geräts wird durch diesen Browserwechsel nicht geändert.
