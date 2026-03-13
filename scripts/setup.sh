#!/bin/bash
# Meridian Blog Engine - Quick Setup Script

set -e

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║   🔥 MERIDIAN BLOG ENGINE - Setup                          ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first:"
    echo "   https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install it first:"
    echo "   https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose found"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please edit .env with your settings before continuing${NC}"
    echo ""
    read -p "Press Enter to continue or Ctrl+C to edit .env first..."
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p uploads

# Build and start
echo ""
echo "🐳 Building and starting services..."
echo ""

docker-compose up --build -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check if app is healthy
echo "🏥 Checking application health..."
for i in {1..30}; do
    if curl -s http://localhost:8000/health > /dev/null; then
        echo -e "${GREEN}✅ Application is healthy!${NC}"
        break
    fi
    echo "   Attempt $i/30..."
    sleep 2
    
    if [ $i -eq 30 ]; then
        echo -e "${YELLOW}⚠️  Application may still be starting. Check logs with: make logs${NC}"
    fi
done

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║   🎉 SETUP COMPLETE!                                       ║"
echo "║                                                            ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║   🌐 Blog:     http://localhost:8000                       ║"
echo "║   🔐 Admin:    http://localhost:8000/login                 ║"
echo "║   📊 Health:   http://localhost:8000/health                ║"
echo "║   🕸️  GraphQL: http://localhost:8000/graphql               ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║                                                            ║"
echo "║   Default Login:                                           ║"
echo "║   Email:    admin@meridian.blog                            ║"
echo "║   Password: admin123                                       ║"
echo "║                                                            ║"
echo "║   ⚠️  CHANGE THIS PASSWORD IN PRODUCTION!                  ║"
echo "║                                                            ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║                                                            ║"
echo "║   Useful commands:                                         ║"
echo "║   • make logs      - View application logs                 ║"
echo "║   • make stop      - Stop services                         ║"
echo "║   • make down      - Remove everything                     ║"
echo "║   • make shell     - Open container shell                  ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${BLUE}Happy publishing! 📝${NC}"
echo ""
