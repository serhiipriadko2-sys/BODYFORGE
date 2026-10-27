param(
  [Parameter(Mandatory=$true)][string]$OriginalDirectory,
  [Parameter(Mandatory=$true)][string]$PackedDirectory
)
# Compare reproducible Chrome/SwiftShader captures of actual avatar pixels.
# The central region covers the full body/face on the 390x844 QA viewport.
# UI overlays outside this area do not dilute the fidelity measurement.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$names = @(
  'athlete-full','athlete-portrait','athlete-buzz','athlete-swept',
  'athlete-crop','athlete-custom','athlete-max-portrait',
  'athlete-max-three-quarter','athlete-max-full'
)
$failures = @()
foreach ($name in $names) {
  $beforePath = Join-Path $OriginalDirectory ($name + '.png')
  $afterPath = Join-Path $PackedDirectory ($name + '.png')
  if (-not (Test-Path -LiteralPath $beforePath) -or -not (Test-Path -LiteralPath $afterPath)) {
    throw ('Missing comparison screenshot: ' + $name)
  }
  $before = [System.Drawing.Bitmap]::new($beforePath)
  $after = [System.Drawing.Bitmap]::new($afterPath)
  try {
    if ($before.Width -ne $after.Width -or $before.Height -ne $after.Height) {
      throw ('Screenshots have different dimensions: ' + $name)
    }
    $width = $before.Width
    $height = $before.Height
    $xMin = [int][math]::Floor($width * 0.15)
    $xMax = [int][math]::Floor($width * 0.85)
    $yMin = [int][math]::Floor($height * 0.27)
    $yMax = [int][math]::Floor($height * 0.67)
    $points = 0
    $errorSum = 0.0
    $changed = 0
    for ($y=$yMin; $y -lt $yMax; $y += 4) {
      for ($x=$xMin; $x -lt $xMax; $x += 4) {
        $a = $before.GetPixel($x,$y)
        $b = $after.GetPixel($x,$y)
        $dr = [math]::Abs([int]$a.R - [int]$b.R)
        $dg = [math]::Abs([int]$a.G - [int]$b.G)
        $db = [math]::Abs([int]$a.B - [int]$b.B)
        $errorSum += ($dr+$dg+$db)/3
        if ([math]::Max($dr,[math]::Max($dg,$db)) -gt 24) { $changed++ }
        $points++
      }
    }
    $mae = [math]::Round($errorSum / $points, 3)
    $changedRate = [math]::Round($changed / $points, 4)
    $pass = ($mae -le 5.0 -and $changedRate -le 0.10)
    Write-Output ('VISUAL ' + $name + ' dimensions=' + $width + 'x' + $height +
      ' sampled=' + $points + ' avgRgbDelta=' + $mae +
      ' changedOver24=' + $changedRate + ' pass=' + $pass)
    if (-not $pass) { $failures += $name }
  } finally {
    $before.Dispose()
    $after.Dispose()
  }
}
if ($failures.Count -gt 0) {
  Write-Output ('VISUAL_REGRESSION_FAILURES=' + ($failures -join ','))
  exit 12
}
Write-Output ('BODYFORGE_VISUAL_PIXEL_PARITY_PASS ' + $names.Count + '/9')
