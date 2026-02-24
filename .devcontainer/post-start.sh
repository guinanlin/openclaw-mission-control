#!/bin/bash
# DevContainer post-start script
# Runs every time the container starts (after postCreateCommand runs only on first creation)
# Useful for keeping services up-to-date without full rebuilds

set -euo pipefail

echo "🚀 Starting background services..."

# Ensure .env exists with required values
if [ ! -f ".env" ]; then
    echo "📋 Creating .env from .env.example..."
    cp .env.example .env
    
    # Generate a secure LOCAL_AUTH_TOKEN if not already set
    if ! grep -q "LOCAL_AUTH_TOKEN=[a-zA-Z0-9]" .env; then
        python3 << 'PYTHON_EOF'
import secrets
import re

token = secrets.token_urlsafe(64)
with open('.env', 'r') as f:
    content = f.read()
content = re.sub(r'LOCAL_AUTH_TOKEN=.*', f'LOCAL_AUTH_TOKEN={token}', content)
with open('.env', 'w') as f:
    f.write(content)
print(f"✅ Generated LOCAL_AUTH_TOKEN")
PYTHON_EOF
    fi
fi

# Start database and Redis
echo "📦 Starting PostgreSQL and Redis..."
docker compose -f compose.yml --env-file .env up -d db redis

# Wait for services to be ready
echo "⏳ Waiting for services to become ready..."
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if docker compose -f compose.yml --env-file .env exec -T db pg_isready -U postgres -d mission_control >/dev/null 2>&1; then
        echo "✅ PostgreSQL is ready"
        break
    fi
    attempt=$((attempt + 1))
    sleep 1
    if [ $attempt -eq $max_attempts ]; then
        echo "⚠️  PostgreSQL not ready after 30 seconds, continuing anyway..."
    fi
done

attempt=0
while [ $attempt -lt $max_attempts ]; do
    if docker compose -f compose.yml --env-file .env exec -T redis redis-cli ping >/dev/null 2>&1; then
        echo "✅ Redis is ready"
        break
    fi
    attempt=$((attempt + 1))
    sleep 1
    if [ $attempt -eq $max_attempts ]; then
        echo "⚠️  Redis not ready after 30 seconds, continuing anyway..."
    fi
done

echo "✨ All systems ready!"
echo ""
echo "📖 Quick start:"
echo "   Backend: cd backend && uv run uvicorn app.main:app --reload --port 8000"
echo "   Frontend: cd frontend && npm run dev"
