"""One-time subset conversion. Requires fonttools; no runtime Python dependency."""
import json
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
font=TTFont(sys.argv[1] if len(sys.argv)>1 else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
glyphset=font.getGlyphSet(); cmap=font.getBestCmap()
class Pen(BasePen):
 def __init__(self): super().__init__(glyphset); self.commands=[]; self.start=None
 def emit(self,op,*points):
  self.commands.append(op)
  for point in points:self.commands.extend(str(round(v,2)) for v in point)
 def _moveTo(self,p):self.start=p;self.emit('m',p)
 def _lineTo(self,p):self.emit('l',p)
 def _qCurveToOne(self,c,p):self.emit('q',p,c)
 def _curveToOne(self,c1,c2,p):self.emit('b',p,c1,c2)
 def _closePath(self):self.emit('l',self.start)
 def _endPath(self):pass
glyphs={}
for c in sorted(set('Янтарный циркуль? ')):
 name=cmap[ord(c)]; pen=Pen();glyphset[name].draw(pen)
 glyphs[c]={'ha':font['hmtx'][name][0],'o':' '.join(pen.commands)}
data={'glyphs':glyphs,'familyName':font['name'].getDebugName(1)+' title subset','resolution':font['head'].unitsPerEm,'boundingBox':{'yMin':font['head'].yMin,'yMax':font['head'].yMax},'underlineThickness':90,'underlinePosition':-100}
with open('src/fonts/title.json','w') as f:json.dump(data,f,ensure_ascii=False)
