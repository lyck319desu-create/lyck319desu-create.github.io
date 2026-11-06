import json,math
exec(open('handcode.py').read())
W={v['name']:v['w'] for v in json.load(open('ch_weights.json')).values()}
def w(name):
    for k,v in W.items():
        if k.startswith(name): return v
    raise Exception(name)
K=['rel','pos','lines','big','col','pre','naze','place','q','promise','focus','mark','pic','anom','labels']
rows=[]
for ch,L in C.items():
    for t in L:
        d=dict(zip(K,t)); d['ch']=ch; d['lr']=math.log2(d['rel']); rows.append(d)
tests={
 '見せる約束（水を抜く・中が見える）':lambda d:d['promise']=='1',
 '絵だけで異常がわかる':lambda d:d['anom']=='1',
 '主役が1か所':lambda d:d['focus']=='1',
 '「なぜ」を入れる':lambda d:d['naze']=='1',
 '？で終わる':lambda d:d['q']=='1',
 '主な文字に地名':lambda d:d['place']=='1',
 '小さい前振りの行がある':lambda d:d['pre']=='1',
 '文字1行だけ':lambda d:d['lines']==1,
 '文字3行以上':lambda d:d['lines']>=3,
 '一番大きい字が画面の14%以上':lambda d:d['big']>=14,
 '数字などの札0':lambda d:d['labels']==0,
 '数字などの札2つ以上':lambda d:d['labels']>=2,
 '主役を塗る':lambda d:d['mark']=='fill',
 '主役を光るふちで囲む':lambda d:d['mark']=='glow',
 '主役を楕円で囲む':lambda d:d['mark']=='ell',
 '矢印だけ':lambda d:d['mark']=='arrow',
 '立体地図（3d/ai3d）':lambda d:d['pic'] in('3d','ai3d'),
 '陰影地図（relief）':lambda d:d['pic']=='relief',
 '写真':lambda d:d['pic']=='photo',
 '説明図・地球儀':lambda d:d['pic'] in('diag','globe'),
 '大きい字が黄':lambda d:d['col']=='yellow',
 '大きい字が白':lambda d:d['col']=='white',
}
res=[]
for name,f in tests.items():
    num=den=0; plus=minus=0; n1=n0=0; per=[]
    for ch in C:
        R=[d for d in rows if d['ch']==ch]
        a=[d['lr'] for d in R if f(d)]; b=[d['lr'] for d in R if not f(d)]
        n1+=len(a); n0+=len(b)
        if not a or not b: continue
        diff=sum(a)/len(a)-sum(b)/len(b)
        ww=w(ch)*min(1,min(len(a),len(b))/2)
        num+=ww*diff; den+=ww; plus+=diff>0.3; minus+=diff<-0.3; per.append(f"{ch[:4]}{diff:+.1f}")
    if den: res.append((name,num/den,plus,minus,n1,n0,per))
for name,m,p,mi,n1,n0,per in sorted(res,key=lambda x:-x[1]):
    print(f"{name:22s} {2**m:5.2f}倍  +{p}/-{mi}ch  (あり{n1}/なし{n0})  {' '.join(per)}")
