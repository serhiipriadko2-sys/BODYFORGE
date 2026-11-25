"""Author a bounded tailored rest-shape correction against the real body.
Inputs: pinned GLB, exact runtime mesh export, output JSON.
Run in Blender background. Preserve topology/UVs/weights; no new runtime mesh.
"""
import hashlib, json, math, sys
from collections import defaultdict
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

source, export, output = map(Path,sys.argv[sys.argv.index('--')+1:])
data=json.loads(export.read_text(encoding='utf8'))
assert hashlib.sha256(source.read_bytes()).hexdigest()==data['sourceSha256']=='df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e'
assert data['seamSha256']=='be33083fbbda9e60ac516bef95d8cc7c6afa725236f8c83ecf375c044391c8e7'
if output.exists():raise FileExistsError(output)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
skin=bpy.data.objects['BODYFORGE_Body'].data
tree=BVHTree.FromPolygons([Vector((v.co.x,v.co.z,-v.co.y)) for v in skin.vertices],
                          [p.vertices[:] for p in skin.polygons],all_triangles=True)

def nearest(p):
    q,n,idx,d=tree.find_nearest(Vector(p))
    if q is None or d>.04: raise RuntimeError(('unfitted garment',p,d))
    return np.array(q),np.array(n),d

def quality(p,faces):
    a,b,c=p[faces[:,0]],p[faces[:,1]],p[faces[:,2]]
    return np.cross(b-a,c-a)

def roughness(p,ids):
    v=p[ids]
    a=np.roll(v,1,axis=0)-v;b=np.roll(v,-1,axis=0)-v
    # Angle between successive edge directions: independent of edge length.
    cosine=-(a*b).sum(axis=1)/np.maximum(1e-10,np.linalg.norm(a,axis=1)*np.linalg.norm(b,axis=1))
    return float(np.mean(np.arccos(np.clip(cosine,-1,1))**2))

result=[]
for g in data['garments']:
    p=np.array(g['positions'],dtype=np.float64); n=np.array(g['normals'])
    faces=np.array(g['indices']).reshape(-1,3)
    # Weld only coincident UV-split positions for consistent corrections.
    _,first,inverse=np.unique(np.round(p,6),axis=0,return_index=True,return_inverse=True)
    w=p[first]; count=len(w)
    neighbors=[set() for _ in range(count)]
    for a,b,c in inverse[faces]:
        for i,j in ((a,b),(b,c),(c,a)):
            if i!=j:neighbors[i].add(j);neighbors[j].add(i)
    neighbor_ids=[np.array(sorted(ns),dtype=int) for ns in neighbors]
    displacement=np.zeros_like(w); pinned=np.zeros(count,dtype=bool)
    edge_stats=[]
    # Fit each cut edge to a smoother closed contour. Nearest-surface
    # projection prevents simply averaging inward through the skin.
    for loop in g['loops']:
        ids=inverse[np.array(loop['vertices'])]
        assert len(np.unique(ids))==len(ids)
        q=w[ids].copy()
        original=q.copy()
        for _ in range(4):
            prev=np.roll(q,1,axis=0);nxt=np.roll(q,-1,axis=0)
            l=np.linalg.norm(prev-q,axis=1);r=np.linalg.norm(nxt-q,axis=1)
            target=(prev*r[:,None]+nxt*l[:,None])/np.maximum(1e-9,(l+r)[:,None])
            q=q+.42*(target-q)
        for i,j in enumerate(ids):
            base,normal,d=nearest(original[i])
            qfit,nfit,_=nearest(q[i])
            gap=float((original[i]-base)@normal)
            # Retain positive source clearance with a conservative floor.
            q[i]=qfit+nfit*min(.008,max(.0040,gap))
            delta=q[i]-original[i]
            limit=.0055 if loop['kind']=='sleeve' else .0035
            q[i]=original[i]+delta*min(1,limit/max(1e-9,np.linalg.norm(delta)))
        displacement[ids]=q-original;pinned[ids]=True
        edge_stats.append(dict(kind=loop['kind'],before=roughness(w,ids),after=roughness(w+displacement,ids)))
    # Diffuse edge motion over a small number of adjacent rings instead of
    # creating a sharp crease at the first row of triangles.
    for _ in range(5):
        old=displacement.copy()
        for i,ns in enumerate(neighbor_ids):
            if not pinned[i] and len(ns):displacement[i]=old[ns].mean(axis=0)*.72
    # Broad panel ease: the shirt should bridge the abdomen rather than
    # printing every individual anatomical recess. Positive loft only.
    for i,(x,y,z) in enumerate(w):
        if pinned[i]:continue
        if g['name']=='BODYFORGE_Shirt':
            front=math.exp(-((abs(x)-.075)/.103)**2-((y-1.205)/.112)**2-((z-.128)/.067)**2)
            back=math.exp(-((abs(x)-.090)/.112)**2-((y-1.225)/.116)**2-((z+.075)/.054)**2)
            lift=.0050*front+.0030*back
        else:
            lift=.0018*math.exp(-((abs(x)-.12)/.079)**2-((y-.876)/.09)**2-((z-.08)/.08)**2)
        displacement[i]+=n[first[i]]*lift
    # Back off globally if any original triangle risks inversion. Bound
    # change in signed clearance (sampled vertices, not global collision).
    initial=quality(p,faces)
    area=np.linalg.norm(initial,axis=1)
    valid=area>1e-10
    delta=displacement[inverse]
    scale=1.
    for _ in range(12):
        updated=p+delta*scale
        current=quality(updated,faces)
        signed=(current[valid]*initial[valid]).sum(axis=1)/area[valid]**2
        if signed.min()>.20:break
        scale*=.72
    else:raise RuntimeError('triangle orientation gate')
    delta*=scale
    updated=p+delta
    active=np.flatnonzero(np.linalg.norm(delta,axis=1)>.000025)
    stats=[]
    min_gap=1.;max_loss=0.
    for i in active:
        q,n0,_=nearest(p[i]);r,n1,_=nearest(updated[i])
        gap0=float((p[i]-q)@n0);gap1=float((updated[i]-r)@n1)
        min_gap=min(min_gap,gap1);max_loss=max(max_loss,gap0-gap1)
    for loop,st in zip(g['loops'],edge_stats):
        ids=inverse[np.array(loop['vertices'])]
        st['after']=roughness(w+displacement*scale,ids)
    # Quantize to 10 micrometres and record only edited vertices. Normals
    # are corrected from the actual runtime mesh once, after seam capping.
    edits=[[int(i),*[int(round(v*100000)) for v in delta[i]]] for i in active]
    max_delta=float(np.linalg.norm(delta,axis=1).max())
    print('TAILOR',json.dumps(dict(name=g['name'],vertices=len(p),edited=len(edits),scale=scale,
         maxDeltaMm=max_delta*1000,minSignedGapMm=min_gap*1000,maxGapLossMm=max_loss*1000,
         minOrientation=float(signed.min()),edges=edge_stats)))
    assert len(edits)>100 and max_delta<.009 and max_loss<.004
    def fingerprint(values):
        h=2166136261
        for value in values:
            h=((h^(int(value)&0xffffffff))*16777619)&0xffffffff
        return h
    result.append(dict(name=g['name'],vertexCount=len(p),
                       positionHash=fingerprint(np.floor(p.ravel()*1e6+.5).astype(np.int64)),
                       indexHash=fingerprint(faces.ravel()),edits=edits))
output.write_text(json.dumps(dict(version='tailored-v1',sourceSha256=data['sourceSha256'],seamSha256=data['seamSha256'],garments=result),separators=(',',':'))+'\n',encoding='utf8')
print('TAILOR_RECIPE',output.stat().st_size,hashlib.sha256(output.read_bytes()).hexdigest())
