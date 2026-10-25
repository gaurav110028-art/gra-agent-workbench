"""Independent archive, CRC and XML extraction using Python stdlib; no temp files."""
import io
import subprocess
import zipfile
import xml.etree.ElementTree as ET

output = subprocess.check_output(['node', 'tests/export-fixture.mjs'])
with zipfile.ZipFile(io.BytesIO(output)) as archive:
    assert archive.testzip() is None
    assert sorted(archive.namelist()) == ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']
    all_parts = b'\n'.join(archive.read(name) for name in archive.namelist())
    for private in (b'ABCDE1234F', b'client@example.test', b'SYNTHETIC_PRIVATE_AUTHOR'):
        assert private not in all_parts
    document = ET.fromstring(archive.read('word/document.xml'))
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    text = ''.join(node.text or '' for node in document.findall('.//w:t', ns))
    assert text == 'Synthetic PAN [REDACTED]; [REDACTED]. Public total: 42.'
    assert document.find('.//w:b', ns) is not None
    assert document.find('.//w:i', ns) is not None
    assert document.find('.//w:jc', ns).get('{%s}val' % ns['w']) == 'center'
print('PASS: independent Python ZIP/CRC/XML extraction; approved secrets and source metadata absent.')
