param([ValidateRange(1024,65535)][int]$Port = 8765, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$appDirectory = Join-Path $PSScriptRoot 'dist'
if (-not (Test-Path -LiteralPath (Join-Path $appDirectory 'index.html'))) { throw 'Der gebaute Dateimanager fehlt im Unterordner dist.' }
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    throw "Port $Port ist bereits belegt. Beende zuerst den vorher gestarteten Dateimanager oder waehle -Port 8766."
}
$pythonCandidates = @(
    (Join-Path $env:USERPROFILE 'Documents\Codex\Tools\Agent-Tools\.venv\Scripts\python.exe'),
    (Join-Path $env:USERPROFILE 'scoop\apps\python\current\python.exe')
)
$pythonPath = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $pythonPath) {
    $pythonPath = Get-Command python -All -ErrorAction Stop | Where-Object { $_.Source -notmatch 'WindowsApps' } | Select-Object -First 1 -ExpandProperty Source
}
if (-not $pythonPath) { throw 'Python wurde nicht gefunden. Die Microsoft-Store-Verknuepfung reicht nicht aus.' }
$serverScript = Join-Path $PSScriptRoot 'serve_local.py'
if (-not (Test-Path -LiteralPath $serverScript)) { throw 'Der lokale Webserver serve_local.py fehlt.' }
$serverArguments = @(('"' + $serverScript + '"'), '--port', [string]$Port, '--directory', ('"' + $appDirectory + '"'))
$serverProcess = Start-Process -FilePath $pythonPath -ArgumentList $serverArguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot 'server.log') -RedirectStandardError (Join-Path $PSScriptRoot 'server-errors.log')
$serverUrl = "http://127.0.0.1:$Port/"
$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
        $response = Invoke-WebRequest -Uri $serverUrl -UseBasicParsing -TimeoutSec 1
        if ($response.StatusCode -eq 200 -and $response.Content -match 'Allmiibo DE3.12 Dateimanager') { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 200 }
}
if (-not $ready) { if (-not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id }; throw 'Der lokale Dateimanager konnte nicht gestartet werden.' }
$listenerId = (Get-NetTCPConnection -State Listen -LocalPort $Port | Where-Object { $_.LocalAddress -eq '127.0.0.1' } | Select-Object -First 1).OwningProcess
$listenerInfo = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $listenerId)
if (-not $listenerInfo -or ($listenerId -ne $serverProcess.Id -and $listenerInfo.ParentProcessId -ne $serverProcess.Id) -or -not $listenerInfo.CommandLine.Contains($serverScript) -or -not $listenerInfo.CommandLine.Contains($appDirectory)) {
    if (-not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id }
    throw 'Der lokale Webserver konnte dem gestarteten Prozess nicht eindeutig zugeordnet werden.'
}
# A Windows virtual-environment launcher may delegate to a child interpreter.
# Track the process that actually owns the listening socket.
$serverProcess = Get-Process -Id $listenerId
@{process_id=$serverProcess.Id; process_start_utc=$serverProcess.StartTime.ToUniversalTime().ToString('o'); url=$serverUrl; directory=$appDirectory; script=$serverScript} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'server-state.json') -Encoding UTF8
Write-Output "Dateimanager: $serverUrl (Prozess $($serverProcess.Id), nur auf diesem PC erreichbar)"
if (-not $NoBrowser) { Start-Process $serverUrl }
