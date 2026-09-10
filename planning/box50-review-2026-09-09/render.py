"""Render measured final STL meshes using an orthographic, depth-buffered CPU rasterizer.
No generated imagery; positions and triangles come directly from each exported result.
"""
from pathlib import Path
import json, sys, time
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from numba import njit

ROOT=Path(__file__).resolve().parent
(ROOT/'images').mkdir(exist_ok=True)
FONT='C:/Windows/Fonts/segoeui.ttf'
def font(size): return ImageFont.truetype(FONT,size)

@njit
def raster(points, depth, colors, w, h):
    rgb=np.empty((h,w,3),np.uint8);rgb[:,:,:]=247
    buf=np.full((h,w),-1e30)
    for i in range(points.shape[0]):
        p=points[i]; d=depth[i]
        x0=max(0,int(np.floor(np.min(p[:,0])))); x1=min(w-1,int(np.ceil(np.max(p[:,0]))))
        y0=max(0,int(np.floor(np.min(p[:,1])))); y1=min(h-1,int(np.ceil(np.max(p[:,1]))))
        den=(p[1,1]-p[2,1])*(p[0,0]-p[2,0])+(p[2,0]-p[1,0])*(p[0,1]-p[2,1])
        if abs(den)<1e-9:continue
        for y in range(y0,y1+1):
            for x in range(x0,x1+1):
                a=((p[1,1]-p[2,1])*(x+.5-p[2,0])+(p[2,0]-p[1,0])*(y+.5-p[2,1]))/den
                b=((p[2,1]-p[0,1])*(x+.5-p[2,0])+(p[0,0]-p[2,0])*(y+.5-p[2,1]))/den
                c=1-a-b
                if a< -1e-7 or b< -1e-7 or c< -1e-7: continue
                z=a*d[0]+b*d[1]+c*d[2]
                if z>buf[y,x]:
                    buf[y,x]=z;rgb[y,x]=colors[i]
    return rgb

def read_stl(path):
    data=path.read_bytes();n=int.from_bytes(data[80:84],'little')
    dtype=np.dtype([('normal','<f4',(3,)),('verts','<f4',(3,3)),('attr','<u2')])
    return np.frombuffer(data,dtype=dtype,offset=84,count=n)['verts'].astype(float)

def view(tris, target, span, w,h, mode):
    camera=np.array([1.,-1.,.72]);camera/=np.linalg.norm(camera)
    right=np.cross([0,0,1],camera);right/=np.linalg.norm(right)
    up=np.cross(camera,right)
    p=tris-np.array(target)
    screen=np.stack([p@right*w/span+w/2,-p@up*w/span+h/2],axis=2)
    depth=p@camera
    n=np.cross(tris[:,1]-tris[:,0],tris[:,2]-tris[:,0]);n/=np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-12)
    light=np.array([-.3,-.6,1.]);light/=np.linalg.norm(light)
    intensity=.36+.56*np.maximum(0,n@light)+.08*np.maximum(0,n@camera)
    base=np.tile([63.,139.,153.],(len(n),1))
    center=tris.mean(axis=1)
    if mode=='emboss':
        raised=(center[:,0]>50.015)|(center[:,1]<-.015)
        base[raised]=[237,168,67]
    color=np.clip(base*intensity[:,None],0,255).astype(np.uint8)
    return Image.fromarray(raster(screen,depth,color,w,h))

def render(path,record):
    tris=read_stl(path);mode=record['mode']
    canvas=Image.new('RGB',(1440,900),(247,247,247));draw=ImageDraw.Draw(canvas)
    canvas.paste(view(tris,[25,25,25],98,820,680,mode),(0,100))
    canvas.paste(view(tris,[50,0,25],27,620,680,mode),(820,100))
    label={'default':'baseline, non-inverted','rotated37':'37 degrees, non-inverted'}.get(record['config'],record['config'])
    draw.text((32,18),f"{record['id']}  /  {mode.upper()}  /  {label}",font=font(28),fill='#203448')
    s=record['settings']
    draw.text((32,60),f"50 x 50 x 50 mm  |  wall 1.6 mm  |  rotation {s['rotationDeg']}°  |  scale {s['scale']}  |  margin {s['margin']} mm  |  depth {s['depth']} mm",font=font(19),fill='#465b65')
    draw.text((36,794),'Final exported mesh',font=font(20),fill='#203448')
    draw.text((860,794),'Shared 90° corner · magnified',font=font(20),fill='#203448')
    draw.text((32,849),f"Retained parts: {record['keptParts']}   |   Surface-level mismatch run: {record['longestRun']:.2f} mm   |   Mesh: {record['roundtrip']}",font=font(19),fill='#203448')
    canvas.save(ROOT/'images'/f'{path.stem}.png')

def records():
    out={}
    for p in ROOT.glob('*.jsonl'):
        for line in p.read_text().splitlines():
            try:r=json.loads(line)
            except json.JSONDecodeError:continue
            if r.get('mesh'):out[r['mesh']]=r
    return list(out.values())

def gallery():
    rows=records();ids=list(dict.fromkeys(r['id'] for r in rows))
    for mode in ['cut','emboss','recess']:
        rs=[r for r in rows if r['mode']==mode and r['config']=='picker-default']
        sheet=Image.new('RGB',(1600,95+((len(rs)+3)//4)*275),'white');d=ImageDraw.Draw(sheet)
        d.text((24,15),f'50 mm box / {mode.upper()} / pattern picker defaults',font=font(32),fill='#203448')
        d.text((24,57),'Exact final STL meshes. Open the gallery for full-resolution corner views and rotated settings.',font=font(19),fill='#465b65')
        for i,r in enumerate(rs):
            p=ROOT/'images'/f"{Path(r['mesh']).stem}.png"
            if not p.exists():continue
            im=Image.open(p);thumb=im.crop((0,100,820,790)).resize((300,252))
            x=(i%4)*400;y=95+(i//4)*275
            sheet.paste(thumb,(x,y));d.text((x+12,y+246),r['id'],font=font(17),fill='#203448')
            if r['keptParts']>1:d.text((x+275,y+32),f"{r['keptParts']} parts",font=font(17),fill='#ad3b23')
        sheet.save(ROOT/f'contact-{mode}.png')
    html='''<!doctype html><meta charset="utf-8"><title>Box 50 mm — pattern seam audit</title><style>body{font:16px system-ui;background:#f3f5f6;color:#203448;margin:30px}h1{font-size:30px}nav{position:sticky;top:0;background:#fff;padding:14px;display:flex;gap:16px;flex-wrap:wrap}a{color:#096e85}section{margin:28px 0}details{background:white;margin:12px 0;padding:12px}summary{cursor:pointer;font-weight:bold}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(560px,1fr));gap:16px}img{width:100%}figure{margin:0}figcaption{padding:8px}select{font:inherit} .bad{color:#ad3b23}</style><h1>50 mm container — pattern seam audit</h1><p>1.6 mm shell. Actual cut, recessed and embossed STL results; overview and magnified shared corner. Gold identifies raised geometry. Disconnected parts are counted after the app's 5 mm³ island filter.</p><nav><a href="REPORT.md">Review report</a><a href="contact-cut.png">Cutout contact sheet</a><a href="contact-emboss.png">Emboss contact sheet</a><a href="contact-recess.png">Recess contact sheet</a></nav>'''
    for id in ids:
        html+=f'<details open><summary>{id}</summary><div class="grid">'
        for r in sorted(rows,key=lambda r:(r['config']!='picker-default',r['config'],r['mode'])):
            if r['id']!=id:continue
            stem=Path(r['mesh']).stem
            html+=f'<figure><a href="images/{stem}.png"><img loading="lazy" src="images/{stem}.png"></a><figcaption>{r["config"]} · {r["mode"]} · {r["keptParts"]} retained parts · <a href="{r["mesh"]}">STL</a></figcaption></figure>'
        html+='</div></details>'
    (ROOT/'gallery.html').write_text(html,encoding='utf8')

if __name__=='__main__':
    watch='--watch' in sys.argv
    while True:
        count=0
        for r in records():
            p=ROOT/r['mesh'];dest=ROOT/'images'/f'{p.stem}.png'
            if not dest.exists() or dest.stat().st_mtime<max(p.stat().st_mtime,Path(__file__).stat().st_mtime):
                render(p,r);count+=1;print(p.stem,flush=True)
        gallery()
        if not watch:break
        result=ROOT/'batch.json'
        if result.exists() and len(json.loads(result.read_text()))==29:break
        time.sleep(5)
