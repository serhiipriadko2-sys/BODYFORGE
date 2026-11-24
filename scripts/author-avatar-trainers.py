"""Author original, fitted athletic shoe details on the pinned CC0 athlete.

Blender coordinates are Z-up. The donor is a static glTF mesh; the runtime
attaches it to the existing shoes' exact live rig. No new body or rig is shipped.
Run: blender -b --factory-startup --disable-autoexec --python-exit-code 1
 --python scripts/author-avatar-trainers.py -- SOURCE OUTPUT
"""
import bpy
import hashlib
import math
from pathlib import Path
import sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import convex_hull_2d

source, output = (Path(x).resolve() for x in sys.argv[sys.argv.index('--')+1:])
assert hashlib.sha256(source.read_bytes()).hexdigest() == 'df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
if output.exists():
    raise FileExistsError(output)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
shoe = bpy.data.objects['BODYFORGE_Shoes']
assert len(shoe.data.vertices)==1142
coords = [v.co.copy() for v in shoe.data.vertices]
faces = [tuple(p.vertices) for p in shoe.data.polygons]
bvh = BVHTree.FromPolygons(coords, faces, all_triangles=True)

def material(name, color, roughness):
    m = bpy.data.materials.new(name)
    m.use_nodes=True
    bsdf=m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*color,1)
    bsdf.inputs['Roughness'].default_value=roughness
    bsdf.inputs['Metallic'].default_value=0
    return m

# Buffers shared between feet, one draw per material, no external textures.
parts={}
def add(name, color, rough, verts, polygons, smooth=True):
    if name not in parts:
        parts[name]=[material(name,color,rough),[],[],[]]
    _,v,f,s=parts[name]
    start=len(v)
    v.extend(tuple(p) for p in verts)
    f.extend(tuple(start+i for i in polygon) for polygon in polygons)
    s.extend([smooth]*len(polygons))

def chaikin(poly):
    result=[]
    for i,a in enumerate(poly):
        b=poly[(i+1)%len(poly)]
        result.extend((a.lerp(b,.25),a.lerp(b,.75)))
    return result

def sole_outline(sign):
    points=[Vector((p.x,p.y)) for p in coords if p.x*sign>0 and p.z<.048]
    outline=[points[i] for i in convex_hull_2d(points)]
    # Convex support follows the full measured foot. Smooth corners and
    # expand the outline slightly instead of inventing a generic shoe shape.
    outline=chaikin(chaikin(outline))
    # Resample the perimeter at a fixed spacing to avoid thousands of
    # redundant sole triangles from the dense source foot hull.
    lengths=[0.0]
    for a,b in zip(outline,outline[1:]+outline[:1]):
        lengths.append(lengths[-1]+(b-a).length)
    samples=[]
    k=0
    for i in range(64):
        t=lengths[-1]*i/64
        while lengths[k+1]<t: k+=1
        u=(t-lengths[k])/max(lengths[k+1]-lengths[k],1e-12)
        samples.append(outline[k].lerp(outline[(k+1)%len(outline)],u))
    outline=samples
    centre=sum(outline,Vector((0,0)))/len(outline)
    outline=[centre+(p-centre)*1.055+(p-centre).normalized()*.003 for p in outline]
    area=sum(a.x*b.y-b.x*a.y for a,b in zip(outline,outline[1:]+outline[:1]))
    if area<0: outline.reverse()
    return outline,centre

def band(name,color,rough,outline,centre,profile):
    n=len(outline)
    verts=[]
    for height,scale in profile:
        verts.extend((centre.x+(p.x-centre.x)*scale,centre.y+(p.y-centre.y)*scale,height) for p in outline)
    quads=[]
    for k in range(len(profile)-1):
        for i in range(n):
            j=(i+1)%n
            quads.append((k*n+i,k*n+j,(k+1)*n+j,(k+1)*n+i))
    quads.extend((tuple(reversed(range(n))),tuple(range((len(profile)-1)*n,len(profile)*n))))
    add(name,color,rough,verts,quads)

def top(x,y,lift=.002):
    p,n,_,_=bvh.ray_cast(Vector((x,y,.25)),Vector((0,0,-1)),.30)
    if p is None:
        raise RuntimeError('No fitted shoe surface at '+str((x,y)))
    return p+Vector((0,0,lift))

def ribbon(name,color,rough,rows):
    verts=[p for row in rows for p in row]
    n=len(rows[0])
    fs=[(i*n+j,i*n+j+1,(i+1)*n+j+1,(i+1)*n+j) for i in range(len(rows)-1) for j in range(n-1)]
    # Ensure the ribbon's face normal points upward in both shoes.
    if (verts[fs[0][1]]-verts[fs[0][0]]).cross(verts[fs[0][2]]-verts[fs[0][0]]).z<0:
        fs=[tuple(reversed(f)) for f in fs]
    add(name,color,rough,verts,fs)

def tube(name,color,rough,path,radius=.0022):
    verts=[]; fs=[]; sides=7
    for i,p in enumerate(path):
        t=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized()
        a=t.cross(Vector((0,0,1))).normalized()
        if a.length<.5: a=t.cross(Vector((0,1,0))).normalized()
        b=t.cross(a).normalized()
        verts.extend(p+radius*(math.cos(2*math.pi*j/sides)*a+math.sin(2*math.pi*j/sides)*b) for j in range(sides))
    for i in range(len(path)-1):
        for j in range(sides):
            k=(j+1)%sides
            fs.append((i*sides+j,i*sides+k,(i+1)*sides+k,(i+1)*sides+j))
    fs.extend((tuple(reversed(range(sides))),tuple(range((len(path)-1)*sides,len(path)*sides))))
    add(name,color,rough,verts,fs)

for sign in (-1,1):
    outline,centre=sole_outline(sign)
    # Separate rubber outsole and sculpted foam. Dark outsole / slate foam
    # remain visible in the full-body view and do not look like bare socks.
    band('BF_Trainer_Outsole',(.025,.035,.045),.91,outline,centre,
         [(-.008,.965),(-.006,1.0),(.003,1.0),(.005,.99)])
    band('BF_Trainer_Midsole',(.37,.42,.47),.76,outline,centre,
         [(.004,.99),(.008,1.01),(.016,1.00),(.020,.94)])
    x0=sign*.204
    # The instep is sampled on the original hull, not guessed in screen space.
    # A slightly tapered tongue and reinforced lace channels sit on this fit.
    ys=[-.143+i*.012 for i in range(10)]
    rows=[]
    for i,y in enumerate(ys):
        width=.022+.004*i/(len(ys)-1)
        rows.append([top(x0+width*j/3,y,.0038) for j in range(-3,4)])
    ribbon('BF_Trainer_Tongue',(.029,.045,.066),.84,rows)
    for side in (-1,1):
        rows=[]
        for y in ys:
            rows.append([top(x0+side*.026+j*.003,y,.0047) for j in (-1,0,1)])
        ribbon('BF_Trainer_Eyestay',(.085,.117,.151),.73,rows)
    # Crossed laces follow the actual curved instep, with eased raised centres.
    for k in range(5):
        y0=-.139+k*.018
        y1=y0+.016
        for side in (-1,1):
            path=[]
            for j in range(9):
                t=j/8
                x=x0+side*.022*(1-2*t)
                y=y0+(y1-y0)*t
                path.append(top(x,y,.0062+.0010*math.sin(math.pi*t)))
            tube('BF_Trainer_Laces',(.31,.38,.44),.87,path,.0020)
    # Toe bumper line and two side-panel stitch strips; follow upper surface.
    for y in (-.183,-.169):
        path=[top(x0+j*.004,y,.0028) for j in range(-6,7)]
        tube('BF_Trainer_Stitch',(.075,.101,.131),.86,path,.0010)

objects=[]
bpy.ops.object.select_all(action='DESELECT')
for name,(mat,verts,polygons,smooth) in parts.items():
    mesh=bpy.data.meshes.new(name+'_Geometry')
    mesh.from_pydata(verts,[],polygons)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    for poly,flag in zip(mesh.polygons,smooth):
        poly.use_smooth=flag and len(poly.vertices)==4
    obj.select_set(True)
    objects.append(obj)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,
                          export_yup=True,export_materials='EXPORT')
assert output.stat().st_size<500000
print('TRAINER_DETAIL',output.stat().st_size,hashlib.sha256(output.read_bytes()).hexdigest(),
      [(o.name,len(o.data.vertices),len(o.data.polygons)) for o in objects])
