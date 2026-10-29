"""بازخوانی مستقل بستهٔ دانلودشده؛ وابستگی اختیاری: pymupdf ezdxf ifcopenshell pytest."""
import zipfile
import json
import hashlib
import io
from pathlib import Path
import pymupdf
import ezdxf
import ifcopenshell
import ifcopenshell.validate

paths = list(Path('.preview/journey-qa').glob('*delivery.zip'))
assert paths, 'ابتدا آزمون HTTP و مرورگر اجرا شوند.'
for path in paths:
    with zipfile.ZipFile(path) as package:
        assert package.testzip() is None
        assert 'راهنمای-تحویل.txt' in package.namelist()
        assert 'بستهٔ بازبینی مقدماتی' in package.read('راهنمای-تحویل.txt').decode('utf-8')
        manifest = json.loads(package.read('manifest.json'))
        assert manifest['approval'] == 'not-approved'
        assert not manifest['executionReady'] and not manifest['permitReady']
        source = json.loads(package.read('source/document.json'))
        assert source['revision'] == manifest['revision']
        assert hashlib.sha256(package.read('source/document.json')).hexdigest() == manifest['sourceSha256']
        counts = {}
        for item in manifest['files']:
            data = package.read(item['path'])
            assert hashlib.sha256(data).hexdigest() == item['sha256']
            extension = item['path'].rsplit('.', 1)[-1]
            counts[extension] = counts.get(extension, 0) + 1
            if extension == 'pdf':
                pdf = pymupdf.open(stream=data, filetype='pdf')
                assert len(pdf) > 0
                for page in pdf:
                    page.get_pixmap(matrix=pymupdf.Matrix(.3, .3))
            elif extension == 'dxf':
                model = ezdxf.read(io.StringIO(data.decode()))
                assert not model.audit().errors
            elif extension == 'ifc':
                model = ifcopenshell.file.from_string(data.decode())
                logger = ifcopenshell.validate.json_logger()
                ifcopenshell.validate.validate(model, logger, express_rules=True)
                assert not logger.statements
            elif extension == 'xlsx':
                with zipfile.ZipFile(io.BytesIO(data)) as workbook:
                    assert workbook.testzip() is None
        print(path.name, counts, 'بازخوانی مستقل و تطبیق هش موفق')
