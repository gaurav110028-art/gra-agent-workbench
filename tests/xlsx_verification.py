"""Independent synthetic XLSX ZIP/XML checks shared by interoperability/browser tests."""
import io
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
FORBIDDEN = ['ABCDE1234F', 'client@example.test', 'Aurora Advisory', '0011223344556677', '27ABCDE1234F1Z5', 'ABCD12345E', 'HDFC0001234', '2345 6789 0123', '+91 98765 43210', 'SYNTHETIC_PRIVATE_TAB', 'SYNTHETIC_PRIVATE_AUTHOR', 'SYNTHETIC_ORPHAN_SECRET']

def decode_string(text):
    return re.sub(r'_x([0-9a-fA-F]{4})_', lambda m: chr(int(m.group(1), 16)), text)

def verify_package(output, sheet_count):
    with zipfile.ZipFile(io.BytesIO(output)) as archive:
        assert archive.testzip() is None
        expected = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml'] + [f'xl/worksheets/sheet{i + 1}.xml' for i in range(sheet_count)]
        assert sorted(archive.namelist()) == sorted(expected)
        all_parts = '\n'.join(archive.read(path).decode('utf-8') for path in archive.namelist())
        for secret in FORBIDDEN:
            assert secret not in all_parts
        root = ET.fromstring(archive.read('xl/workbook.xml'))
        sheets = root.findall('s:sheets/s:sheet', NS)
        assert [s.get('name') for s in sheets] == [f'Sheet{i + 1}' for i in range(sheet_count)]
        assert all(s.get('state', 'visible') == 'visible' for s in sheets)
        for i in range(sheet_count):
            sheet = ET.fromstring(archive.read(f'xl/worksheets/sheet{i + 1}.xml'))
            assert not sheet.findall('.//s:f', NS)
            for tag in ['hyperlinks', 'definedNames', 'drawing', 'legacyDrawing', 'tableParts', 'extLst']:
                assert not sheet.findall('.//s:' + tag, NS)
            for element in sheet.iter():
                assert element.get('hidden', '0') not in ('1', 'true')
            for text in sheet.findall('.//s:t', NS):
                for secret in FORBIDDEN:
                    assert secret not in decode_string(text.text or '')

