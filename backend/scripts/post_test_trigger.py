#!/usr/bin/env python3
import requests, json, os, sys

root = os.getcwd()
path = os.path.join(root, "test-trigger.md")
if not os.path.exists(path):
    print("test file not found:", path)
    sys.exit(1)
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

payload = {"project_id": "demo", "source_path": "test-trigger.md", "raw_content": content}
headers = {"Authorization": "Bearer dev-key"}
url = "http://127.0.0.1:8000/api/artifacts/ingest-raw"
try:
    r = requests.post(url, json=payload, headers=headers, timeout=20)
except Exception as exc:
    print("request failed:", exc)
    sys.exit(1)
print("status:", r.status_code)
try:
    j = r.json()
except Exception:
    print(r.text)
    sys.exit(1)
print(json.dumps(j, indent=2))
pdf = j.get("version", {}).get("pdf_path") or j.get("artifact", {}).get("metadata", {}).get("pdf_path")
if pdf:
    print("pdf:", pdf)
    print("exists:", os.path.exists(pdf))
else:
    print("no pdf in response")
