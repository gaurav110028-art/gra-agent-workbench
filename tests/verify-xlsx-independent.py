"""Independent ZIP/CRC/XML and openpyxl interoperability; synthetic, in memory only."""
import io
import re
import subprocess
import zipfile
import xml.etree.ElementTree as ET
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

from xlsx_verification import verify_package

generated = subprocess.check_output(['node', 'tests/export-xlsx-fixture.mjs'])
verify_package(generated, 3)
opened = load_workbook(io.BytesIO(generated), data_only=False)
assert opened.sheetnames == ['Sheet1', 'Sheet2', 'Sheet3']
assert opened['Sheet1']['A1'].value == 'PAN [REDACTED]'
assert opened['Sheet1']['A2'].value == '[REDACTED]'
assert opened['Sheet1']['B2'].value == '[REDACTED]'
assert opened['Sheet1']['A1'].font.bold and opened['Sheet1']['A1'].font.italic
assert opened['Sheet1']['A1'].fill.fgColor.rgb == 'FFFFEEAA'
assert opened['Sheet1']['A1'].border.bottom.style == 'thin'
assert opened['Sheet1']['A1'].alignment.horizontal == 'center'
assert opened['Sheet1'].column_dimensions['A'].width == 25
assert opened['Sheet1'].row_dimensions[1].height == 24
assert opened['Sheet2']['B1'].value == 42.5
assert opened['Sheet2']['C1'].value is True
assert opened['Sheet2']['B1'].number_format == '0.00'

# Independently authored source verifies the importer, not only our own writer.
source = Workbook()
source.properties.creator = 'SYNTHETIC_PRIVATE_AUTHOR'
sheet = source.active
sheet.title = 'SYNTHETIC_PRIVATE_TAB'
sheet['A1'] = 'PAN ABCDE1234F'
sheet['A1'].font = Font(name='Calibri', size=14, bold=True, italic=True, color='FF123456')
sheet['A1'].fill = PatternFill('solid', fgColor='FFFFEEAA')
sheet['A1'].alignment = Alignment(horizontal='center', wrap_text=True)
sheet['A1'].border = Border(bottom=Side(style='thin', color='FF112233'))
sheet['A2'] = 'Aurora Advisory'
sheet['B1'] = 42.5
sheet['B1'].number_format = '0.00'
sheet['B2'] = '=WEBSERVICE("https://example.test")'
sheet['B2'].data_type = 's'  # Explicit literal, never an executable formula.
sheet.row_dimensions[2].hidden = True
sheet.column_dimensions['B'].hidden = True
sheet.column_dimensions['A'].width = 25
sheet.row_dimensions[1].height = 24
hidden = source.create_sheet('Hidden source')
hidden.sheet_state = 'hidden'
hidden['A1'] = 'client@example.test'
hidden['B1'] = '0011223344556677'
very_hidden = source.create_sheet('Very hidden source')
very_hidden.sheet_state = 'veryHidden'
very_hidden['A1'] = 'GSTIN 27ABCDE1234F1Z5'
buffer = io.BytesIO()
source.save(buffer)
output = subprocess.check_output(['node', 'tests/xlsx-stdin.mjs'], input=buffer.getvalue())
verify_package(output, 3)
result = load_workbook(io.BytesIO(output), data_only=False)
assert result['Sheet1']['A1'].value == 'PAN [REDACTED]'
assert result['Sheet1']['A1'].font.bold and result['Sheet1']['A1'].font.italic
assert result['Sheet1']['A1'].fill.fgColor.rgb == 'FFFFEEAA'
assert result['Sheet1']['A1'].alignment.wrap_text
assert result['Sheet1']['B1'].value == 42.5
assert result['Sheet1']['B1'].number_format == '0.00'
assert result['Sheet1']['B2'].data_type == 's'
assert result['Sheet1']['B2'].value == '=WEBSERVICE("https://example.test")'
assert all(s.sheet_state == 'visible' for s in result)
assert not result['Sheet1'].row_dimensions[2].hidden
assert not result['Sheet1'].column_dimensions['B'].hidden
assert result.properties.creator != 'SYNTHETIC_PRIVATE_AUTHOR'
print('PASS: independent XLSX ZIP/CRC/XML extraction and openpyxl source/output interoperability; approved secrets, stale shared strings, source names/metadata, formulas and hidden flags absent.')
