# Aktuelle Software-Nachweise für LCD App675

Die JSON-Dateien binden die tatsächlich ausgeführten lokalen und unabhängigen GitHub-Prüfungen an App675 / DE3.102 und SourceID `9f60aa974f975a552762605d68d0f0e32ad6676f392b12173856177535a5ba46`.

`HOST_SUMMARY.json` nennt alle 198 ausgeführten Skripte samt Hash und den Hash des vollständigen unveränderten Quellen-/Testsnapshot-Berichts. Die beiden Buildberichte und `REPRODUCIBILITY.json` belegen identische BIN-/HEX-Dateien. `SIGNED_OTA_WEB_BINDING.json` prüft zusätzlich das bytegleiche Paket im Web-Angebot.

`ARM_RESULTS.json` umfasst die 13 gelinkten ARM-Prüfgruppen. `PLAYER_MEMORY_ARM.json` ist eine gesonderte tatsächliche ARM-Allokationsprüfung mit modellierten Timergrenzen, keine Hardware-RAM-Messung. Player-/Stream-Sanitizer und die aktuelle Z21-Signatur-/INIT-/Resume-Qualifizierung sind getrennt aufgeführt.

`LSAN_LOCAL_LIMIT.json` dokumentiert den fehlgeschlagenen lokalen LeakSanitizer-Umgebungstest. Der lokale aktuelle Resume-Lauf führt ASan und UBSan aus und behauptet keinen LSan-Erfolg. `CI_Z21_PREVIEW_RESUME.json` stammt dagegen aus dem erfolgreichen aktuellen LCD-Job 137675750476 in Run 45169716170 und bestätigt die positive LSan-Kontrolle für genau die App675-BIN. Der Originalrunner verlangt das Erkennen eines absichtlich erzeugten Lecks, bevor dieser Bericht geschrieben werden kann. Sein temporärer Rohlog ist im GitHub-Artefakt nicht enthalten. Frühere App674-Nachweise bleiben historisch.

`CI_SUMMARY.json` bindet Run, Commit, Tree, LCD-Job und heruntergeladenes Artefakt. Die mit `CI_` beginnenden Build-/Paket-/Resume- und acht ARM-Berichte wurden bytegleich aus diesem Artefakt übernommen; `CI_HOST_SUMMARY.json` fasst den vollständigen frischen 198er-Hostbericht mit Skripthashes zusammen. BIN, HEX und Produktionseingaben wurden bytegleich mit den lokalen Builds verglichen. Der separate Z21-Workflowjob und die historischen Android-Paketprüfungen werden nicht als neue App675-Paketprüfung gezählt.

Alle Geräte-, RF-, elektrischen Zeit- und Strommessungen bleiben außerhalb dieser Softwarebelege.
