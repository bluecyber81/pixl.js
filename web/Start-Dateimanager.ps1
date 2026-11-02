param([ValidateRange(1024,65535)][int]$Port = 8765, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$appDirectory = Join-Path $PSScriptRoot 'dist'
$serverScript = Join-Path $PSScriptRoot 'serve_local.py'
$stateFile = Join-Path $PSScriptRoot "server-state-$Port.json"
$serverUrl = "http://127.0.0.1:$Port/"
function Open-DateimanagerBrowser {
    if (-not $NoBrowser) {
        try { Start-Process $serverUrl }
        catch { Write-Warning "Der Browser konnte nicht geoeffnet werden. Oeffne $serverUrl selbst; der Dateimanager laeuft." }
    }
}
if (-not (Test-Path -LiteralPath (Join-Path $appDirectory 'index.html') -PathType Leaf)) { throw 'Der gebaute Dateimanager fehlt im Unterordner dist.' }
if (-not (Test-Path -LiteralPath $serverScript -PathType Leaf)) { throw 'Der lokale Webserver serve_local.py fehlt.' }
if (Test-Path -LiteralPath $stateFile -PathType Container) { throw 'Der Statuspfad ist ein Ordner. Es wurde kein Server gestartet.' }
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    # A second launch may reopen only the exact server recorded by this copy.
    # Never adopt an unrelated listener or transmit the saved shutdown token.
    $existingMatches = $false
    try {
        if (Test-Path -LiteralPath $stateFile -PathType Leaf) {
            $existing = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
            if ($existing.schema -eq 1 -and $existing.port -eq $Port -and $existing.url -ceq $serverUrl -and
                [string]$existing.token -cmatch '^[a-f0-9]{32}$' -and [string]$existing.instance -cmatch '^[a-f0-9]{64}$') {
                $existingHasher = [Security.Cryptography.SHA256]::Create()
                try { $existingHash = -join ($existingHasher.ComputeHash([Text.Encoding]::ASCII.GetBytes([string]$existing.token)) | ForEach-Object { $_.ToString('x2') }) }
                finally { $existingHasher.Dispose() }
                if ($existingHash -ceq $existing.instance) {
                    $existingHealth = Invoke-RestMethod -Uri ($serverUrl + '.well-known/allmiibo-dateimanager') -TimeoutSec 2
                    $existingMatches = $existingHealth.application -ceq 'allmiibo-dateimanager' -and
                        $existingHealth.version -ceq '3.33.1' -and $existingHealth.instance -ceq $existing.instance
                }
            }
        }
    } catch { $existingMatches = $false }
    if (-not $existingMatches) {
        throw "Port $Port ist bereits durch eine andere oder nicht zugeordnete Instanz belegt. Beende zuerst den dort gestarteten Dateimanager oder waehle einen anderen -Port."
    }
    Write-Output "Dateimanager 3.33.1 laeuft bereits: $serverUrl"
    Open-DateimanagerBrowser
    return
}
$pythonCandidates = @(
    (Join-Path $env:USERPROFILE 'Documents\Codex\Tools\Agent-Tools\.venv\Scripts\python.exe'),
    (Join-Path $env:USERPROFILE 'scoop\apps\python\current\python.exe')
)
$pythonPath = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $pythonPath) {
    $pythonPath = Get-Command python -All -ErrorAction SilentlyContinue | Where-Object { $_.Source -and $_.Source -notmatch 'WindowsApps' } | Select-Object -First 1 -ExpandProperty Source
}
if (-not $pythonPath) { throw 'Python wurde nicht gefunden. Die Microsoft-Store-Verknuepfung reicht nicht aus.' }
$instanceToken = [guid]::NewGuid().ToString('N')
$hasher = [Security.Cryptography.SHA256]::Create()
try { $instanceHash = -join ($hasher.ComputeHash([Text.Encoding]::ASCII.GetBytes($instanceToken)) | ForEach-Object { $_.ToString('x2') }) }
finally { $hasher.Dispose() }
$stateTemp = Join-Path $PSScriptRoot "server-state-$Port-$instanceToken.tmp"
$serverArguments = @(('"' + $serverScript + '"'), '--port', [string]$Port, '--directory', ('"' + $appDirectory + '"'), '--instance-token', $instanceToken)
$ready = $false
try {
    Start-Process -FilePath $pythonPath -ArgumentList $serverArguments -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot "server-$Port.log") -RedirectStandardError (Join-Path $PSScriptRoot "server-$Port-errors.log")
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            $health = Invoke-RestMethod -Uri ($serverUrl + '.well-known/allmiibo-dateimanager') -TimeoutSec 1
            if ($health.application -ceq 'allmiibo-dateimanager' -and $health.version -ceq '3.33.1' -and $health.instance -ceq $instanceHash) { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 150
    }
    if (-not $ready) { throw 'Der lokale Dateimanager antwortet nicht mit seiner eigenen Instanzkennung. Bitte die portbezogenen Server-Logs pruefen.' }
    @{schema=1; port=$Port; url=$serverUrl; instance=$instanceHash; token=$instanceToken} | ConvertTo-Json | Set-Content -LiteralPath $stateTemp -Encoding UTF8
    Move-Item -LiteralPath $stateTemp -Destination $stateFile -Force
} catch {
    # No PID lookup or process termination: only our authenticated server may stop itself.
    if ($ready) {
        try { $null = Invoke-RestMethod -Method Post -Uri ($serverUrl + '.well-known/allmiibo-dateimanager/shutdown') -Headers @{'X-Allmiibo-Token'=$instanceToken} -TimeoutSec 2 }
        catch { Write-Warning 'Der eigene Server konnte nicht per HTTP beendet werden. Bitte den portbezogenen Server-Log pruefen.' }
    }
    if (Test-Path -LiteralPath $stateTemp -PathType Leaf) { Remove-Item -LiteralPath $stateTemp }
    throw
}
Write-Output "Dateimanager 3.33.1: $serverUrl (nur auf diesem PC erreichbar)"
Write-Output "Beenden: Stop-Dateimanager.cmd -Port $Port"
Open-DateimanagerBrowser
