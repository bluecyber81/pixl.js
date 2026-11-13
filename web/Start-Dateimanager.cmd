@echo off
setlocal DisableDelayedExpansion
rem Launch Python directly. No PowerShell script or execution-policy change.
set "ALLMIIBO_PY="
set "ALLMIIBO_PY_ARGS="
set "PYLAUNCHER_ALLOW_INSTALL="
if not exist "%~dp0dateimanager_launcher.py" goto missing_launcher

set "ALLMIIBO_PY=%USERPROFILE%\Documents\Codex\Tools\Agent-Tools\.venv\Scripts\python.exe"
if not exist "%ALLMIIBO_PY%" goto try_scoop
"%ALLMIIBO_PY%" -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
if not errorlevel 1 goto run

:try_scoop
set "ALLMIIBO_PY=%USERPROFILE%\scoop\apps\python\current\python.exe"
if not exist "%ALLMIIBO_PY%" goto try_py
"%ALLMIIBO_PY%" -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
if not errorlevel 1 goto run

:try_py
for /f "delims=" %%P in ('where py.exe 2^>nul ^| findstr /i /v /c:"WindowsApps"') do (
    "%%P" -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
    if not errorlevel 1 (
        set "ALLMIIBO_PY=%%P"
        set "ALLMIIBO_PY_ARGS=-3"
        goto run
    )
)

for /f "delims=" %%P in ('where python.exe 2^>nul ^| findstr /i /v /c:"WindowsApps"') do (
    "%%P" -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
    if not errorlevel 1 (
        set "ALLMIIBO_PY=%%P"
        goto run
    )
)
echo FEHLER: Kein verwendbares Python 3.8 oder neuer gefunden.
echo Bitte einen bereits installierten Python-Interpreter verwenden.
echo Microsoft-Store-Aliase werden nicht automatisch gestartet.
pause
exit /b 1

:missing_launcher
echo FEHLER: dateimanager_launcher.py fehlt. Bitte die komplette ZIP entpacken.
pause
exit /b 1

:run
"%ALLMIIBO_PY%" %ALLMIIBO_PY_ARGS% "%~dp0dateimanager_launcher.py" start %*
set "ALLMIIBO_RESULT=%errorlevel%"
if not "%ALLMIIBO_RESULT%"=="0" pause
exit /b %ALLMIIBO_RESULT%
