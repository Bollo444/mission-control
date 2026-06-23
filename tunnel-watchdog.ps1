# ============================================================
#  Mission Control — tunnel watchdog
#  Runs every few minutes (Scheduled Task). cloudflared does NOT
#  crash when its edge connections time out, so PM2 never restarts
#  it — the process stays "online" while the public site 530s.
#  This checks the real public endpoint and recovers automatically.
# ============================================================
$ErrorActionPreference = 'SilentlyContinue'

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
if (-not $originOk) {
  Log "edge=$edge origin=DOWN  -> restart mission-control + mc-tunnel"
  & $pm2 restart mission-control | Out-Null
  Start-Sleep -Seconds 8
  & $pm2 restart mc-tunnel | Out-Null
} else {
  Log "edge=$edge origin=OK    -> restart mc-tunnel"
  & $pm2 restart mc-tunnel | Out-Null
}

# --- 4. Verify recovery ---
Start-Sleep -Seconds 12
$after = 0
try {
  $r2 = Invoke-WebRequest -Uri $public -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 15
  $after = [int]$r2.StatusCode
} catch { $resp = $_.Exception.Response; if ($resp) { $after = [int]$resp.StatusCode } }
Log "after restart: edge=$after"
