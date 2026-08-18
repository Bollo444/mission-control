# ============================================================
#  Mission Control — tunnel watchdog
#  Runs every few minutes (Scheduled Task). cloudflared does NOT
#  crash when its edge connections time out, so PM2 never restarts
#  it — the process stays "online" while the public site 530s.
#  This checks the real public endpoint and recovers automatically.
# ============================================================
$ErrorActionPreference = 'SilentlyContinue'

# Single-instance guard: the scheduled task repeats every 3 minutes with
# "stop if still running" disabled, so slow network checks can stack up
# concurrent runs. Each stacked run fires its own `pm2 restart`, which is
# what caused the mc-tunnel restart bursts (8 restarts in one second).
# If another run holds the lock, bail out silently.
$lock = 'C:\Users\Amari\.pm2\logs\tunnel-watchdog.lock'
try {
  $fs = [System.IO.File]::Open($lock, 'OpenOrCreate', 'ReadWrite', 'None')
} catch {
  exit 0   # another watchdog run is already in progress
}

$public = 'https://mission-control.decouvertquatrieme.online'
$origin = 'http://127.0.0.1:4317'
$log    = 'C:\Users\Amari\.pm2\logs\tunnel-watchdog.log'
$pm2    = 'C:\Users\Amari\AppData\Roaming\npm\pm2.cmd'
if (-not (Test-Path $pm2)) { $pm2 = 'pm2' }

function Log($m) { "$([DateTime]::UtcNow.ToString('s'))Z  $m" | Add-Content -Path $log -Encoding utf8 }

# --- 1. Local origin (the Next.js app) healthy? ---
$originOk = $false
try {
  $o = Invoke-WebRequest -Uri $origin -UseBasicParsing -TimeoutSec 10
  if ([int]$o.StatusCode -ge 200 -and [int]$o.StatusCode -lt 500) { $originOk = $true }
} catch {}

# --- 2. Public edge healthy? (302 -> Access login counts as UP) ---
$edge = 0
try {
  $r = Invoke-WebRequest -Uri $public -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 15
  $edge = [int]$r.StatusCode
} catch {
  $resp = $_.Exception.Response
  if ($resp) { $edge = [int]$resp.StatusCode } else { $edge = 0 }   # 0 = timeout / no response
}

# 2xx, 3xx (Access redirect) and 403 (Access deny) all mean the edge link is fine.
$edgeOk = (($edge -ge 200 -and $edge -lt 400) -or $edge -eq 403)
if ($edgeOk) { exit 0 }   # healthy — stay silent

# --- 3. Recover ---
function Restart-TunnelClean {
  # `pm2 restart` on Windows leaks a duplicate cloudflared.exe on every call:
  # cloudflared ignores the SIGINT PM2 sends, so the old process keeps
  # running (and keeps its tunnel registrations) while PM2 spawns a new one.
  # Stop the app, force-kill leftover mission-control tunnels, then start a
  # single fresh instance.
  & $pm2 stop mc-tunnel | Out-Null
  Start-Sleep -Seconds 2
  Get-CimInstance Win32_Process -Filter "Name like '%cloudflared%'" |
    Where-Object { $_.CommandLine -like '*mission-control.yml*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
  & $pm2 start mc-tunnel | Out-Null
}

# App restarts are expensive: every one costs a cold boot (seconds of slow
# first page loads), and this box is often under memory pressure — a single
# slow 10s origin probe can false-positive. The app is only bounced when
# (a) a second origin probe also fails AND (b) the last app restart was more
# than 15 minutes ago. The tunnel is cleaned on any edge failure regardless.
$appLock = 'C:\Users\Amari\.pm2\logs\mission-control-restart.lock'
function Test-AppReallyDown {
  if ($originOk) { return $false }
  if (Test-Path $appLock) {
    $last = (Get-Item $appLock).LastWriteTime
    if ((Get-Date) - $last -lt (New-TimeSpan -Minutes 15)) { return $false }
  }
  try {
    $r = Invoke-WebRequest -Uri $origin -UseBasicParsing -TimeoutSec 10
    return -not ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
  } catch { return $true }
}

if (-not $originOk) {
  if (Test-AppReallyDown) {
    Log "edge=$edge origin=DOWN(2x) -> restart mission-control + clean mc-tunnel"
    [System.IO.File]::WriteAllText($appLock, (Get-Date).ToString('o'))   # cooldown marker
    & $pm2 restart mission-control | Out-Null
    Start-Sleep -Seconds 8
  } else {
    Log "edge=$edge origin probe failed but cooldown/retry holds -> tunnel clean only"
  }
  Restart-TunnelClean
} else {
  Log "edge=$edge origin=OK    -> clean mc-tunnel restart"
  Restart-TunnelClean
}

# --- 4. Verify recovery ---
Start-Sleep -Seconds 12
$after = 0
try {
  $r2 = Invoke-WebRequest -Uri $public -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 15
  $after = [int]$r2.StatusCode
} catch { $resp = $_.Exception.Response; if ($resp) { $after = [int]$resp.StatusCode } }
Log "after restart: edge=$after"
$fs.Close()
