"""Tessellate the Onshape Part Studio export (AP242, millimetres, Z up)."""
import argparse
from pathlib import Path

import cadquery as cq
from cadquery.occ_impl.assembly import toCAF
from OCP.IFSelect import IFSelect_RetDone
from OCP.Message import Message_ProgressRange
from OCP.Quantity import Quantity_ColorRGBA
from OCP.RWGltf import RWGltf_CafWriter
from OCP.RWMesh import RWMesh_CoordinateSystem_Zup, RWMesh_CoordinateSystem_glTF
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_AsciiString, TCollection_ExtendedString
from OCP.TColStd import TColStd_IndexedDataMapOfStringString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_LabelSequence
from OCP.TDocStd import TDocStd_Document
from OCP.XCAFDoc import XCAFDoc_ColorSurf, XCAFDoc_DocumentTool, XCAFDoc_VisMaterial, XCAFDoc_VisMaterialPBR
from OCP.XCAFPrs import XCAFPrs_Style

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STEP = ROOT / "cad/cnc-l01-shell.step"
RUNTIME_GLB = ROOT / "public/models/cnc-l01-shell.glb"
DOOR_PARTS = {"DoorPanel", "DoorHandle", "DoorGlass"}


def read_parts(step):
    # A Part Studio exports independent product roots, unlike an assembly STEP.
    reader = STEPCAFControl_Reader()
    document = TDocStd_Document(TCollection_ExtendedString("XCAF"))
    if reader.ReadFile(str(step)) != IFSelect_RetDone or not reader.Transfer(document):
        raise ValueError(f"Cannot read {step}")
    shapes = XCAFDoc_DocumentTool.ShapeTool_s(document.Main())
    colors = XCAFDoc_DocumentTool.ColorTool_s(document.Main())
    roots = TDF_LabelSequence()
    shapes.GetFreeShapes(roots)
    for label in roots:
        attr = TDataStd_Name()
        if not label.FindAttribute(TDataStd_Name.GetID_s(), attr):
            raise ValueError("Expected a named STEP part")
        name = attr.Get().ToExtString()
        body = cq.Shape.cast(shapes.GetShape_s(label))
        if not body.isValid() or len(body.Solids()) != 1:
            raise ValueError(f"Invalid solid: {name}")
        rgba = Quantity_ColorRGBA()
        if not colors.GetColor(body.wrapped, XCAFDoc_ColorSurf, rgba):
            colors.GetColor(body.Faces()[0].wrapped, XCAFDoc_ColorSurf, rgba)
        rgb = rgba.GetRGB()
        # STEP from this exporter omits glazing opacity. Match the Feature Studio.
        alpha = 0.23 if name in {"DoorGlass", "SideGlass"} else rgba.Alpha()
        yield name, body, cq.Color(rgb.Red(), rgb.Green(), rgb.Blue(), alpha, False)


def create_assembly(records):
    if len(records) == 1:
        _, fixed, _ = records[0]
        bounds = fixed.BoundingBox()
        transfer = cq.Solid.makeBox(1000, 1200, 1050, cq.Vector(-500, -1800, 800))
        if abs(bounds.zmin - 320) > 0.1 or bounds.ymin < -1665 or fixed.intersect(transfer).Volume() > 0.001:
            raise ValueError("Single-panel STEP does not fit the original CNC mounting and transfer opening")
        return cq.Assembly(fixed, name="CNC-L01-enclosure", color=cq.Color(0.73, 0.78, 0.79))
    exterior = cq.Assembly(name="CNC-L01")
    sliding = cq.Assembly(name="SlidingDoor")
    parts = {}
    for name, solid, paint in records:
        parts[name] = solid
        target = sliding if name in DOOR_PARTS else exterior
        target.add(solid, name=name, color=paint)
    lenses = {"StackRed", "StackOrange", "StackGreen"}
    has_lamp = lenses.issubset(parts) if lenses.intersection(parts) else "BeaconLens" in parts
    if not DOOR_PARTS.issubset(parts) or "Cabinet" not in parts or not has_lamp:
        raise ValueError("Export the complete ROBODRILL exterior Part Studio")
    exterior.add(sliding)
    # An enclosing box swept along X covers every intermediate pose of each moving part.
    travel = parts["DoorPanel"].BoundingBox().xlen - 120
    for name in sorted(DOOR_PARTS):
        b = parts[name].BoundingBox()
        swept = cq.Solid.makeBox(b.xlen + travel, b.ylen, b.zlen,
                                 cq.Vector(b.xmin - travel, b.ymin, b.zmin))
        for other, fixed in parts.items():
            if other not in DOOR_PARTS and swept.intersect(fixed).Volume() > 0.01:
                raise ValueError(f"Door travel envelope {name} intersects {other}")
    return exterior


def make_runtime_mesh(step):
    parts = list(read_parts(step))
    exterior = create_assembly(parts)
    _, doc = toCAF(exterior, coloredSTEP=True, mesh=True, tolerance=0.25, angularTolerance=0.16)
    writer = RWGltf_CafWriter(TCollection_AsciiString(str(RUNTIME_GLB)), True)
    coords = writer.ChangeCoordinateSystemConverter()
    coords.SetInputCoordinateSystem(RWMesh_CoordinateSystem_Zup)
    coords.SetOutputCoordinateSystem(RWMesh_CoordinateSystem_glTF)
    coords.SetInputLengthUnit(0.001)
    coords.SetOutputLengthUnit(1.0)
    # Paint, plastic, lettering and glass are dielectrics. The glTF default is bare metal.
    finish = XCAFDoc_VisMaterialPBR()
    finish.Metallic = 0.0
    finish.Roughness = 0.55
    material = XCAFDoc_VisMaterial()
    material.SetPbrMaterial(finish)
    style = XCAFPrs_Style()
    style.SetMaterial(material)
    writer.SetDefaultStyle(style)
    writer.SetMergeFaces(True)
    if not writer.Perform(doc, TColStd_IndexedDataMapOfStringString(), Message_ProgressRange()):
        raise RuntimeError("GLB export failed")
    print(f"{len(parts)} STEP solids, {RUNTIME_GLB.stat().st_size} bytes GLB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--step", type=Path, default=DEFAULT_STEP, help="STEP exported from the exterior Part Studio")
    make_runtime_mesh(parser.parse_args().step)
