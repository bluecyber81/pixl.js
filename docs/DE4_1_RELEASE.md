# Allmiibo LCD DE4.1 / App678

Die reguläre LCD-Version übernimmt das Weckprofil aus App677 samt bestätigtem Löschen und erneutem Speichern nach Fehlern. Bildempfang, Player und der mobile Lauftext sind verfügbar. Dateimanager 3.66.1 unterstützt die neue Versionsnummer auch bei Diagnose und Dateizugriff. Die signierte Handy-ZIP aktualisiert die Anwendung auf einem LCD mit PFS1, Z21 und S112 7.3.0. Die Gerätebestätigung vom 24. November gilt für den Vorgänger App677. [Handy-ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de4.1/Allmiibo_LCD_DE4_1_678_NUR_APP.zip) · [Prüfergebnisse](validation/DE4_1.json) · [Prüfpaket](https://github.com/bluecyber81/pixl.js/releases/download/de4.1/Allmiibo_LCD_DE4_1_App678_Pruefpaket.zip)

The regular LCD release includes App677’s confirmed wake-profile removal and retryable settings saves. Image reception, the animation player and phone scrolling text are available. File manager 3.66.1 recognizes the new firmware series in diagnostics and file operations. The signed phone ZIP updates the application on an LCD with PFS1, Z21 and S112 7.3.0. The 24 November owner report applies to the previous App677. [Phone ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de4.1/Allmiibo_LCD_DE4_1_678_NUR_APP.zip) · [Qualification](validation/DE4_1.json) · [Verification kit](https://github.com/bluecyber81/pixl.js/releases/download/de4.1/Allmiibo_LCD_DE4_1_App678_Pruefpaket.zip)

[App677 hardware report](https://github.com/bluecyber81/pixl.js/releases/tag/de3.104-lcd-test1) · [App678 storage profile](validation/DE4_1_PFS.json) · [Sources](https://github.com/bluecyber81/pixl.js/tree/2437a3a4cf15afbc108ae66b28cec03f29da8602/fw)

## Buildkennung am Gerät / Device build identity

Im Geräteinfo-Menü kann „Dirty [1]“ erscheinen. Der eingefrorene Releaseheader trägt für den Git-Arbeitsstand „unbekannt“. Zum Zuordnen des Builds nutze im Dateimanager die LCD-Kennung, App-Zähler 678 und die kompilierte SourceID. Die Prüfsumme der heruntergeladenen App steht im Release.

The legacy device-info screen can display “Dirty [1]” when Git worktree status was unavailable in the frozen build header. Use the LCD board, counter 678 and compiled SourceID in diagnostics to identify this build. The release lists the download digest.
