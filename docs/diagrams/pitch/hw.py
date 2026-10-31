# Hardware-plan diagrams (tiers, ESP32 box, OBD link) in a dark (slides) and a light (PDF) palette.
import sys
DARK=dict(BG='#0D1013',CARD='#151A1F',LINE='#2A313A',TXT='#E8ECF1',MUT='#9AA4B2',SUB='#BFC8D4',BLUE='#5B95FF',RED='#FF4757',GREEN='#3DD68C',AMBER='#FFB020',DASHFILL='#11161B')
LIGHT=dict(BG='#FFFFFF',CARD='#FFFFFF',LINE='#C9D2DC',TXT='#141A21',MUT='#5B6776',SUB='#3A4553',BLUE='#2F6FE0',RED='#D92B3A',GREEN='#12865A',AMBER='#A86500',DASHFILL='#F4F6F9')
FONT="Helvetica Neue, Helvetica, Arial, sans-serif"; MONO="Menlo, Courier New, monospace"
def esc(s): return s.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
def mk(P):
    def svg(w,h,body):
        m=''.join(f'<marker id="m{k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{P[k]}"/></marker>' for k in ['BLUE','RED','GREEN','MUT','AMBER'])
        return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" font-family="{FONT}"><defs>{m}</defs>{body}</svg>'
    def text(x,y,lines,size=24,fill=None,weight=400,anchor='start',lh=1.3,family=None):
        fam=f' font-family="{family}"' if family else ''
        o=f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill or P["SUB"]}" font-weight="{weight}" text-anchor="{anchor}"{fam}>'
        for i,l in enumerate(lines): o+=f'<tspan x="{x}" dy="{0 if i==0 else size*lh}">{esc(l)}</tspan>'
        return o+'</text>'
    def box(x,y,w,h,title,lines,acc,tag=None,dashed=False,ts=26,bs=21):
        d=' stroke-dasharray="10 7"' if dashed else ''
        f=P['DASHFILL'] if dashed else P['CARD']
        s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{f}" stroke="{acc if not dashed else P["LINE"]}" stroke-width="2"{d}/>'
        yy=y+38
        if tag: s+=text(x+20,y+30,[tag],15,acc,700,family=MONO); yy=y+62
        s+=text(x+20,yy,[title],ts,P['TXT'],700)
        s+=text(x+20,yy+bs*1.6,lines,bs,P['SUB'])
        return s
    def arrow(d,c='BLUE',dash=False,w=3):
        da=' stroke-dasharray="8 6"' if dash else ''
        return f'<path d="{d}" fill="none" stroke="{P[c]}" stroke-width="{w}"{da} marker-end="url(#m{c})"/>'
    return svg,text,box,arrow

def tiers(P):
    svg,text,box,arrow=mk(P); b=''
    rows=[('FREE · TODAY','Phone app',['accelerometer, gyro, GPS;','saturates on hard impacts'],'GREEN',False),
          ('FREE · TODAY','Witness',['in the app (5 taps) or a','web link; no account'],'GREEN',False),
          ('PAID · ROADMAP','OBD dongle',['plugs into the diagnostic port;','wheel speed sharpens the speed drop'],'AMBER',True),
          ('PAID · ROADMAP','Sellekni Box (ESP32)',['±200 g sensor sees the real crash pulse;','own GNSS, LTE and backup power'],'AMBER',True)]
    for i,(tag,t,d,acc,dash) in enumerate(rows):
        y=i*140
        b+=box(0,y,600,128,t,d,P[acc],tag,dash,ts=25,bs=19)
        b+=arrow(f'M600 {y+64} C 680 {y+64}, 680 278, 742 278','MUT' if dash else 'BLUE',dash)
    b+=f'<rect x="746" y="188" width="380" height="180" rx="16" fill="{P["CARD"]}" stroke="{P["RED"]}" stroke-width="3"/>'
    b+=text(770,233,['SAME PACKET'],16,P['RED'],700,family=MONO)
    b+=text(770,273,['one 160-character SMS'],26,P['TXT'],700)
    b+=text(770,310,['internet first, plain SMS','fallback, queued offline'],20,P['SUB'])
    b+=arrow('M1126 278 L1196 278','BLUE')
    b+=f'<rect x="1200" y="188" width="380" height="180" rx="16" fill="{P["CARD"]}" stroke="{P["BLUE"]}" stroke-width="2"/>'
    b+=text(1224,233,['SAME SERVER'],16,P['BLUE'],700,family=MONO)
    b+=text(1224,273,['ops room + hospital'],26,P['TXT'],700)
    b+=text(1224,310,['one decoder for every','source; a human decides'],20,P['SUB'])
    return svg(1580,556,b)

def boxd(P):
    svg,text,box,arrow=mk(P); b=''
    b+=f'<rect x="230" y="0" width="1010" height="470" rx="18" fill="none" stroke="{P["LINE"]}" stroke-width="2" stroke-dasharray="10 7"/>'
    b+=text(254,32,['SELLEKNI BOX · ROADMAP · NOT BUILT'],15,P['MUT'],700,family=MONO)
    b+=box(0,170,190,120,'12 / 24 V',['OBD pin 16','or fuse tap'],P['LINE'],ts=22,bs=18)
    b+=box(260,60,250,120,'Surge guard + buck',['5 V / 3.3 V','load-dump safe'],P['LINE'],ts=21,bs=18)
    b+=box(260,300,250,140,'Backup power',['supercap or cell:','radio stays alive','after a power cut'],P['AMBER'],ts=21,bs=18)
    b+=f'<rect x="580" y="170" width="300" height="140" rx="14" fill="{P["CARD"]}" stroke="{P["RED"]}" stroke-width="3"/>'
    b+=text(602,210,['ESP32 MCU'],26,P['TXT'],700)
    b+=text(602,245,['same detector rules,','packet encoder (C port)'],18,P['SUB'])
    b+=box(560,30,200,110,'±200 g accel.',['ADXL375-class'],P['BLUE'],ts=20,bs=17)
    b+=box(780,30,200,110,'6-axis IMU',['orientation, rollover'],P['BLUE'],ts=20,bs=17)
    b+=box(560,340,220,110,'LTE + GNSS',['modem, nano-SIM'],P['BLUE'],ts=20,bs=17)
    b+=box(800,340,200,110,'Cancel button',['+ buzzer: “I’m OK”'],P['BLUE'],ts=20,bs=17)
    b+=box(1010,190,210,110,'CAN / OBD',['optional: wheel','speed'],P['LINE'],dashed=True,ts=20,bs=17)
    b+=arrow('M190 230 C 220 230, 225 120, 256 120','MUT')
    b+=arrow('M510 120 C 545 120, 545 220, 576 220','MUT')
    b+=arrow('M510 370 C 545 370, 545 270, 576 270','AMBER',True)
    b+=arrow('M660 140 L660 166','BLUE'); b+=arrow('M880 140 L800 166','BLUE')
    b+=arrow('M670 310 L670 336','BLUE'); b+=arrow('M820 310 L880 336','BLUE')
    b+=arrow('M880 245 L1006 245','MUT',True)
    b+=arrow('M670 450 L670 486 L1420 486 L1420 330','RED')
    b+=f'<rect x="1270" y="170" width="300" height="156" rx="14" fill="{P["CARD"]}" stroke="{P["RED"]}" stroke-width="2"/>'
    b+=text(1290,210,['Same packet'],24,P['TXT'],700)
    b+=text(1290,245,['HTTPS first,','SMS fallback, to the','same server'],18,P['SUB'])
    steps=['sample at max rate','ring buffer','trigger ≥ 4 g','gates: speed, time, stop','countdown + button','encode + send']
    b+=text(0,522,['FIRMWARE FLOW · same rules as the phone'],15,P['MUT'],700,family=MONO)
    x=0
    for i,s in enumerate(steps):
        w=245
        b+=f'<rect x="{x}" y="540" width="{w}" height="56" rx="10" fill="{P["CARD"]}" stroke="{P["LINE"]}" stroke-width="2"/>'
        b+=text(x+w/2,575,[s],18,P['TXT'],600,'middle')
        if i<5: b+=arrow(f'M{x+w+2} 568 L{x+w+20} 568','BLUE',w=2)
        x+=w+22
    return svg(1570,600,b)

def obd(P):
    svg,text,box,arrow=mk(P); b=''
    items=[('Car','OBD-II port under the dash','pin 16: permanent +12 V','LINE'),
           ('OBD dongle','Bluetooth LE, ELM327-type','initialised with AT commands','AMBER'),
           ('Phone app','reads Mode 01 PID 0D','vehicle speed, km/h','BLUE'),
           ('Same detector','wheel speed + phone sensors','sharper speed drop','RED')]
    x=0; w=360
    for i,(t,a,c,k) in enumerate(items):
        b+=f'<rect x="{x}" y="0" width="{w}" height="150" rx="14" fill="{P["CARD"]}" stroke="{P[k]}" stroke-width="2"/>'
        b+=text(x+22,46,[t],26,P['TXT'],700)
        b+=text(x+22,88,[a,c],20,P['SUB'])
        if i<3: b+=arrow(f'M{x+w+4} 75 L{x+w+50} 75','BLUE')
        x+=w+56
    return svg(x-56,150,b)

for name,fn in [('hw-tiers',tiers),('hw-box',boxd),('hw-obd',obd)]:
    open(f'{name}-dark.svg','w').write(fn(DARK)); open(f'{name}-light.svg','w').write(fn(LIGHT))
print('ok')
