[Console]::OutputEncoding=[Text.UTF8Encoding]::new()
$ErrorActionPreference='Stop'
$root='E:\github\BODYFORGE';$a=Join-Path $root 'docs\audits\BF_106_JOURNAL_GATE_20261125';$copy=Join-Path $root '.bodyforge-qa\bf106-journal-gate-final'
Set-Location -LiteralPath $root
$g0=Get-Content "$a/final-run/gates.json" -Raw|ConvertFrom-Json
if($g0.mobile -ne 12 -or !$g0.frozenSourceAndBuildUnchanged){throw 'Previous mobile failure missing'}
$m=Get-Content "$a/final-run/source.json" -Raw|ConvertFrom-Json
$mf=Get-Content "$a/final-run/build-manifest.json" -Raw|ConvertFrom-Json
if((Get-FileHash "$a/final-run/source.json").Hash -ne $g0.sourceManifestSha256 -or (Get-FileHash "$a/final-run/build-manifest.json").Hash -ne $g0.buildManifestSha256){throw 'Manifest drift'}
function VerifyBuild {foreach($x in $m){if((Get-FileHash -LiteralPath (Join-Path $copy $x.path)).Hash -ne $x.sha256){throw "Frozen source drift $($x.path)"}};foreach($x in $mf){if((Get-FileHash -LiteralPath (Join-Path "$copy/dist" $x.path)).Hash -ne $x.sha256){throw "Build drift $($x.path)"}}}
VerifyBuild
$f=Join-Path $root 'qa\mobile-e2e.mjs';$own=(Get-Content "$a/owned-final.json" -Raw|ConvertFrom-Json).'qa/mobile-e2e.mjs'
if((Get-FileHash $f).Hash -ne $own){throw 'Harness drift'}
$g=[ordered]@{scope='same frozen product and build; external corrected mobile harness';qaSha256=$own;sourceManifestSha256=$g0.sourceManifestSha256;buildManifestSha256=$g0.buildManifestSha256;mobile='NOT_RUN';started=(Get-Date).ToString('o')}
$p=$null
try{
 $busy=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue|Select-Object -ExpandProperty LocalPort)
 $port=(6230..6240|Where-Object {$_ -notin $busy}|Select-Object -First 1);if(!$port){throw 'No free port'}
 $g.port=$port;$node=(Get-Command node.exe).Source;$vite=Join-Path $root 'node_modules\vite\bin\vite.js'
 $p=Start-Process -FilePath $node -WorkingDirectory $copy -ArgumentList @(('"'+$vite+'"'),'preview','--host','127.0.0.1','--port',"$port",'--strictPort') -RedirectStandardOutput "$a/mobile-retry-preview.log" -RedirectStandardError "$a/mobile-retry-preview-err.log" -PassThru -WindowStyle Hidden
 $origin="http://127.0.0.1:$port";$r=$null
 for($i=0;$i -lt 40;$i++){try{$r=Invoke-WebRequest "$origin/" -UseBasicParsing -TimeoutSec 2;if($r.StatusCode -eq 200){break}}catch{Start-Sleep -Milliseconds 300}}
 if(!$r -or $r.StatusCode -ne 200){throw 'Preview unavailable'}
 $l=@(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop|Where-Object LocalAddress -eq '127.0.0.1')
 if($l.Count -ne 1 -or $l[0].OwningProcess -ne $p.Id){throw 'Preview PID mismatch'}
 function ResponseHash($r){$s=[Security.Cryptography.SHA256]::Create();try{[BitConverter]::ToString($s.ComputeHash($r.RawContentStream.ToArray())).Replace('-','').ToLowerInvariant()}finally{$s.Dispose()}}
 if((ResponseHash $r) -ne ($mf|Where-Object path -eq 'index.html').sha256){throw 'Index mismatch'}
 if((ResponseHash (Invoke-WebRequest "$origin/$($g0.entry)" -UseBasicParsing -TimeoutSec 10)) -ne $g0.entrySha256){throw 'Entry mismatch'}
 $g.preview=200;$g.entrySha256=$g0.entrySha256
 $env:BODYFORGE_QA_ORIGIN=$origin;$env:BODYFORGE_DEV_ORIGIN=$origin;$env:BODYFORGE_QA_EXPECT_ENTRY_SHA256=$g0.entrySha256;$env:BODYFORGE_QA_ARTIFACT_DIR="$a/mobile-retry-shots";$env:NO_COLOR='1'
 Write-Output 'MOBILE_RETRY_EXACT_BUILD_START'
 $ErrorActionPreference='Continue'
 & node $f 2>&1 | Out-File "$a/mobile-retry.log" -Encoding UTF8 -Width 4096
 $g.mobile=$LASTEXITCODE;Write-Output "MOBILE_EXIT=$($g.mobile)";Get-Content "$a/mobile-retry.log" -Tail 24 -Encoding UTF8
 $ErrorActionPreference='Stop'
 VerifyBuild
 if((Get-FileHash $f).Hash -ne $own){throw 'QA changed during run'}
 $g.frozenSourceAndBuildUnchanged=$true
 if($g.mobile -ne 0 -or !(Select-String -LiteralPath "$a/mobile-retry.log" -Pattern '^BODYFORGE_MOBILE_E2E_PASS')){throw 'Mobile gate failed'}
}catch{$g.error=$_.Exception.Message;Write-Output "GATE_ERROR=$($_.Exception.Message)"}finally{
 if($p -and !$p.HasExited){Stop-Process -Id $p.Id -ErrorAction SilentlyContinue;$p.WaitForExit(5000)|Out-Null}
 $g.previewStopped=(!$p -or $p.HasExited);$g.finished=(Get-Date).ToString('o')
 $g|ConvertTo-Json -Depth 5|Set-Content "$a/mobile-retry-gates.json" -Encoding UTF8
 Get-Content "$a/mobile-retry-gates.json" -Raw
}