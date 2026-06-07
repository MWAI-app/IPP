with open('ipp-procesmanager.html', 'rb') as f:
    content = f.read()
# Find all sk3-iol and sk2-iol pattern and show bytes after them
import re
for m in re.finditer(rb'sk[23]-iol">', content):
    chunk = content[m.end():m.end()+15]
    print(repr(chunk))
# Check if file starts correctly
print("Start:", repr(content[:20]))
print("File size:", len(content))
