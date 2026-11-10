$ErrorActionPreference='Stop'
$name='bf-e2e-tower-48336'
if ($name -notmatch '^bf-e2e-tower-[0-9]{3,8}$') { throw 'Invalid temporary profile name' }
$root=[IO.Path]::GetFullPath($env:TEMP).TrimEnd([IO.Path]::DirectorySeparatorChar)
$path=[IO.Path]::GetFullPath((Join-Path $root $name))
if ((Split-Path $path -Parent) -ne $root) { throw 'Temporary profile path escaped' }
$processes=@(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -match [regex]::Escape($path) -and $_.CommandLine -like "*--user-data-dir=*$name*" })
if ($processes.Count -gt 30) { throw 'Unbounded process count' }
Write-Output "OWNED_CHROME_COUNT=$($processes.Count)"
foreach ($p in $processes) {
  if ($p.CommandLine -notmatch [regex]::Escape($path)) { throw 'Process ownership changed' }
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  Write-Output "STOP_OWNED_PID=$($p.ProcessId)"
}
Start-Sleep -Seconds 2
$remaining=@(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object {
  $_.CommandLine -match [regex]::Escape($path) -and $_.CommandLine -like "*--user-data-dir=*$name*" })
Write-Output "OWNED_CHROME_REMAINING=$($remaining.Count)"
if ($remaining.Count -ne 0) { throw 'Owned processes still active' }
if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop }
Write-Output "OWNED_PROFILE_PRESENT=$([bool](Test-Path -LiteralPath $path))"
