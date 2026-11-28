# Allmiibo since DE3.10

Highlights through LCD DE4.2 / App680 and File Manager 3.68.0-beta.4. [Deutsch](PROJEKTUEBERBLICK.md)

- **Faster transfers.** Small figure files are read in batches. App680 stores up to four small files together when uploading to newly created subfolders. Reading the same 26 small BIN files took 10.29 seconds, down from 20.85 seconds.
- **Bluetooth remote control.** Operate the device menu from a phone or PC. Capture the screen, rotate the image and save it as a PNG.
- **Easier figure discovery.** Browse pictures, search across folders, filter by game and see QR codes and game notes in German and English. The catalogue covers 956 figure IDs.
- **Return to the last figure.** “Back to list” keeps the current figure selected. “Resume app” lets you continue after the device wakes up.
- **Backup and restore.** Save folders and their file attributes to a ZIP, resume interrupted backups, compare archives and restore them. An earlier ZIP speeds up repeat backups when many small files are unchanged.
- **Improved storage and reliability.** Packed LittleFS handles collections of many small files. The SPIFFS migration assistant backs up and verifies the data. Fixes cover saving settings, pending NFC writes and card slots.
- **Display and controls.** A more legible battery indicator, a browser battery log, optional LCD dimming, screen rotation in games, and a display and button test are available.
- **Pictures, clips and scrolling text.** Send images, short clips and text to the LCD from a phone or PC. “Wake Switch 2” can forget a saved pairing.
- **Updates and diagnostics.** The file manager identifies matching updates and displays firmware, bootloader and connection information. Flash the signed LCD application by phone or browser. On one LCD, Windows transferred it in 50.2 seconds through final acknowledgement.
- **File manager and OLED support.** The manager is available online and as a Windows portable ZIP. The three-button OLED has its own firmware, guides and updater profile. The current stable firmware release is for LCD.

An LCD displaying **DE4.2-b2 / App680** already has the stable application installed. Both packages contain the same signed app. [Stable release and phone ZIP](https://github.com/bluecyber81/pixl.js/releases/tag/de4.2) · [File manager](https://bluecyber81.github.io/pixl.js/) · [Detailed history](DEVELOPMENT_HISTORY.md) · [Transfer timings](https://github.com/bluecyber81/pixl.js/releases/tag/web3.66.2)
