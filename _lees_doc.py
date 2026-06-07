from docx import Document

doc = Document('IPP-Procesmanager-Handleiding.docx')
for i, p in enumerate(doc.paragraphs):
    t = p.text.strip()
    if t:
        sn = p.style.name if p.style else 'None'
        print(f'[{i:3d}] style={sn!r:30s} | {t[:90]}')
