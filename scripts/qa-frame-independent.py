"""حل مستقل با NumPy (LU)، مونتاژ از انتگرال توابع شکل و بازخوانی واقعی PDF/CSV/SVG.
این یک اعتبارسنجی نرم‌افزاری داخلی است؛ مرجع رسمی یا تأیید مهندس مستقل نیست.
"""
import json,math,zipfile,hashlib,csv,io
from pathlib import Path
import numpy as np
import pymupdf
import xml.etree.ElementTree as ET
fixtures=json.loads(Path('.preview/frame-qa/fixtures.json').read_text())
for fixture in fixtures:
 m=fixture['model'];n=len(m['nodes']);K=np.zeros((3*n,3*n));elements=[]
 nodes={v['id']:i for i,v in enumerate(m['nodes'])}
 # چهار نقطه گاوس: برای B^t EI B و بار یکنواخت دقیق است.
 gp,gw=np.polynomial.legendre.leggauss(4)
 for e in m['members']:
  a,b=m['nodes'][nodes[e['start']]],m['nodes'][nodes[e['end']]]
  dx,dy=b['x']-a['x'],b['y']-a['y'];L=math.hypot(dx,dy);c,s=dx/L,dy/L
  T=np.zeros((6,6));T[:2,:2]=[[c,s],[-s,c]];T[3:5,3:5]=T[:2,:2];T[2,2]=T[5,5]=1
  EI=e['eGPa']*1e6*e['iCm4']*1e-8;EA=e['eGPa']*1e6*e['areaCm2']*1e-4
  k=np.zeros((6,6));Q=np.zeros((6,2))
  for p,w in zip(gp,gw):
   t=(p+1)/2;weight=w*L/2
   ba=np.array([-1/L,0,0,1/L,0,0]);bb=np.array([0,(-6+12*t)/L**2,(-4+6*t)/L,0,(6-12*t)/L**2,(-2+6*t)/L])
   k+=weight*(EA*np.outer(ba,ba)+EI*np.outer(bb,bb))
   Q[:,0]+=weight*np.array([1-t,0,0,t,0,0])
   Q[:,1]+=weight*np.array([0,1-3*t*t+2*t**3,L*(t-2*t*t+t**3),0,3*t*t-2*t**3,L*(-t*t+t**3)])
  dofs=[nodes[e['start']]*3+i for i in range(3)]+[nodes[e['end']]*3+i for i in range(3)]
  K[np.ix_(dofs,dofs)]+=T.T@k@T
  elements.append((e,dofs,T,k,Q))
 fixed=[]
 for node in m['nodes']:
  support=node['support'];fixed.extend([support in ('fixed','pin','rollerX'),support in ('fixed','pin','rollerY'),support=='fixed'])
 free=np.where(np.logical_not(fixed))[0]
 for case in fixture['result']['results']:
  F=np.zeros(n*3);qs={e['id']:np.zeros(2) for e in m['members']}
  for lc in m['cases']:
   factor=case['factors'].get(lc['id'],0)
   for f in lc['nodes']:F[nodes[f['node']]*3:nodes[f['node']]*3+3]+=factor*np.array([f['fx'],f['fy'],f['mz']])
   for f in lc['members']:qs[f['member']]+=factor*np.array([f['qx'],f['qy']])
  for e,dofs,T,k,Q in elements:F[dofs]+=T.T@Q@qs[e['id']]
  D=np.zeros(n*3);D[free]=np.linalg.solve(K[np.ix_(free,free)],F[free]);R=K@D-F
  expected=np.array([[r['ux'],r['uy'],r['rz']] for r in case['nodes']]).flatten()
  assert np.allclose(D,expected,rtol=2e-7,atol=1e-10),(fixture['kind'],fixture['index'],'D')
  actualR=np.array([[r['rx'],r['ry'],r['rm']] for r in case['nodes']]).flatten()
  assert np.allclose(R,actualR,rtol=2e-7,atol=2e-7),'R'
  for e,dofs,T,k,Q in elements:
   f=k@T@D[dofs]-Q@qs[e['id']];stored=next(v for v in case['members'] if v['member']==e['id'])
   assert np.allclose(f,stored['endForces'],rtol=2e-7,atol=2e-7),'end forces'
   d=T@D[dofs];L=stored['length'];EI=e['eGPa']*1e6*e['iCm4']*1e-8;EA=e['eGPa']*1e6*e['areaCm2']*1e-4;qx,qy=qs[e['id']]
   for p in stored['sections']:
    x=p['x'];t=x/L
    N=EA*(d[3]-d[0])/L+qx*(L-2*x)/2
    M=EI*((-6+12*t)*d[1]/L**2+(-4+6*t)*d[2]/L+(6-12*t)*d[4]/L**2+(-2+6*t)*d[5]/L)+qy*(12*x*x-12*L*x+2*L*L)/24
    V=EI*(12*d[1]/L**3+6*d[2]/L**2-12*d[4]/L**3+6*d[5]/L**2)+qy*(x-L/2)
    assert np.allclose([N,V,M],[p['n'],p['v'],p['m']],rtol=2e-7,atol=2e-7),'section curvature equilibrium'

print(len(fixtures),'مدل: مونتاژ گاوسی و حل مستقل NumPy با جابه‌جایی، واکنش و نیروهای انتهایی سازگار است.')
paths=list(Path('.preview/frame-qa').glob('*report.zip'));assert paths
for path in paths:
 with zipfile.ZipFile(path) as z:
  assert z.testzip() is None
  manifest=json.loads(z.read('manifest.json'));source=json.loads(z.read('source.json'));a=json.loads(z.read('assessment.json'));r=a['frame']
  assert not a['executionReady'] and not r['executionReady'] and manifest['approval']=='not-approved'
  assert manifest['frameEngine']==r['engine'] and manifest['revision']==source['revision']
  assert hashlib.sha256(z.read('source.json')).hexdigest()==manifest['sourceSha256']
  for f in manifest['files']:assert hashlib.sha256(z.read(f['path'])).hexdigest()==f['sha256']
  rows=list(csv.DictReader(io.StringIO(z.read('frame-nodes.csv').decode('utf-8-sig'))))
  assert len(rows)==sum(len(c['nodes']) for c in r['results'])
  for row in rows:
   c=next(c for c in r['results'] if c['id']==row['case'] and c['kind']==row['kind']);n=next(n for n in c['nodes'] if n['node']==row['node'])
   for csvkey,key in [('ux_m','ux'),('uy_m','uy'),('rz_rad','rz'),('rx_kN','rx'),('ry_kN','ry'),('rm_kNm','rm')]:assert math.isclose(float(row[csvkey]),n[key],abs_tol=1e-12)
  for name in ['frame-model.svg','frame-deformed.svg','frame-moment.svg']:
   root=ET.fromstring(z.read(name));assert root.tag.endswith('svg')
   assert not root.findall('.//{http://www.w3.org/2000/svg}script')
  pdf=pymupdf.open(stream=z.read('گزارش-اولیه.pdf'),filetype='pdf');assert len(pdf)>=5
  for page in pdf:
   page.get_pixmap(matrix=pymupdf.Matrix(.3,.3))
   for block in page.get_text('dict')['blocks']:
    for line in block.get('lines',[]):
     for s in line['spans']:
      x0,y0,x1,y1=s['bbox'];assert x0>=0 and y0>=0 and x1<=page.rect.width and y1<=page.rect.height,(path,s)
  pdf[-2].get_pixmap(matrix=pymupdf.Matrix(1,1)).save(str(path.with_suffix('.png')))
  print(path.name,len(pdf),'صفحه PDF، CSV، SVG و هش مبنا بازخوانی شد.')
