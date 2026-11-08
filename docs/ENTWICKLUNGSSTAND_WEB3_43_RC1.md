# Lokaler Entwicklungsstand vom 8. November 2026

Ausgangspunkt: Web 3.42.2, LCD-App DE3.66/638, Z19 und S112 7.3.0. Der Dateimanager 3.43.0-rc.1 enthält folgende unabhängig nutzbare Änderungen:

| Wo? | Was lässt sich damit tun? |
|---|---|
| Sicherung | „Ordnersicherung nach Schließen des Browsers fortsetzen“ vor dem Start einschalten. Im selben Browserprofil unter derselben Adresse lässt sich die normale Sicherung später fortsetzen. Vor der Übernahme prüft der Dateimanager bereits gespeicherte Dateien erneut am selben Gerät. Eine exportierte ZIP separat speichern. |
| Figurenkatalog | Figuren als Webfavoriten merken und Filter unter eigenem Namen speichern. Favoriten sind an die öffentliche Figuren-ID gebunden. Die Rahmen der Katalogkarten zeigen weiterhin den getrennt geprüften Gerätebestand. |
| Figurenkatalog, Downloadlinks | Die gespeicherten HTTPS-Links als JSON mitnehmen. Beim Import zeigt eine Vorschau neue, unveränderte und abweichende Einträge. Ergänzen und Ersetzen lassen andere IDs unangetastet. Es wird keine Figur automatisch geladen oder geschrieben. |
| Gerät & Diagnose, LCD-Displayfoto | Das gelesene Bild um 180° drehen; PNG und Vorschau zeigen dieselbe Ausrichtung. Drehen benötigt keinen weiteren Funkzugriff. Bei einem Gerätewechsel wird das alte Foto entfernt. |
| Figurenimport | Die deutsche Ansicht erklärt jetzt schon bei der Vorbereitung, wenn eine BIN z. B. zur falschen Figur gehört. Die vorhandenen Prüfgrenzen gelten weiterhin. |

Die normale Startseite lädt ihren ZIP-Leser erst, wenn er benötigt wird. Die separate DFU-Seite behält den eigenen Leser. Für den lokalen Teststand verweisen die öffentlichen Downloadverknüpfungen ausdrücklich auf die veröffentlichten 3.42.2-Archive. Der Portable-Download und das zugehörige Prüfpaket dieser Testfassung werden getrennt bereitgestellt.

Der Webstand funktioniert mit der vorhandenen App DE3.66. Im Prüfpaket liegen außerdem zwei unabhängige Geräteentwicklungen: deutsche Spielhinweise für das LCD (DE3.67/639) und getrennte Startzeitmessung (Profil 640). Nur der jeweils bezeichnete Patch gehört zum zugehörigen Binärabbild. Der bestätigte Z19 bleibt unverändert. Prüfstand und Grenzen stehen im mitgelieferten Prüfbericht.
