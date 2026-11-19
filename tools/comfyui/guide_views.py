import math
import bpy
from mathutils import Vector

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

def render_views(directory, prefix):
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
        scene.render.filepath=str(directory/f'{prefix}-{view}.png')
        bpy.ops.render.render(write_still=True)
