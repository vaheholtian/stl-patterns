import json
from PIL import Image, ImageDraw, ImageFont
A = {a['slug']: a for a in json.load(open('analysis.json'))}
M = json.load(open('meta.json'))
f = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 13)
COLS, ROWS, CW, CH = 5, 6, 450, 290
for page in range((len(M) + 29) // 30):
    sheet = Image.new('RGB', (COLS * CW, ROWS * CH), 'white'); d = ImageDraw.Draw(sheet)
    for k, m in enumerate(M[page * 30:(page + 1) * 30]):
        a = A[m['slug']]; x, y = (k % COLS) * CW, (k // COLS) * CH
        sheet.paste(Image.open(f"thumbs/{m['slug']}.png").convert('RGB'), (x + 3, y + 3))
        sheet.paste(Image.open(f"thumbs/{m['slug']}_mono.png").convert('RGB'), (x + 226, y + 3))
        t = f"{page*30+k} {m['slug']} {m['mode']} L{m['nLayers']}\nseam {a['seam']} fill {a['fill']} eLoss {a['edgeLoss']} hid {a['hidden']}\nfg {'C' if a['fg']['connected'] else '-'}{a['fg']['share']} bg {'C' if a['bg']['connected'] else '-'}{a['bg']['share']}  mm fg {a['tileMmFg']} bg {a['tileMmBg']}"
        d.multiline_text((x + 4, y + 226), t, fill='black', font=f)
        d.rectangle([x, y, x + CW - 1, y + CH - 1], outline='#999')
    sheet.save(f'sheets/p{page:02d}.png')
print('ok')
