from pathlib import Path
from PIL import Image
from html.parser import HTMLParser
import json
ROOT=Path(__file__).resolve().parent
images=list(ROOT.glob('*.png'))+list((ROOT/'images').glob('*.png'))
for path in images:
    with Image.open(path) as im: im.verify()
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.links=[]
    def handle_starttag(self,tag,attrs):
        self.links.extend(value for key,value in attrs if key in ('src','href'))
parser=Links(); parser.feed((ROOT/'gallery.html').read_text(encoding='utf8'))
missing=[link for link in parser.links if not (ROOT/link).exists()]
assert not missing,missing
assert len(images)==345,len(images)
assert (ROOT/'REPORT.md').exists()
summary={'validPNGs':len(images),'validGalleryLinks':len(parser.links),'missing':missing}
(ROOT/'image-verification.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary))
