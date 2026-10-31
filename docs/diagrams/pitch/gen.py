# Diagram SVGs for the pitch deck (dark theme, matches the slide tokens).
BG='#0D1013'; CARD='#151A1F'; LINE='#2A313A'; TXT='#E8ECF1'; MUT='#9AA4B2'; SUB='#BFC8D4'
BLUE='#5B95FF'; RED='#FF4757'; GREEN='#3DD68C'; AMBER='#FFB020'
FONT="Helvetica Neue, Helvetica, Arial, sans-serif"; MONO="Menlo, Courier New, monospace"
def esc(s): return s.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
def svg(w,h,body):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" font-family="{FONT}">
<defs>
<marker id="ab" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{BLUE}"/></marker>
<marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{RED}"/></marker>
<marker id="am" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{MUT}"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{GREEN}"/></marker>
</defs>
{body}
</svg>'''
def text(x,y,lines,size=24,fill=SUB,weight=400,anchor='start',lh=1.3,family=None):
    fam=f' font-family="{family}"' if family else ''
    out=f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{fam}>'
    for i,l in enumerate(lines):
        out+=f'<tspan x="{x}" dy="{0 if i==0 else size*lh}">{esc(l)}</tspan>'
    return out+'</text>'
def box(x,y,w,h,title,lines,accent=BLUE,num=None,stroke=LINE,fill=CARD):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="{fill}" stroke="{stroke}" stroke-width="2"/>'
    s+=f'<rect x="{x}" y="{y+18}" width="6" height="{h-36}" rx="3" fill="{accent}"/>'
    tx=x+30
    if num: s+=text(tx,y+46,[num],26,accent,800,family=MONO); tx2=tx+44
    else: tx2=tx
    s+=text(tx2,y+46,[title],30,TXT,700)
    s+=text(tx,y+90,lines,24,SUB)
    return s

# 1. Architecture: the alert path
b=''
b+=box(0,90,330,190,'Driver’s phone',['detects the crash','30 s alarm: “I’m OK”','queues if no signal'],RED,'1')
b+=box(0,360,330,150,'Witness',['in the app or web link','no account, 5 taps'],AMBER)
b+=box(510,215,280,190,'Gateway',['decodes, checks','merges duplicate','reports'],BLUE,'2')
b+=box(900,215,280,190,'Rules engine',['estimated risk','+ its reasons','ranks hospitals'],BLUE,'3')
b+=box(1290,90,374,190,'Ops room screen',['map pin + reasons','the human decides','every action logged'],BLUE,'4')
b+=box(1290,360,374,150,'Hospital ED',['pre-alert card + SMS','acknowledges'],GREEN)
b+=f'<path d="M330 160 C 420 160, 420 255, 506 255" fill="none" stroke="{BLUE}" stroke-width="4" marker-end="url(#ab)"/>'
b+=f'<path d="M330 225 C 420 225, 420 300, 506 300" fill="none" stroke="{RED}" stroke-width="4" stroke-dasharray="12 8" marker-end="url(#ar)"/>'
b+=text(338,140,['Internet'],22,BLUE,700)
b+=text(338,330,['or plain SMS'],22,RED,700)
b+=f'<path d="M330 435 C 420 435, 420 360, 506 360" fill="none" stroke="{AMBER}" stroke-width="4" marker-end="url(#ab)"/>'
b+=f'<path d="M790 310 L896 310" stroke="{BLUE}" stroke-width="4" marker-end="url(#ab)"/>'
b+=f'<path d="M1180 280 C 1235 280, 1230 185, 1286 185" fill="none" stroke="{BLUE}" stroke-width="4" marker-end="url(#ab)"/>'
b+=f'<path d="M1477 280 L1477 356" stroke="{GREEN}" stroke-width="4" marker-end="url(#ag)"/>'
b+=text(1492,330,['1-click pre-alert'],22,GREEN,700)
b+=f'<path d="M165 90 L165 30 L1477 30 L1477 86" fill="none" stroke="{MUT}" stroke-width="3" stroke-dasharray="4 8" marker-end="url(#am)"/>'
b+=f'<rect x="560" y="12" width="560" height="36" fill="{BG}"/>'
b+=text(840,40,['the voice call to 14 / 1021 still happens'],24,MUT,600,'middle')
open('architecture.svg','w').write(svg(1664,520,b))

# 2. Detection: how the phone decides it was a crash
steps=[('Armed','above 25 km/h','for 10 s'),('Impact','sustained,','not a single spike'),('Speed collapse','GPS speed falls','or the car rolls'),('Stopped','the vehicle','comes to rest'),('30 s alarm','sound, vibration,','voice: “I’m OK”'),('Alert sent','internet, else SMS;','queued if no signal')]
b=''; w=250; gap=33
for i,(t,l1,l2) in enumerate(steps):
    x=i*(w+gap); acc=RED if i==4 else (GREEN if i==5 else BLUE)
    b+=f'<rect x="{x}" y="0" width="{w}" height="210" rx="16" fill="{CARD}" stroke="{acc if i>=4 else LINE}" stroke-width="2"/>'
    b+=text(x+24,52,[str(i+1)],34,acc,800,family=MONO)
    b+=text(x+24,104,[t],29,TXT,700)
    b+=text(x+24,148,[l1,l2],23,SUB)
    if i<5: b+=f'<path d="M{x+w+4} 105 L{x+w+gap-4} 105" stroke="{BLUE}" stroke-width="4" marker-end="url(#ab)"/>'
b+=text(0,290,['FILTERED OUT BEFORE ANY ALERT'],22,MUT,700,family=MONO)
rej=[('Phone dropped','never armed: the car wasn’t moving'),('Speed bump, pothole','too short to count as an impact'),('Hard brake','no impact, so no event')]
for i,(t,d) in enumerate(rej):
    x=i*566
    b+=f'<rect x="{x}" y="315" width="532" height="110" rx="16" fill="{CARD}" stroke="{LINE}" stroke-width="2"/>'
    b+=f'<circle cx="{x+44}" cy="370" r="20" fill="none" stroke="{RED}" stroke-width="4"/><path d="M{x+32} 358 L{x+56} 382 M{x+56} 358 L{x+32} 382" stroke="{RED}" stroke-width="4"/>'
    b+=text(x+84,360,[t],27,TXT,700)
    b+=text(x+84,398,[d],22,SUB)
open('detection.svg','w').write(svg(1664,425,b))

# 3. Orientation: closest is not always right (illustrative)
b=''
b+=f'<rect x="0" y="0" width="760" height="700" rx="20" fill="#11161B" stroke="{LINE}" stroke-width="2"/>'
for i in range(1,8): b+=f'<path d="M{i*95} 0 L{i*95} 700" stroke="#182027" stroke-width="2"/>'
for i in range(1,8): b+=f'<path d="M0 {i*88} L760 {i*88}" stroke="#182027" stroke-width="2"/>'
b+=f'<path d="M80 600 C 220 560, 260 470, 300 400 S 420 220, 600 150" fill="none" stroke="#2E3A47" stroke-width="22" stroke-linecap="round"/>'
b+=f'<path d="M80 600 C 220 560, 260 470, 300 400 S 420 220, 600 150" fill="none" stroke="#56636F" stroke-width="2" stroke-dasharray="14 12"/>'
b+=f'<path d="M150 560 C 200 600, 300 630, 380 620" fill="none" stroke="#2E3A47" stroke-width="18" stroke-linecap="round"/>'
# crash pin
b+=f'<circle cx="150" cy="560" r="36" fill="{RED}" opacity="0.25"/><circle cx="150" cy="560" r="16" fill="{RED}"/>'
b+=text(110,515,['Crash'],26,TXT,700)
# clinic (nearest)
b+=f'<rect x="360" y="585" width="70" height="70" rx="12" fill="{CARD}" stroke="{MUT}" stroke-width="3"/>'
b+=f'<path d="M395 600 L395 640 M375 620 L415 620" stroke="{MUT}" stroke-width="6"/>'
b+=f'<rect x="450" y="560" width="290" height="120" rx="14" fill="{CARD}" stroke="{LINE}" stroke-width="2"/>'
b+=text(468,598,['Nearest clinic'],26,TXT,700)
b+=text(468,632,['✗ no CT scan at night','✗ no intensive care'],22,'#FF8A94')
# CHU (suggested)
b+=f'<rect x="565" y="115" width="70" height="70" rx="12" fill="{CARD}" stroke="{BLUE}" stroke-width="3"/>'
b+=f'<path d="M600 130 L600 170 M580 150 L620 150" stroke="{BLUE}" stroke-width="6"/>'
b+=f'<rect x="40" y="20" width="440" height="150" rx="14" fill="{CARD}" stroke="{BLUE}" stroke-width="2"/>'
b+=text(58,58,['Farther hospital · suggested'],26,TXT,700)
b+=text(58,94,['✓ CT 24/7    ✓ intensive care','✓ trauma surgery','the dispatcher confirms'],22,'#8BB4FF')
b+=f'<path d="M180 540 C 260 420, 420 260, 556 180" fill="none" stroke="{BLUE}" stroke-width="5" stroke-dasharray="2 12" stroke-linecap="round" marker-end="url(#ab)"/>'
b+=text(24,684,['Illustrative example'],22,MUT)
open('orientation.svg','w').write(svg(760,700,b))

# 4. Today vs with Sellekni
def lane(y,label,col,items,last_col):
    s=text(0,y+62,[label],26,col,800,family=MONO)
    x0=200; w=272; g=20
    for i,it in enumerate(items):
        x=x0+i*(w+g); c=last_col if i==len(items)-1 else LINE
        s+=f'<rect x="{x}" y="{y}" width="{w}" height="100" rx="14" fill="{CARD}" stroke="{c}" stroke-width="2"/>'
        s+=text(x+20,y+42,[it[0]],24,TXT,700)
        s+=text(x+20,y+76,[it[1]],21,SUB)
        if i<len(items)-1: s+=f'<path d="M{x+w+2} {y+50} L{x+w+g-2} {y+50}" stroke="{col}" stroke-width="3" marker-end="url(#{"ar" if col==RED else "ab"})"/>'
    return s
b=lane(0,'TODAY',RED,[('Crash','nobody may see it'),('Find a phone','in shock, at night'),('Dictate address','by voice'),('Severity','unknown until arrival'),('Nearest hospital','not always the right one')],RED)
b+=lane(150,'SELLEKNI',BLUE,[('Crash','the phone detects it'),('30 s to cancel','then it sends itself'),('Exact position','in the packet'),('Estimated risk','with its reasons'),('Right hospital','pre-alerted, if confirmed')],GREEN)
open('today-vs.svg','w').write(svg(1664,250,b))

# 5. Packet anatomy (annex)
fields=[('SLK1','version'),('K7Q2M','incident id'),('R75H','risk R · 75 · high conf.'),('36.47213,2.82871','position'),('T1432','time 14:32'),('D71','speed drop 71 km/h'),('RO','rollover'),('#0E','check code')]
b=''; x=0
for i,(f,m) in enumerate(fields):
    w=max(120,len(f)*24+40)
    c=RED if f=='R75H' else (GREEN if f=='#0E' else BLUE)
    b+=f'<rect x="{x}" y="0" width="{w}" height="80" rx="12" fill="{CARD}" stroke="{c}" stroke-width="2"/>'
    b+=text(x+w/2,52,[f],34,TXT,700,'middle',family=MONO)
    yy=150 if i%2==0 else 250
    b+=f'<path d="M{x+w/2} 84 L{x+w/2} {yy-34}" stroke="{c}" stroke-width="3"/>'
    b+=text(x+w/2,yy,[m],22,SUB,400,'middle')
    x+=w+14
open('packet.svg','w').write(svg(x,270,b))
print('ok', x)
