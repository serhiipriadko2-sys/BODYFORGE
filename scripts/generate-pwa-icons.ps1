# Reproducibly rasterize the existing BODYFORGE vector mark with local Chrome.
# Does not read profiles, cameras, browser cookies or network resources.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$icons = Join-Path $root 'public\icons'
$chrome = if ($env:CHROME_PATH) { $env:CHROME_PATH } else { 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
if (-not (Test-Path -LiteralPath $chrome)) { throw 'Chrome executable not found' }
Add-Type -AssemblyName System.Drawing
$targets = @(
  @{ source = 'bodyforge-icon.svg'; file = 'bodyforge-192.png'; size = 192 },
  @{ source = 'bodyforge-icon.svg'; file = 'bodyforge-512.png'; size = 512 },
  @{ source = 'bodyforge-maskable.svg'; file = 'bodyforge-maskable-512.png'; size = 512 },
  @{ source = 'bodyforge-icon.svg'; file = 'bodyforge-180.png'; size = 180 }
)
foreach ($item in $targets) {
  $svgPath = Join-Path $icons $item.source
  $output = Join-Path $icons $item.file
  $svg = Get-Content -LiteralPath $svgPath -Raw -Encoding UTF8
  # Inline SVG paints synchronously in headless Chrome; data-URI images can be blank.
  $page = '<!doctype html><meta charset="utf-8"><style>*{margin:0;padding:0}html,body{width:100%;height:100%;overflow:hidden;background:#0c1114}svg{width:100vw;height:100vh;display:block}</style>' + $svg
  $scratch = Join-Path $env:TEMP ('bf-pwa-raster-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $scratch | Out-Null
  try {
    $html = Join-Path $scratch 'icon.html'
    Set-Content -LiteralPath $html -Value $page -Encoding UTF8
    $uri = ([System.Uri]::new($html)).AbsoluteUri
    $profile = Join-Path $scratch 'chrome'
    $rendered = Join-Path $scratch 'rendered-512.png'
    $arguments = @(
      '--headless=new', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--disable-gpu', '--hide-scrollbars',
      '--virtual-time-budget=4000', '--window-size=512,512',
      ('--user-data-dir=' + $profile), ('--screenshot=' + $rendered), $uri
    )
    $null = Start-Process -FilePath $chrome -ArgumentList $arguments -PassThru -Wait
    if (-not (Test-Path -LiteralPath $rendered)) { throw ('Missing icon render: ' + $rendered) }
    $source = [System.Drawing.Bitmap]::new($rendered)
    try {
      if ($source.Width -ne 512 -or $source.Height -ne 512) { throw 'Chrome viewport mismatch' }
      $scaled = [System.Drawing.Bitmap]::new($item.size, $item.size)
      try {
        $graphics = [System.Drawing.Graphics]::FromImage($scaled)
        try {
          $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
          $graphics.DrawImage($source, 0, 0, $item.size, $item.size)
        } finally { $graphics.Dispose() }
        $scaled.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
      } finally { $scaled.Dispose() }
    } finally { $source.Dispose() }
    $bitmap = [System.Drawing.Bitmap]::new($output)
    try {
      if ($bitmap.Width -ne $item.size -or $bitmap.Height -ne $item.size) { throw 'Icon pixel dimensions mismatch' }
      $hasMark = $false
      for ($y = 0; $y -lt $bitmap.Height; $y += [Math]::Max(1, [int]($bitmap.Height / 32))) {
        for ($x = 0; $x -lt $bitmap.Width; $x += [Math]::Max(1, [int]($bitmap.Width / 32))) {
          $pixel = $bitmap.GetPixel($x, $y)
          if ($pixel.G -gt 190 -and $pixel.R -gt 100 -and $pixel.B -gt 40) { $hasMark = $true; break }
        }
        if ($hasMark) { break }
      }
      if (-not $hasMark) { throw ('Blank or unrendered icon: ' + $output) }
    } finally { $bitmap.Dispose() }
    $file = Get-Item -LiteralPath $output
    $hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Output ($item.file + ' ' + $item.size + 'x' + $item.size + ' bytes=' + $file.Length + ' sha256=' + $hash)
  } finally {
    Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
  }
}
