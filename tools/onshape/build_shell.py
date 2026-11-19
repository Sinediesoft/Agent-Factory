"""Build the default STEP for the local trial, or tessellate a STEP from Onshape.

Run with CadQuery 2.8.0. All CAD coordinates are in millimetres, Z up.
"""
import argparse
from pathlib import Path

import cadquery as cq

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STEP = ROOT / "cad/cnc-l01-shell.step"
RUNTIME_GLB = ROOT / "public/models/cnc-l01-shell.glb"


def box(xmin, ymin, zmin, xmax, ymax, zmax):
    return cq.Solid.makeBox(
        xmax - xmin, ymax - ymin, zmax - zmin, cq.Vector(xmin, ymin, zmin)
    )


def default_enclosure():
    """Local equivalent of the FeatureScript's default configuration."""
    half_width, half_depth, wall = 1920, 1610, 80
    bottom, top, half_port = 320, 3060, 1250
    x, y = half_width, half_depth
    stock = box(-x, -y, bottom, x, y, top)
    cavity = box(-x + wall, -y + wall, bottom + wall, x - wall, y - wall, top - wall)
    port = box(-half_port, -y - 1, 730, half_port, -y + wall + 1, 2310)
    reveal = box(-half_port, -y - 1, 2470, half_port, -y + 16, 2510)
    vents = [
        box(-x - 1, -150, z, -x + wall + 1, 900, z + 42)
        for z in range(1900, 2281, 95)
    ]
    return stock.cut(cavity, port, reveal, *vents).clean()


def make_runtime_mesh(step):
    solids = cq.importers.importStep(str(step)).solids().vals()
    if len(solids) != 1 or not solids[0].isValid():
        raise ValueError("Expected a single valid closed enclosure solid")
    solid = solids[0]
    # Check the mounting plane, doorway and inside face of the sliding doors.
    bounds = solid.BoundingBox()
    if abs(bounds.zmin - 320) > 0.1 or bounds.ymin < -1665:
        raise ValueError("Enclosure does not fit the plinth or the sliding doors")
    transfer = box(-500, -1800, 800, 500, -600, 1850)
    if solid.intersect(transfer).Volume() > 0.001:
        raise ValueError("Enclosure obstructs the central transfer opening")
    # This exporter rotates Z-up to Y-up but preserves numeric coordinates. glTF uses metres.
    assembly = cq.Assembly(solid.scale(0.001), name="CNC-L01-enclosure", color=cq.Color(0.73, 0.78, 0.79))
    assembly.export(str(RUNTIME_GLB), "GLTF")
    print(f"{bounds.xlen:.0f} × {bounds.ylen:.0f} × {bounds.zlen:.0f} mm, "
          f"one solid, transfer opening clear, {RUNTIME_GLB.stat().st_size} bytes GLB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--step", type=Path, help="Use an exported enclosure STEP in its mounting coordinates")
    args = parser.parse_args()
    if args.step is None:
        cq.exporters.export(default_enclosure(), str(DEFAULT_STEP))
    make_runtime_mesh(args.step or DEFAULT_STEP)
