[Console]::OutputEncoding=[Text.UTF8Encoding]::new()
$ErrorActionPreference='Stop'
Set-Location 'E:\github\BODYFORGE'
$root=(Get-Location).Path
$a=Join-Path $root 'docs/audits/BF_107_ACTIVATION_FENCE_20261127'
$copy=(Get-Content "$a/isolated-root.txt" -Raw).Trim()
$deps=Join-Path $root 'node_modules'
$link=Join-Path $copy 'node_modules'
if(Test-Path $link){throw 'Dependency junction exists'}
New-Item -ItemType Junction -Path $link -Target $deps|Out-Null
$m=Get-Content "$a/source.json" -Raw|ConvertFrom-Json
$g=[ordered]@{head=(Get-Content "$a/head.txt" -Raw).Trim();sourceCount=$m.Count;sourceManifestSha256=(Get-FileHash "$a/source.json").Hash;tsc='NOT_RUN';journal='NOT_RUN';unit='NOT_RUN';build='NOT_RUN';bundle='NOT_RUN';towerV2='NOT_RUN';mobile='NOT_RUN';privacy='NOT_RUN';started=(Get-Date).ToString('o')}
$env:CI='true';$env:NO_COLOR='1';$env:FORCE_COLOR='0';$dev=$null;$preview=$null
function Gate([string]$label,[string]$log,[string[]]$argv){
 $ErrorActionPreference='Continue'
 & node @argv 2>&1|Out-File (Join-Path $a $log) -Encoding UTF8 -Width 4096
 $c=$LASTEXITCODE;Write-Output "$label exit=$c"|Out-Host
 Get-Content (Join-Path $a $log) -Tail 9 -Encoding UTF8|ForEach-Object{if($_.Length -lt 2000){$_|Out-Host}}
 return $c
}
function FreePort{
 $busy=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue|Select-Object -ExpandProperty LocalPort)
 $p=(8500..8599|Where-Object {$_ -notin $busy}|Select-Object -First 1)
 if(!$p){throw 'No free port'};return $p
}
function WaitHttp([int]$port,$proc){
 $r=$null;for($i=0;$i -lt 45;$i++){if($proc.HasExited){throw 'Owned server stopped'};try{$r=Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 3;if($r.StatusCode -eq 200){break}}catch{Start-Sleep -Milliseconds 400}}
 if(!$r -or $r.StatusCode -ne 200){throw 'HTTP unavailable'}
 $l=@(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop|Where-Object LocalAddress -eq '127.0.0.1')
 if($l.Count -ne 1 -or $l[0].OwningProcess -ne $proc.Id){throw 'Listener ownership mismatch'}
 return $r
}
function StopOwn($p){if($p -and !$p.HasExited){Stop-Process -Id $p.Id -ErrorAction Stop;$p.WaitForExit(5000)|Out-Null}}
function ResponseHash($r){$s=[Security.Cryptography.SHA256]::Create();try{[BitConverter]::ToString($s.ComputeHash($r.RawContentStream.ToArray())).Replace('-','').ToLowerInvariant()}finally{$s.Dispose()}}
function VerifyCopy{foreach($x in $m){if((Get-FileHash -LiteralPath (Join-Path $copy $x.path)).Hash -ne $x.sha256){throw "Source drift $($x.path)"}}}
try{
 VerifyCopy
 Set-Location -LiteralPath $copy
 $node=(Get-Command node.exe).Source;$vite=Join-Path $deps 'vite/bin/vite.js'
 $g.tools=@('vite','rolldown','vitest','typescript'|ForEach-Object{[pscustomobject]@{path="node_modules/$_/package.json";hash=(Get-FileHash (Join-Path $deps "$_/package.json")).Hash;version=(Get-Content (Join-Path $deps "$_/package.json") -Raw|ConvertFrom-Json).version}})
 $g.tsc=Gate 'TSC' 'tsc.log' @((Join-Path $deps 'typescript/bin/tsc'),'-b')
 if($g.tsc -ne 0){throw 'TypeScript failed'}
 $port=FreePort;$g.devPort=$port
 $env:BODYFORGE_QA_PORT="$port";$env:BODYFORGE_QA_ORIGIN="http://127.0.0.1:$port";$env:BODYFORGE_DEV_ORIGIN=$env:BODYFORGE_QA_ORIGIN
 $launch=Join-Path $root 'docs/audits/BF_107_ENTRY_BUDGET_20261125/isolated-dev-launcher.mjs'
 $dev=Start-Process -FilePath $node -WorkingDirectory $copy -ArgumentList @(('"'+$launch+'"'),('"'+$copy+'"'),('"'+$deps+'"'),"$port") -RedirectStandardOutput "$a/dev.log" -RedirectStandardError "$a/dev-err.log" -PassThru -WindowStyle Hidden
 $r=WaitHttp $port $dev
 if($r.Content -notmatch '/@vite/client'){throw 'Expected Vite dev'}
 foreach($module in @('/src/lib/progression.ts','/src/lib/durableJournal.ts','/src/lib/durableJournalV2.ts','/src/lib/journalCheckpointBatch.ts','/src/lib/journalMixedStorage.ts','/src/lib/activityHistory.ts')){
  $w=$null;for($i=0;$i -lt 3;$i++){try{$w=Invoke-WebRequest "$env:BODYFORGE_QA_ORIGIN$module" -UseBasicParsing -TimeoutSec 45;if($w.StatusCode -eq 200){break}}catch{Start-Sleep -Seconds 1}}
  if(!$w -or $w.StatusCode -ne 200 -or $w.Headers['Content-Type'] -notmatch 'javascript'){throw "Warmup failed $module"}
 }
 $g.journal=Gate 'JOURNAL' 'journal.log' @('qa/durable-journal-e2e.mjs')
 StopOwn $dev
 if($g.journal -ne 0){throw 'Journal gate failed'}
 $g.unit=Gate 'UNIT' 'unit.log' @((Join-Path $deps 'vitest/vitest.mjs'),'run','--pool=threads','--maxWorkers=1','--no-file-parallelism')
 if($g.unit -ne 0){throw 'Unit failed'}
 VerifyCopy
 $g.build=Gate 'BUILD' 'build.log' @($vite,'build')
 if($g.build -ne 0){throw 'Build failed'}
 $dist=Join-Path $copy 'dist'
 $mf=@(Get-ChildItem -LiteralPath $dist -File -Recurse|Sort-Object FullName|ForEach-Object {[pscustomobject]@{path=$_.FullName.Substring($dist.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant()}})
 $mf|ConvertTo-Json -Depth 3|Set-Content "$a/build-manifest.json" -Encoding UTF8
 $g.buildCount=$mf.Count;$g.buildManifestSha256=(Get-FileHash "$a/build-manifest.json").Hash
 $g.bundle=Gate 'BUNDLE' 'bundle.log' @('qa/bundle-on-demand.mjs')
 if($g.bundle -ne 0){throw 'Bundle failed'}
 $entry=@($mf|Where-Object path -match '^assets/index-[\w-]+\.js$')
 if($entry.Count -ne 1){throw 'Entry ambiguous'}
 $g.entry=$entry[0].path;$g.entrySha256=$entry[0].sha256;$g.entryBytes=$entry[0].bytes
 $port=FreePort;$g.previewPort=$port
 $preview=Start-Process -FilePath $node -WorkingDirectory $copy -ArgumentList @(('"'+$vite+'"'),'preview','--host','127.0.0.1','--port',"$port",'--strictPort') -RedirectStandardOutput "$a/preview.log" -RedirectStandardError "$a/preview-err.log" -PassThru -WindowStyle Hidden
 $r=WaitHttp $port $preview
 if((ResponseHash $r) -ne ($mf|Where-Object path -eq 'index.html').sha256){throw 'Index mismatch'}
 if((ResponseHash (Invoke-WebRequest "http://127.0.0.1:$port/$($entry[0].path)" -UseBasicParsing -TimeoutSec 10)) -ne $entry[0].sha256){throw 'Entry mismatch'}
 $g.preview=200
 $env:BODYFORGE_QA_ORIGIN="http://127.0.0.1:$port";$env:BODYFORGE_DEV_ORIGIN=$env:BODYFORGE_QA_ORIGIN
 $env:BODYFORGE_QA_EXPECT_ENTRY_SHA256=$entry[0].sha256;$env:BODYFORGE_QA_ARTIFACT_DIR=Join-Path $a 'browser'
 $env:BODYFORGE_QA_ARTIFACT_DIR=Join-Path $a 'tower-browser'
 $g.towerV2=Gate 'KEYED_V2_GAME_FLOW' 'tower-v2.log' @('qa/tower20-e2e.mjs','--journal-v2')
 if($g.towerV2 -ne 0){throw 'Keyed v2 game flow failed'}
 $env:BODYFORGE_QA_ARTIFACT_DIR=Join-Path $a 'browser'
 $g.mobile=Gate 'MOBILE' 'mobile.log' @('qa/mobile-e2e.mjs')
 $g.privacy=Gate 'PRIVACY' 'privacy.log' @('qa/privacy-server-e2e.mjs')
 StopOwn $preview
 VerifyCopy
 foreach($x in $mf){if((Get-FileHash -LiteralPath (Join-Path $dist $x.path)).Hash -ne $x.sha256){throw 'Build drift'}}
 foreach($x in $g.tools){if((Get-FileHash (Join-Path $root $x.path)).Hash -ne $x.hash){throw 'Toolchain drift'}}
 $g.frozenSourceAndBuildUnchanged=$true
 if($g.mobile -ne 0 -or $g.privacy -ne 0){throw 'Acceptance gate failed'}
}catch{$g.error=$_.Exception.Message;Write-Output "GATE_ERROR=$($_.Exception.Message)"}finally{
 StopOwn $preview;StopOwn $dev
 $g.previewStopped=(!$preview -or $preview.HasExited);$g.devStopped=(!$dev -or $dev.HasExited);$g.finished=(Get-Date).ToString('o')
 $g|ConvertTo-Json -Depth 6|Set-Content "$a/gates.json" -Encoding UTF8
 Get-Content "$a/gates.json" -Raw
 Set-Location -LiteralPath $root
}
