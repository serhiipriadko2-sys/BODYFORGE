"""Read-only, standard-library verification for the licensed groom inputs."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

SOURCE_SHA256 = '5fda92f77defe426475e5518078803f2398b04457758bca280939d6497324dde'
PINNED = {
    'short02.obj': '48f979114adfa712165a69cc55c45a70831af1fb3cba8e2a89120f0c87407b64',
    'short04.obj': '676964a133ee35ffcea1195382bf75542da7a298931e4001bc7b0d7b707225de',
    'short02_diffuse.png': '47fe33831a3929567c733356dd66243116e05df2ace1f884ddca0080b728229f',
    'short04_diffuse.png': '0bef7fc0e403db5a40fabb2111ebfa6f7e8158e204c6e56b8da98e9ef527846e',
    'short02_normal.png': '2cfac7619f8eec77dd90df979d912415058f4f0fc16940cba40a8eb1ae6d74b5',
}


def verify_groom_inputs(root: Path, source_dir: Path) -> dict:
    """Check all pinned files before Blender is imported or outputs are opened."""
    errors = []
    manifest = {}
    try:
        manifest = json.loads((source_dir / 'manifest.json').read_text(encoding='utf8'))
        if not isinstance(manifest, dict) or manifest.get('schema') != 'bodyforge.groom-inputs.v1':
            raise ValueError('expected bodyforge.groom-inputs.v1 manifest')
        if manifest.get('license') != 'CC0-1.0':
            raise ValueError('expected CC0-1.0 input license')
        records = manifest.get('files')
        if not isinstance(records, list) or len(records) != len(PINNED):
            raise ValueError('manifest must list exactly the five pinned inputs')
        if any(not isinstance(rec, dict) or not isinstance(rec.get('path'), str)
               or rec['path'] not in PINNED for rec in records):
            raise ValueError('unknown or unsafe manifest input path')
        records = {rec['path']: rec for rec in records}
        if set(records) != set(PINNED):
            raise ValueError('missing or duplicated manifest input')
    except (OSError, ValueError) as exc:
        errors.append(f'manifest.json: {exc}')
        records = {}

    inputs = []
    for name, expected in PINNED.items():
        try:
            data = (source_dir / name).read_bytes()
            actual = hashlib.sha256(data).hexdigest()
            if actual != expected:
                errors.append(f'{name}: SHA256 mismatch (expected {expected}, actual {actual})')
            record = records.get(name, {})
            if records and (record.get('sha256') != expected or record.get('bytes') != len(data)):
                errors.append(f'{name}: manifest hash/byte count differs from pinned input')
            inputs.append({'path': name, 'bytes': len(data), 'sha256': actual})
        except OSError as exc:
            errors.append(f'{name}: missing or unreadable pinned input ({exc})')

    source = root / 'art/bodyforge-athlete-realistic.blend'
    try:
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        if source_hash != SOURCE_SHA256:
            errors.append(f'{source.name}: source SHA256 mismatch')
    except OSError as exc:
        errors.append(f'{source.name}: missing or unreadable source ({exc})')
    if errors:
        raise ValueError('GROOM_INPUTS_FAIL; no outputs written:\n- ' + '\n- '.join(errors))
    return {'sourceSha256': source_hash, 'inputs': inputs, 'license': manifest['license']}
