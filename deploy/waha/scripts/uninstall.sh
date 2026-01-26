#!/bin/bash

# ============================================
# Script de Desinstalação - WAHA
# Remove completamente a instalação do WAHA
# ============================================

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

echo -e "${RED}"
echo "============================================"
echo "  Desinstalação WAHA - WhatsApp HTTP API"
echo "============================================"
echo -e "${NC}"
echo ""
echo -e "${YELLOW}ATENÇÃO: Esta ação irá remover:${NC}"
echo "  - Todos os containers WAHA"
echo "  - Todas as sessões WhatsApp"
echo "  - Todos os arquivos de mídia"
echo "  - Todas as configurações"
echo ""

read -p "Tem certeza que deseja continuar? (digite 'DESINSTALAR' para confirmar): " CONFIRM

if [ "$CONFIRM" != "DESINSTALAR" ]; then
    log_info "Operação cancelada."
    exit 0
fi

echo ""

# Verificar se WAHA está instalado
if [ ! -d "$WAHA_DIR" ]; then
    log_warn "WAHA não encontrado em $WAHA_DIR"
    exit 0
fi

cd "$WAHA_DIR"

# Detectar comando do Docker Compose
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

# ==========================================
# 1. Oferecer backup antes de remover
# ==========================================
read -p "Deseja fazer backup antes de remover? (s/n): " BACKUP_CONFIRM
if [ "$BACKUP_CONFIRM" = "s" ] || [ "$BACKUP_CONFIRM" = "S" ]; then
    log_info "Fazendo backup..."
    ./scripts/backup.sh
    
    BACKUP_DIR="$WAHA_DIR/backups"
    if [ -d "$BACKUP_DIR" ]; then
        read -p "Mover backups para /root/waha-backups? (s/n): " MOVE_BACKUP
        if [ "$MOVE_BACKUP" = "s" ] || [ "$MOVE_BACKUP" = "S" ]; then
            mkdir -p /root/waha-backups
            mv "$BACKUP_DIR"/* /root/waha-backups/
            log_success "Backups movidos para /root/waha-backups"
        fi
    fi
fi

# ==========================================
# 2. Parar e remover containers
# ==========================================
log_info "Parando containers..."
$DOCKER_COMPOSE down -v 2>/dev/null || true

# ==========================================
# 3. Remover imagens Docker
# ==========================================
log_info "Removendo imagens Docker..."
docker rmi devlikeapro/waha:latest 2>/dev/null || true
docker rmi nginx:alpine 2>/dev/null || true

# ==========================================
# 4. Remover rede Docker
# ==========================================
log_info "Removendo rede Docker..."
docker network rm waha-network 2>/dev/null || true

# ==========================================
# 5. Remover cron de renovação SSL
# ==========================================
log_info "Removendo cron de renovação SSL..."
crontab -l 2>/dev/null | grep -v "waha" | crontab - 2>/dev/null || true

# ==========================================
# 6. Remover certificados SSL
# ==========================================
if [ -f "$WAHA_DIR/.env" ]; then
    source "$WAHA_DIR/.env"
    if [ -n "$DOMAIN" ] && [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
        read -p "Remover certificados SSL de $DOMAIN? (s/n): " REMOVE_SSL
        if [ "$REMOVE_SSL" = "s" ] || [ "$REMOVE_SSL" = "S" ]; then
            certbot delete --cert-name "$DOMAIN" --non-interactive 2>/dev/null || true
            log_success "Certificados SSL removidos"
        fi
    fi
fi

# ==========================================
# 7. Remover diretório de instalação
# ==========================================
log_info "Removendo diretório de instalação..."
rm -rf "$WAHA_DIR"

# ==========================================
# 8. Limpar volumes Docker órfãos
# ==========================================
log_info "Limpando volumes Docker órfãos..."
docker volume prune -f 2>/dev/null || true

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Desinstalação Concluída!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
if [ -d "/root/waha-backups" ]; then
    echo "  Backups salvos em: /root/waha-backups"
    echo ""
fi
echo "  O WAHA foi completamente removido do sistema."
echo ""
