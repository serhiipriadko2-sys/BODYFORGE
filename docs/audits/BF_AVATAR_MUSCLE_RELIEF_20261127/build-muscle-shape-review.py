"""Independent numpy evaluation + editable local Blender shape-key review."""
import bpy,numpy as np,hashlib,json,math
from pathlib import Path
from mathutils import Quaternion,Vector

root=Path.cwd()
folder=root/'.bodyforge-qa/muscle-relief-v1'
audit=root/'docs/audits/BF_AVATAR_MUSCLE_RELIEF_20261127'
src=root/'public/assets/bodyforge-athlete-efficient.glb'
meta=json.loads((folder/'muscle-shapes.json').read_text(encoding='utf-8'))
binary=(folder/'muscle-shapes.bin').read_bytes()
out=folder/'muscle-relief-review.blend'
receipt=audit/'blender-shape-readback.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
assert not out.exists() and not receipt.exists()
assert meta['schema']=='BF_MUSCLE_SHAPE_REVIEW_V1'
assert sha(src)==meta['assetSha256']=='df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
assert len(binary)==meta['binaryBytes'] and hashlib.sha256(binary).hexdigest()==meta['binarySha256']
for p,h in meta['sourceHashes'].items():assert sha(root/p)==h
groups=meta['groups'];assert groups==['arms','core','legs','back']
assert sum(len(meta['controls'][g]) for g in groups)==34
def coords(data):
    a=np.empty(len(data)*3,dtype=np.float32)
    data.foreach_get('co',a)
    return a.reshape(-1,3)
def read(spec,count):
    assert spec['offset']>=0 and spec['bytes']==count*12 and spec['offset']+spec['bytes']<=len(binary)
    return np.frombuffer(binary,dtype='<f4',count=count*3,offset=spec['offset']).reshape(count,3)
def to_blender(a):return a[:,[0,2,1]]*np.array([1,-1,1],np.float32)
def from_blender(a):return a[:,[0,2,1]]*np.array([1,1,-1],np.float32)
def mapping(raw,record):
    p=read(record['source'],record['count'])
    x=from_blender(raw)
    assert p.shape==x.shape
    if np.max(abs(p-x))<2e-7:
        return np.arange(len(p),dtype=np.int32)
    # Position-defined displacement makes coincident UV-split vertices
    # interchangeable for this comparison, never for topology or weights.
    from mathutils.kdtree import KDTree
    tree=KDTree(len(p))
    for i,point in enumerate(p):tree.insert(tuple(point),i)
    tree.balance()
    nearest=[tree.find(tuple(point)) for point in x]
    ix=np.asarray([v[1] for v in nearest],dtype=np.int32)
    error=float(np.max(np.linalg.norm(p[ix]-x,axis=1)))
    assert error<5e-5,(record['name'],error)
    print('VERTEX_MAPPING',record['name'],len(ix),error,flush=True)
    return ix
def independent(p,controls):
    d=np.zeros_like(p,dtype=np.float64)
    for c in controls:
        for side in ([1] if c.get('midline',False) else [1,-1]):
            mirror=np.array([side,1,1],np.float64)
            center=np.asarray(c['center'])*mirror
            n=np.asarray(c['normal'])*mirror;n=n/np.linalg.norm(n)
            u=np.asarray(c['along'])*mirror;u=u-n*np.dot(u,n);u=u/np.linalg.norm(u)
            v=np.cross(n,u);v=v/np.linalg.norm(v)
            A=np.stack([u,v,n],axis=1)/np.asarray(c['radius'])
            projected=(p-center)@A
            q=np.maximum(0,1-np.einsum('ij,ij->i',projected,projected))
            d+=q[:,None]**3*(n*c['amplitude'])
    return d

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(src.resolve()))
control=bpy.data.objects.new('BF_Review_Controls',None)
bpy.context.collection.objects.link(control)
control.empty_display_type='PLAIN_AXES';control.empty_display_size=.10
control.location=(.8,0,1.4);control.hide_render=True
control['Review_scope']='Raw bind-pose volume + relief; no scan/pose/cloth repairs/runtime shading.'
for name in groups:
    control[name]=5.0
    control.id_properties_ui(name).update(min=0,max=5,soft_min=0,soft_max=5,description='BODYFORGE paid level: 0 to 5')
control['relief_strength']=1.0
control.id_properties_ui('relief_strength').update(min=0,max=1,soft_min=0,soft_max=1,description='Compare volume-only at 0 versus volume plus new relief at 1')
def driver(block,group,kind):
    f=block.driver_add('value');d=f.driver;d.type='SCRIPTED'
    v=d.variables.new();v.name='level';v.type='SINGLE_PROP'
    v.targets[0].id_type='OBJECT';v.targets[0].id=control;v.targets[0].data_path='["'+group+'"]'
    if kind=='relief':
        v=d.variables.new();v.name='strength';v.type='SINGLE_PROP'
        v.targets[0].id_type='OBJECT';v.targets[0].id=control;v.targets[0].data_path='["relief_strength"]'
        d.expression='level/5.0*strength'
    else:d.expression='level/5.0'
result=[]
for record in meta['meshes']:
    obj=bpy.data.objects[record['name']]
    assert obj.type=='MESH' and len(obj.data.vertices)==record['count'] and obj.data.shape_keys is None
    assert any(m.type=='ARMATURE' for m in obj.modifiers)
    raw=coords(obj.data.vertices);ix=mapping(raw,record);p=read(record['source'],record['count']).astype(np.float64)
    basis=obj.shape_key_add(name='Basis',from_mix=False)
    peak_error=0.;active=0;import_delta_error=0.
    for group in groups:
        for kind in ['volume','relief']:
            delta=read(record['fields'][group][kind],record['count'])
            if kind=='relief':
                check=independent(p,meta['controls'][group])
                err=float(np.max(abs(check-delta)))
                assert err<2e-8,(record['name'],group,err)
                peak_error=max(peak_error,err)
                import_err=float(np.max(abs(independent(from_blender(raw).astype(np.float64),meta['controls'][group])-delta[ix])))
                assert import_err<1e-5,(record['name'],group,import_err)
                import_delta_error=max(import_delta_error,import_err)
                active+=int((np.linalg.norm(delta,axis=1)>.0001).sum())
            key=obj.shape_key_add(name=group+'_'+kind,from_mix=False)
            key.relative_key=basis;key.slider_min=0;key.slider_max=1
            q=(raw+to_blender(delta[ix])).astype(np.float32)
            key.data.foreach_set('co',q.ravel())
            driver(key,group,kind)
    assert len(obj.data.shape_keys.key_blocks)==9
    result.append(dict(name=obj.name,vertices=len(raw),shapeKeys=9,independentReliefMaxErrorM=peak_error,importReliefMaxErrorM=import_delta_error,importCoordinateMaxErrorM=float(np.max(np.linalg.norm(p[ix]-from_blender(raw),axis=1))),groupVertexHitsAbove01mm=active))
for name in ['BODYFORGE_Shirt','BODYFORGE_ChestMark','BODYFORGE_Hair_swept','BODYFORGE_Hair_buzz']:
    obj=bpy.data.objects.get(name)
    if obj:obj.hide_set(True);obj.hide_render=True
bpy.ops.object.select_all(action='DESELECT')
control.select_set(True);bpy.context.view_layer.objects.active=control
bpy.context.scene.unit_settings.system='METRIC'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.region_3d.view_location=Vector((0,0,.92))
            space.region_3d.view_distance=3.0
            space.region_3d.view_rotation=Quaternion((1,0,0),math.pi/2)
            space.region_3d.view_perspective='ORTHO'
            space.shading.type='SOLID'
        elif area.type=='PROPERTIES':
            area.spaces.active.context='OBJECT'
bpy.context.scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(out.resolve()),compress=True)
assert out.stat().st_size>10000
# Reopen actual file. Verify authored keys and drive mixed levels without
# saving this temporary read-back state into the file.
bpy.ops.wm.open_mainfile(filepath=str(out.resolve()),load_ui=False)
control=bpy.data.objects['BF_Review_Controls']
for g in groups:assert control[g]==5.0
assert control['relief_strength']==1.0
max_error=0.
for record in meta['meshes']:
    obj=bpy.data.objects[record['name']]
    keys=obj.data.shape_keys.key_blocks
    assert len(keys)==9 and len(obj.data.shape_keys.animation_data.drivers)==8
    raw=coords(keys['Basis'].data);ix=mapping(raw,record)
    for g in groups:
        for kind in ['volume','relief']:
            key=keys[g+'_'+kind]
            assert key.relative_key==keys['Basis']
            expected=(raw+to_blender(read(record['fields'][g][kind],record['count'])[ix])).astype(np.float32)
            error=float(np.max(abs(coords(key.data)-expected)))
            assert error<3e-7
            max_error=max(max_error,error)
mixed={'arms':2,'core':3,'legs':4,'back':5}
def eval_drivers(strength):
    for g,v in mixed.items():control[g]=float(v)
    control['relief_strength']=float(strength);control.update_tag()
    bpy.context.scene.frame_set(bpy.context.scene.frame_current)
    bpy.context.view_layer.update()
    tested=0
    for record in meta['meshes']:
        obj=bpy.data.objects[record['name']]
        keys=obj.data.shape_keys.key_blocks
        for g,v in mixed.items():
            for kind,factor in [('volume',1),('relief',strength)]:
                value=keys[g+'_'+kind].value
                assert abs(value-v/5*factor)<1e-6,(obj.name,g,kind,value,v/5*factor)
                tested+=1
    return tested
checks=eval_drivers(1)+eval_drivers(0)
r=dict(status='PASS',scope=meta['scope'],blend=str(out.relative_to(root)),bytes=out.stat().st_size,sha256=sha(out),
       binarySha256=meta['binarySha256'],meshes=result,shapeKeys=45,drivenNonBasisKeys=40,
       mixedLevelDriverChecks=checks,reopenedMaxCoordinateErrorM=max_error,sourceHashes=meta['sourceHashes'])
with receipt.open('x',encoding='utf-8') as fp:json.dump(r,fp,indent=2)
print('BLENDER_MUSCLE_READBACK',json.dumps(r),flush=True)
