from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
ROOT=Path(__file__).resolve().parent
rows=json.loads((ROOT/'sections.json').read_text())
fig,axes=plt.subplots(1,3,figsize=(15,6.3))
for ax,row in zip(axes,rows):
    box='box50' in row['name'];fine='0.6' in row['name']
    for poly in row['polygons']:
        ax.add_patch(Polygon(poly,facecolor='#74a5ae',edgecolor='#28505d',linewidth=1))
    if box:
        ax.set_xlim(48.8,51.2);ax.set_ylim(-1.2,1.2)
        ax.plot([48.8,50.8,50.8],[-.8,-.8,1.2],'--',color='#c65831',lw=2,label='Required 0.8 mm offset')
        ax.plot([48.8,50,50],[0,0,1.2],':',color='#23333f',lw=1,label='Original surface')
        ax.set_title(f'90° box corner / scale {"0.6" if fine else "1.0"}')
        if fine:ax.annotate('0.32 mm shortfall\non each axis',xy=(50.6,-.6),xytext=(49.0,-1.03),arrowprops={'arrowstyle':'->','color':'#c65831'},color='#a84626')
    else:
        ax.set_xlim(-2.1,2.1);ax.set_ylim(-.5,2.6)
        expected=.8/np.cos(np.deg2rad(67.5));xs=np.array([-2.1,0,2.1])
        ax.plot(xs,expected-np.abs(xs)*np.tan(np.deg2rad(67.5)),'--',color='#c65831',lw=2,label='Required 0.8 mm offset')
        ax.set_title('135° bend / scale 1.0')
        ax.annotate('1.225 mm\nmissing ridge height',xy=(0,1.45),xytext=(.45,2.12),arrowprops={'arrowstyle':'->','color':'#c65831'},color='#a84626')
    ax.set_aspect('equal');ax.grid(alpha=.15);ax.set_xlabel('x (mm)');ax.set_ylabel('y (mm)');ax.legend(loc='lower left',fontsize=8)
fig.suptitle('Confirmed emboss notch — cross-sections of actual exported meshes',fontsize=17,y=.98)
fig.text(.5,.02,'A uniformly filled diagnostic tile isolates the fold geometry. Blue: actual solid. Dashed orange: intended relief envelope.',ha='center',fontsize=11)
fig.tight_layout(rect=[0,.11,1,.92]);fig.savefig(ROOT/'emboss-notch-sections.png',dpi=160);plt.close(fig)
