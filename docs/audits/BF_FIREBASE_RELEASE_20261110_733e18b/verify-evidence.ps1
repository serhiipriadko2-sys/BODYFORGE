$ErrorActionPreference = 'Stop'
Set-Location 'C:\github\BODYFORGE'
$d = (Resolve-Path 'docs\audits\BF_FIREBASE_RELEASE_20261110_733e18b').Path.TrimEnd('\')
$stagePrefix = (Join-Path $d 'site') + '\'
$utf8 = New-Object Text.UTF8Encoding($false)
$rows = @('BODYFORGE FIREBASE RELEASE AUDIT | relative path | bytes | sha256')
$files = @(Get-ChildItem $d -File -Recurse | Where-Object {
  -not $_.FullName.StartsWith($stagePrefix, [StringComparison]::OrdinalIgnoreCase) -and
  $_.Name -notin @('RECEIPT.md', 'EVIDENCE_SHA256.txt')
} | Sort-Object FullName)
foreach ($f in $files) {
  if (-not $f.FullName.StartsWith($d + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Out-of-root audit path'
  }
  if (($f.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Symlink audit evidence rejected' }
  $rel = $f.FullName.Substring($d.Length + 1).Replace('\','/')
  if ($rel.Contains('..') -or $rel.Contains('|') -or $rel.StartsWith('/')) { throw 'Unsafe evidence path' }
  if ($f.Length -le 0) { throw 'Empty evidence: ' + $rel }
  $hash = (Get-FileHash $f.FullName -Algorithm SHA256).Hash.ToLower()
  $rows += "$rel | $($f.Length) | $hash"
}
$file = Join-Path $d 'EVIDENCE_SHA256.txt'
[IO.File]::WriteAllText($file, ($rows -join "`n") + "`n", $utf8)
$seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$checked = 0
foreach ($line in (Get-Content -LiteralPath $file | Select-Object -Skip 1)) {
  $cells = @($line -split '\|')
  if ($cells.Count -ne 3) { throw 'Invalid evidence record' }
  $rel = $cells[0].Trim()
  if ($rel.Contains('..') -or $rel.StartsWith('/') -or -not $seen.Add($rel)) { throw 'Duplicate or unsafe path' }
  $target = Join-Path $d ($rel.Replace('/', '\'))
  if (-not (Test-Path $target)) { throw 'Missing evidence' }
  $actual = Get-Item $target
  if ($actual.Length -ne [long]$cells[1].Trim() -or
      (Get-FileHash $target -Algorithm SHA256).Hash.ToLower() -ne $cells[2].Trim()) {
    throw 'Evidence drift: ' + $rel
  }
  $checked++
}
if ($checked -ne $files.Count) { throw 'Audit count mismatch' }
Write-Output "EVIDENCE_VALID=$checked FAILED=0"
Write-Output "EVIDENCE_MANIFEST_BYTES=$((Get-Item $file).Length)"
Write-Output "EVIDENCE_MANIFEST_SHA256=$((Get-FileHash $file -Algorithm SHA256).Hash.ToLower())"
