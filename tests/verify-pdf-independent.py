"""Synthetic PDF verification using pypdf/Pillow and independent Poppler rendering.

No source contents are printed. Browser mode consumes actual download+review pixels via stdin.
"""
import base64
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from PIL import Image, ImageDraw, ImageChops
from pypdf import PdfReader

def verify(payload):
    data = base64.b64decode(payload['pdf'])
    reader = PdfReader(io.BytesIO(data), strict=True)
    assert not reader.is_encrypted and reader.metadata is None
    assert set(reader.trailer.keys()) == {'/Size', '/Root'}
    assert set(reader.trailer['/Root'].keys()) == {'/Type', '/Pages'}
    assert len(reader.pages) == len(payload['pages'])
    assert reader.attachments == {} and reader.get_fields() is None
    assert reader.xmp_metadata is None
    # Every reachable and unreachable in-use object must belong to the known image-only grammar.
    ids = {n for generation, offsets in reader.xref.items() if generation != 65535 for n in offsets if n}
    assert ids == set(range(1, 3 + 3 * len(reader.pages)))
    assert not reader.xref_objStm
    expected = []
    for index, page in enumerate(reader.pages):
        assert set(page.keys()) == {'/Type', '/Parent', '/MediaBox', '/Resources', '/Contents'}
        assert page.extract_text() == ''
        assert set(page['/Resources'].keys()) == {'/XObject'}
        assert set(page['/Resources']['/XObject'].keys()) == {'/Im0'}
        image = page['/Resources']['/XObject']['/Im0'].get_object()
        assert set(image.keys()) == {'/Type', '/Subtype', '/Width', '/Height', '/ColorSpace', '/BitsPerComponent', '/Filter'}
        assert image['/ColorSpace'] == '/DeviceRGB' and image['/BitsPerComponent'] == 8
        pixels = image.get_data()
        rendered_source = Image.open(io.BytesIO(base64.b64decode(payload['pages'][index].split(',', 1)[1]))).convert('RGB')
        assert rendered_source.size == (image['/Width'], image['/Height'])
        masked = rendered_source.copy()
        draw = ImageDraw.Draw(masked)
        for r in payload['regions']:
            if r['page'] == index:
                draw.rectangle((r['x'], r['y'], r['x'] + r['width'] - 1, r['y'] + r['height'] - 1), fill=(0, 0, 0))
        assert pixels == masked.tobytes(), 'Export pixels differ from independently masked review pixels'
        expected.append(masked)
        operators = list(page.get_contents().operations)
        assert [op for _, op in operators] == [b'q', b'cm', b'Do', b'Q']
        assert operators[2][0] == ['/Im0']
    forbidden = ['ABCDE1234F', 'client@example.test', '0011223344556677', 'SBIN0001234', 'Aurora Advisory', 'SYNTHETIC_PRIVATE_AUTHOR']
    streams = [reader.get_object(n).get_data() for n in ids if hasattr(reader.get_object(n), 'get_data')]
    for secret in forbidden:
        assert secret.encode() not in data
        assert all(secret.encode() not in stream for stream in streams)
    poppler = os.environ.get('GRA_TEST_PDFTOPPM') or shutil.which('pdftoppm')
    assert poppler, 'Poppler pdftoppm is required; set GRA_TEST_PDFTOPPM if it is not on PATH.'
    with tempfile.TemporaryDirectory(prefix='gra-synthetic-pdf-') as folder:
        source = Path(folder) / 'synthetic-output.pdf'
        source.write_bytes(data)
        completed = subprocess.run([poppler, '-r', '144', '-png', str(source), str(Path(folder) / 'page')], capture_output=True)
        assert completed.returncode == 0, 'Independent PDF renderer failed'
        for index, reference in enumerate(expected):
            candidates = sorted(Path(folder).glob('page-*.png'))
            actual = Image.open(candidates[index]).convert('RGB')
            assert actual.size == reference.size
            # Independent rasterizer can differ at image edges; interiors of every removed region must be solid black.
            for r in payload['regions']:
                if r['page'] == index:
                    crop = actual.crop((r['x'] + 1, r['y'] + 1, r['x'] + r['width'] - 1, r['y'] + r['height'] - 1))
                    assert crop.getbbox() is None, 'Redaction pixels survived independent rendering'
            difference = ImageChops.difference(actual, reference)
            assert sum(sum(channel) for channel in difference.getdata()) / (actual.width * actual.height * 3) < 2
            if os.environ.get('GRA_TEST_PDF_RENDER_DIR'):
                target = Path(os.environ['GRA_TEST_PDF_RENDER_DIR']); target.mkdir(parents=True, exist_ok=True)
                actual.save(target / f'synthetic-page-{index + 1}.png')
    print('PASS: actual PDF download independently parsed (all objects/streams), pixel-compared and rendered with pypdf/Pillow/Poppler; no text, source metadata, annotations, attachments or layers retained.')

if __name__ == '__main__':
    verify(json.load(sys.stdin))
