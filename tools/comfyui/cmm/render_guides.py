from pathlib import Path
import sys
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from guide_views import panel, render_views

bpy.ops.wm.read_factory_settings(use_empty=True)
ivory = (.86, .88, .87)
granite = (.31, .36, .38)
panel('granite measuring base', (0, 0, .47), (3.84, 3.00, .72), granite)
panel('rear electronics cabinet', (0, 1.21, 1.82), (3.84, .58, 2.50), ivory)
panel('left bridge frame', (-1.69, -.02, 1.78), (.46, 2.98, 2.64), ivory)
panel('right bridge frame', (1.69, -.02, 1.78), (.46, 2.98, 2.64), ivory)
panel('upper measuring beam', (0, .12, 2.97), (3.82, 2.72, .34), ivory)
render_views(Path(__file__).resolve().parent / 'reference', 'cmm')
