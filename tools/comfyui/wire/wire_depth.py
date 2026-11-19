"""ComfyUI node for the four orthographic WIRE-01 reference cameras (metres, glTF Y-up)."""
from pathlib import Path
import numpy as np
import onnxruntime as ort
import torch
import trimesh
from PIL import Image
from scipy import ndimage
from skimage.measure import marching_cubes
import folder_paths
from comfy_extras.nodes_hunyuan3d import MESH

VIEWS = ('front', 'left', 'back', 'right')
YAW = (0, -90, 180, 90)
PITCH = np.arctan2(2, 7)
ORTHO_WIDTH = 5.9
PITCH_METRES = 0.035


def infer_depth(session, rgb, mask):
    # LoadImage's RGB may contain arbitrary colour under transparent pixels.
    rgb = np.where(mask[:, :, None], rgb, 0.5)
    image = Image.fromarray((rgb * 255).astype(np.uint8))
    image = np.asarray(image.resize((518, 518), Image.Resampling.BICUBIC)) / 255.
    image = (image - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    inputs = image.transpose(2, 0, 1)[None].astype(np.float32)
    output = session.run(None, {session.get_inputs()[0].name: inputs})[0].squeeze()
    return np.asarray(Image.fromarray(output).resize(mask.shape[::-1], Image.Resampling.BILINEAR))


def project(points, azimuth, shape):
    yaw = np.radians(azimuth + 12)
    right = np.array([np.cos(yaw), 0, -np.sin(yaw)])
    toward = np.array([np.sin(yaw)*np.cos(PITCH), np.sin(PITCH), np.cos(yaw)*np.cos(PITCH)])
    up = np.cross(toward, right)
    height, width = shape
    pixels_x = np.floor(width * (.5 + np.einsum("ij,j->i", points, right) / ORTHO_WIDTH)).astype(int)
    pixels_y = np.floor(height * (.5 - np.einsum("ij,j->i", points, up) / ORTHO_WIDTH)).astype(int)
    return (pixels_y.clip(0, height-1), pixels_x.clip(0, width-1)), np.einsum("ij,j->i", points, toward)


def surface_from_views(images, masks, session):
    origin = np.array([-2.12, -.12, -1.84])
    grid = np.indices((123, 97, 107)).reshape(3, -1).T * PITCH_METRES + origin
    points = grid - [0, 1.56, 0]
    inside = np.ones(len(points), dtype=bool)
    projections = []
    for image, mask, yaw in zip(images, masks, YAW):
        pixels, distance = project(points, yaw, mask.shape)
        inside &= mask[pixels]
        projections.append((infer_depth(session, image, mask), pixels, distance))

    # Calibrate each relative depth map to the silhouette envelope in metres.
    # The envelope only estimates the outer surface; allow recesses in the neural depth map.
    hull = inside.copy()
    for depth, (v, u), distance in projections:
        envelope = np.full(depth.shape, -np.inf)
        np.maximum.at(envelope, (v[hull], u[hull]), distance[hull])
        envelope = ndimage.maximum_filter(envelope, size=7)
        valid = np.isfinite(envelope)
        x = depth[valid]
        y = envelope[valid]
        slope, offset = np.polyfit(x, y, 1)
        if slope <= 0:
            raise ValueError('Depth increases away from the camera; check input views')
        # Folded sheet panels have shallow relief. Bound depth noise against each
        # calibrated silhouette so a shadow cannot carve a large dent into the roof.
        filtered = ndimage.gaussian_filter(depth, 3)
        estimated = slope * filtered[v, u] + offset
        limit = np.maximum(estimated, envelope[v, u] - .045)
        inside &= distance <= limit

    # Preserve the front opening, EDM tank, carriage approach and wire guide envelope.
    gx, gy, gz = grid.T
    chamber = (gx > -1.59) & (gx < .91) & (gy > .58) & (gy < 2.74) & (gz > -.69)
    envelope = (abs(gx) <= 1.96) & (abs(gz) <= 1.59) & (gy >= .19) & (gy <= 3.15)
    inside &= envelope & ~chamber
    field = ndimage.gaussian_filter(inside.reshape(123, 97, 107).astype('f4'), .85)
    verts, faces, _, _ = marching_cubes(field, level=.5, spacing=(PITCH_METRES,)*3)
    mesh = trimesh.Trimesh(vertices=verts+origin, faces=faces)
    mesh = max(mesh.split(only_watertight=False), key=lambda part: part.area)
    mesh = mesh.simplify_quadric_decimation(face_count=min(12000, len(mesh.faces)))
    mesh.fix_normals()
    return mesh


class WireDepthShell:
    @classmethod
    def INPUT_TYPES(cls):
        inputs = {}
        for name in VIEWS:
            inputs[name] = ('IMAGE',)
            inputs[name+'_mask'] = ('MASK',)
        return {'required': inputs}

    RETURN_TYPES = ('MESH',)
    FUNCTION = 'generate'
    CATEGORY = '3d/Agent Factory'

    def generate(self, **inputs):
        model = Path(folder_paths.models_dir) / 'depth' / 'model_quantized.onnx'
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 4
        session = ort.InferenceSession(str(model), sess_options=opts, providers=['CPUExecutionProvider'])
        images = [inputs[name][0].cpu().numpy() for name in VIEWS]
        masks = [inputs[name+'_mask'][0].cpu().numpy() < .5 for name in VIEWS]
        mesh = surface_from_views(images, masks, session)
        return (MESH(torch.from_numpy(mesh.vertices.astype('f4'))[None],
                     torch.from_numpy(mesh.faces.astype('int64'))[None]),)


NODE_CLASS_MAPPINGS = {'WireDepthShell': WireDepthShell}
