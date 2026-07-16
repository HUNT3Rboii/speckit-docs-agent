#!/bin/bash

API_URL="http://localhost:8000"
API_KEY="dev-key"

echo "🧪 Testing Documentation Agent Pipeline..."
echo ""

# Test 1: Create a project
echo "1️⃣  Creating project..."
PROJECT_RESPONSE=$(curl -s -X POST "$API_URL/api/projects" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "name": "test-project",
    "repo_url": "https://github.com/test/repo"
  }')

echo "Response: $PROJECT_RESPONSE"
PROJECT_ID=$(echo $PROJECT_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "Project ID: $PROJECT_ID"
echo ""

# Test 2: Ingest a markdown file
echo "2️⃣  Ingesting markdown artifact..."
INGEST_RESPONSE=$(curl -s -X POST "$API_URL/api/artifacts/ingest-raw" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{
    \"project_id\": \"$PROJECT_ID\",
    \"source_path\": \"specs/001-test/spec.md\",
    \"raw_content\": \"# Test Feature\n\nThis is a test feature specification.\n\n## Overview\n\nWe are testing the documentation pipeline.\n\n## Requirements\n\n- The system must process markdown files\n- The system must generate PDF output\",
    \"commit_hash\": \"test-commit-123\"
  }")

echo "Response: $INGEST_RESPONSE"
echo ""

# Test 3: List artifacts
echo "3️⃣  Listing artifacts..."
ARTIFACTS_RESPONSE=$(curl -s "$API_URL/api/projects/$PROJECT_ID/artifacts" \
  -H "Authorization: Bearer $API_KEY")

echo "Response: $ARTIFACTS_RESPONSE"
echo ""

# Test 4: Check for PDF
echo "4️⃣  Checking for generated PDF..."
docker-compose -f infra/docker-compose.yml exec -T backend ls -la /app/pdf-output/ || echo "PDF output directory check (run from project root)"

echo ""
echo "✅ Pipeline test complete!"
echo ""
echo "📄 To view the PDFs, run:"
echo "   docker-compose -f infra/docker-compose.yml exec backend ls -la /app/pdf-output/"
