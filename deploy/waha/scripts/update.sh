#!/bin/bash

# ============================================
# Script de Atualização - WAHA
# Atualiza para a última versão do WAHA
# ============================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
log_error() { echo -e "${RED}[ERRO]${NC} $1"; }

WAHA_DIR="/opt/waha"

echo -e "${BLUE}"
echo "============================================"
echo "  Atualização WAHA - WhatsApp HTTP API"
echo "  Data: $(date)"
echo "============================================"
echo -e "${NC}"

# Verificar se WAHA está instalado
if [ ! -d "$WAHA_DIR" ]; then
    log_error "WAHA não encontrado em $WAHA_DIR"
    exit 1
fi

cd "$WAHA_DIR"

# Detectar comando do Docker Compose
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

# ==========================================
# 1. Fazer backup antes de atualizar
# ==========================================
log_info "Fazendo backup antes de atualizar..."
./scripts/backup.sh

# ==========================================
# 2. Parar containers
# ==========================================
log_info "Parando containers..."
$DOCKER_COMPOSE down

# ==========================================
# 3. Baixar nova imagem
# ==========================================
log_info "Baixando última versão do WAHA..."
docker pull devlikeapro/waha:latest

# ==========================================
# 4. Iniciar containers
# ==========================================
log_info "Iniciando containers com nova versão..."
$DOCKER_COMPOSE up -d

# ==========================================
# 5. Aguardar e verificar
# ==========================================
log_info "Aguardando containers iniciarem..."
sleep 15

# Verificar status
if $DOCKER_COMPOSE ps | grep -q "Up"; then
    log_success "Containers iniciados com sucesso"
else
    log_error "Erro ao iniciar containers"
    $DOCKER_COMPOSE logs
    exit 1
fi

# Verificar saúde
log_info "Verificando saúde do serviço..."
for i in {1..30}; do
    if curl -s http://localhost:3000/api/health | grep -q "ok"; then
        log_success "WAHA está funcionando!"
        break
    fi
    sleep 2
done

# ==========================================
# 6. Mostrar versão
# ==========================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Atualização Concluída!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  Status dos containers:"
$DOCKER_COMPOSE ps
echo ""
echo "  Versão da imagem:"
docker images devlikeapro/waha:latest --format "{{.Repository}}:{{.Tag}} - {{.CreatedSince}}"
echo ""
