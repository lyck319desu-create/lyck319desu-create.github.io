import json,math,sys
S='/tmp/claude-0/-home-user-lyck319desu-create-github-io/d698e6e2-81ee-5141-a7ad-074f90fea636/scratchpad/th'
D=json.load(open(S+'/feat_table.json')); W=json.load(open(S+'/ch_weights.json'))
D=[d for d in D if d['ch']!='UCUNrlExPl71v_6SNNTLYShg']  # 野球に変わったので除く
def rank(v):
    o=sorted(range(len(v)),key=lambda i:v[i]); r=[0]*len(v); i=0
    while i<len(v):
        j=i
        while j+1<len(v) and v[o[j+1]]==v[o[i]]: j+=1
        for k in range(i,j+1): r[o[k]]=(i+j)/2
        i=j+1
    return r
def spear(x,y):
    rx,ry=rank(x),rank(y); n=len(x); mx,my=sum(rx)/n,sum(ry)/n
    sx=math.sqrt(sum((a-mx)**2 for a in rx)); sy=math.sqrt(sum((b-my)**2 for b in ry))
    if sx==0 or sy==0: return None
    return sum((a-mx)*(b-my) for a,b in zip(rx,ry))/(sx*sy)
by={}
for d in D: by.setdefault(d['ch'],[]).append(d)
feats=sys.argv[1].split(',')
out=[]
for f in feats:
    num=den=0; pos=neg=0; per=[]
    for c,v in by.items():
        v=[d for d in v if f in d and d[f] is not None]
        if len(v)<6: continue
        r=spear([d[f] for d in v],[math.log(max(d['rel'],1e-3)) for d in v])
        if r is None: continue
        w=W[c]['w']; num+=w*r; den+=w; pos+=r>0.1; neg+=r<-0.1; per.append((W[c]['name'][:6],round(r,2)))
    if den: out.append((f,round(num/den,3),pos,neg,per))
for f,m,p,n,per in sorted(out,key=lambda x:-abs(x[1])):
    print(f"{f:16s} 重み平均 {m:+.3f}  プラスのch {p} / マイナスのch {n}")
