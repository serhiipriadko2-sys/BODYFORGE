from pathlib import Path
from hashlib import sha256
p=Path('qa/import-preview-e2e.mjs')
a=Path('docs/audits/BF_107_GZIP_ARCHIVE_20261125')
old=p.read_bytes()
assert sha256(old).hexdigest()=='fb523ceda0bb526a4ff3f21e4e8b83fc528c466a3886ab4c5d10b4f37f3aa624'
s=old.decode().replace('\r\n','\n')
def once(x,y):
 global s
 assert s.count(x)==1,x
 s=s.replace(x,y)
once("function selectFixture(payload, kind) {","async function selectFixture(payload, kind) {")
once("    kind === 'bad-utf8' ? [new Uint8Array([0xc3,0x28])] : [payload];","""    kind === 'bad-utf8' ? [new Uint8Array([0xc3,0x28])] :
    kind === 'gzip' ? [await new Response(new Blob([payload]).stream().pipeThrough(new CompressionStream('gzip'))).blob()] : [payload];""")
once("  const file = new File(contents, 'bf106-' + kind + '.json', { type: 'application/json' });","  const file = new File(contents, 'bf106-' + kind + (kind==='gzip'?'.json.gz':'.json'), { type: kind==='gzip'?'application/gzip':'application/json' });")
once("  async function requestReplacement(){\n    await choose(backup.json);","  async function requestReplacement(kind='valid'){\n    await choose(backup.json,kind);")
once("""  await requestReplacement();
  await ev("document.querySelector('[data-action=confirm-file-replacement]').click()");
  await until("!!document.querySelector('[data-action=request-replacement-keep]')",'same paid file can be selected again');""","""  await requestReplacement('gzip');
  await ev("document.querySelector('[data-action=confirm-file-replacement]').click()");
  await until("!!document.querySelector('[data-action=request-replacement-keep]')",'same paid file in gzip can be selected again');
  check(await ev("localStorage.getItem('bodyforge:pilot:v1')")===candidate.storedProfileRaw &&
    await ev("localStorage.getItem('bodyforge:pilot:v1:backup')")===candidate.storedBackupRaw,'gzip file replacement stages exact v1 bytes without new authority');""")
with (a/'import-preview-e2e.mjs.before').open('xb') as out:out.write(old)
assert p.read_bytes()==old
p.write_bytes(s.encode())
print(p,p.stat().st_size,sha256(p.read_bytes()).hexdigest())