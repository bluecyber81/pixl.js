# LCD DE3.71t1 / App644 und Dateimanager 3.48.0

Die stabile LCD-Anwendung ist DE3.65/637. DE3.71t1/644 ist die signierte Testversion für LCD/nRF52832 mit passender DFU-Schlüsselbindung und eingerichtetem Packed LittleFS PFS1. Der verwendete Geräteaufbau umfasst Z19 und S112 7.3.0. Das App-Update enthält ausschließlich die Anwendung. [Handy-Download](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_DE3_71t1_App644_NUR_APP_SIGNIERT.zip) · [Installationsanleitung](https://bluecyber81.github.io/pixl.js/guide/) · [Nachbau](BUILD_DE3_71T1.md)

## Figuren, Eingabe und Schlafmodus

Im aktiven Amiibo öffnet die mittlere Taste das Detailmenü. „Zurück zur Liste“ führt aus der Detailansicht zurück. Lange Notizen lassen sich scrollen. Beim Wechsel der Ansicht verwirft die Firmware alte Tastenereignisse. Der Dateiemulator merkt sich beim Einschlafen die übergeordnete Ansicht samt Auswahl. Die Datenbank stellt unter anderem bestätigte Suche, Favoriten und Slot-Auswahl wieder her. Temporäre UIDs und noch unbestätigter Text werden dabei nicht gespeichert. Im Katalog wurden die Schreibweisen Cyrus, Frita und Jeremiah berichtigt.

## Was am Gerät geprüft wurde

Ein Nutzer bestätigte den Flash, den Windows-Direktstart und für die ausprobierten Wege in beiden Apps den Rückweg zur richtigen Figur nach Listenrückkehr und Schlafen/Aufwachen. Ein verbundener Export mit Web 3.47.0-T1 meldete App644, Z19 und S112 7.3.0. Alle neun Diagnoseabschnitte lagen vor. Der gemessene Abschnitt vom Beginn der Speicherinitialisierung bis zur ersten Ereignisverarbeitung dauerte 2385 ms. Der Speicher war nach 2194 ms eingebunden. Der Export umfasste nur eine RAM-Probe. NFC-Schreibvorgänge mit temporärer UID, Android-Wiederaufnahme nach Browserneustart und kontrollierte Stromunterbrechungen während der Wiederherstellung bleiben gesonderte Prüfungen.

## Zwei Listenpfade mit abweichender Auswahl in App644

Zwei gezielte Versuche mit dem C-Code der ausgelieferten Anwendung zeigten eine Abweichung. In der Amiibo-Datenbank führte der Rückweg von Datenplatz 03 zum ersten Platz der Liste. In einer Spielliste blieb Figur A markiert, wenn im Detail zu Figur B gewechselt und dann die Liste geöffnet wurde. Beide Befunde stammen vom Rechner. Sie ergänzen den Gerätetest auf den vom Nutzer ausprobierten Wegen. Die veröffentlichte App644 enthält diesen Fehler. Den Stand der Folgekorrektur zeigt der [Entwicklungszweig](https://github.com/bluecyber81/pixl.js/tree/fix/amiidb-list-selection-after-detail).

## Vue und Gerätediagnose

Der Webclient wechselte am 22. Oktober von Vue 2, Element UI und webpack auf Vue 3, Element Plus und Vite. Der Dateimanager 3.48.0 verwendet Vue 3.5.44 und vue-i18n 11.4.17. [Quellstand der Umstellung](https://github.com/bluecyber81/pixl.js/commit/ec9c7f8ebd06ba449c0f8811c5c3b6dcfdcaa7bd)

Die Menüdiagnose PXMI v2 erfasst den ersten Start einer App aus dem Hauptmenü sowie die zuletzt beobachtete Rückkehr. Zwei gespeicherte vollständige Diagnose-JSONs lassen sich ohne Bluetooth vergleichen, auch auf einem anderen Rechner. Zu sehen sind beispielsweise die gewählte App, die Aufrufdauer und verworfene Tastenereignisse. Bei älteren Geräten mit PXMI v1 zeigt der Manager weiter die verfügbaren Werte an. Eine fehlende Rückkehrbeobachtung bleibt offen. Der SHA-256-Wert aus dem Firmwarepaket ist im Export ausdrücklich als Referenz gekennzeichnet.

## Was der Dateimanager ergänzt

Offline-Vergleiche von ZIPs liefern gefilterte CSV-/JSON-Listen. Die Vorschau beim Import lokaler Favoriten und Suchfilter zeigt Konflikte vor dem Zusammenführen oder Ersetzen. Der Diagnosevergleich liest unterstützte PXMIv2-Exporte. Die Kapazitätssimulation erkennt das geprüfte Paar DE3.71t1/644. Wenn Windows den eigenen Hintergrundserver nach bestätigter Stoppanforderung beendet hat, räumt der Starter dessen Status auf. Der Direktstart und das Beenden mit Strg+C sind weiterhin verfügbar.

Der Webkatalog führt Sword Kirby & Dragoon und Noir Dedede & Hydra seit dem 12. November als in den USA erschienen. Die vier Zelda-Hinweise zu Urbosa und Mipha sind online korrigiert. Auf dem LCD gilt noch der Text von App644. [Nintendo-Quellen und Zuordnungen](CATALOG_CORRECTIONS.md)

[Dateimanager](https://bluecyber81.github.io/pixl.js/) · [Windows-Paket und Quellen](https://github.com/bluecyber81/pixl.js/releases/tag/web3.48.0) · [Prüfpaket](https://github.com/bluecyber81/pixl.js/releases/download/web3.48.0/Allmiibo_DE3_71t1_Z19_Web3_48_0_ChatGPT_Pruefpaket.zip)
