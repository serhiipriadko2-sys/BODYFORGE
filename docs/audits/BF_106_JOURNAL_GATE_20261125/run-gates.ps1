[Console]::OutputEncoding=[Text.UTF8Encoding]::new()
$ErrorActionPreference='Stop'
$root='E:\github\BODYFORGE';$a=Join-Path $root 'docs\audits\BF_106_JOURNAL_GATE_20261125';$copy=Join-Path $root '.bodyforge-qa\bf106-journal-gate'
$m=Get-Content "$a/source.json" -Raw|ConvertFrom-Json
function VerifyCopy{foreach($x in $m){if((Get-FileHash -LiteralPath (Join-Path $copy $x.path)).Hash -ne $x.sha256){throw "Frozen drift $($x.path)"}}}
$g=[ordered]@{head=(Get-Content "$a/head.txt" -Raw).Trim();sourceCount=$m.Count;sourceManifestSha256=(Get-FileHash "$a/source.json").Hash;tsc='NOT_RUN';journalGate='NOT_RUN';recovery='NOT_RUN';journal='NOT_RUN';unit='NOT_RUN';build='NOT_RUN';bundle='NOT_RUN';preview='NOT_RUN';tower='NOT_RUN';mobile='NOT_RUN';privacy='NOT_RUN';started=(Get-Date).ToString('o')}
$env:CI='true';$env:NO_COLOR='1';$env:FORCE_COLOR='0';$dev=$null;$preview=$null
function RunGate([string]$name,[string]$log,[string[]]$args2){
 $ErrorActionPreference='Continue'
 & node @args2 2>&1|Out-File "$a/$log" -Encoding UTF8 -Width 4096
 $c=$LASTEXITCODE;Write-Output "$name exit=$c"|Out-Host;Get-Content "$a/$log" -Tail 10|Out-Host
 return $c
}
function FreePort{
 $busy=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue|Select-Object -ExpandProperty LocalPort)
 $p=(6210..6240|Where-Object {$_ -notin $busy}|Select-Object -First 1)
 if(!$p){throw 'No free QA port'};return $p
}
function WaitHttp([int]$port,$proc){
 $r=$null;for($i=0;$i -lt 40;$i++){try{$r=Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 2;if($r.StatusCode -eq 200){break}}catch{Start-Sleep -Milliseconds 400}}
 if(!$r -or $r.StatusCode -ne 200){throw 'Server unavailable'}
 $l=@(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop|Where-Object LocalAddress -eq '127.0.0.1')
 if($l.Count -ne 1 -or $l[0].OwningProcess -ne $proc.Id){throw 'Server ownership mismatch'}
 & node -e "fetch('http://127.0.0.1:$port/').then(r=>{if(!r.ok)process.exitCode=1;console.log('NODE_FETCH='+r.status)}).catch(e=>{console.error(e.cause?.message);process.exitCode=1})"|Out-Host
 if($LASTEXITCODE -ne 0){throw 'Node HTTP preflight failed'};return $r
}
function StopOwn($p){if($p -and !$p.HasExited){Stop-Process -Id $p.Id -ErrorAction Stop;$p.WaitForExit(5000)|Out-Null}}
function ResponseHash($r){$s=[Security.Cryptography.SHA256]::Create();try{[BitConverter]::ToString($s.ComputeHash($r.RawContentStream.ToArray())).Replace('-','').ToLowerInvariant()}finally{$s.Dispose()}}
try{
 Set-Location -LiteralPath $copy;VerifyCopy
 $node=(Get-Command node.exe).Source;$vite=Join-Path $root 'node_modules\vite\bin\vite.js'
 $g.tsc=RunGate 'TSC' 'tsc.log' @((Join-Path $root 'node_modules\typescript\bin\tsc'),'-b')
 if($g.tsc -ne 0){throw 'TypeScript failed'}
 $port=FreePort;$g.devPort=$port
 $env:BODYFORGE_QA_PORT="$port";$env:BODYFORGE_QA_ORIGIN="http://127.0.0.1:$port";$env:BODYFORGE_DEV_ORIGIN=$env:BODYFORGE_QA_ORIGIN
 $dev=Start-Process -FilePath $node -WorkingDirectory $copy -ArgumentList @('"'+(Join-Path $copy 'qa\stable-dev-server.mjs')+'"') -RedirectStandardOutput "$a/dev.log" -RedirectStandardError "$a/dev-err.log" -PassThru -WindowStyle Hidden
 $r=WaitHttp $port $dev;if($r.Content -notmatch '/@vite/client'){throw 'Expected dev'}
 Write-Output 'JOURNAL_GATE_NATIVE_START'
 $g.journalGate=RunGate 'JOURNAL_GATE' 'gate-browser.log' @('qa/journal-gate-e2e.mjs')
 if($g.journalGate -ne 0){throw 'Native coordination failed'}
 $g.recovery=RunGate 'RECOVERY' 'recovery.log' @('qa/profile-replacement-e2e.mjs')
 if($g.recovery -ne 0){throw 'Recovery regression'}
 Write-Output 'FULL_JOURNAL_START'
 $g.journal=RunGate 'JOURNAL' 'journal.log' @('qa/journal-e2e.mjs')
 if($g.journal -ne 0){throw 'Journal regression'}
 StopOwn $dev;VerifyCopy
 Write-Output 'FULL_UNIT_START'
 $g.unit=RunGate 'UNIT' 'unit.log' @((Join-Path $root 'node_modules\vitest\vitest.mjs'),'run','--maxWorkers=1','--no-file-parallelism')
 if($g.unit -ne 0){throw 'Unit failed'}
 $g.build=RunGate 'BUILD' 'build.log' @($vite,'build');if($g.build -ne 0){throw 'Build failed'}
 VerifyCopy;$dist=Join-Path $copy 'dist'
 $mf=@(Get-ChildItem -LiteralPath $dist -File -Recurse|Sort-Object FullName|ForEach-Object {[pscustomobject]@{path=$_.FullName.Substring($dist.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant()}})
 $mf|ConvertTo-Json -Depth 3|Set-Content "$a/build-manifest.json" -Encoding UTF8
 $g.buildCount=$mf.Count;$g.buildManifestSha256=(Get-FileHash "$a/build-manifest.json").Hash
 $g.bundle=RunGate 'BUNDLE' 'bundle.log' @('qa/bundle-on-demand.mjs');if($g.bundle -ne 0){throw 'Bundle failed'}
 $entry=@($mf|Where-Object path -match '^assets/index-[\w-]+\.js$');if($entry.Count -ne 1){throw 'Entry ambiguous'}
 $g.entry=$entry[0].path;$g.entrySha256=$entry[0].sha256
 $port=FreePort;$g.previewPort=$port
 $preview=Start-Process -FilePath $node -WorkingDirectory $copy -ArgumentList @(('"'+$vite+'"'),'preview','--host','127.0.0.1','--port',"$port",'--strictPort') -RedirectStandardOutput "$a/preview.log" -RedirectStandardError "$a/preview-err.log" -PassThru -WindowStyle Hidden
 $r=WaitHttp $port $preview
 if((ResponseHash $r) -ne ($mf|Where-Object path -eq 'index.html').sha256){throw 'Index mismatch'}
 if((ResponseHash (Invoke-WebRequest "http://127.0.0.1:$port/$($entry[0].path)" -UseBasicParsing -TimeoutSec 10)) -ne $entry[0].sha256){throw 'Entry mismatch'}
 $g.preview=200;$env:BODYFORGE_QA_ORIGIN="http://127.0.0.1:$port";$env:BODYFORGE_DEV_ORIGIN=$env:BODYFORGE_QA_ORIGIN;$env:BODYFORGE_QA_EXPECT_ENTRY_SHA256=$entry[0].sha256
 $env:BODYFORGE_QA_ARTIFACT_DIR="$a/tower-shots"
 $g.tower=RunGate 'TOWER' 'tower.log' @('qa/tower20-e2e.mjs')
 $env:BODYFORGE_QA_ARTIFACT_DIR="$a/mobile-shots"
 $g.mobile=RunGate 'MOBILE' 'mobile.log' @('qa/mobile-e2e.mjs')
 $g.privacy=RunGate 'PRIVACY' 'privacy.log' @('qa/privacy-server-e2e.mjs')
 VerifyCopy
 foreach($x in $mf){if((Get-FileHash -LiteralPath (Join-Path $dist $x.path)).Hash -ne $x.sha256){throw "Build drift $($x.path)"}}
 $g.frozenSourceAndBuildUnchanged=$true
 if($g.tower -ne 0 -or $g.mobile -ne 0 -or $g.privacy -ne 0){throw 'Preview QA failed'}
}catch{$g.error=$_.Exception.Message;Write-Output "GATE_ERROR=$($_.Exception.Message)"}finally{
 StopOwn $dev;StopOwn $preview
 $g.devStopped=(!$dev -or $dev.HasExited);$g.previewStopped=(!$preview -or $preview.HasExited);$g.finished=(Get-Date).ToString('o')
 $g|ConvertTo-Json -Depth 6|Set-Content "$a/gates.json" -Encoding UTF8
 Get-Content "$a/gates.json" -Raw
 Set-Location -LiteralPath $root
}