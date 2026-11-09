# LCD-Testversion DE3.68 / App640

Beim normalen Beenden einer Vordergrund-App kehrt die Auswahl im Hauptmenü zu deren Symbol zurück. Nach einem Kaltstart oder bei einer ausgeblendeten App ist das erste verfügbare Symbol ausgewählt. Ein Hintergrunddienst ändert die Auswahl nicht. Der Launcher verwendet die App-ID im RAM. Diese Änderung schreibt beim App-Wechsel nichts in den Flash.

Auf DE3.67 konnte das Aufwachen aus dem Tiefschlaf bereits eine aktive App wieder öffnen. Das normale Verlassen einer App über das Menü baute das Karussell jedoch mit Fokus auf Position null neu auf.

Für ein LCD-Allmiibo mit eingerichteter Packed-LittleFS-Installation, passendem Bootloader und S112 7.3.0 die [App-ZIP laden](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_68_640_NUR_APP.zip). Bei einem vorhandenen Z19 genügt die App. Im [Web-Updater](https://bluecyber81.github.io/pixl.js/dfu/web.html?package=de3.68-lcd-app) ist DE3.68 als Testversion gekennzeichnet.

**Praxistest am LCD**. Im Hauptmenü den Kartenemulator öffnen, normal beenden und prüfen, ob dessen Symbol ausgewählt bleibt. Anschließend eine zweite App öffnen und wieder verlassen. Der Build, die DFU-Signatur und der Menüwechsel wurden am Rechner geprüft. Der Test am physischen LCD steht aus.

[Quellbau](BUILD_DE3_68.md) · [Prüfergebnisse](validation/DE3_68.json)
