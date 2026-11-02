# Allmiibo-Dateimanager im Browser

**[Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/)** ·
[Firmware übertragen](https://bluecyber81.github.io/pixl.js/dfu/web.html) ·
[Downloadpakete und Quellen](https://github.com/bluecyber81/pixl.js/releases/tag/web3.32.5)

## Verbinden

1. Die Webseite in Chrome auf Android oder einem unterstützten Computer öffnen.
2. Am eigenen Allmiibo „Bluetooth-Dateiübertragung“ öffnen. Andere Verbindungen
   zu nRF, AmiLoop oder einem weiteren Dateimanager vorher trennen.
3. „Verbinden“ anklicken und das eigene Gerät im Browser auswählen.

Das Allmiibo muss sich beim verwendeten Handy oder Computer befinden. Die
Webseite verbindet sich über dessen Bluetooth; sie macht kein entferntes
Allmiibo über das Internet erreichbar. Der Laptop zu Hause kann ausgeschaltet
bleiben. Die Vorschau und der Figurenkatalog lassen sich ohne Gerät ansehen.

## Funktionen und Daten

Dateien und Ordner, Bilder und Figureninfos, Suche, ZIP-Sicherung und Import,
Diagnose, Fernbedienung sowie die DFU-Seite bleiben erhalten. Einzelne
Gerätefunktionen setzen eine passende Firmware und deren gemeldete Fähigkeiten
voraus. Der Dateimanager zeigt fehlende oder unbestätigte Werte entsprechend an.

Sicherungen und Figurendateien werden lokal im Browser verarbeitet und direkt
zwischen dem gewählten Gerät und dem verwendeten Handy/Computer übertragen.
Die Webseite lädt sie nicht zu GitHub hoch. Browser-Zwischenspeicher ist keine
dauerhafte Sicherung; benötigte ZIP-Dateien ausdrücklich herunterladen.
Die GitHub-Webadresse hat ihren eigenen Browser-Speicher. Eine unter localhost
begonnene Wiederherstellung wird daher nicht automatisch im Online-Tab fortgesetzt.
Eine laufende Übertragung zuerst abschließen; anschließend bei Bedarf dieselbe
gespeicherte Sicherungs-ZIP auf der Online-Seite erneut auswählen.

GitHub erhält die üblichen Abrufe der Webseite. Figurenbilder werden anhand
öffentlicher Figuren-IDs geladen. Persönliche UID, lokale Dateinamen und
Figurendateiinhalte sind dafür nicht erforderlich.

## Firmware-Update

Der Dateimanager kann ohne erneutes Flashen verwendet werden. Die angebotene
`Allmiibo_LCD_DE3_55_627_TESTSTAND.zip` ist ausschließlich die Anwendung für
das passende LCD-/PFS1-Gerät mit BL8 und S112 7.3.0. Sie enthält weder Bootloader
noch SoftDevice, Sammlung oder einen PC-Bluetooth-Treiber. Es ist keine neue
Formatierung erforderlich. Für andere Platinen oder SPIFFS/gewöhnliches
Upstream-LittleFS gilt das Paket nicht als kompatibel.

Die DFU-Seite prüft die Identität des mitgelieferten Pakets. Geräteauswahl und
Übertragung bleiben eine bewusste Benutzeraktion. Ein erfolgreicher Download
oder eine passende Prüfsumme beweist keine Hardwarekompatibilität.

Die zugehörigen DE3.55-Quellen stehen als `Allmiibo_DE3_55_Quellcode.zip` in der
verlinkten Veröffentlichung bereit. Der unveränderte Firmwarebaum `fw/` dieses
Repositorys beschreibt noch DE3.37. `RELEASE_INFO.json` dokumentiert ebenfalls
diese historische Firmwareveröffentlichung und ist keine Online-Versionsabfrage.

## Veröffentlichung und Rückkehr

Der Zweig `gh-pages` enthält ausschließlich die fertigen öffentlichen Webdateien,
deren Lizenzhinweise und das ausdrücklich angebotene Anwendungspaket. GitHub
Pages veröffentlicht diesen Zweig unter `/pixl.js/` mit HTTPS. Der aktuelle
Webquellcode steht unter `web/` im Hauptzweig und als separates Release-Archiv.
Die festgelegte Lockdatei bleibt für reproduzierbare Abhängigkeiten maßgeblich.

Die portable Ausgabe bleibt verfügbar und verwendet weiterhin einen lokalen
Server. Eine Änderung der Webseite aktualisiert keine Gerätefirmware automatisch.
Ältere Website-Commits und veröffentlichte Pakete bleiben über GitHub erreichbar.

## Prüfgrenzen

Die Veröffentlichung wird mit Quelltests, fertigen Root- und Unterpfad-Builds,
WASM-/Paketidentitäten und HTTP-/Browserprüfungen kontrolliert. Bluetooth und
NFC benötigen darüber hinaus ein reales Gerät. Die Webadresse ist keine Zusage,
dass jeder Browser, jede Platine oder jede Gerätefirmware unterstützt wird.
