from pathlib import Path
import hashlib,json,shutil,tempfile,stat
r=Path.cwd();a=r/'docs/audits/BF_107_ENTRY_BUDGET_20261125';c=r/'.bodyforge-qa/bf107-entry-budget'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
g=read(a/'gates.json')
assert g['unit']==g['tsc']==g['build']==g['bundle']==g['appearanceLazy']==0
assert g['error']=='HTTP unavailable' and g['journal']=='NOT_RUN' and g['devStopped'] and g['previewStopped']
source=read(a/'source.json');build=read(a/'build-manifest.json')
assert sha(a/'source.json').upper()==g['sourceManifestSha256']
assert sha(a/'build-manifest.json').upper()==g['buildManifestSha256']
for base,rows in [(c,source),(c/'dist',build)]:
 for row in rows:
  p=base/row['path'];assert p.is_file() and not p.is_symlink() and p.stat().st_size==row['bytes'] and sha(p)==row['sha256'],row['path']
d=Path(tempfile.mkdtemp(prefix='bodyforge-isolated-qa-')).resolve()
assert not d.is_relative_to(r.resolve()) and d.parent==Path(tempfile.gettempdir()).resolve()
for row in source:
 p=d/row['path'];p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(c/row['path'],p)
 assert sha(p)==row['sha256'],row['path']
with (a/'isolated-dev-root.txt').open('x',encoding='utf-8') as f:f.write(str(d))
print('ISOLATED_DEV',d,len(source),flush=True)