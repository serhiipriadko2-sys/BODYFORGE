"""Scalp-fitted directional hair-card study, Blender 5.2.
Only the pinned CC0 athlete is used. New hair is procedural, not scan-derived.
Run: blender -b --factory-startup --disable-autoexec --python-exit-code 1
     --python scripts/author-strand-groom-v3.py -- BODY_GLB OUTPUT_GLB
"""
import bpy
import hashlib
import json
import math
from pathlib import Path
import random
import sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

source, output = map(Path, sys.argv[sys.argv.index('--')+1:])
assert hashlib.sha256(source.read_bytes()).hexdigest() == 'df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
assert not output.exists()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
body = bpy.data.objects['BODYFORGE_Body']
scalp = BVHTree.FromPolygons([v.co for v in body.data.vertices],
    [p.vertices[:] for p in body.data.polygons], all_triangles=True)
centre = Vector((0, -.044, 1.689))

def edge(phi):
    front = max(0, math.sin(phi))
    back = max(0, -math.sin(phi))
    temple = math.exp(-((front-.65)/.18)**2) if front > 0 else 0
    return (1.36 + .45*back**1.4 - .35*front**.65 - .055*temple
            + .016*math.sin(phi*9) + .007*math.sin(phi*23+.4))

def surface(phi, fraction, lift):
    theta = max(.006, fraction*edge(phi))
    direction = Vector((.086*math.sin(theta)*math.cos(phi),
        -.103*math.sin(theta)*math.sin(phi), .085*math.cos(theta))).normalized()
    hit, normal, _, _ = scalp.ray_cast(centre+direction*.24, -direction, .24)
    if hit is None or normal.dot(direction) < .05:
        raise RuntimeError(('scalp ray', phi, fraction))
    return hit + direction*lift

def cap_lift(phi, r, swept):
    t = min(1., r/.93)
    front = max(0, math.sin(phi))
    return .00030 + (.0019 if swept else .00145)*(1-t*t)**1.5 + .00022*front*(1-t)

def groom(style):
    swept = style == 'swept'
    rng = random.Random(261127 + int(swept))
    vertices, faces, tones, uv = [], [], [], []
    root_distances = []
    sectors, rows = 96, 17

    def add(point, tone, u, v):
        vertices.append(point)
        tones.append((tone, tone*.96, tone*.91, 1.))
        # glTF exporter reverses V. Desired runtime atlas: cap < .30, cards > .40.
        uv.append((u, 1-v))
        return len(vertices)-1

    # Low, conformal undercoat with UV seam duplication. The cap is opaque
    # but textured with narrow direction-aligned bands; no thick helmet edge.
    for row in range(rows+1):
        t = row/rows
        r = .012 + .918*t
        for i in range(sectors+1):
            phi = math.tau*i/sectors
            tone = .45 + .035*math.sin(phi*17+2*t) + .025*math.sin(phi*37-4*t)
            add(surface(phi,r,cap_lift(phi,r,swept)), tone, i/sectors, .035+.245*t)
            if row < rows and i < sectors:
                a = row*(sectors+1)+i
                f = (a,a+1,a+sectors+2,a+sectors+1)
                # Orientation in the local radial frame.
                # Actual face orientation checked/repaired after construction.
                faces.append(f)
    pole = surface(0, .006, cap_lift(0,0,swept))
    for i in range(sectors):
        c = add(pole.copy(),.45,(i+.5)/sectors,.02)
        faces.append((c,i,i+1))
    cap_faces=len(faces)

    def card(curve, width, segments, tone, tile, fringe=False):
        start = len(vertices)
        root = curve(0)
        nearest, normal, _, dist = scalp.find_nearest(root)
        assert nearest is not None
        root_distances.append(float(dist))
        for step in range(segments+1):
            t = step/segments
            mid = curve(t)
            tangent = (curve(min(1,t+.005))-curve(max(0,t-.005))).normalized()
            outward = (mid-centre).normalized()
            across = tangent.cross(outward).normalized()
            assert across.length > .99
            normal = across.cross(tangent).normalized()
            if normal.dot(outward)<0: normal=-normal
            # Ribbons are wide enough for a cluster of individually textured
            # fibers. Gradual tip taper avoids the blunt polygon silhouette.
            taper = (.10+.90*(math.sin(math.pi*(.10+.90*t)))**.70)
            rootshade=.72+.28*math.sin(math.pi*.5*t)
            v=.40+.57*t
            left,right=tile
            for side,u in ((-1,left),(1,right)):
                add(mid+across*(side*width*taper),tone*rootshade,u,v)
            if step<segments:
                a=start+step*2
                faces.append((a,a+2,a+3,a+1))
        return start

    # Evenly spread roots on the scalp rather than concentrating at the pole.
    # A wider range of azimuth and length produces overlapping thin cards.
    for i in range(480):
        phi=i*2.399963229728653+rng.uniform(-.08,.08)
        front=max(0,math.sin(phi))
        r=.12+.80*math.sqrt(rng.random())
        travel=rng.uniform(.17,.37)*(1.12 if swept else .92)
        delta=-travel if front>.22 and r>.38 else travel*.60
        turn=(.48 if swept else .20)*front+rng.uniform(-.10,.10)
        arch=rng.uniform(.0028,.0068)*(1.28 if swept else 1)
        arch*=.45+.55*front
        width=rng.uniform(.00115,.00210)
        tone=rng.uniform(.64,.94)
        def curve(t):
            q=min(.975,max(.020,r+delta*t))
            a=phi+turn*t
            lift=cap_lift(a,q,swept)+.0001+arch*math.sin(math.pi*t)**.82+.00025*t
            return surface(a,q,lift)
        card(curve,width,6,tone,(.025,.975))

    # Mixed short edge fibers rooted across the scalp-density transition,
    # with a bounded small loft and a distinct atlas band.
    for i in range(320):
        phi=math.tau*(i+rng.uniform(.07,.93))/320
        front=max(0,math.sin(phi));r=rng.uniform(.885,.987)
        travel=rng.uniform(.035,.075)
        turn=rng.uniform(-.024,.024)+(.020 if swept else .009)*front
        loft=rng.uniform(.00055,.00150)
        width=rng.uniform(.00025,.00060);tone=rng.uniform(.58,.90)
        def fringe(t):
            a=phi+turn*t;q=min(1.057,r+travel*t)
            base=cap_lift(a,q,swept) if q<.93 else .00030
            return surface(a,q,base+loft*math.sin(math.pi*t)+.00014*t)
        card(fringe,width,4,tone,(.025,.475),True)

    # Flip undercoat faces whose normals oppose the outward scalp direction.
    for i in range(cap_faces):
        f=faces[i];a,b,c=[vertices[k] for k in f[:3]]
        if (b-a).cross(c-a).dot(a-centre)<0:faces[i]=tuple(reversed(f))

    mesh=bpy.data.meshes.new('Directional groom '+style)
    mesh.from_pydata(vertices,[],faces);mesh.update()
    layer=mesh.uv_layers.new(name='Strand atlas')
    for loop in mesh.loops:layer.data[loop.index].uv=uv[loop.vertex_index]
    colors=mesh.color_attributes.new(name='Color',type='BYTE_COLOR',domain='POINT')
    for i,value in enumerate(tones):colors.data[i].color=value
    for polygon in mesh.polygons:polygon.use_smooth=True
    obj=bpy.data.objects.new('BODYFORGE_Groom_'+style,mesh)
    bpy.context.collection.objects.link(obj);obj.select_set(True)
    obj['BODYFORGE_groom_revision']='directional-v3'
    mesh.calc_loop_triangles()
    areas=[(vertices[t.vertices[1]]-vertices[t.vertices[0]]).cross(
             vertices[t.vertices[2]]-vertices[t.vertices[0]]).length*.5 for t in mesh.loop_triangles]
    # The tiny crown patch is allowed to be tiny, never zero-area.
    assert min(areas)>1e-12,(style,min(areas))
    assert len(mesh.loop_triangles)<=12500 and max(root_distances)<.0035
    info=dict(style=style,authorVertices=len(vertices),triangles=len(mesh.loop_triangles),
              cards=480,edgeCards=320,rootMaxDistanceMm=max(root_distances)*1000,
              minAreaM2=min(areas))
    print('GROOM_V3_STYLE',json.dumps(info),flush=True)
    return obj,info

bpy.ops.object.select_all(action='DESELECT')
objects,stats=[],[]
for style in ('crop','swept'):
    obj,info=groom(style);objects.append(obj);stats.append(info)
bpy.ops.export_scene.gltf(filepath=str(output.resolve()),export_format='GLB',use_selection=True,
    export_yup=True,export_animations=False,export_materials='NONE',export_normals=True,
    export_texcoords=True,export_vertex_color='ACTIVE',export_extras=True)
assert output.stat().st_size<1600000
print('GROOM_V3_EXPORT',json.dumps({'bytes':output.stat().st_size,
    'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'styles':stats}),flush=True)
