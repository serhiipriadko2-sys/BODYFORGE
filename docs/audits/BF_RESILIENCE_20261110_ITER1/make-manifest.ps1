$ErrorActionPreference = 'Stop'
Set-Location 'C:\github\BODYFORGE'
$d = (Resolve-Path 'docs\audits\BF_RESILIENCE_20261110_ITER1').Path.TrimEnd('\')
$utf8 = New-Object System.Text.UTF8Encoding($false)
$files = @(Get-ChildItem $d -File -Recurse | Where-Object {
  $_.Name -notin @('RECEIPT.md', 'MANIFEST_SHA256.txt')
} | Sort-Object FullName)
$rows = @('BODYFORGE RESILIENCE QA | relative path | bytes | sha256')
foreach ($f in $files) {
  if (-not $f.FullName.StartsWith($d + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Evidence path outside audit directory'
  }
  if (($f.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Symlinked evidence not allowed'
  }
  $rel = $f.FullName.Substring($d.Length + 1).Replace('\','/')
  if ($rel.Contains('..') -or $rel.Contains('|') -or $rel.StartsWith('/')) {
    throw 'Unsafe manifest relative path'
  }
  if ($f.Length -le 0) { throw 'Empty evidence file: ' + $rel }
  $hash = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLower()
  $rows += "$rel | $($f.Length) | $hash"
}
$manifest = Join-Path $d 'MANIFEST_SHA256.txt'
[IO.File]::WriteAllText($manifest, ($rows -join "`n") + "`n", $utf8)
$checked = 0
$seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
foreach ($line in (Get-Content -LiteralPath $manifest | Select-Object -Skip 1)) {
  $fields = @($line -split '\|')
  if ($fields.Count -ne 3) { throw 'Malformed manifest row' }
  $rel = $fields[0].Trim()
  if ($rel.Contains('..') -or $rel.StartsWith('/') -or -not $seen.Add($rel)) {
    throw 'Unsafe or duplicate path: ' + $rel
  }
  $filePath = Join-Path $d ($rel.Replace('/', '\'))
  $expectedBytes = [int64]$fields[1].Trim()
  $expectedHash = $fields[2].Trim()
  if (-not (Test-Path -LiteralPath $filePath)) { throw 'Missing: ' + $rel }
  $item = Get-Item -LiteralPath $filePath
  $actualHash = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLower()
  if ($item.Length -ne $expectedBytes -or $actualHash -ne $expectedHash) {
    throw 'Evidence mismatch: ' + $rel
  }
  $checked++
}
if ($checked -ne $files.Count) { throw 'Manifest item count mismatch' }
Write-Output "MANIFEST_VALID=$checked FAILED=0"
Write-Output "MANIFEST_BYTES=$((Get-Item $manifest).Length)"
Write-Output "MANIFEST_SHA256=$((Get-FileHash $manifest -Algorithm SHA256).Hash.ToLower())"
