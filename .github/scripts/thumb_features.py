# サムネの「数字だけ」を出す（画像そのものはリポジトリに載せない）。
# 使い方: python thumb_features.py targets.txt shard_index shard_count out.json
import sys, json, os, urllib.request, io
import numpy as np, cv2
from PIL import Image

tg = [l.rstrip('\n').split('\t') for l in open(sys.argv[1]) if l.strip() and not l.startswith('#')]
k, n = int(sys.argv[2]), int(sys.argv[3])
tg = [t for i, t in enumerate(tg) if i % n == k]
out = sys.argv[4]

import easyocr
reader = easyocr.Reader(['ja', 'en'], gpu=False, verbose=False)
import torch, open_clip
model, _, prep = open_clip.create_model_and_transforms('ViT-B-32', pretrained='laion2b_s34b_b79k')
tok = open_clip.get_tokenizer('ViT-B-32')
LABELS = {
 'map3d': 'a 3D terrain relief map with mountains',
 'map2d': 'a flat 2D map',
 'satellite': 'a satellite photo of the earth from space',
 'photo': 'a photograph of a city or a landscape',
 'aerial': 'an aerial photo of an island or coast',
 'anime': 'an anime style illustration',
 'yukkuri': 'cute cartoon mascot characters',
 'globe': 'a globe of the earth',
 'oldmap': 'an old historical map',
 'infographic': 'an infographic diagram with charts',
 'face': 'a close up of a human face',
 'arrowmap': 'a map with a big red arrow',
}
with torch.no_grad():
    tf = model.encode_text(tok(list(LABELS.values()))); tf /= tf.norm(dim=-1, keepdim=True)

def fetch(vid):
    for q in ['maxresdefault', 'hqdefault']:
        try:
            b = urllib.request.urlopen(f'https://i.ytimg.com/vi/{vid}/{q}.jpg', timeout=20).read()
            im = Image.open(io.BytesIO(b)).convert('RGB')
            if q == 'hqdefault':  # 4:3 の黒帯を切る
                w, h = im.size; im = im.crop((0, int(h*0.125), w, int(h*0.875)))
            return im.resize((1280, 720)), q
        except Exception:
            pass
    return None, None

def hexc(c): return '#%02x%02x%02x' % tuple(int(v) for v in c)

def clusters(px, kk=3):
    px = np.float32(px.reshape(-1, 3))
    if len(px) < kk: return []
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, lab, cen = cv2.kmeans(px, kk, None, crit, 2, cv2.KMEANS_PP_CENTERS)
    cnt = np.bincount(lab.ravel(), minlength=kk)
    res = []
    for i in np.argsort(-cnt):
        r, g, b = cen[i]; hsv = cv2.cvtColor(np.uint8([[[b, g, r]]]), cv2.COLOR_BGR2HSV)[0][0]
        res.append({'hex': hexc((r, g, b)), 'share': round(float(cnt[i]/cnt.sum()), 2), 'h': int(hsv[0])*2, 's': int(hsv[1]), 'v': int(hsv[2])})
    return res

def colorfulness(a):
    r, g, b = [a[..., i].astype(float) for i in range(3)]
    rg = r-g; yb = 0.5*(r+g)-b
    return float(np.sqrt(rg.std()**2+yb.std()**2)+0.3*np.sqrt(rg.mean()**2+yb.mean()**2))

try:
    face = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
except Exception:
    face = None
res = {}
def one(ch, vid):
    im, q = fetch(vid)
    if im is None: res[vid] = {'ch': ch, 'err': 'nofetch'}; return
    a = np.array(im); bgr = cv2.cvtColor(a, cv2.COLOR_RGB2BGR); hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    H, S, V = hsv[..., 0].astype(int)*2, hsv[..., 1], hsv[..., 2]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY); edges = cv2.Canny(gray, 80, 200)
    boxes = []
    try:
        for bb, txt, conf in reader.readtext(a, detail=1):
            if conf < 0.15 or not txt.strip(): continue
            xs = [p[0] for p in bb]; ys = [p[1] for p in bb]
            x0, x1, y0, y1 = max(0, min(xs)), min(1280, max(xs)), max(0, min(ys)), min(720, max(ys))
            if x1-x0 < 4 or y1-y0 < 4: continue
            crop = a[int(y0):int(y1), int(x0):int(x1)]
            boxes.append({'t': txt, 'conf': round(float(conf), 2), 'x0': round(x0/1280, 3), 'x1': round(x1/1280, 3), 'y0': round(y0/720, 3), 'y1': round(y1/720, 3), 'hpct': round((y1-y0)/720*100, 1), 'colors': clusters(crop)})
    except Exception as e:
        res[vid] = {'ch': ch, 'err': 'ocr ' + str(e)[:80]}
    # 行にまとめる
    lines = []
    for b in sorted(boxes, key=lambda b: (b['y0']+b['y1'])/2):
        cy = (b['y0']+b['y1'])/2; h = b['y1']-b['y0']
        for L in lines:
            if abs(L['cy']-cy) < 0.5*max(h, L['h']):
                L['boxes'].append(b); L['x0'] = min(L['x0'], b['x0']); L['x1'] = max(L['x1'], b['x1']); L['h'] = max(L['h'], h); break
        else:
            lines.append({'cy': cy, 'h': h, 'x0': b['x0'], 'x1': b['x1'], 'boxes': [b]})
    lines = [{'cy': round(L['cy'], 3), 'hpct': round(L['h']*100, 1), 'x0': L['x0'], 'x1': L['x1'], 'text': ''.join(b['t'] for b in sorted(L['boxes'], key=lambda b: b['x0'])), 'chars': sum(len(b['t']) for b in L['boxes'])} for L in lines]
    tmask = np.zeros((720, 1280), bool)
    for b in boxes: tmask[int(b['y0']*720):int(b['y1']*720), int(b['x0']*1280):int(b['x1']*1280)] = True
    red = ((H < 15) | (H > 340)) & (S > 130) & (V > 100)
    yel = (H >= 40) & (H <= 65) & (S > 130) & (V > 150)
    nontext_red = (red & ~tmask).astype(np.uint8)
    nc, lab, st, _ = cv2.connectedComponentsWithStats(nontext_red, 8)
    blobs = sorted([s for s in st[1:] if s[4] > 400], key=lambda s: -s[4])[:3]
    fc = face.detectMultiScale(gray, 1.1, 6, minSize=(60, 60)) if face is not None else []
    g43 = cv2.resize(gray, (4, 3), interpolation=cv2.INTER_AREA)
    e43 = cv2.resize(edges.astype(float), (4, 3), interpolation=cv2.INTER_AREA)/255
    with torch.no_grad():
        f = model.encode_image(prep(im).unsqueeze(0)); f /= f.norm(dim=-1, keepdim=True)
        p = (100*f@tf.T).softmax(-1)[0].tolist()
    r = res.get(vid, {'ch': ch})
    r.update({'q': q, 'boxes': boxes, 'lines': lines,
      'text_area': round(float(tmask.mean()), 3),
      'badge_hit': any(b['x1'] > 0.82 and b['y1'] > 0.85 for b in boxes),
      'bright': round(float(V.mean())), 'contrast': round(float(gray.std())), 'sat': round(float(S.mean())),
      'colorful': round(colorfulness(a), 1),
      'edge': round(float((edges > 0).mean()), 3), 'edge_nontext': round(float((edges[~tmask] > 0).mean()) if (~tmask).any() else 0, 3),
      'edge_4x3': [[round(float(v), 3) for v in row] for row in e43], 'bright_4x3': g43.tolist(),
      'red': round(float(red.mean()), 3), 'yellow': round(float(yel.mean()), 3),
      'white': round(float(((S < 40) & (V > 210)).mean()), 3), 'black': round(float((V < 40).mean()), 3),
      'red_blobs': [{'x': round(s[0]/1280, 2), 'y': round(s[1]/720, 2), 'w': round(s[2]/1280, 2), 'h': round(s[3]/720, 2), 'area': round(s[4]/921600, 4)} for s in blobs],
      'faces': [[round(x/1280, 2), round(y/720, 2), round(w/1280, 2)] for x, y, w, h in fc],
      'palette': clusters(cv2.resize(a, (160, 90)), 5),
      'clip': {k2: round(v, 3) for k2, v in zip(LABELS, p)}})
    res[vid] = r
    print(ch, vid, len(boxes), flush=True)

for ch, vid in tg:
    try: one(ch, vid)
    except Exception as e: res[vid] = {'ch': ch, 'err': str(e)[:120]}; print('ERR', vid, e, flush=True)
json.dump(res, open(out, 'w'), ensure_ascii=False)
