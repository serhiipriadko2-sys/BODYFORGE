"""Layered, scalp-fitted real-time haircut. Blender 5.2, pinned CC0 athlete.
Usage: blender -b --factory-startup --disable-autoexec --python-exit-code 1
 --python scripts/author-strand-groom-v2.py -- BODY_GLB OUTPUT_GLB
"""
import hashlib
import json
import math
from pathlib import Path
import random
import sys
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

source, output = map(Path,sys.argv[sys.argv.index('--')+1:])
assert hashlib.sha256(source.read_bytes()).hexdigest()=='df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
if output.exists(): raise FileExistsError(output)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
body=bpy.data.objects['BODYFORGE_Body']
scalp=BVHTree.FromPolygons([v.co for v in body.data.vertices],[p.vertices[:] for p in body.data.polygons],all_triangles=True)
centre=Vector((0,-.044,1.689))

def edge(phi):
    front=max(0,math.sin(phi))
    back=max(0,-math.sin(phi))
    temple=math.exp(-((front-.65)/.18)**2) if front>0 else 0
    return (1.36+.45*back**1.4-.35*front**.65-.055*temple
            +.016*math.sin(phi*9)+.007*math.sin(phi*23+.4))

def surface(phi,fraction,lift):
    theta=max(.006,fraction*edge(phi))
    direction=Vector((.086*math.sin(theta)*math.cos(phi),-.103*math.sin(theta)*math.sin(phi),.085*math.cos(theta))).normalized()
    hit,normal,_,_=scalp.ray_cast(centre+direction*.24,-direction,.24)
    if hit is None or normal.dot(direction)<.05: raise RuntimeError(('scalp ray',phi,fraction))
    return hit+direction*lift

def groom(style):
    swept=style=='swept'
    rng=random.Random(260324+int(swept))
    vertices,faces,tones=[],[],[]
    sectors,rows=112,21
    def add(point,tone):
        vertices.append(point)
        tones.append((tone,tone*.94,tone*.88,1))
    # Nearly flush cap with irregular recessed boundary. Small ridges supply
    # texture without a thick helmet; individual fringe fibres cross the edge.
    for row in range(rows+1):
        t=row/rows
        for i in range(sectors):
            phi=math.tau*i/sectors
            ridge=.00020*(.5+.5*math.sin(phi*47+7*t))
            loft=.00046+(.0023 if swept else .00175)*(1-t*t)**1.5+ridge*(1-t)
            tone=.35+.10*t+.055*math.sin(phi*31+12*t)+.035*math.sin(phi*19-8*t)
            add(surface(phi,.94*t,loft),tone)
            if row<rows:
                a=row*sectors+i;b=row*sectors+(i+1)%sectors
                faces.append((a,b,b+sectors,a+sectors))
    faces.append(tuple(reversed(range(sectors))))

    def ribbon(curve,width,segments,tone,raised):
        start=len(vertices)
        cross_count=3 if raised else 2
        for step in range(segments+1):
            t=step/segments
            mid=curve(t)
            tangent=(curve(min(1,t+.006))-curve(max(0,t-.006))).normalized()
            outward=(mid-centre).normalized()
            across=tangent.cross(outward).normalized()
            normal=across.cross(tangent).normalized()
            taper=.075+.925*(math.sin(math.pi*(.12+.88*t)))**.68
            for side in ([-1,0,1] if raised else [-1,1]):
                add(mid+across*(side*width*taper)+normal*((1-abs(side))*width*.24 if raised else 0),
                    tone*(.85+.15*(1-abs(side)))*(.88+.12*math.sin(math.pi*t)))
            if step<segments:
                a=start+step*cross_count
                for j in range(cross_count-1):
                    faces.append((a+j,a+j+cross_count,a+j+cross_count+1,a+j+1))

    # Layered directed locks. Frontal roots sweep back toward the crown;
    # side and rear roots follow the scalp downward, not straight upward.
    for i in range(260):
        principal=i<76
        phi=i*2.399963+rng.uniform(-.12,.12)
        front=max(0,math.sin(phi))
        r=rng.uniform(.18,.92)
        travel=rng.uniform(.16,.38)*(1.15 if swept else .90)
        delta=(-travel if front>.30 and r>.37 else travel*.68)
        turn=(.38 if swept else .17)*front+rng.uniform(-.09,.10)
        arch=rng.uniform(.0036,.0080) if principal else rng.uniform(.0016,.0045)
        arch*= (.62+.38*front)*(1.35 if swept else 1)
        width=rng.uniform(.0015,.0028) if principal else rng.uniform(.00030,.00070)
        tone=rng.uniform(.44,.83) if principal else rng.uniform(.57,.96)
        def curve(t):
            return surface(phi+turn*t,min(.955,max(.035,r+delta*t)),
                           .0014+arch*math.sin(math.pi*t)**.85+.0007*t)
        ribbon(curve,width,7 if principal else 5,tone,principal)

    # Fine, short transition hairs with independently sampled roots and tips.
    # More irregular boundary than the opaque cap, lower height at temples.
    for i in range(384):
        phi=math.tau*(i+rng.uniform(.06,.94))/384
        front=max(0,math.sin(phi))
        r=rng.uniform(.914,.994)
        travel=rng.uniform(.025,.071)
        turn=rng.uniform(-.022,.022)+(.028 if swept else .010)*front
        loft=rng.uniform(.00075,.0017)
        width=rng.uniform(.00011,.00024)
        tone=rng.uniform(.44,.87)
        def fringe(t):
            return surface(phi+turn*t,min(1.057,r+travel*t),
                           .00030+loft*math.sin(math.pi*t)+.00034*t)
        ribbon(fringe,width,4,tone,False)

    mesh=bpy.data.meshes.new('Layered groom '+style)
    mesh.from_pydata(vertices,[],faces);mesh.update()
    color=mesh.color_attributes.new(name='Color',type='BYTE_COLOR',domain='POINT')
    for i,value in enumerate(tones):color.data[i].color=value
    for polygon in mesh.polygons:polygon.use_smooth=True
    obj=bpy.data.objects.new('BODYFORGE_Groom_'+style,mesh)
    bpy.context.collection.objects.link(obj);obj.select_set(True)
    mesh.calc_loop_triangles()
    assert len(mesh.loop_triangles)<15000
    obj['BODYFORGE_groom_revision']='layered-v2'
    print('HAIR_STYLE',json.dumps(dict(style=style,vertices=len(vertices),triangles=len(mesh.loop_triangles),transitionFibres=384,locks=260)))
    return obj

bpy.ops.object.select_all(action='DESELECT')
groom('crop');groom('swept')
bpy.ops.export_scene.gltf(filepath=str(output.resolve()),export_format='GLB',use_selection=True,
                         export_yup=True,export_animations=False,export_materials='NONE',
                         export_normals=True,export_vertex_color='ACTIVE',export_extras=True)
assert output.stat().st_size<1500000
print('GROOM_V2',output.stat().st_size,hashlib.sha256(output.read_bytes()).hexdigest())
