# Dateimanager 3.39.1: Display während laufender Vorgänge wach halten

Bei längeren Sicherungen oder Dateiübertragungen kann ein ausgeschaltetes
Handydisplay die Bluetooth-Verbindung unterbrechen. Der Dateimanager fordert
jetzt während eines laufenden Vorgangs eine Screen Wake Lock an, wenn der
Browser dies unterstützt und der Tab sichtbar ist.

Die Anzeige **Handy-Display** zeigt den tatsächlichen Zustand. Der Haken
**Während des Vorgangs wach halten** schaltet die Hilfe aus oder wieder ein.
Wenn der Browser ablehnt oder das System die Sperre beendet, steht
**Erneut versuchen** bereit. Die Datenübertragung wartet nicht auf die
Wake-Lock-Erlaubnis. Nach Ende, Trennen oder Verlassen der App wird die Sperre
freigegeben. Nach einem Tabwechsel wird sie bei der Rückkehr erneut angefordert;
eine Freigabe durch das System führt zu keiner automatischen Wiederholungsschleife.

Den Tab im Vordergrund lassen. Manuelles Sperren, Energiesparen und ein vom
Betriebssystem angehaltener Browser können Bluetooth weiterhin unterbrechen.
Die Funktion verspricht keine Hintergrundübertragung und verhindert kein
bewusstes Sperren des Handys. Browserunterstützung und Berechtigungen entscheiden
über die tatsächliche Verfügbarkeit.
Der [W3C-Arbeitsentwurf zur Screen Wake Lock API](https://www.w3.org/TR/2026/WD-screen-wake-lock-20260929/)
beschreibt die Sichtbarkeitsbedingung und Freigaben durch Browser-/Energiepolitik.

Die Änderung betrifft die Browseroberfläche. Firmware App DE3.62/634,
Bootloader Z17, S112 und bestehende Sicherungsformate sind unverändert.
Es gibt keinen automatischen Geraetezugriff, Import, Flash oder Löschvorgang.
Die Prüfung verwendet lokale Hosttests und synthetische Browserzustände;
ein echter Handy-/BLE-Langzeittest bleibt offen. Die ausführlichen Nachweise
stehen in [WEB3_39_1.json](validation/WEB3_39_1.json).
