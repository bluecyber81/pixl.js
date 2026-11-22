# Web3.62.0 – Korrektur der Downloadlieferung

Die normale Ausgabe verwendet nun ein unmittelbar bereitstellbares Portable auf GitHub Pages und das Quellarchiv des gepflegten Zweigs `web-app672`. Die Versionsnummer bleibt 3.62.0; Firmware DE3.99 / App672 und ihre Paketbytes bleiben unverändert.

- Portable: https://bluecyber81.github.io/pixl.js/downloads/web3.62.0/Allmiibo_Dateimanager_3_62_0_Portable.zip
- Webquellen: https://github.com/bluecyber81/pixl.js/archive/refs/heads/web-app672.zip
- Oberfläche: https://bluecyber81.github.io/pixl.js/?v=3.62.0

Footer, generierte Lizenz-/Quellenseite, aktuelle README-Einstiege und Versionsdaten stimmen überein. Historische Links sind erhalten. Der vorherige Verweis auf ein noch nicht veröffentlichtes GitHub-Release-Asset ist damit aus den aktuellen Einstiegspunkten entfernt.

## Bindung und Prüfungen

Ausgangspunkt ist der öffentliche Webcommit `2f93268192cfebb5bcc2d2efdc030ed171d520c0` mit Tree `e779a59315b3c3c27461061394951790a7fa22da`, lokal `5cffaf4a1998a29652ee41e2e21820512b654950`. Seine vollständige Softwarequalifikation und der erfolgreiche Source-Checks-Lauf 45029885208 bleiben unverändert erhalten. Deren vollständige Node-Zahlen 2.118/2.115 PASS/0 Fehler/3 Auslassungen und der native Windowsnachweis gehören zu diesem Ausgangsstand.

Für die Lieferkorrektur wurden gezielt neun Download-/Footer-Prüfungen ausgeführt: alle bestanden. Beide neuen Produktionsausgaben bestehen je 50/50 Distprüfungen, auch nach Übernahme des historischen Pages-Bestands. Die tatsächlich gepackte Portable-ZIP wurde entpackt, gestartet, wiederverwendet und beendet. 301 Inhaltsdateien, die Oberfläche, das Versionsmanifest und das echte App672-Paket stimmen in den HTTP-Prüfungen bytegenau überein.

Das neue Portable enthält 303 ZIP-Einträge, ist 11.163.249 Byte groß und hat SHA-256 `96c70b03e5fdd3ad459da0c61eef095edb15cd1941f87403bd4b7a45578e026c`. Die alte Datei mit SHA-256 `d917fe47fc9c6c66a1de8e73ff596a39ee6380ce55e7f8d3f6c61b63d00ca2c1` und die alten Builds bleiben als Stand vor der Lieferkorrektur erhalten. Eine neue unabhängige CI-Reproduktion wird diesem neuen Hash erst mit dem späteren tatsächlichen Lauf zugeschrieben.

## Pages und Paketaufbau

Die vorbereitete Ausgabe enthält weiterhin 1.137 Dateien. `test/app662`, `test/app669` und `test/app670` sind bytegleich erhalten. Die 1.486 früher ausgeschlossenen Root-Assets wurden nicht erneut übernommen. Die vorherige 1.137-Dateien-Ausgabe wurde vollständig gegen den tatsächlich veröffentlichten Pages-Commit `7e6ef6d2500165f2466c229df02edc1d5bec0a40` verglichen.

Das Portable befindet sich weder in `web/public` noch innerhalb seiner eigenen ZIP. Der Herausgeber fügt die fertige Portable-Datei nach dem Build unter `downloads/web3.62.0/` zum Pages-Tree hinzu. Dieser letzte Schritt ergibt 1.138 öffentliche Dateien und verhindert ein rekursiv eingebettetes Paket.

## Grenzen und aktuelle Metadaten

`web_release_status` lautet `normal-release`, das Veröffentlichungsdatum `2026-11-22`: deklarative Metadaten der unmittelbar veröffentlichten normalen Ausgabe. Die endgültigen öffentlichen Source-/Pages-Commitwerte und die tatsächliche HTTP-/Cloud-Browser-Lieferquittung werden separat festgehalten, ohne Selbstreferenz im eigenen Gitcommit. Ältere Pending-Felder in unveränderten Nachweisen beschreiben deren damaligen Aufnahmezeitpunkt.

Für die Änderung der Lieferziele wurde keine unveränderte PFS-/ARM-/Geräteprüfung wiederholt. Es wird weder eine native EXE noch eine physische App672-Geräteabnahme behauptet. Die vollständigen maschinenlesbaren Bindungen und Evidenzhashes stehen in [WEB3_62_0_DOWNLOAD_DELIVERY.json](WEB3_62_0_DOWNLOAD_DELIVERY.json).
