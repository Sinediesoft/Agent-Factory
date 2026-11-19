from pathlib import Path
import sys
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from guide_views import panel, render_views

bpy.ops.wm.read_factory_settings(use_empty=True)
ivory = (.85, .86, .82)
panel('wide grinder bed', (0, 0, .49), (3.84, 3.00, .66), (.44, .46, .47))
panel('rear spindle cabinet', (0, .99, 1.68), (3.78, 1.04, 2.80), ivory)
panel('left wheel cabinet', (-1.50, -.05, 1.59), (.83, 2.82, 2.69), ivory)
panel('right operator console support', (1.51, -.18, 1.56), (.75, 2.70, 2.59), ivory)
panel('lintel over slide rail', (0, -.12, 2.81), (3.77, 2.82, .35), ivory)
panel('raised spindle cover', (-.55, .38, 3.00), (1.62, 1.65, .25), ivory)
render_views(Path(__file__).resolve().parent / 'reference', 'grind')
