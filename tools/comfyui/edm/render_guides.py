from pathlib import Path
import sys
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from guide_views import panel, render_views

bpy.ops.wm.read_factory_settings(use_empty=True)

# Twin columns and the overhead bridge surround a central vertical ram.
ivory = (.83,.85,.86)
panel('lower cabinet', (0,0,.48), (3.80,3.06,.64), (.45,.50,.54))
panel('rear bulkhead', (0,1.11,1.65), (3.67,.86,2.90), ivory)
panel('left column', (-1.52,.03,1.65), (.67,2.82,2.80), ivory)
panel('right control tower', (1.46,-.08,1.69), (.88,2.90,2.87), ivory)
panel('ram bridge', (0,-.32,2.87), (3.14,2.02,.53), ivory)
render_views(Path(__file__).resolve().parent/'reference', 'edm')
