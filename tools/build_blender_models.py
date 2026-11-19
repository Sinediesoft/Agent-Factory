"""Build synthetic FANUC-inspired demo assets with Blender's bpy API.

Run with Blender Python (4.5 LTS):
  PYTHONPATH=/path/to/bpy python3.11 tools/build_blender_models.py
This exports the reusable equipment and track GLBs, an editable .blend scene,
and a preview PNG.
"""
import math
import subprocess
from pathlib import Path
import bpy
from mathutils import Vector
from build_track import load_layout, make_track_network

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'models'
OUT.mkdir(parents=True, exist_ok=True)
PREVIEW = ROOT / 'docs' / 'visuals' / 'agent-factory-blender-preview.png'


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)


def material(name, color, metallic=0.0, roughness=0.45, alpha=1.0, emission=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*color, alpha)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, alpha)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Alpha'].default_value = alpha
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = 2.0
    if alpha < 1:
        m.surface_render_method = 'DITHERED'
    return m

WHITE = material('ceramic-white', (0.78, 0.83, 0.84), .25, .34)
WHITE_TOP = material('warm-white', (0.92, .91, .81), .12, .45)
YELLOW = material('safety-yellow', (.91, .63, .055), .22, .35)
BLACK = material('powder-black', (.045, .065, .075), .22, .5)
STEEL = material('brushed-steel', (.28, .38, .42), .8, .28)
CHROME = material('chrome', (.66, .75, .78), .95, .17)
GLASS = material('tinted-glass', (.11, .28, .34), .42, .15, .46)
DARK_GLASS = material('control-glass', (.025, .07, .095), .18, .23)
BLUE = material('screen-cyan', (.07, .61, .84), .08, .18, emission=(.06, .4, .65))
GREEN = material('status-green', (.07, .83, .36), .08, .2, emission=(.03, .5, .19))
RED = material('status-red', (.82, .09, .08), .12, .25, emission=(.4, .02, .02))
ORANGE = material('status-amber', (.95, .42, .05), .1, .28)
LAMP_RED = material('lamp-red-lens', (.65, .08, .07), .08, .23)
LAMP_YELLOW = material('lamp-yellow-lens', (.85, .55, .025), .08, .23)
LAMP_GREEN = material('lamp-green-lens', (.05, .58, .20), .08, .23)
PAD = material('soft-pad', (.16, .63, .55), .04, .74)


def empty(name, parent=None, loc=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = loc
    return obj


def cube(name, loc, scale, mat, parent=None, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = loc
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('soft-machined-edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        norm = obj.modifiers.new('weighted-normals', 'WEIGHTED_NORMAL')
        norm.keep_sharp = True
    return obj


def cylinder(name, loc, radius, depth, mat, parent=None, vertices=24, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = loc
    if rotation:
        obj.rotation_euler = rotation
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new('edge-round', 'BEVEL')
    bevel.width = .018
    bevel.segments = 2
    obj.modifiers.new('weighted-normals', 'WEIGHTED_NORMAL')
    return obj


def link(name, a, b, radius, mat, parent=None):
    center = (Vector(a) + Vector(b)) / 2
    direction = Vector(b) - Vector(a)
    obj = cylinder(name, center, radius, direction.length, mat, parent, 20)
    obj.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    return obj


def text_mesh(name, body, loc, size, mat, parent=None):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = body
    curve.size = size
    curve.extrude = .004
    curve.bevel_depth = .001
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = loc
    obj.rotation_euler = (math.pi / 2, 0, 0)
    obj.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object


def panel_controls(root, x=1.55, y=-1.78, z=1.6):
    cube('control-column', (x, y, z), (.55, .22, 2.0), BLACK, root, .05)
    cube('controller-screen-frame', (x, y-.13, z+.43), (.45, .045, .6), STEEL, root, .01)
    cube('controller-screen', (x, y-.16, z+.43), (.37, .012, .5), BLUE, root, .005)
    for row in range(3):
        for col in range(3):
            cylinder(f'key-{row}-{col}', (x-.15+col*.15, y-.16, z-.2-row*.14), .045, .025, CHROME, root, 12, (math.pi/2,0,0))
    cylinder('emergency-stop', (x+.12,y-.17,z-.78), .10, .09, RED, root, 20, (math.pi/2,0,0))


def status_light(root, x, y, z):
    cylinder('status-pole', (x,y,z-.12), .06, .28, STEEL, root)
    cylinder('status-lamp-base', (x,y,z+.03), .24, .07, BLACK, root)
    for name, level, lens in [('StatusGreen', .17, LAMP_GREEN),
                               ('StatusYellow', .40, LAMP_YELLOW),
                               ('StatusRed', .63, LAMP_RED)]:
        cylinder(name, (x,y,z+level), .21, .19, lens, root, 32)
        cylinder(f'{name}-rim', (x,y,z+level-.115), .24, .035, BLACK, root, 32)
    cylinder('status-lamp-cap', (x,y,z+.77), .24, .06, BLACK, root)


def machine_base(root, width=3.7, depth=3.15, height=3.0):
    cube('machine-plinth', (0,0,.16), (width,depth,.32), BLACK, root, .05)
    cube('rear-enclosure', (0,.91,height/2), (width,1.33,height), WHITE, root, .08)
    cube('roof', (0,0,height-.13), (width+.04,depth+.04,.29), WHITE_TOP, root, .06)
    cube('left-side', (-width/2+.12,-.45,height/2), (.25,2.3,height-.32), WHITE, root, .04)
    cube('right-side', (width/2-.12,-.45,height/2), (.25,2.3,height-.32), WHITE, root, .04)
    cube('front-header', (0,-depth/2+.07,height-.49), (width,.23,.68), WHITE_TOP, root, .04)
    cube('front-sill', (0,-depth/2+.06,.49), (width,.24,.5), BLACK, root, .02)
    cube('interior-black', (0,-depth/2+.23,1.48), (width-.48,.1,1.5), BLACK, root, .03)
    for i in range(5):
        cube(f'side-vent-{i}', (-width/2-.015,.1+i*.18,2.28), (.018,.11,.48), BLACK, root, .005)
    for sx in [-1,1]:
        cube(f'foot-{sx}', (sx*(width/2-.35),-.9,.075), (.45,.55,.15), STEEL, root, .01)


def doors(root, width=2.2, z=1.48, front=-1.76):
    for side, x in [('L',-width/4),('R',width/4)]:
        door = empty(f'Door_{side}', root, (x, front, z))
        cube(f'door-{side}-frame', (0,0,0), (width/2+.04,.11,1.65), YELLOW, door, .025)
        cube(f'door-{side}-glass', (0,-.067,.04), (width/2-.17,.013,1.39), GLASS, door, .01)
        cube(f'door-{side}-handle', ((width/4-.1) * (1 if side=='L' else -1),-.12,-.07), (.045,.09,.38), CHROME, door, .01)
    return root


def make_cnc():
    root=empty('MachineRoot')
    machine_base(root,3.8,3.2,3.05)
    doors(root,2.55,1.52,-1.72)
    cube('cross-slide', (0,-.87,.77), (2.18,1.1,.24), STEEL,root,.025)
    for x in [-.75,-.25,.25,.75]:
        cube('table-t-slot', (x,-.89,.91), (.065,.9,.025), BLACK,root,.005)
    cube('work-fixture', (0,-.87,1.02), (.7,.65,.19), CHROME,root,.02)
    cylinder('spindle-housing', (0,-.62,2.22), .31,.72,YELLOW,root)
    cylinder('spindle-chuck', (0,-.62,1.78), .15,.22,CHROME,root)
    cylinder('cutting-tool', (0,-.62,1.53), .045,.38,STEEL,root)
    panel_controls(root,1.69,-1.8,1.59)
    status_light(root,1.55,-.75,3.28)
    text_mesh('brand', 'FANUC',(-1.66,-1.77,2.68),.24,YELLOW,root)
    text_mesh('family', 'CNC // DEMO',(-.18,-1.78,2.66),.12,BLACK,root)
    return root


def make_wire():
    root=empty('MachineRoot')
    machine_base(root,3.8,3.2,3.0)
    doors(root,2.5,1.5,-1.73)
    cube('dielectric-tank',(-.15,-.67,.83),(2.25,1.36,.78),STEEL,root,.055)
    cube('tank-rim',(-.15,-.67,1.22),(2.45,1.55,.09),CHROME,root,.018)
    cylinder('upper-wire-head',(-.15,-.67,2.25),.21,.47,YELLOW,root)
    link('wire-filament',(-.15,-.67,2.05),(-.15,-.67,1.29),.012,CHROME,root)
    for x in [-.57,.57]:
        cylinder('wire-spool',(x,.66,2.12),.31,.16,STEEL,root,32,(math.pi/2,0,0))
        cylinder('wire-spool-hub',(x,.55,2.12),.07,.17,BLACK,root,20,(math.pi/2,0,0))
    panel_controls(root,1.7,-1.8,1.6)
    status_light(root,1.5,-.7,3.26)
    text_mesh('brand','FANUC',(-1.65,-1.77,2.65),.24,YELLOW,root)
    text_mesh('family','WIRE EDM // DEMO',(-.24,-1.77,2.65),.11,BLACK,root)
    return root


def make_edm():
    root=empty('MachineRoot')
    machine_base(root,3.75,3.2,3.05)
    doors(root,2.5,1.5,-1.73)
    cube('dielectric-basin',(0,-.7,.89),(2.25,1.25,.72),STEEL,root,.045)
    cube('fixture-block',(0,-.7,1.3),(.82,.75,.13),CHROME,root,.015)
    cylinder('z-ram',(0,-.55,2.27),.32,.82,YELLOW,root)
    cube('electrode-holder',(0,-.55,1.76),(.36,.31,.21),BLACK,root,.015)
    cylinder('electrode',(0,-.55,1.5),.105,.4,CHROME,root)
    for x in [-1.1,1.1]:
        link('coolant-line',(x,.2,2.05),(x,-.73,1.28),.045,BLACK,root)
    panel_controls(root,1.68,-1.8,1.6)
    status_light(root,1.5,-.7,3.26)
    text_mesh('family','EDM // DEMO',(-1.6,-1.78,2.65),.18,YELLOW,root)
    return root


def make_grind():
    root=empty('MachineRoot')
    machine_base(root,3.75,3.1,3.0)
    doors(root,2.45,1.48,-1.7)
    cube('magnetic-chuck',(0,-.79,.96),(2.28,.96,.19),CHROME,root,.025)
    for x in [-.8,-.4,0,.4,.8]:
        cube('chuck-line',(x,-.8,1.07),(.025,.8,.018),BLACK,root,.005)
    cylinder('grinding-wheel',(0,-.44,2.04),.49,.18,STEEL,root,48,(math.pi/2,0,0))
    cylinder('wheel-center',(0,-.56,2.04),.15,.19,BLACK,root,32,(math.pi/2,0,0))
    cube('wheel-guard',(0,-.2,2.35),(1.16,.5,.5),YELLOW,root,.12)
    link('coolant-nozzle',(.75,.22,2.35),(.37,-.5,1.28),.035,BLACK,root)
    panel_controls(root,1.68,-1.77,1.58)
    status_light(root,1.5,-.6,3.24)
    text_mesh('family','GRIND // DEMO',(-1.65,-1.75,2.64),.18,YELLOW,root)
    return root


def make_robot():
    root=empty('RobotRoot')
    cube('rail-carriage',(0,0,2.54),(1.55,1.25,.26),BLACK,root,.09)
    for x in [-.54,.54]:
        for y in [-.29,.29]:
            cube('rail-shoe',(x,y,2.38),(.26,.22,.12),STEEL,root,.025)
    cylinder('turntable',(0,0,2.77),.52,.28,STEEL,root,32)
    cylinder('rotary-waist',(0,0,3.03),.43,.43,YELLOW,root,32)
    shoulder=empty('Shoulder',root,(0,0,3.18))
    cylinder('J2-hinge',(0,0,0),.32,.44,BLACK,shoulder,32,(math.pi/2,0,0))
    link('upper-arm',(0,0,.05),(1.12,0,.65),.26,YELLOW,shoulder)
    cube('upper-arm-cover',(.55,-.16,.39),(.91,.16,.28),YELLOW,shoulder,.1)
    elbow=empty('Elbow',shoulder,(1.12,0,.65))
    cylinder('J3-hinge',(0,0,0),.28,.4,BLACK,elbow,32,(math.pi/2,0,0))
    link('forearm',(0,0,0),(.97,0,-.23),.19,YELLOW,elbow)
    cube('forearm-cover',(.52,-.13,-.09),(.8,.14,.22),YELLOW,elbow,.08)
    wrist=empty('Wrist',elbow,(.97,0,-.23))
    cylinder('J4-wrist',(.15,0,-.06),.19,.35,BLACK,wrist,24,(0,math.pi/2,0))
    cylinder('J5-wrist',(.35,0,-.09),.14,.27,YELLOW,wrist,24,(0,math.pi/2,0))
    tool_rough=empty('ToolRough',wrist,(.52,0,-.1))
    cube('rough-adapter',(.12,0,0),(.25,.3,.28),STEEL,tool_rough,.03)
    for y in [-.19,.19]:
        cube('rough-jaw',(.34,y,-.03),(.4,.11,.2),BLACK,tool_rough,.018)
    tool_protect=empty('ToolProtect',wrist,(.52,0,-.1))
    cube('protect-adapter',(.12,0,0),(.25,.32,.28),STEEL,tool_protect,.03)
    for y in [-.22,.22]:
        cube('protect-jaw',(.35,y,-.03),(.42,.12,.24),PAD,tool_protect,.025)
    link('external-cable',(-.22,.24,3.0),(.54,.24,3.61),.035,BLACK,root)
    text_mesh('arm-brand','FANUC',(-.12,-.27,3.01),.11,BLACK,root)
    assembly=empty('RobotAssembly',root,(0,0,-2.055))
    for obj in list(bpy.data.objects):
        if obj.parent == root and obj != assembly:
            obj.parent=assembly
    return root


def export_model(name, builder):
    reset()
    builder()
    bpy.ops.export_scene.gltf(filepath=str(OUT / f'{name}.glb'), export_format='GLB',
                              export_apply=True, export_yup=True, export_cameras=False,
                              export_lights=False)
    print('exported', name, (OUT / f'{name}.glb').stat().st_size, flush=True)


def make_full_scene():
    reset()
    floor=material('floor',(.07,.12,.18),.13,.81)
    cube('floor',(0,0,-.09),(65,50,.18),floor,None,.04)
    coords={'CNC-L01':(-17,-19),'CNC-R01':(-12,-14),'CNC-L02':(-17,-8),
            'CNC-R02':(-12,-9),'GRIND-01':(0,-16),'WIRE-01':(17,-7),'EDM-01':(17,7)}
    builders={'CNC':make_cnc,'GRIND':make_grind,'WIRE':make_wire,'EDM':make_edm}
    for ident,(x,z) in coords.items():
        kind=ident.split('-')[0]
        root=builders[kind]()
        root.name=ident
        root.location=(x,-z,0)
    for ident,x,z in [('R1',-20,5),('R2',-20,8)]:
        root=make_robot();root.name=ident;root.location=(x,-z,0)
    make_track_network(load_layout())
    for ident,x,z in [('RAW',-5,16),('WIP',0,17),('FG',5,16)]:
        cube(ident,(x,-z,.4),(3.5,2.2,.8),STEEL,None,.06)
    # Camera and preview: still image is evidence of mesh layout, not collision validation.
    bpy.ops.object.camera_add(location=(26,-43,48))
    camera=bpy.context.object
    direction=Vector((-1,1,0)) - camera.location
    camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO';camera.data.ortho_scale=57
    bpy.context.scene.camera=camera
    bpy.ops.object.light_add(type='AREA',location=(-22,-24,32))
    bpy.context.object.data.energy=3500;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=22
    bpy.context.scene.render.engine='BLENDER_WORKBENCH'
    bpy.context.scene.display.shading.light='STUDIO'
    bpy.context.scene.display.shading.color_type='MATERIAL'
    bpy.context.scene.render.resolution_x=1400
    bpy.context.scene.render.resolution_y=900
    bpy.context.scene.render.resolution_percentage=100
    bpy.context.scene.render.image_settings.file_format='PNG'
    bpy.context.scene.render.filepath=str(PREVIEW)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'agent-factory-scene.blend'))
    bpy.ops.render.render(write_still=True)
    print('saved full scene and preview', flush=True)


if __name__=='__main__':
    subprocess.run(['node', 'tools/export_track_layout.mjs'], cwd=ROOT, check=True)
    for name,builder in [('cnc',make_cnc),('grind',make_grind),('wire',make_wire),('edm',make_edm),('robot',make_robot)]:
        export_model(name,builder)
    export_model('track', lambda: make_track_network(load_layout()))
    make_full_scene()
