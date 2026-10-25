"""Synthetic interoperability smoke test. Requires python-docx, no Word or temp files."""
import io
import subprocess
from docx import Document

source = Document()
# python-docx's stock template includes a bibliography custom-XML part. That
# structure is deliberately unsupported; omit it from this plain-text fixture.
for key, rel in list(source.part.rels.items()):
    if rel.reltype.endswith('/customXml'):
        source.part.drop_rel(key)
source.core_properties.author = 'SYNTHETIC_PRIVATE_AUTHOR'
p = source.add_paragraph()
p.add_run('Synthetic PAN ABCDE').bold = True
p.add_run('1234F; public total 42.').italic = True
buffer = io.BytesIO()
source.save(buffer)
output = subprocess.check_output(['node', 'tests/roundtrip-stdin.mjs'], input=buffer.getvalue())
result = Document(io.BytesIO(output))
assert result.paragraphs[0].text == 'Synthetic PAN [REDACTED]; public total 42.'
assert result.paragraphs[0].runs[0].bold is True
assert result.paragraphs[0].runs[1].italic is True
assert result.core_properties.author != 'SYNTHETIC_PRIVATE_AUTHOR'
print('PASS: independent python-docx source import and redacted package reopen; text/formatting/metadata verified.')
