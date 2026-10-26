@echo off
powershell.exe -NoProfile -File "%~dp0Start-Dateimanager.ps1" %*
if errorlevel 1 pause
