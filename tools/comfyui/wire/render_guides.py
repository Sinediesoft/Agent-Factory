from pathlib import Path
import math
import bpy
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
# Original silhouette guides, with an offset service cabinet and open work tank bay.
def panel(name, position, size, color):
    bpy.ops.mesh.primitive_cube_add(size=1,location=position)
    obj=bpy.context.object
    obj.name=name
    obj.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bevel=obj.modifiers.new('Sheet metal corners','BEVEL')
    bevel.width=.075
    bevel.segments=3
    mat=bpy.data.materials.new(name)
    mat.diffuse_color=(*color,1)
    obj.data.materials.append(mat)

ivory=(.84,.85,.82)
panel('base',(0,0,.44),(3.92,3.12,.52),ivory)
panel('rear column',(-.42,.97,1.61),(2.91,1.18,2.81),ivory)
panel('working bay side',(-1.74,-.34,1.23),(.35,2.38,1.90),ivory)
panel('reel housing',(-.78,.13,2.81),(2.33,1.79,.62),ivory)
panel('control cabinet',(1.40,-.02,1.70),(1.08,3.10,2.90),ivory)
panel('cabinet plinth',(1.40,-.09,.29),(1.05,2.93,.28),(.18,.19,.20))
scene=bpy.context.scene
scene.render.engine='BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO'
scene.display.shading.color_type='MATERIAL'
scene.display.shading.show_shadows=True
scene.display.shading.show_cavity=True
scene.display.shading.cavity_type='BOTH'
scene.render.film_transparent=True
scene.render.resolution_x=scene.render.resolution_y=512
scene.render.resolution_percentage=100
scene.render.image_settings.color_mode='RGBA'
bpy.ops.object.camera_add()
camera=bpy.context.object;scene.camera=camera
camera.data.type='ORTHO';camera.data.ortho_scale=5.9
target=Vector((0,0,1.56))
for view,yaw in [('front',0),('left',-90),('back',180),('right',90)]:
    az=math.radians(yaw+12)
    camera.location=target+Vector((7*math.sin(az),-7*math.cos(az),2.0))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(Path(__file__).resolve().parent/'reference'/f'wire-{view}.png')
    bpy.ops.render.render(write_still=True)
