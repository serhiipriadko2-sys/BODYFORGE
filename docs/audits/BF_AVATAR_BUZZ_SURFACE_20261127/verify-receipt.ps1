Set-Location 'E:\github\BODYFORGE'
$ErrorActionPreference='Stop'
$root=(Get-Location).Path
$g='docs/audits/BF_AVATAR_GROOM_V3_20261127';$b='docs/audits/BF_AVATAR_BUZZ_SURFACE_20261127'
$raw=Get-Content "$b/full-vitest.log" -Raw
$plain=[regex]::Replace($raw,[string][char]27+'\[[0-9;]*m','')
$test=[regex]::Match($plain,'Tests\s+(\d+) passed\s+\((\d+)\)')
$tf=[regex]::Match($plain,'Test Files\s+(\d+) passed\s+\((\d+)\)')
if(!$test.Success -or !$tf.Success -or $test.Groups[1].Value -ne $test.Groups[2].Value -or $tf.Groups[1].Value -ne $tf.Groups[2].Value){throw 'Full test result not established'}
$tests=[int]$test.Groups[1].Value;$testfiles=[int]$tf.Groups[1].Value
$expected=@{
 'public/assets/bodyforge-athlete-efficient.glb'='DF8C4E3D0D8EBFBD6A03B83E537663BDA41DF5D0D30259AD1B530C2A2ABEFA7E'
 'public/assets/bodyforge-strand-groom-v2.glb'='1F1D2D3D40A043BFBEBF185BE3614854588F755D1CE3028E3498976436714BC1'
 '.bodyforge-qa/groom-review-v3/bodyforge-strand-groom-v3.glb'='37FD6CA23F50D666DFBE64B81AE8746B049CEC64998E4770CB7466945A54B8D5'
 'scripts/author-strand-groom-v3.py'='B06E4584CB9437BC359B98C75C2DC4A36592BC1CB989218B8F2E799262B82AA4'
 'src/lib/avatarDirectionalGroomReview.ts'='DFC8301F8968972A4CEF9C830AB84D22F29B9816D685D641CEE239A7355A03EA'
 'src/lib/avatarDirectionalGroomReview.test.ts'='D3C1C6EF2585CBAF046755970B5E180E9BCE01431724C99C8841494380E0C190'
 'qa/local-avatar-groom-review.ts'='05480E760D7B133A24335BC7845A26986702F66B8B07C4FA86A207F7315D89BD'
 'vite.config.ts'='0F10406CBD7F313E494DBF803395DA77FDFBAA6175A5E5808B7094FC6D1F1C40'
 'src/components/Avatar3D.tsx'='98DC6EA73C7351ACE1599D3E62B1E6000F7191B2A1CF4D8C865A72065DB2FE9F'
 'src/lib/avatarSkinLighting.ts'='D221F073144B922CF455EFF792578C0E1141B2B68F1AF9E27F0D2EE43795DB85'
 'qa/avatar-quality-e2e.mjs'='D90BF8579CDF95DE00E76055CADEAF8C77A17A5AB1C46AC9894750B1AF997102'
 'src/lib/avatarBuzzReview.ts'='2AD9E017C78BA6A94E68F98646CEBD7B6CE7D0B05F26548991FC7B608B1302C0'
 'src/lib/avatarBuzzReview.test.ts'='4EE510365ED9FB1B67AC1A357A9C1A0F0DAC5C8A5CB6AC959038885ECC1EEF15'
 "$g/matched-groom-comparison.png"='ED3A19967927CD5D4C60006CDE68D0670AAF25A5357B33D76B60F2E5D75EC635'
 "$b/matched-buzz-comparison.png"='5F15D9484746BE1B97E25D104B31175A1758BD4BE2A602333F3D4F82C440D36A'
 "$b/Avatar3D.tsx.before.txt"='0995BEB3FC8DAF6C716626CEACC9D190AA7759F30DD29D1C78706D6E367E200C'
 "$b/avatar-quality-e2e.mjs.before.txt"='040569AF191E6BB86FA345D8A90025E6A2D792B067827710DBA95BCB71F4B8C4'
 "$b/avatarSkinLighting.ts.before.txt"='C595B33A44E0177938F086366E1867D1DBE3B254D6EF8CFB3E5A3010BA2D8E30'
}
foreach($p in $expected.Keys){if((Get-FileHash -LiteralPath $p).Hash -ne $expected[$p]){throw "Drift $p"}}
foreach($stage in @(@($g,85,21),@($b,60,14))){
 $total=0;$count=0
 foreach($mode in @('on','off','fallback')){
   $file="$($stage[0])/$mode.log";if(!(Test-Path $file)){continue}
   $line=Get-Content $file|Where-Object {$_ -like 'ATHLETE_GROOM_V3_PASS *'}|Select-Object -Last 1
   if(!$line){throw "Missing successful browser summary $file"}
   $o=$line.Substring('ATHLETE_GROOM_V3_PASS '.Length)|ConvertFrom-Json
   $total+=$o.assertions;$count+=$o.screenshots.Count
   foreach($shot in $o.screenshots){if(!(Test-Path -LiteralPath $shot.file) -or (Get-Item -LiteralPath $shot.file).Length -ne $shot.bytes){throw 'Frame mismatch'}}
 }
 if($total -ne $stage[1] -or $count -ne $stage[2]){throw 'Browser totals drift'}
}
$hits=@(Get-ChildItem dist/assets -Filter '*.js' | Select-String -SimpleMatch -Pattern 'BF_BUZZ_SURFACE_V1','avatarBuzzSurface','bfBuzzAtlas','BODYFORGE_DIRECTIONAL_GROOM_V3','avatarGroomV3')
if($hits.Count -ne 0){throw 'Experimental production markers'}
$report=@"
# BODYFORGE scalp-surface buzz V1 — verified local review

Status: technical PASS for scoped opt-in hair experiments; AAA PARTIAL. No commit, push, deployment, distribution, real user-save mutation or OS setting change.

## Scope
- V3 directional card hair already verified in sibling BF_AVATAR_GROOM_V3_20261127 (85 browser assertions, 21 frames). The previous body and V2 hair GLBs remain byte-exact. Both styles retain head anchoring and existing dye control.
- New optional scalp-surface buzz uses the real skin mesh instead of the old opaque 1792-triangle shell (5376 indices). 256x256 R8 tile, 65536 base bytes; 16x16 jittered short projected segments, 0.72 mm nominal spacing, artistic width/length, mean atlas coverage 0.0909494. No new geometry or draw pass; 3 triplanar textureGrad samples on enabled scalp fragments. Reference for approximate scale: https://bionumbers.hms.harvard.edu/bionumber.aspx?id=116431 and https://pmc.ncbi.nlm.nih.gov/articles/PMC9113037/. Not a density measurement or physically measured hair reflectance.
- Existing scalp boundaries and skin lighting retained. Texture lifetime tied to body material. In review mode with V3 missing, the old buzz cap remains visible, and the surface shader stays disabled. On other hairstyles the uniform is disabled.

## Verification
- 18/18 targeted tests (5 files), full Vitest $tests/$tests ($testfiles files), final TypeScript/Vite build exit 0. Experimental markers absent from production JS. V3 local endpoint 7/7 checks.
- Current buzz browser on/fallback: 30/30 assertions each, 14 frames. Enabled scenario observed 9 active surface draws, 90 inactive, zero original cap draws. Fallback: zero active draws, 99 inactive, 6 original cap draws. Verified switching away, exact synthetic game bytes unchanged, all four groups at maximum, no uncaught browser exceptions. Total for both sequential checkpoints: 145 browser assertions, 35 actual frames (not 145 distinct features).
- Matched comparison: five non-buzz portrait crops exactly identical to prior V3; buzz portrait 8514 changed pixels of 110250; all seven fallback crops identical to prior V2; torso crop changed 23134 pixels with maximum decoded channel difference 2/255. Possible draw timing/low-amplitude shading variation; no claim of global byte identity. No calibration or photorealism score.
- matched-buzz-comparison.png: 337160 bytes, SHA256 5f15d9484746be1b97e25d104b31175a1758bd4be2a602333f3d4f82c440d36a.
- Visual observation: eliminates helmet silhouette and gives visible skin between hairs. Current material resembles closely shaved scalp rather than dense short-cut hair; hairline and pigmentation require artistic refinement. Dark V3 long hair still slightly over-glossy.
- Memory headroom recovered before testing; guarded sequential browser and test runs completed. No hardware Android benchmark. No ADB on PATH observed. No global performance or zero-error claim. Existing V3 checkpoint bundle-size warning; latest build succeeded.

## Local review
http://127.0.0.1:5173/?avatarScanTorso=1&avatarScanTorsoColor=1&avatarScanTorsoNormal=1&avatarAthletic=1&avatarSkinDiffusion=1&avatarHeadVolume=1&avatarGroomV3=1&avatarBuzzSurface=1

Next acceptance gate: improve visual hair density and pigment under multiple lights, then stronger head/skin and muscular relief work and actual device profiling. Current experimental switches are excluded from production assets. Do not equate QA with AAA visual acceptance.
"@
$rp=Join-Path $root "$b/REPORT.md";$receipt=Join-Path $root "$b/RECEIPT.json"
if((Test-Path $rp) -or (Test-Path $receipt)){throw 'Report already exists'}
[IO.File]::WriteAllText($rp,$report,[Text.UTF8Encoding]::new($false))
$paths=@($expected.Keys)+@((Get-ChildItem $g,$b -Recurse -File)|ForEach-Object {$_.FullName.Substring($root.Length+1).Replace('\','/')})
$files=@(foreach($p in ($paths|Sort-Object -Unique)){$i=Get-Item -LiteralPath $p;if($i.Length -le 0 -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw "Invalid $p"};[ordered]@{path=$p;bytes=$i.Length;sha256=(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant()}})
$r=[ordered]@{status='PARTIAL_AAA_SCOPE_PASS';head=(git rev-parse HEAD);localOnly=$true;productionDeployment=$false;tests=@{unit=$tests;unitFailed=0;files=$testfiles;targeted=18;endpoint=7;browserAssertions=145;browserFrames=35;build='PASS';physicalAndroid='NOT_RUN'};privateMarkersInProductionJs=0;count=$files.Count;files=$files}
[IO.File]::WriteAllText($receipt,($r|ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false))
$read=Get-Content $receipt -Raw|ConvertFrom-Json
foreach($f in $read.files){if((Get-Item -LiteralPath $f.path).Length -ne $f.bytes -or (Get-FileHash -LiteralPath $f.path).Hash -ne $f.sha256){throw "Readback mismatch $($f.path)"}}
if($read.files.Count -ne $read.count){throw 'Count mismatch'}
"RECEIPT_PASS $($read.count)/$($read.count)"
foreach($p in @($rp,$receipt)){ "$p bytes=$((Get-Item -LiteralPath $p).Length) sha256=$((Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant())" }
code.cmd -r "$b/REPORT.md" "$b/matched-buzz-comparison.png" "$g/matched-groom-comparison.png"
