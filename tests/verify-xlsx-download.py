"""Verify the actual synthetic Chromium download independently, from stdin."""
import io
import sys
from openpyxl import load_workbook
from xlsx_verification import verify_package

output = sys.stdin.buffer.read()
verify_package(output, 3)
book = load_workbook(io.BytesIO(output), data_only=False)
assert book['Sheet1']['A1'].value == 'PAN [REDACTED]'
assert book['Sheet1']['A2'].value == '[REDACTED]'
assert book['Sheet1']['B1'].value == '[REDACTED]'
assert book['Sheet1']['B2'].value == '[REDACTED]'
assert book['Sheet2']['B1'].value == 42.5
assert book['Sheet2']['C1'].value is True
assert book['Sheet1']['A1'].font.bold and book['Sheet1']['A1'].font.italic
assert book['Sheet1']['A1'].fill.fgColor.rgb == 'FFFFEEAA'
assert book['Sheet1']['A1'].alignment.horizontal == 'center'
assert all(sheet.sheet_state == 'visible' for sheet in book)
print('PASS: actual browser XLSX download independently verified with Python ZIP/CRC/XML and openpyxl.')
