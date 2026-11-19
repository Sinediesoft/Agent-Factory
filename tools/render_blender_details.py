"""Render close-up evidence from the generated Blender scene."""
from pathlib import Path
import bpy
from mathutils import Vector

root=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(root/'agent-factory-scene.blend'))
scene=bpy.context.scene
scene.render.engine='BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO'
scene.display.shading.color_type='MATERIAL'
scene.display.shading.show_cavity=True
scene.display.shading.cavity_type='BOTH'
scene.render.resolution_x=1400
scene.render.resolution_y=900
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
camera=scene.camera
camera.data.type='ORTHO'

for name,position,target,scale in [
    ('agent-factory-cnc-detail.png',(-5,0,12),(-14.5,11,1.3),18),
    ('agent-factory-robot-detail.png',(-8,-19,10),(-18,-6.5,2.7),15),
    ('agent-factory-track-detail.png',(22,-1,17),(11,7,.4),18),
]:
    camera.location=position
    direction=Vector(target)-camera.location
    camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=scale
    scene.render.filepath=str(root/'docs'/'visuals'/name)
    bpy.ops.render.render(write_still=True)
    print(name,flush=True)
