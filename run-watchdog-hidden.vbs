Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\Users\Amari\mission-control\tunnel-watchdog.ps1", 0, False