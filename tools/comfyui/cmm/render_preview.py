"""Render the assembled CMM in the factory for a visual placement check."""
from pathlib import Path
import bpy
from mathutils import Vector

root = Path(__file__).resolve().parents[3]
bpy.ops.wm.open_mainfile(filepath=str(root / 'agent-factory-scene.blend'))
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = 'BOTH'
scene.render.resolution_x = 1400
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
camera = scene.camera
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 7.7
camera.location = (-34.5, 12.5, 7.6)
target = Vector((-28.75, 19, 1.65))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.filepath = str(root / 'docs/visuals/cmm-01-preview.png')
bpy.ops.render.render(write_still=True)
