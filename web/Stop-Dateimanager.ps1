$ErrorActionPreference = 'Stop'
$stateFile = Join-Path $PSScriptRoot 'server-state.json'
if (-not (Test-Path -LiteralPath $stateFile)) { Write-Output 'Kein gespeicherter Dateimanager-Prozess.'; exit }
$serverState = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
$serverPid = [int]$serverState.process_id
$serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid"
if ($serverProcess) {
    $runningProcess = Get-Process -Id $serverPid
    if (-not $serverState.process_start_utc -or $runningProcess.StartTime.ToUniversalTime().Ticks -ne ([datetime]$serverState.process_start_utc).ToUniversalTime().Ticks) {
        throw 'Die gespeicherte Prozessnummer wurde neu vergeben oder ist nicht eindeutig. Es wurde nichts beendet.'
    }
    if (-not $serverState.script -or -not $serverProcess.CommandLine.Contains([string]$serverState.script) -or -not $serverProcess.CommandLine.Contains([string]$serverState.directory)) {
        throw 'Die gespeicherte Prozessnummer gehoert nicht mehr zu diesem Dateimanager. Es wurde nichts beendet.'
    }
    Stop-Process -Id $serverPid
}
Remove-Item -LiteralPath $stateFile
Write-Output 'Lokaler Dateimanager beendet.'
