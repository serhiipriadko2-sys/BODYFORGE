$ErrorActionPreference = 'Stop'
$name = 'bf-resilience-K4OPOV'
if ($name -notmatch '^bf-resilience-[A-Za-z0-9]{6}$') { throw 'Invalid QA profile name' }
$root = [IO.Path]::GetFullPath($env:TEMP).TrimEnd([IO.Path]::DirectorySeparatorChar)
$path = [IO.Path]::GetFullPath((Join-Path $root $name))
if ((Split-Path $path -Parent) -ne $root) { throw 'Unsafe profile path' }
$owned = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
 Where-Object { $_.CommandLine -like "*--user-data-dir=*$name*" -and $_.CommandLine -match [regex]::Escape($path) })
Write-Output "SCOPED_PROCESS_COUNT=$($owned.Count)"
if ($owned.Count -gt 30) { throw 'Unexpected number of owned processes' }
foreach ($process in $owned) {
  if ($process.CommandLine -notmatch [regex]::Escape($path)) { throw 'Mismatched process, abort' }
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  Write-Output "SCOPED_CLOSED_PID=$($process.ProcessId)"
}
Start-Sleep -Seconds 2
$remaining = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
 Where-Object { $_.CommandLine -like "*--user-data-dir=*$name*" -and $_.CommandLine -match [regex]::Escape($path) })
Write-Output "SCOPED_REMAINING=$($remaining.Count)"
if ($remaining.Count -ne 0) { throw 'Owned Chrome processes still live' }
if (Test-Path -LiteralPath $path) {
  Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
}
Write-Output "OWN_PROFILE_EXISTS=$([bool](Test-Path -LiteralPath $path))"
