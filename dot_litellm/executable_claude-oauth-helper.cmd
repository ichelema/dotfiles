@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$c = Get-Content 'E:\msys64\home\Sphynx\.claude\.credentials.json' -Raw | ConvertFrom-Json; Write-Output $c.claudeAiOauth.accessToken"