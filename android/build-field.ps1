param(
    [string]$BuildId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
    [string]$Sdk = (Join-Path $env:LOCALAPPDATA 'Android\Sdk'),
    [string]$Jdk = 'C:\Program Files\Android\Android Studio\jbr',
    [switch]$UseExistingDist
)
$ErrorActionPreference = 'Stop'
if ($BuildId -notmatch '^[A-Za-z0-9_-]{1,50}$') { throw 'Invalid build id' }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$stage = Join-Path $root ('.bodyforge-qa\health-native-' + $BuildId)
if (Test-Path $stage) { throw 'Output directory already exists; choose a new build id' }
$tools = Join-Path $Sdk 'build-tools\36.1.0'
$androidJar = Join-Path $Sdk 'platforms\android-36.1\android.jar'
$javac = Join-Path $Jdk 'bin\javac.exe'
$java = Join-Path $Jdk 'bin\java.exe'
$jar = Join-Path $Jdk 'bin\jar.exe'
$aapt = Join-Path $tools 'aapt2.exe'
$d8 = Join-Path $tools 'd8.bat'
$align = Join-Path $tools 'zipalign.exe'
$sign = Join-Path $tools 'apksigner.bat'
$debugKey = Join-Path $env:USERPROFILE '.android\debug.keystore'
foreach ($p in @($androidJar,$javac,$java,$jar,$aapt,$d8,$align,$sign,$debugKey)) {
    if (!(Test-Path -LiteralPath $p)) { throw "Required local tool or debug key unavailable: $p" }
}
$env:JAVA_HOME = $Jdk
function Run([string]$program, [string[]]$arguments) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $program @arguments
    $result = $LASTEXITCODE
    $ErrorActionPreference = $old
    if ($result -ne 0) { throw "Command failed: $(Split-Path $program -Leaf), exit $result" }
}
if (!$UseExistingDist) { Run 'npm.cmd' @('run','build') }
if (!(Test-Path 'dist\index.html')) { throw 'Build dist first' }
New-Item -ItemType Directory $stage | Out-Null
foreach ($sub in @('policy','classes','dex')) {
    New-Item -ItemType Directory (Join-Path $stage $sub) | Out-Null
}
$src = Join-Path $PSScriptRoot 'src'
$javaRoot = Join-Path $src 'java\ru\bodyforge\healthqa'
$policy = Join-Path $stage 'policy'
$classes = Join-Path $stage 'classes'
$dex = Join-Path $stage 'dex'
Run $javac @('--release','8','-encoding','UTF-8','-d',$policy,(Join-Path $javaRoot 'StepsPolicy.java'),(Join-Path $PSScriptRoot 'tests\StepsPolicyTest.java'))
Run $java @('-cp',$policy,'ru.bodyforge.healthqa.StepsPolicyTest')
Run $javac @('--release','8','-encoding','UTF-8','-d',$policy,(Join-Path $javaRoot 'LiveStepPolicy.java'),(Join-Path $PSScriptRoot 'tests\LiveStepPolicyTest.java'))
Run $java @('-cp',$policy,'ru.bodyforge.healthqa.LiveStepPolicyTest')
$sources = @(Get-ChildItem (Join-Path $src 'java') -File -Recurse -Filter '*.java' | ForEach-Object FullName)
Run $javac (@('--release','8','-encoding','UTF-8','-classpath',$androidJar,'-d',$classes) + $sources)
$codeJar = Join-Path $stage 'code.jar'
Run $jar @('cf',$codeJar,'-C',$classes,'.')
Run $d8 @('--release','--min-api','26','--lib',$androidJar,'--output',$dex,$codeJar)
$resources = Join-Path $stage 'compiled.zip'
$base = Join-Path $stage 'base.apk'
Run $aapt @('compile','--dir',(Join-Path $src 'res'),'-o',$resources)
Run $aapt @('link','-I',$androidJar,'--manifest',(Join-Path $src 'AndroidManifest.xml'),'-o',$base,'-R',$resources)
$unsigned = Join-Path $stage 'unsigned.apk'
$aligned = Join-Path $stage 'aligned.apk'
$apk = Join-Path $stage 'BODYFORGE-HealthConnect-test.apk'
$manifest = Join-Path $stage 'payload-manifest.json'
$packer = Join-Path $PSScriptRoot 'pack_web_apk.py'
Run 'py' @($packer,'pack',(Join-Path $root 'dist'),$base,(Join-Path $dex 'classes.dex'),$unsigned,$manifest)
Run $align @('-f','4',$unsigned,$aligned)
# Android SDK's standard local debug identity; never use a production key.
Run $sign @('sign','--ks',$debugKey,'--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--key-pass','pass:android','--out',$apk,$aligned)
Run $sign @('verify','--verbose','--print-certs',$apk)
Run $align @('-c','4',$apk)
$permissionOutput = & $aapt dump permissions $apk
if ($LASTEXITCODE -ne 0) { throw 'Manifest permission inspection failed' }
$permissionOutput | ForEach-Object { Write-Output $_ }
$permissions = @($permissionOutput | ForEach-Object {
    if ($_ -match "uses-permission(?:-sdk-\d+)?: name='([^']+)'") { $Matches[1] }
} | Sort-Object -Unique)
$allowed = @('android.permission.CAMERA','android.permission.INTERNET','android.permission.health.READ_STEPS','android.permission.ACTIVITY_RECOGNITION') | Sort-Object
if ((Compare-Object $permissions $allowed) -or $permissions.Count -ne 4) { throw 'Unexpected APK permissions' }
Run 'py' @($packer,'verify',$apk,$manifest)
Write-Output "APK_PATH=$apk"
Write-Output "APK_BYTES=$((Get-Item $apk).Length)"
Write-Output "APK_SHA256=$((Get-FileHash $apk -Algorithm SHA256).Hash.ToLower())"
Write-Output 'BODYFORGE_HEALTH_APK_PASS'
