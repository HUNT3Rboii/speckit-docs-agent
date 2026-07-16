#!/bin/bash

echo "🚀 Starting Documentation Agent Pipeline..."
echo ""

# Navigate to infra directory
cd infra

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Start services
echo "📦 Starting Docker services..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check if services are running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Services are running!"
    echo ""
    echo "📊 Service URLs:"
    echo "   Backend API: http://localhost:8000"
    echo "   PostgreSQL:  localhost:5432"
    echo ""
    echo "📖 View logs with:"
    echo "   docker-compose logs -f"
    echo ""
    echo "🛑 Stop services with:"
    echo "   docker-compose down"
else
    echo "❌ Failed to start services. Check logs with:"
    echo "   docker-compose logs"
    exit 1
fi
