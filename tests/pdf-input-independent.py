"""Independently build synthetic PDFs in memory for import/failure tests; output bytes only."""
import io
import sys
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

mode = sys.argv[1]
if mode in ('encrypted', 'empty-password'):
    writer = PdfWriter()
    writer.append(PdfReader(io.BytesIO(sys.stdin.buffer.read())))
    writer.encrypt('' if mode == 'empty-password' else 'synthetic-password')
    writer.write(sys.stdout.buffer)
elif mode == 'reportlab':
    output = io.BytesIO()
    c = canvas.Canvas(output, pagesize=(400, 300))
    c.setAuthor('SYNTHETIC_PRIVATE_AUTHOR')
    c.drawString(30, 250, 'PAN ABCDE1234F')
    c.drawString(30, 220, 'Total 42')
    c.showPage()
    c.save()
    sys.stdout.buffer.write(output.getvalue())
else:
    raise ValueError('Unknown synthetic fixture mode')
