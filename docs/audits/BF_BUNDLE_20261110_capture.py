"""Seal the compiled QA artifact; never edit application sources or Git."""
from pathlib import Path
import datetime, hashlib, json, shutil, subprocess

root = Path('C:/github/BODYFORGE').resolve()
target = root / '.bodyforge-qa/bundle-20261110-final'
assert target.resolve().is_relative_to(root) and not target.exists()
def record(path):
    data = path.read_bytes()
    return {'path': path.relative_to(root).as_posix(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

inputs = sorted(p for p in (root / 'src').rglob('*') if p.is_file())
inputs += [root / p for p in ['package.json', 'package-lock.json', 'vite.config.ts', 'index.html',
    'qa/mobile-e2e.mjs', 'qa/bundle-on-demand.mjs', 'qa/on-demand-camera-e2e.mjs',
    'qa/appearance-e2e.mjs', 'qa/training-experience-e2e.mjs']]
source = [record(p) for p in inputs]
dist = root / 'dist'
files = sorted(p for p in dist.rglob('*') if p.is_file())
build = [record(p) for p in files]
target.mkdir(parents=True)
for path, expected in zip(files, build):
    assert not path.is_symlink()
    output = target / path.relative_to(dist)
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, output)
    assert hashlib.sha256(output.read_bytes()).hexdigest() == expected['sha256']
assert source == [record(p) for p in inputs], 'Source changed while sealing build'
assert build == [record(p) for p in files], 'dist changed while sealing build'
manifest = {'schema': 'bodyforge.compiled-qa-snapshot.v1',
    'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'buildDirectory': target.relative_to(root).as_posix(), 'origin': 'http://127.0.0.1:5193',
    'inputs': source, 'dist': build,
    'note': 'App source edits are in the primary workspace; only compiled output is copied for stable QA.'}
output = root / 'docs/audits/BF_BUNDLE_20261110.inputs.json'
output.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
print(json.dumps({'manifest': record(output), 'buildFiles': len(files), 'sourceFiles': len(source), 'origin': manifest['origin']}))
