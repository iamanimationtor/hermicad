"""بازخوانی مستقل گزارش‌های تخصصی؛ وابستگی: pymupdf."""
import hashlib,json,zipfile,math
from pathlib import Path
import pymupdf
paths=list(Path('.preview/structures-qa').glob('*.zip'))
assert len(paths)>=10,'ابتدا QA ده خانواده اجرا شود.'
for path in paths:
 with zipfile.ZipFile(path) as z:
  assert z.testzip() is None
  m=json.loads(z.read('manifest.json'));source=json.loads(z.read('source.json'));a=json.loads(z.read('assessment.json'))
  assert m['approval']=='not-approved' and m['purpose']=='review-only' and a['executionReady'] is False
  assert m['revision']==source['revision'] and m['family']==source['brief']['structural']['family']==a['family']
  assert m['designId']==source['id'] and m['engine']==a['engine']
  assert not m['executionReady'] and not m['permitReady']
  assert hashlib.sha256(z.read('source.json')).hexdigest()==m['sourceSha256']
  assert len(a['formulaRecords'])==len(a['metrics'])
  assert set(z.namelist())=={f['path'] for f in m['files']}|{'manifest.json'}
  for f in m['files']:
   data=z.read(f['path']);assert len(data)==f['bytes'] and hashlib.sha256(data).hexdigest()==f['sha256']
  pdf=pymupdf.open(stream=z.read('گزارش-اولیه.pdf'),filetype='pdf');assert len(pdf)>0
  for page in pdf:
   page.get_pixmap(matrix=pymupdf.Matrix(.4,.4))
   for block in page.get_text('dict')['blocks']:
    for line in block.get('lines',[]):
     for span in line['spans']:
      x0,y0,x1,y1=span['bbox'];assert x0>=25 and x1<=page.rect.width-25 and y0>=15 and y1<=page.rect.height-15, (path,span)
  values={m['id']:m['value'] for m in a['metrics']}
  if a['family'] in ('concrete','steel'):assert math.isclose(values['deflection'],10.546875,abs_tol=1e-9)
  elif a['family']=='retaining':assert math.isclose(values['thrust'],27,abs_tol=1e-9)
  elif a['family']=='tank':assert math.isclose(values['pressure'],29.41995,abs_tol=1e-9)
  else:assert a['status']=='not-implemented' and not values
  assert all(not r['verified'] for r in a['references'])
  if path.name=='browser.zip':pdf[0].get_pixmap(matrix=pymupdf.Matrix(1.3,1.3)).save('.preview/structures-qa/report.png')
  print(path.name,len(pdf),'صفحه؛ هش، محدودهٔ چاپ، روابط و وضعیت تأییدنشده معتبر')
