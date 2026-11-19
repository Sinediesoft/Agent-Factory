from pathlib import Path
import sys
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from guide_views import panel, render_views

bpy.ops.wm.read_factory_settings(use_empty=True)
ivory=(.84,.85,.82)
panel('base',(0,0,.44),(3.92,3.12,.52),ivory)
panel('rear column',(-.42,.97,1.61),(2.91,1.18,2.81),ivory)
panel('working bay side',(-1.74,-.34,1.23),(.35,2.38,1.90),ivory)
panel('reel housing',(-.78,.13,2.81),(2.33,1.79,.62),ivory)
panel('control cabinet',(1.40,-.02,1.70),(1.08,3.10,2.90),ivory)
panel('cabinet plinth',(1.40,-.09,.29),(1.05,2.93,.28),(.18,.19,.20))
render_views(Path(__file__).resolve().parent/'reference', 'wire')
