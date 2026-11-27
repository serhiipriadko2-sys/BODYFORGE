"""Replace only four driven geometry keys with exact BODYFORGE taper fields.
The packed scan textures, scan-relief keys, rig and review subdivision stay intact.
This is a Blender authoring scene, not the browser pose or production GLB.
"""
import bpy
import hashlib
import json
import numpy as np
from pathlib import Path


root = Path.cwd()
old = root / '.bodyforge-qa/scan-torso-textured-review.blend'
prefix = root / '.bodyforge-qa/athletic-taper-authoring-v2'
output = root / '.bodyforge-qa/athletic-taper-review-v2.blend'
report = root / 'docs/audits/BF_AVATAR_ANATOMICAL_TAPER_20261127/blender-authoring.json'
def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

assert sha(old) == '9057d807f671e24b45b5676f376dd05108dbe388efc6da0d05c7028638c10b8a'
assert not output.exists() and not report.exists()
manifest = json.loads(prefix.with_suffix('.json').read_text(encoding='utf-8'))
assert manifest['revision'] == 'BF_ATHLETIC_TAPER_REVIEW_V2'
assert manifest['fieldSha256'] == sha(root/'src/lib/avatarAthleticReview.ts')
raw = prefix.with_suffix('.bin')
assert raw.stat().st_size == manifest['bytes'] == 4340640
assert sha(raw) == manifest['sha256']
data = np.fromfile(raw,dtype='<f4')
assert np.isfinite(data).all()
groups = manifest['groups']
assert groups == ['arms','core','legs','back']
topology=json.loads((report.parent/'topology-source.json').read_text(encoding='utf-8'))
assert topology['assetSha256']=='df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
topology={m['name']:m for m in topology['meshes']}
def check_topology(obj,m):
    obj.data.calc_loop_triangles()
    t=np.array([v.vertices[:] for v in obj.data.loop_triangles],dtype='<u4')
    t.sort(axis=1)
    t=t[np.lexsort((t[:,2],t[:,1],t[:,0]))]
    digest=hashlib.sha256(t.tobytes()).hexdigest()
    ref=topology[m['name']]
    assert len(t)==ref['triangles'] and digest==ref['topologySha256'],(obj.name,digest,ref)
    return digest

bpy.ops.wm.open_mainfile(filepath=str(old),load_ui=False)
results = []
for m in manifest['meshes']:
    obj = bpy.data.objects[m['name']]
    keys = obj.data.shape_keys.key_blocks
    assert len(keys) == 8
    a = data[m['offset']//4:(m['offset']+m['bytes'])//4].reshape(m['count'],15)
    assert a.shape == (m['count'],15)
    # glTF coordinates -> Blender coordinates.
    rest = a[:,:3][:,[0,2,1]] * np.array([1,-1,1])
    topology_hash = check_topology(obj,m)
    basis = np.empty(len(keys['Basis'].data)*3,dtype=np.float32)
    keys['Basis'].data.foreach_get('co',basis)
    basis = basis.reshape(-1,3)
    # Existing Blender import has a measured sub-30um basis difference.
    # Require the complete canonical triangle-index hash before using order.
    assert len(basis)==len(rest)==m['count']
    error=float(np.linalg.norm(basis-rest,axis=1).max())
    assert error<3e-5,(m['name'],error)
    mapping=np.arange(m['count'])
    for g, group in enumerate(groups):
        delta = a[mapping,3+g*3:6+g*3][:,[0,2,1]]*np.array([1,-1,1])
        new = (basis+delta).astype(np.float32)
        key = keys['BF_'+group+'_level5']
        key.data.foreach_set('co',new.ravel())
        check = np.empty(new.size,dtype=np.float32)
        key.data.foreach_get('co',check)
        assert np.array_equal(check,new.ravel())
    results.append({'mesh':m['name'],'sourceVertices':m['count'],'blenderVertices':len(basis),'maxMatchErrorM':error,'topologySha256':topology_hash})
c = bpy.data.objects['BODYFORGE Growth Review Controls']
for g in groups:
    c[g] = 0
c['note'] = 'Exact taper V2 runtime geometry keys. App separately adds bone growth, pose and clothing corrections.'
bpy.context.scene['BF_review'] = 'BF_ATHLETIC_TAPER_REVIEW_V2: exact geometry keys, scan color and normal review; offline geometry preview only.'
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
output_sha=sha(output)
# Reopen the bytes and verify all driven shape-key values.
bpy.ops.wm.open_mainfile(filepath=str(output),load_ui=False)
c=bpy.data.objects['BODYFORGE Growth Review Controls']
for m in manifest['meshes']:
    obj=bpy.data.objects[m['name']]
    check_topology(obj,m)
    keys=obj.data.shape_keys.key_blocks
    a=data[m['offset']//4:(m['offset']+m['bytes'])//4].reshape(-1,15)
    basis=np.empty(m['count']*3,np.float32)
    keys['Basis'].data.foreach_get('co',basis)
    basis=basis.reshape(-1,3)
    for i,g in enumerate(groups):
        delta=a[:,3+i*3:6+i*3][:,[0,2,1]]*np.array([1,-1,1])
        actual=np.empty(basis.size,np.float32)
        keys['BF_'+g+'_level5'].data.foreach_get('co',actual)
        assert np.array_equal(actual,(basis+delta).astype(np.float32).ravel()),(m['name'],g)
cases=0
for g in groups:
    for level in range(6):
        for other in groups:
            c[other]=level if other==g else 0
        c.update_tag()
        bpy.context.view_layer.update()
        for m in manifest['meshes']:
            keys=bpy.data.objects[m['name']].data.shape_keys.key_blocks
            assert len(keys)==8
            for other in groups:
                assert abs(keys['BF_'+other+'_level5'].value-(level/5 if other==g else 0))<1e-6
            assert abs(keys['BF_Scan_front'].value-(.3+.7*level/5 if g=='core' else .3))<1e-6
            assert abs(keys['BF_Scan_back'].value-(.3+.7*level/5 if g=='back' else .3))<1e-6
            cases+=1
mat=bpy.data.objects['BODYFORGE_Body'].data.materials[0]
images=[n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE']
assert len(images)==2 and all(i.packed_file for i in images)
assert sorted(tuple(i.size) for i in images)==[(1024,1024),(2048,2048)]
assert sha(output)==output_sha
receipt={'status':'PASS','scope':'Exact indexed deltas on preserved Blender basis (sub-30um drift), all five triangle topology hashes and reopened key coordinates verified; 120 driver cases; excludes runtime bone-growth and posed garment fit','revision':manifest['revision'],'sourceFieldSha256':manifest['fieldSha256'],'bridgeSha256':manifest['sha256'],'blend':str(output.relative_to(root)),'bytes':output.stat().st_size,'sha256':output_sha,'driverCases':cases,'meshes':results}
with report.open('x',encoding='utf-8') as f:json.dump(receipt,f,indent=2)
print('BLENDER_TAPER_REVIEW',json.dumps(receipt),flush=True)
