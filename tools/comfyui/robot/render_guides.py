"""Author four calibrated views of each rigid housing. X is the link axis."""
from pathlib import Path
import math
import sys
import bpy

folder = Path(__file__).resolve().parent
sys.path.insert(0, str(folder.parent))
from guide_views import render_views

# Axial station, half-width, half-height and offset describe three different castings.
profiles = {
    'upper': [(-1.62,.23,.29,0),(-1.45,.49,.53,.03),(-1.10,.55,.60,.08),
              (-.40,.41,.47,.16),(.46,.35,.38,.13),(1.20,.38,.43,.03),(1.60,.26,.31,0)],
    'fore': [(-1.62,.42,.49,.03),(-1.30,.52,.53,.05),(-.65,.44,.43,.06),
             (.50,.31,.34,.04),(1.25,.29,.29,0),(1.60,.22,.24,0)],
    'wrist': [(-1.60,.42,.42,0),(-1.37,.53,.52,0),(-.74,.55,.51,0),
              (-.25,.45,.46,0),(.65,.39,.40,0),(1.35,.35,.36,0),(1.6,.27,.29,0)]
}
for name, rings in profiles.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    verts, faces = [], []
    sides = 32
    for i,(x,w,h,rise) in enumerate(rings):
        for j in range(sides):
            angle = j*2*math.pi/sides
            verts.append((x,w*math.cos(angle),1.56+rise+h*math.sin(angle)))
            if i:
                a=(i-1)*sides+j
                b=(i-1)*sides+(j+1)%sides
                faces.append((a,b,b+sides,a+sides))
    faces += [tuple(reversed(range(sides))),tuple(range(len(verts)-sides,len(verts)))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    obj.color=(.98,.65,.05,1)
    mat=bpy.data.materials.new('paint')
    mat.diffuse_color=obj.color
    mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth=True
    render_views(folder/'reference',name)
