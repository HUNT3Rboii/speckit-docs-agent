#!/usr/bin/env python3
import sqlite3
import json

conn = sqlite3.connect('doc_agent.sqlite3')
cursor = conn.cursor()

# Get latest artifact
cursor.execute('SELECT id, source_path FROM artifacts ORDER BY id DESC LIMIT 1')
result = cursor.fetchone()

if not result:
    print("No artifacts found")
    exit(0)

artifact_id, source_path = result
print(f"Latest Artifact: {artifact_id}")
print(f"Source Path: {source_path}")
print()

# Get latest version
cursor.execute('SELECT structured_json FROM artifact_versions WHERE artifact_id = ? ORDER BY version_no DESC LIMIT 1', (artifact_id,))
version = cursor.fetchone()

if not version or not version[0]:
    print("No version data found")
    exit(0)

data = json.loads(version[0])

# Check for AI-enhanced fields
has_tasks = 'tasks' in data and isinstance(data['tasks'], list) and len(data['tasks']) > 0
has_user_stories = 'user_stories' in data and isinstance(data['user_stories'], list) and len(data['user_stories']) > 0
has_design_decisions = 'design_decisions' in data and isinstance(data['design_decisions'], list) and len(data['design_decisions']) > 0
has_metadata = 'metadata' in data and 'processed_by' in data.get('metadata', {})

print("AI Enhancement Check:")
print(f"  Has tasks: {has_tasks}")
print(f"  Has user_stories: {has_user_stories}")
print(f"  Has design_decisions: {has_design_decisions}")
print(f"  Has AI metadata: {has_metadata}")
print()

if has_tasks or has_user_stories or has_design_decisions:
    print("✅ AI-ENHANCED MODE")
    if has_metadata:
        print(f"   Processed by: {data['metadata'].get('processed_by', 'Unknown')}")
else:
    print("❌ RULE-BASED MODE")

conn.close()
