from pathlib import Path
from hashlib import sha256
a=Path('docs/audits/BF_107_GZIP_ARCHIVE_20261125')
p=Path('src/lib/backupArchive.ts')
q=Path('src/components/ProgressBackupPanel.tsx')
c=Path('src/components/progressBackup.css')
j=Path('qa/mobile-e2e.mjs')
expected={p:'b9bbcc3fd7599d6b819bf3cd6c0242129e3fe47965a438f1609fecf7be23a222',q:'aa7f8f2ad2f06ca89d6239e928821e8d375709e0e30994665daf5ec428a6554c',c:'6b930b8ebb01546f83696ba807efb55d3359b793e7ed05b30fd866d493d9b9bd',j:'b83a15cbf457d2b3b88a11a030498f49d9c8057bf49a6e0be4805e2351f51b08'}
old={f:f.read_bytes() for f in expected}
for f,h in expected.items():assert sha256(old[f]).hexdigest()==h,f
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
s=old[p].decode().replace('\r\n','\n')
s=once(s,'  const source = new Blob([json]);',"  if (json.length > MAX_ARCHIVE_SOURCE_BYTES) return { status: 'too-large' };\n  let source: Blob;\n  try { source = new Blob([json]); } catch { return { status: 'unavailable' }; }")
z=old[q].decode().replace('\r\n','\n')
z=once(z,"    const packed = await prepareBackupArchive(prepared.json, prepared.filename, controller.signal);","    const packed = await prepareBackupArchive(prepared.json, prepared.filename, controller.signal)\n      .catch(() => ({ status: 'unavailable' } as const));")
z=once(z,"      setMessage('Архив подготовлен, распаковка проверена. Выбери файл для скачивания.');","""      setMessage(packed.inspectableSize && prepared.complete
        ? 'Архив подготовлен, распаковка проверена. Выбери файл для скачивания.'
        : 'Архив подготовлен для разбора. Полнота или размер исходного JSON ограничивают проверку. Не очищай данные.');""")
z=once(z,"      setMessage(archive.inspectableSize\n", "      setMessage(archive.inspectableSize && prepared.complete\n")
z=once(z,"Распакованный JSON превышает предел проверки. Не очищай данные.","Проверка исходных данных ограничена. Не очищай данные.")
w=old[c].decode().replace('\r\n','\n')+"\n.progress-backup-actions [data-archive-stage] { margin-top: 8px; }\n"
v=old[j].decode().replace('\r\n','\n')
v=once(v,"if (blob.type.includes('application/json')) window.__bfExportBlobs.set(uri, blob);","if (blob.type.includes('application/json') || blob.type==='application/gzip') window.__bfExportBlobs.set(uri, blob);")
v=once(v,"        window.__bfExportSample = { filename: this.download, blob: window.__bfExportBlobs.get(this.href) };","        const sample={filename:this.download,blob:window.__bfExportBlobs.get(this.href)};\n        if(this.download.endsWith('.gz'))window.__bfArchiveSample=sample;\n        else window.__bfExportSample=sample;")
x="    'manual selected-file inspection confirms structure without claiming a restore');"
v=once(v,x,x+r"""
  // GZIP is an optional exact wrapper around the same v1 backup.
  await click('[data-action=prepare-progress]');
  await until("document.querySelector('#progress-backup')?.dataset.backupStage==='ready'",'gzip source prepared',12000);
  const archiveSourceBytes = await js("Number(document.querySelector('[data-backup-bytes]').dataset.backupBytes)");
  await click('[data-action=prepare-progress-archive]');
  await until("document.querySelector('[data-archive-stage]')?.dataset.archiveStage==='ready'",'gzip round trip verified',20000);
  const archiveBytes = await js("Number(document.querySelector('[data-archive-bytes]').dataset.archiveBytes)");
  check(archiveBytes>0&&archiveBytes<archiveSourceBytes,'gzip is smaller than the prepared JSON');
  await click('[data-action=download-progress-archive]');
  const archiveSample = await js("(async()=>{const s=window.__bfArchiveSample;const text=await new Response(s.blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();const p=JSON.parse(text);return {name:s.filename,bytes:s.blob.size,sourceBytes:new Blob([text]).size,primary:p.storedProfileRaw,version:p.exportSchemaVersion,complete:p.complete}})()");
  check(archiveSample.name.endsWith('.json.gz')&&archiveSample.bytes===archiveBytes&&archiveSample.sourceBytes===archiveSourceBytes&&archiveSample.primary===beforeBackup&&archiveSample.version===1&&archiveSample.complete,'actual GZIP download preserves exact profile evidence');
  console.log('GZIP_SAMPLE',JSON.stringify({sourceBytes:archiveSourceBytes,archiveBytes}));
  await js("(()=>{const input=document.querySelector('[data-action=inspect-progress-file]'),dt=new DataTransfer();dt.items.add(new File([window.__bfArchiveSample.blob],'backup.json.gz',{type:'application/gzip'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
  await until("document.querySelector('[data-import-preview]')?.dataset.importPreview==='preview-ready'",'selected gzip preview ready',10000);
  check(await js("document.querySelector('.progress-backup-file-checker').dataset.inspectionState==='readable'"),'selected gzip uses the existing strict comparison');
  await js("(async()=>{const data=new Uint8Array(await window.__bfArchiveSample.blob.arrayBuffer());data[data.length-8]^=1;const input=document.querySelector('[data-action=inspect-progress-file]'),dt=new DataTransfer();dt.items.add(new File([data],'corrupt.json.gz',{type:'application/gzip'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
  await until("document.querySelector('.progress-backup-file-checker')?.dataset.inspectionState==='invalid'",'corrupt gzip rejected',10000);
  check(await js("!document.querySelector('[data-import-preview]')&&localStorage.getItem('bodyforge:pilot:v1')!==null"),'corrupt archive exposes no comparison');
  check(await js("localStorage.getItem('bodyforge:pilot:v1')")===beforeBackup,'gzip export and inspection never rewrite the wallet');
  // A stale prepared archive must be invalidated just like the JSON.
  await click('[data-action=prepare-progress]');
  await until("document.querySelector('#progress-backup')?.dataset.backupStage==='ready'",'stale test source ready',12000);
  await click('[data-action=prepare-progress-archive]');
  await until("document.querySelector('[data-archive-stage]')?.dataset.archiveStage==='ready'",'stale test archive ready',20000);
  await js("window.dispatchEvent(new StorageEvent('storage',{key:'bodyforge:avatar-look:v1'}));true");
  await until("document.querySelector('#progress-backup')?.dataset.backupStage==='idle'&&!document.querySelector('[data-action=download-progress-archive]')",'archive invalidated by another tab');
  check(await js("!document.querySelector('[data-action=download-progress-archive]')"),'stale gzip is not offered for download');
""")
x="    'oversize evidence download is not presented as an inspectable backup');"
v=once(v,x,x+r"""
  await click('[data-action=prepare-progress-archive]');
  await until("document.querySelector('[data-archive-stage]')?.dataset.archiveStage==='ready'",'oversized gzip evidence prepared',30000);
  check(await js("document.querySelector('[data-action=download-progress-archive]').textContent.includes('ДЛЯ РАЗБОРА')&&Number(document.querySelector('[data-archive-bytes]').dataset.archiveBytes)<16*1024*1024"),'small gzip still warns about oversized inflated JSON');
  await click('[data-action=download-progress-archive]');
  const gzipEvidence=await js("(async()=>{const s=window.__bfArchiveSample,text=await new Response(s.blob.stream().pipeThrough(new DecompressionStream('gzip'))).text(),p=JSON.parse(text),row=p.durableResults.find(x=>x.key==='bodyforge:pilot:v1:result:qa-large-evidence');return {bytes:s.blob.size,sourceBytes:new Blob([text]).size,exact:row?.baseProfileRaw==='я'.repeat(8*1024*1024)&&p.storedProfileRaw!==null}})()");
  check(gzipEvidence.exact&&gzipEvidence.sourceBytes>16*1024*1024&&gzipEvidence.bytes<gzipEvidence.sourceBytes,'oversize gzip preserves original journal evidence');
  console.log('GZIP_LARGE_SAMPLE',JSON.stringify(gzipEvidence));
  await js("(()=>{const input=document.querySelector('[data-action=inspect-progress-file]'),dt=new DataTransfer();dt.items.add(new File([window.__bfArchiveSample.blob],'large.json.gz',{type:'application/gzip'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
  await until("document.querySelector('.progress-backup-file-checker')?.dataset.inspectionState==='invalid'",'inflated gzip over limit rejected',20000);
  check(await js("document.querySelector('[data-inspection-result]').textContent.includes('Распакованный JSON')&&!document.querySelector('[data-import-preview]')"),'gzip cannot bypass the decoded size limit');
  await click('[data-action=prepare-progress]');
  await until("document.querySelector('[data-backup-capacity]')?.dataset.backupCapacity==='oversize'",'plain evidence remains available',20000);
""")
v=once(v,"delete window.__bfExportSample;return true","delete window.__bfExportSample;delete window.__bfArchiveSample;return true")
for f,data in old.items():
 with (a/(f.name+'.before-qa')).open('xb') as out:out.write(data)
for f,data in old.items():assert f.read_bytes()==data
for f,content in [(p,s),(q,z),(c,w),(j,v)]:
 f.write_bytes(content.encode());print(f,f.stat().st_size,sha256(f.read_bytes()).hexdigest())