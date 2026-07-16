import requests
import subprocess
from pathlib import Path

try:
    content = Path('..').joinpath('test-trigger.md').read_text(encoding='utf-8')
except Exception as e:
    print('READ_ERROR', e)
    raise SystemExit(1)

payload = {'project_id':'test-run','source_path':'test-trigger.md','raw_content':content}
headers = {'Authorization':'Bearer dev-key'}

try:
    r = requests.post('http://127.0.0.1:8000/api/artifacts/ingest-raw', json=payload, headers=headers, timeout=10)
    print('STATUS', r.status_code)
    print(r.text)
except Exception as e:
    print('POST_ERROR', e)

print('\n--- PDFs (most recent 5) ---')
subprocess.run([
    'powershell', '-NoProfile', '-Command',
    'Get-ChildItem "c:/Users/MSI/Desktop/speckit-docs-agent/speckit-docs-agent/backend/tmp-output" -Filter "*.pdf" | Sort-Object LastWriteTime -Descending | Select-Object -First 5 | Format-Table Name, @{Name="SizeKB";Expression={[math]::Round($_.Length/1KB,1)}}'
])
