#!/bin/bash
# ============================================================
# Discovery CMDB — Deploy to Unraid
# ============================================================
set -e

UNRAID_HOST="root@192.168.178.112"
REMOTE_DIR="/mnt/user/appdata/discovery-cmdb"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🖧  Discovery CMDB — Deploy to Unraid"
echo "======================================"
echo "Target: $UNRAID_HOST:$REMOTE_DIR"
echo ""

# ---- Pre-flight checks ----
if ! command -v ssh &>/dev/null; then
  echo "❌ ssh not found. Please install OpenSSH."
  exit 1
fi

if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$UNRAID_HOST" "echo ok" &>/dev/null; then
  echo "❌ Cannot connect to $UNRAID_HOST. Check SSH access."
  exit 1
fi
echo "✅ SSH connection to Unraid OK"

# ---- Create remote directory ----
ssh "$UNRAID_HOST" "mkdir -p $REMOTE_DIR"

# ---- Sync files ----
echo ""
echo "📤 Syncing files..."
rsync -avz --exclude='.git' --exclude='node_modules' --exclude='__pycache__' \
  --exclude='*.pyc' --exclude='.env' --exclude='dist' --exclude='*.egg-info' \
  "$LOCAL_DIR/" "$UNRAID_HOST:$REMOTE_DIR/"

# ---- Create .env if it doesn't exist ----
ssh "$UNRAID_HOST" "
  cd $REMOTE_DIR
  if [ ! -f .env ]; then
    cp .env.example .env
    # Generate random secret key
    SECRET=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | head -c 64)
    sed -i \"s/change_this_super_secret_key_in_production_please/\$SECRET/\" .env
    echo '✅ Created .env with random SECRET_KEY'
    echo '⚠️  Please review /mnt/user/appdata/discovery-cmdb/.env and set your POSTGRES_PASSWORD!'
  else
    echo '✅ .env already exists, skipping'
  fi
"

# ---- Docker Compose up ----
echo ""
echo "🐳 Starting Docker containers..."
ssh "$UNRAID_HOST" "
  cd $REMOTE_DIR

  # Check if docker compose v2 is available
  if docker compose version &>/dev/null 2>&1; then
    COMPOSE_CMD='docker compose'
  elif docker-compose version &>/dev/null 2>&1; then
    COMPOSE_CMD='docker-compose'
  else
    echo '❌ docker compose not found on remote host'
    exit 1
  fi

  \$COMPOSE_CMD pull --quiet 2>/dev/null || true
  \$COMPOSE_CMD up -d --build

  echo ''
  echo 'Container status:'
  \$COMPOSE_CMD ps
"

# ---- Done ----
echo ""
echo "🎉 Deployment complete!"
echo ""
echo "  UI:       http://192.168.178.112:8085"
echo "  API Docs: http://192.168.178.112:8085/docs"
echo "  ReDoc:    http://192.168.178.112:8085/redoc"
echo ""
echo "  The Setup Wizard will launch on first visit."
echo ""
