"""Tiny SVG toolkit for the Sellekni diagrams. One code path, two themes:
standalone files use hex colours; the published page uses CSS variables (style="fill:var(--dg-ink)")."""
import html

SANS = "'IBM Plex Sans','IBM Plex Sans Arabic',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"
MONO = "'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"

def mix(a, b, t):
    pa = [int(a[i:i+2], 16) for i in (1, 3, 5)]; pb = [int(b[i:i+2], 16) for i in (1, 3, 5)]
    return '#%02X%02X%02X' % tuple(round(pa[i] * (1 - t) + pb[i] * t) for i in range(3))

class Theme:
    def __init__(self, ink, muted, line, surface, paper, brand, brand_text, brand_soft, inline=False):
        self.ink, self.muted, self.line, self.surface, self.paper = ink, muted, line, surface, paper
        self.brand, self.brand_text, self.brand_soft, self.inline = brand, brand_text, brand_soft, inline

LIGHT = Theme('#14181C', '#566270', '#B9B3A4', '#FFFFFF', '#F6F4EF', '#2B62F0', '#1740B0', mix('#F6F4EF', '#2B62F0', .12))
INLINE = Theme('var(--dg-ink)', 'var(--dg-muted)', 'var(--dg-line)', 'var(--dg-surface)', 'var(--dg-paper)',
               'var(--dg-brand)', 'var(--dg-brand-text)', 'var(--dg-brand-soft)', inline=True)

def esc(s): return html.escape(str(s), quote=False)
def st(**kw): return ';'.join(f"{k.replace('_', '-')}:{v}" for k, v in kw.items() if v is not None)

def wrap(s, maxw, size, mono=False):
    cw = size * (0.62 if mono else 0.56)
    per = max(4, int(maxw / cw))
    out, cur = [], ''
    for w in s.split(' '):
        if cur and len(cur) + 1 + len(w) > per: out.append(cur); cur = w
        else: cur = (cur + ' ' + w).strip()
    if cur: out.append(cur)
    return out

class Svg:
    def __init__(self, T, W, H, uid, title, desc, bg=True):
        self.T, self.W, self.H, self.uid, self.title, self.desc, self.bg = T, W, H, uid, title, desc, bg
        self.p = []
    def add(self, s): self.p.append(s)
    # ---- shapes
    def rect(self, x, y, w, h, fill=None, stroke=None, sw=1.2, rx=8, dash=None):
        T = self.T
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" style="{st(fill=fill or "none", stroke=stroke or "none", stroke_width=sw, stroke_dasharray=dash)}"/>')
    def text(self, x, y, s, size=12, fill=None, anchor='start', weight=400, mono=False, ls=None, italic=False):
        fam = MONO if mono else SANS
        extra = f' letter-spacing="{ls}"' if ls else ''
        it = ' font-style="italic"' if italic else ''
        self.add(f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}"{extra}{it} style="fill:{fill or self.T.ink}">{esc(s)}</text>')
    def lines(self, x, y, ls, size=12, lh=None, **kw):
        lh = lh or round(size * 1.35)
        for i, l in enumerate(ls): self.text(x, y + i * lh, l, size, **kw)
        return y + len(ls) * lh
    def para(self, x, y, s, maxw, size=12, lh=None, **kw):
        return self.lines(x, y, wrap(s, maxw, size, kw.get('mono', False)), size, lh, **kw)
    def line(self, x1, y1, x2, y2, stroke=None, sw=1.2, dash=None):
        self.add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" style="{st(stroke=stroke or self.T.muted, stroke_width=sw, stroke_dasharray=dash)}"/>')
    def arrow(self, pts, stroke=None, sw=1.4, dash=None, head=True):
        col = stroke or self.T.ink
        mk = 'b' if col == self.T.brand else 'i'
        d = 'M' + ' L'.join(f'{x},{y}' for x, y in pts)
        me = f' marker-end="url(#{self.uid}-{mk})"' if head else ''
        self.add(f'<path d="{d}" fill="none"{me} style="{st(stroke=col, stroke_width=sw, stroke_dasharray=dash, stroke_linejoin="round")}"/>')
    def label(self, x, y, s, size=11, anchor='middle', fill=None, mono=False, pad=3):
        """text with a paper-coloured halo so it stays readable on top of a line"""
        w = len(s) * size * (0.62 if mono else 0.55) + 2 * pad
        x0 = x - w / 2 if anchor == 'middle' else (x - w + pad if anchor == 'end' else x - pad)
        self.add(f'<rect x="{x0:.1f}" y="{y - size:.1f}" width="{w:.1f}" height="{size + 5}" rx="3" style="fill:{self.T.paper}"/>')
        self.text(x, y, s, size, fill=fill or self.T.muted, anchor=anchor, mono=mono)
    def badge(self, cx, cy, s='H', r=9):
        self.add(f'<circle cx="{cx}" cy="{cy}" r="{r}" style="fill:{self.T.brand}"/>')
        self.text(cx, cy + 4, s, 11, fill='#FFFFFF', anchor='middle', weight=600)
    def node(self, x, y, w, h, title, sub=None, kind='solid', size=13, subsize=11, tcolor=None):
        T = self.T
        if kind == 'solid': self.rect(x, y, w, h, T.surface, T.ink, 1.3)
        elif kind == 'soft': self.rect(x, y, w, h, T.brand_soft, T.brand, 1.3)
        elif kind == 'dashed': self.rect(x, y, w, h, 'none', T.muted, 1.3, dash='5 4')
        elif kind == 'ghost': self.rect(x, y, w, h, 'none', T.line, 1)
        self.text(x + 12, y + 8 + size, title, size, fill=tcolor or (T.muted if kind == 'dashed' else T.ink), weight=600)
        if sub: self.para(x + 12, y + 10 + size + subsize + 2, sub, w - 24, subsize, fill=T.muted)
    def render(self, standalone):
        T = self.T
        defs = (f'<defs><marker id="{self.uid}-i" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" style="fill:{T.ink}"/></marker>'
                f'<marker id="{self.uid}-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" style="fill:{T.brand}"/></marker></defs>')
        head = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.W} {self.H}" width="{self.W}" height="{self.H}" role="img" aria-label="{html.escape(self.desc, quote=True)}">'
                if standalone else
                f'<svg viewBox="0 0 {self.W} {self.H}" role="img" aria-label="{html.escape(self.desc, quote=True)}" style="width:100%;height:auto;display:block">')
        bg = f'<rect width="{self.W}" height="{self.H}" style="fill:{T.paper}"/>' if (self.bg and standalone) else ''
        return head + f'<title>{esc(self.title)}</title>' + defs + bg + ''.join(self.p) + '</svg>'
