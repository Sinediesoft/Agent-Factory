"""Build the synthetic rail network from the web simulation's exported layout."""
import json
import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
LAYOUT = ROOT / 'tools' / 'track-layout.json'


def load_layout():
    return json.loads(LAYOUT.read_text(encoding='utf-8'))


def material(name, rgb, metallic=.0, roughness=.5, emission=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = 1.2
    return mat


class BoxBatch:
    """Merge repeated rail sections into a few editable mesh objects."""

    def __init__(self):
        self.vertices = []
        self.faces = []

    def add(self, center, tangent, length, width, height, z):
        dx, dy = tangent
        mag = math.hypot(dx, dy)
        if mag < 1e-8:
            return
        ux, uy = dx / mag, dy / mag
        nx, ny = -uy, ux
        base = len(self.vertices)
        for hz in (-height / 2, height / 2):
            for along, across in ((-1, -1), (-1, 1), (1, 1), (1, -1)):
                self.vertices.append((
                    center[0] + ux * along * length / 2 + nx * across * width / 2,
                    center[1] + uy * along * length / 2 + ny * across * width / 2,
                    z + hz,
                ))
        for face in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                     (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.faces.append(tuple(base + i for i in face))

    def create(self, name, mat, parent):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        obj.data.materials.append(mat)
        return obj


def empty(name, parent=None, loc=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = loc
    return obj


def cylinder(name, loc, radius, depth, mat, parent, vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = loc
    obj.data.materials.append(mat)
    return obj


def build_path(path, gauge, height, sleeper_spacing, batches, key):
    """The JSON x/z floor plan maps to Blender x/-y, with z as height."""
    coordinates = [(p[0], -p[1]) for p in path]
    steel, sleepers, accents = batches[key]
    distance = 0.0
    next_sleeper = sleeper_spacing / 2
    for a, b in zip(coordinates, coordinates[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        if length < 1e-8:
            continue
        nx, ny = -dy / length, dx / length
        center = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        for side in (-1, 1):
            rail_center = (center[0] + nx * side * gauge / 2,
                           center[1] + ny * side * gauge / 2)
            steel.add(rail_center, (dx, dy), length + .015, .085, .13, height)
        accents.add(center, (dx, dy), length + .01, .035, .012, height + .078)
        while next_sleeper <= distance + length:
            along = next_sleeper - distance
            point = (a[0] + dx * along / length, a[1] + dy * along / length)
            sleepers.add(point, (dx, dy), .22, gauge + .47, .07, height - .11)
            next_sleeper += sleeper_spacing
        distance += length


def make_track_network(layout):
    root = empty('TrackNetwork')
    steel = material('track-steel', (.34, .49, .53), .83, .27)
    tie_mat = material('track-sleepers', (.055, .095, .13), .24, .6)
    disc_mat = material('turntable-deck', (.22, .32, .39), .7, .31)
    dark = material('turntable-housing', (.06, .10, .14), .4, .55)
    amber = material('track-marker-amber', (.96, .55, .08), .18, .22,
                     emission=(.55, .24, .02))
    colors = {
        'main': material('track-main-cyan', (.05, .55, .92), .3, .25,
                         emission=(.015, .28, .62)),
        'area': material('track-area-violet', (.47, .32, .82), .25, .32,
                         emission=(.21, .1, .4)),
        'branch': material('track-branch-amber', (.92, .57, .12), .25, .3,
                           emission=(.46, .19, .015)),
        'dock': material('track-dock-teal', (.23, .63, .59), .25, .3,
                         emission=(.075, .31, .25)),
    }
    batches = {kind: (BoxBatch(), BoxBatch(), BoxBatch()) for kind in colors}
    gauge = layout['gaugeM']
    height = layout['railHeightM']
    spacing = layout['sleeperSpacingM']
    build_path(layout['main']['path'], gauge, height, spacing, batches, 'main')
    for ring in layout['rings']:
        build_path(ring['path'], gauge, height, spacing, batches, 'area')
    for branch in layout['branches']:
        for path in branch['paths']:
            build_path(path, gauge, height, spacing, batches, 'branch')
    for dock in layout['docks']:
        build_path(dock['path'], gauge, height, spacing, batches, 'dock')
    for kind, (rails, sleepers, accents) in batches.items():
        rails.create(f'Track_{kind}_steel', steel, root)
        sleepers.create(f'Track_{kind}_sleepers', tie_mat, root)
        accents.create(f'Track_{kind}_accent', colors[kind], root)

    # Six named rotors are animated from the corresponding turntable reservations.
    for branch in layout['branches']:
        x, z = branch['paths'][0][0]
        x, y = x, -z
        base = empty(f'Turntable_{branch["id"]}', root, (x, y, 0))
        radius = layout['turntableRadiusM']
        cylinder(f'{branch["id"]}_housing', (0, 0, height - .13), radius, .14, dark, base, 48)
        rotor = empty(f'Rotor_{branch["id"]}', base, (0, 0, height - .035))
        cylinder(f'{branch["id"]}_deck', (0, 0, 0), radius - .08, .11, disc_mat, rotor, 48)
        rotor_rails = BoxBatch()
        for side in (-1, 1):
            rotor_rails.add((0, side * gauge / 2), (1, 0), 1.55, .085, .11, .095)
        rotor_rails.create(f'{branch["id"]}_rotor_rails', steel, rotor)
        cylinder(f'{branch["id"]}_pivot', (0, 0, .065), .17, .08, amber, rotor, 24)

    for dock in layout['docks']:
        x, z = dock['path'][-1]
        end = empty(f'Dock_{dock["id"]}', root, (x, -z, 0))
        cylinder(f'{dock["id"]}_stop', (0, 0, height - .02), .19, .13, dark, end, 16)
        cylinder(f'{dock["id"]}_marker', (0, 0, height + .06), .085, .04, amber, end, 16)
    return root
