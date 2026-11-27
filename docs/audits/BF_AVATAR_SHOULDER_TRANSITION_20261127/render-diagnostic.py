"""Texture-free inspection of the exact CPU-skinned geometry exported by QA."""
import bpy,numpy as np,json,hashlib,math
from pathlib import Path
from mathutils import Vector
root=Path.cwd()
audit=root/'docs/audits/BF_AVATAR_SHOULDER_TRANSITION_20261127'
folder=root/'.bodyforge-qa/shoulder-transition-20261127'
meta=json.loads((audit/'diagnostic.json').read_text(encoding='utf8'))
binary=(folder/'diagnostic.bin').read_bytes()
assert hashlib.sha256(binary).hexdigest()==meta['binarySha256']
n=meta['vertices'];ni=meta['indices']
indices=np.frombuffer(binary,dtype='<u4',count=ni).reshape(-1,3)
points=np.frombuffer(binary,dtype='<f4',offset=ni*4).reshape(-1,n,3)
assert points.shape[0]==len(meta['states'])
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='BLENDER_WORKBENCH'
scene.render.resolution_x=720;scene.render.resolution_y=620;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.display.shading.light='STUDIO'
scene.display.shading.studio_light='paint.sl'
scene.display.shading.color_type='SINGLE';scene.display.shading.single_color=(.54,.56,.58)
scene.display.shading.show_shadows=True
scene.display.shading.show_cavity=True
scene.display.shading.cavity_type='BOTH'
scene.display.shading.curvature_ridge_factor=1.0;scene.display.shading.curvature_valley_factor=1.0
scene.world=bpy.data.worlds.new('diagnostic world');scene.display.shading.background_type='WORLD';scene.world.color=(.055,.055,.055)
# Workbench inspection is geometry-only. Weld only this diagnostic copy,
# not the actual game asset, to avoid visually false UV split normals.
bind=points[0]
ix=np.rint(bind.astype(np.float64)*1e6).astype(np.int64)
_,first,inv=np.unique(ix,axis=0,return_index=True,return_inverse=True)
tri=inv[indices]
# Retain the upper-body region, with a large margin around the view.
center=bind[indices].mean(axis=1)
tri=tri[(center[:,1]>1.03)&(center[:,1]<1.63)]
mesh=bpy.data.meshes.new('actual CPU skinned body')
mesh.from_pydata(points[1,first][:,[0,2,1]]*np.array([1,-1,1]),[],tri.tolist());mesh.update()
obj=bpy.data.objects.new('BODYFORGE shoulder diagnostic',mesh);scene.collection.objects.link(obj)
for poly in mesh.polygons:poly.use_smooth=True
camera=bpy.data.objects.new('diagnostic camera',bpy.data.cameras.new('diagnostic camera'));scene.collection.objects.link(camera)
camera.data.type='ORTHO';camera.data.ortho_scale=.76;scene.camera=camera
target=Vector((0,-.01,1.35))
for name in ['bind','neutral','arms','max']:
    k=meta['states'].index(name)
    co=(points[k,first][:,[0,2,1]]*np.array([1,-1,1],np.float32)).astype(np.float32)
    mesh.vertices.foreach_set('co',co.ravel());mesh.update()
    for angle,label in [(0,'front'),(math.radians(35),'turned'),(math.pi,'rear')]:
        camera.location=target+Vector((math.sin(angle)*2,-math.cos(angle)*2,.05))
        camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        out=audit/f'clay-{name}-{label}.png';assert not out.exists()
        scene.render.filepath=str(out.resolve());bpy.ops.render.render(write_still=True)
print('SHOULDER_DIAGNOSTIC_RENDER_PASS',flush=True)
