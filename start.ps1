# PowerShell script to start Documentation Agent Pipeline

Write-Host "🚀 Starting Documentation Agent Pipeline..." -ForegroundColor Green
Write-Host ""

# Navigate to infra directory
Set-Location -Path "infra"

# Check if Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "❌ Docker is not running. Please start Docker and try again." -ForegroundColor Red
    exit 1
}

# Start services
Write-Host "📦 Starting Docker services..." -ForegroundColor Yellow
docker-compose up -d

# Wait for services to be healthy
Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check if services are running
$services = docker-compose ps
if ($services -match "Up") {
    Write-Host "✅ Services are running!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Service URLs:" -ForegroundColor Cyan
    Write-Host "   Backend API: http://localhost:8000"
    Write-Host "   PostgreSQL:  localhost:5432"
    Write-Host ""
    Write-Host "📖 View logs with:" -ForegroundColor Cyan
    Write-Host "   docker-compose logs -f"
    Write-Host ""
    Write-Host "🛑 Stop services with:" -ForegroundColor Cyan
    Write-Host "   docker-compose down"
} else {
    Write-Host "❌ Failed to start services. Check logs with:" -ForegroundColor Red
    Write-Host "   docker-compose logs"
    exit 1
}
