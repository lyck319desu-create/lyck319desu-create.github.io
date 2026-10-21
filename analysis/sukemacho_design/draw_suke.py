"""すけマッチョ 新デザイン（ホワイトマン寄せ）のキャラクターシートとサムネ見本を SVG で描いて PNG にする。"""
import math, cairosvg, sys
OUT = sys.argv[1]

INK = '#1f1f1f'; BODY = '#ffffff'; BACK = '#dcdcdc'; SHADE = '#c8c8c8'
RED = '#e0262b'; SHORTS = '#1f1f1f'; BG = '#c6c8cc'; GREEN = '#22a34a'; YEL = '#f6c51b'
OL = 7  # 輪郭の太さ

def capsule(a, b, wa, wb):
    """a→b の先細りカプセルのパス。"""
    (x1, y1), (x2, y2) = a, b
    dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L, dx / L; ra, rb = wa / 2, wb / 2
    p = [(x1 + nx * ra, y1 + ny * ra), (x2 + nx * rb, y2 + ny * rb), (x2 - nx * rb, y2 - ny * rb), (x1 - nx * ra, y1 - ny * ra)]
    return (f'M{p[0][0]:.1f},{p[0][1]:.1f} L{p[1][0]:.1f},{p[1][1]:.1f} A{rb},{rb} 0 0 0 {p[2][0]:.1f},{p[2][1]:.1f} '
            f'L{p[3][0]:.1f},{p[3][1]:.1f} A{ra},{ra} 0 0 0 {p[0][0]:.1f},{p[0][1]:.1f} Z')

def circ(c, r): return f'M{c[0]-r:.1f},{c[1]:.1f} a{r},{r} 0 1 0 {2*r},0 a{r},{r} 0 1 0 {-2*r},0 Z'
def poly(pts): return 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + ' Z'

def layer(paths, fill):
    """輪郭→塗りの順に描き、重なりの内側に線を出さない。"""
    o = ''.join(f'<path d="{d}" fill="{INK}" stroke="{INK}" stroke-width="{OL*2}" stroke-linejoin="round"/>' for d in paths)
    return o + ''.join(f'<path d="{d}" fill="{fill}"/>' for d in paths)

def arm(s, e, w, up=46):
    return [capsule(s, e, up, up * .8), capsule(e, w, up * .8, up * .58), circ(w, up * .5)]

def leg(h, k, a, toe):
    return [capsule(h, k, 62, 44), capsule(k, a, 44, 28), capsule(a, toe, 26, 20)]

def band(e, w):
    """手首の赤いリストバンド。"""
    t = .60; x = e[0] + (w[0] - e[0]) * t; y = e[1] + (w[1] - e[1]) * t
    t2 = .76; x2 = e[0] + (w[0] - e[0]) * t2; y2 = e[1] + (w[1] - e[1]) * t2
    return (f'<path d="{capsule((x, y), (x2, y2), 34, 34)}" fill="{RED}" stroke="{INK}" stroke-width="5"/>')

def face_front(c, mood='normal'):
    x, y = c; s = []
    if mood == 'surprised':
        s += [f'<circle cx="{x-15}" cy="{y+2}" r="7" fill="{INK}"/>', f'<circle cx="{x+15}" cy="{y+2}" r="7" fill="{INK}"/>',
              f'<ellipse cx="{x}" cy="{y+24}" rx="7" ry="9" fill="{INK}"/>',
              f'<path d="M{x-25},{y-16} q10,-8 18,-2 M{x+7},{y-18} q10,-6 18,2" stroke="{INK}" stroke-width="5" fill="none" stroke-linecap="round"/>']
    else:
        s += [f'<ellipse cx="{x-15}" cy="{y+2}" rx="5" ry="7" fill="{INK}"/>', f'<ellipse cx="{x+15}" cy="{y+2}" rx="5" ry="7" fill="{INK}"/>']
        if mood == 'normal':
            s += [f'<path d="M{x-25},{y-12} l17,4 M{x+25},{y-12} l-17,4" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>',
                  f'<path d="M{x-9},{y+22} q9,5 18,0" stroke="{INK}" stroke-width="4" fill="none" stroke-linecap="round"/>']
        elif mood == 'smug':
            s += [f'<path d="M{x-25},{y-12} l17,4 M{x+25},{y-12} l-17,4" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>',
                  f'<path d="M{x-12},{y+18} q12,12 24,0" stroke="{INK}" stroke-width="5" fill="none" stroke-linecap="round"/>']
        elif mood == 'pain':
            s = [f'<path d="M{x-22},{y} l12,4 l-12,4 M{x+22},{y} l-12,4 l12,4" stroke="{INK}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
                 f'<path d="M{x-25},{y-16} l17,-5 M{x+25},{y-16} l-17,-5" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>',
                 f'<path d="M{x-12},{y+24} l6,-5 l6,5 l6,-5 l6,5" stroke="{INK}" stroke-width="4" fill="none" stroke-linecap="round"/>',
                 f'<path d="M{x+34},{y-30} q6,12 0,18 q-6,-6 0,-18" fill="#6fb7ff" stroke="{INK}" stroke-width="3"/>']
        elif mood == 'think':
            s += [f'<path d="M{x-25},{y-14} l17,0 M{x+25},{y-18} l-17,4" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>',
                  f'<path d="M{x-8},{y+22} l16,-2" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>']
    return ''.join(s)

def face_side(c, mood='normal'):
    x, y = c
    s = f'<ellipse cx="{x+14}" cy="{y}" rx="4.5" ry="7" fill="{INK}"/><path d="M{x+4},{y-14} l20,3" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>'
    if mood == 'pain':
        s = f'<path d="M{x+6},{y-2} l12,4 l-12,4" stroke="{INK}" stroke-width="5" fill="none"/><path d="M{x+4},{y-16} l20,-4" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>'
    return s + f'<path d="M{x+20},{y+22} l10,-1" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>'

HEAD_R = 40

def front(pose='flex', mood='normal'):
    """正面。原点は足元の中央。"""
    sh = {'L': (-88, -488), 'R': (88, -488)}
    if pose == 'flex':
        arms = {'R': ((88, -488), (178, -478), (168, -590)), 'L': ((-88, -488), (-178, -478), (-168, -590))}
    elif pose == 'point':
        arms = {'R': ((88, -488), (168, -540), (232, -612)), 'L': ((-88, -488), (-150, -400), (-72, -335))}
    elif pose == 'cross':  # 腕組み風（両手を腰）
        arms = {'R': ((88, -488), (150, -400), (72, -335)), 'L': ((-88, -488), (-150, -400), (-72, -335))}
    else:  # stand
        arms = {'R': ((88, -488), (112, -380), (118, -275)), 'L': ((-88, -488), (-112, -380), (-118, -275))}
    legs = [((-40, -275), (-50, -140), (-52, -18), (-82, -8)), ((40, -275), (50, -140), (52, -18), (82, -8))]
    torso = poly([(-104, -505), (104, -505), (84, -410), (54, -330), (60, -275), (-60, -275), (-54, -330), (-84, -410)])
    paths = [torso, capsule((0, -500), (0, -548), 54, 48), circ((0, -572), HEAD_R), circ(sh['L'], 36), circ(sh['R'], 36)]
    for k in 'LR': paths += arm(*arms[k])
    for l in legs: paths += leg(*l)
    g = layer(paths, BODY)
    # 筋肉の線（薄く）
    g += (f'<path d="M-70,-440 q35,22 70,4 q35,18 70,-4 M0,-475 L0,-300 M-34,-405 h22 M12,-405 h22 M-32,-372 h20 M12,-372 h20 M-30,-340 h18 M12,-340 h18" '
          f'stroke="{SHADE}" stroke-width="5" fill="none" stroke-linecap="round"/>')
    g += f'<path d="{poly([(-66, -300), (66, -300), (72, -205), (10, -198), (0, -232), (-10, -198), (-72, -205)])}" fill="{SHORTS}" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>'
    for k in 'LR': g += band(arms[k][1], arms[k][2])
    if pose == 'point':
        w = arms['R'][2]; g += layer([capsule(w, (w[0] + 30, w[1] - 34), 14, 12)], BODY)
    g += face_front((0, -572), mood)
    return g

def _axes(sh, hip):
    ux, uy = sh[0] - hip[0], sh[1] - hip[1]; L = math.hypot(ux, uy); ux, uy = ux / L, uy / L
    return (ux, uy), (-uy, ux), L

def torso_side(sh, hip):
    """横向きの胴：胸が前に張り、腰でしぼる。"""
    (ux, uy), (nx, ny), L = _axes(sh, hip)
    def P(t, k): return (hip[0] + ux * L * t + nx * k, hip[1] + uy * L * t + ny * k)
    return poly([P(1.06, -40), P(1.04, 30), P(.92, 60), P(.72, 58), P(.48, 40), P(.18, 40), P(-.04, 42), P(-.06, -40),
                 P(.2, -44), P(.5, -38), P(.8, -48)])

def shorts_side(sh, hip, knee):
    (ux, uy), (nx, ny), L = _axes(sh, hip)
    def P(t, k): return (hip[0] + ux * L * t + nx * k, hip[1] + uy * L * t + ny * k)
    vx, vy = knee[0] - hip[0], knee[1] - hip[1]; m = (hip[0] + vx * .42, hip[1] + vy * .42)
    Lv = math.hypot(vx, vy); px, py = -vy / Lv, vx / Lv
    if px * nx + py * ny < 0: px, py = -px, py * -1
    return poly([P(.16, -46), P(.16, 44), (m[0] + px * 34, m[1] + py * 34), (m[0] - px * 34, m[1] - py * 34), P(-.12, -48)])

def side(pose='stand', mood='normal'):
    """横向き（右向き）。原点は足元。"""
    if pose == 'stand':
        J = dict(head=(14, -572), neck=(4, -520), sh=(4, -488), hip=(-4, -285), torso_w=(118, 96),
                 arm=((4, -488), (14, -378), (34, -282)), farm=((-6, -488), (2, -378), (20, -282)),
                 leg=((-4, -280), (6, -145), (0, -18), (44, -8)), fleg=((-14, -280), (-6, -145), (-14, -18), (30, -8)))
    elif pose == 'pushup':
        J = dict(head=(236, -205), neck=(196, -180), sh=(160, -165), hip=(-60, -100), torso_w=(96, 80),
                 arm=((160, -165), (158, -88), (160, -14)), farm=((150, -165), (146, -88), (146, -14)),
                 leg=((-60, -100), (-185, -60), (-300, -26), (-312, -4)), fleg=((-70, -98), (-195, -58), (-310, -24), (-322, -4)))
    elif pose == 'pushup_down':
        J = dict(head=(250, -95), neck=(210, -80), sh=(172, -70), hip=(-60, -52), torso_w=(96, 80),
                 arm=((172, -70), (100, -88), (160, -14)), farm=((162, -70), (92, -90), (146, -14)),
                 leg=((-60, -52), (-185, -36), (-300, -22), (-312, -4)), fleg=((-70, -52), (-195, -34), (-310, -20), (-322, -4)))
    elif pose == 'squat':
        J = dict(head=(70, -430), neck=(50, -385), sh=(36, -360), hip=(-70, -175), torso_w=(112, 92),
                 arm=((36, -360), (128, -350), (222, -356)), farm=((26, -362), (118, -352), (212, -358)),
                 leg=((-70, -175), (96, -128), (0, -18), (46, -8)), fleg=((-80, -175), (86, -132), (-10, -18), (36, -8)))
    back = arm(*J['farm']) + leg(*J['fleg'])
    g = layer(back, BACK)
    paths = [torso_side(J['sh'], J['hip']), capsule(J['sh'], J['neck'], 56, 50), circ(J['head'], HEAD_R)] + leg(*J['leg'])
    g += layer(paths, BODY)
    g += f'<path d="{shorts_side(J["sh"], J["hip"], J["leg"][1])}" fill="{SHORTS}" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>'
    g += layer([circ(J['sh'], 36)] + arm(*J['arm']), BODY)
    g += band(J['arm'][1], J['arm'][2])
    g += face_side(J['head'], mood)
    return g

def place(g, x, y, s=1.0): return f'<g transform="translate({x},{y}) scale({s})">{g}</g>'

FONT = "font-family=\"'Noto Sans JP'\""
def text(x, y, s, size, color=INK, weight=900, anchor='start', stroke=None):
    st = f' stroke="{stroke}" stroke-width="{size*0.14:.0f}" paint-order="stroke" stroke-linejoin="round"' if stroke else ''
    return f'<text x="{x}" y="{y}" {FONT} font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}"{st}>{s}</text>'

def rich(x, y, parts, size, anchor='start', stroke='#ffffff'):
    """白い縁取り付きの極太文字。cairosvg は paint-order と tspan の中央寄せが効かないので、縁→塗りの2回描き、幅は全角で見積もる。"""
    n = sum(len(t) for t, _ in parts)
    if anchor == 'middle': x = x - n * size * 0.98 / 2
    out = ''
    for mode in ('stroke', 'fill'):
        cx = x
        for t, c in parts:
            st = f'fill="{stroke}" stroke="{stroke}" stroke-width="{size*0.2:.0f}" stroke-linejoin="round"' if mode == 'stroke' else f'fill="{c}"'
            out += f'<text x="{cx:.0f}" y="{y}" {FONT} font-size="{size}" font-weight="900" {st}>{t}</text>'
            cx += len(t) * size * 0.98
    return out

def svg(w, h, body, bg=BG): return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><rect width="100%" height="100%" fill="{bg}"/>{body}</svg>'
def save(name, s): cairosvg.svg2png(bytestring=s.encode(), write_to=f'{OUT}/{name}')

# ---- キャラクターシート ----
b = text(60, 95, 'すけマッチョ　キャラクターシート（新デザイン案 v1）', 54)
b += text(62, 145, '手本：ホワイトマン【WORKOUT】の様式（灰色の無地・白い人物・黒い太線）に寄せる。顔・赤いリストバンド・黒の短パンが「すけマッチョ」の目印', 24, '#333', 700)
labels = [('正面（基本）', 230, 'front', 'stand', 'normal'), ('ダブルバイセップス', 590, 'front', 'flex', 'smug'),
          ('説明（指さし）', 950, 'front', 'point', 'normal'), ('横向き', 1290, 'side', 'stand', 'normal')]
for lab, x, kind, pose, mood in labels:
    g = front(pose, mood) if kind == 'front' else side(pose, mood)
    b += place(g, x, 880, .95) + text(x, 940, lab, 30, anchor='middle', weight=700)
b += place(side('pushup'), 1660, 360, .6) + text(1640, 400, '腕立て（上）', 26, anchor='middle', weight=700)
b += place(side('pushup_down'), 1660, 540, .6) + text(1640, 580, '腕立て（下）', 26, anchor='middle', weight=700)
b += place(side('squat'), 1660, 900, .5) + text(1660, 940, 'スクワット（下）', 26, anchor='middle', weight=700)
# 色見本
x0 = 60
for i, (c, n) in enumerate([(BG, '背景 灰'), (BODY, '体 白'), (INK, '線・文字 黒'), (RED, '強調・まちがい 赤'), (GREEN, '正しい 緑'), (YEL, 'ご褒美 黄')]):
    b += f'<rect x="{x0 + i*260}" y="1000" width="44" height="44" rx="6" fill="{c}" stroke="{INK}" stroke-width="3"/>' + text(x0 + i*260 + 54, 1032, n, 22, weight=700)
save('character_sheet.png', svg(1920, 1080, b))

# ---- 表情 ----
b = text(60, 90, '表情（顔は丸と線だけ。縮小しても読める太さ）', 44)
for i, (m, lab) in enumerate([('normal', 'ふつう'), ('smug', 'どや'), ('surprised', 'おどろき'), ('pain', 'きつい'), ('think', '考える')]):
    x = 200 + i * 340
    b += place(layer([capsule((-34, 74), (34, 74), 44, 44), capsule((0, 30), (0, 60), 46, 50), circ((0, 0), HEAD_R)], BODY) + face_front((0, 0), m), x, 300, 2.4)
    b += text(x, 580, lab, 34, anchor='middle', weight=700)
save('expressions.png', svg(1800, 620, b))

# ---- 長尺サムネ 1280x720 ----
def thumb(name, l1, l2, g):
    b = rich(48, 135, l1, 104) + rich(48, 260, l2, 96) + g
    save(name, svg(1280, 720, b))
thumb('thumb_long_squat.png', [('スクワット', INK), ('毎日100回', RED)], [('1ヶ月でどうなる？', INK)], place(side('squat', 'pain'), 960, 800, 1.3))
thumb('thumb_long_pushup.png', [('腕立て', INK), ('毎日30回', RED)], [('続けた体の変化', INK)], place(side('pushup', 'pain'), 700, 700, 1.6))
thumb('thumb_long_rest.png', [('筋トレ', INK), ('サボると', RED)], [('筋肉は落ちる？', INK)], place(front('stand', 'surprised'), 1010, 900, 1.0))

# ---- ショートの0コマ目 1080x1920 ----
b = rich(540, 380, [('正しい', INK), ('腕立て', RED)], 140, anchor='middle') + rich(540, 550, [('できてる？', INK)], 140, anchor='middle')
b += place(side('pushup'), 580, 1300, 1.5)
b += f'<rect x="90" y="1560" width="900" height="110" rx="14" fill="#000" opacity=".75"/>' + text(540, 1638, 'その腕立て、ちょっと惜しい', 56, '#fff', anchor='middle')
save('short_frame0.png', svg(1080, 1920, b))
print('ok')
