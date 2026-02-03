#!/bin/bash
set -e

# ============================================
# Atualizador Baileys WhatsApp Server
# ============================================

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_error() { echo -e "${RED}[ERRO]${NC} $1"; }

if [ "$EUID" -ne 0 ]; then
    log_error "Execute como root: sudo ./update.sh"
    exit 1
fi

echo ""
echo "============================================"
echo "   Baileys WhatsApp Server - Atualizacao"
echo "============================================"
echo ""

# Determinar comando do Docker Compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Parar containers
log_info "Parando containers..."
$DOCKER_COMPOSE down

# Rebuild
log_info "Reconstruindo imagem..."
$DOCKER_COMPOSE build --no-cache

# Iniciar
log_info "Iniciando containers..."
$DOCKER_COMPOSE up -d

# Aguardar
sleep 10

# Verificar
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health || echo "000")
if [ "$HEALTH_CHECK" = "200" ]; then
    log_success "Atualizacao concluida!"
else
    log_error "Servidor pode estar iniciando. Verifique: $DOCKER_COMPOSE logs -f"
fi

echo ""
echo "============================================"
