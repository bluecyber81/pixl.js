param([ValidateRange(1024,65535)][int]$Port = 8765)
$ErrorActionPreference = 'Stop'
$stateFile = Join-Path $PSScriptRoot "server-state-$Port.json"
if (-not (Test-Path -LiteralPath $stateFile -PathType Leaf)) { Write-Output "Kein gespeicherter Dateimanager fuer Port $Port."; exit }
$serverState = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
$serverUrl = "http://127.0.0.1:$Port/"
if ($serverState.schema -ne 1 -or $serverState.port -ne $Port -or $serverState.url -ne $serverUrl -or [string]$serverState.token -cnotmatch '^[a-f0-9]{32}$' -or [string]$serverState.instance -cnotmatch '^[a-f0-9]{64}$') {
    throw 'Der gespeicherte Status passt nicht zu diesem Port. Es wurde nichts beendet.'
}
$health = Invoke-RestMethod -Uri ($serverUrl + '.well-known/allmiibo-dateimanager') -TimeoutSec 2
if ($health.application -ne 'allmiibo-dateimanager' -or $health.instance -cne $serverState.instance) {
    throw 'Auf diesem Port antwortet eine andere Instanz. Es wurde nichts beendet.'
}
$reply = Invoke-RestMethod -Method Post -Uri ($serverUrl + '.well-known/allmiibo-dateimanager/shutdown') -Headers @{'X-Allmiibo-Token'=[string]$serverState.token} -TimeoutSec 2
if ($reply.stopping -ne $true) { throw 'Der eigene Server hat das Beenden nicht bestaetigt.' }
Remove-Item -LiteralPath $stateFile
Write-Output "Der lokale Dateimanager auf Port $Port beendet sich."
