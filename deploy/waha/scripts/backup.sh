#!/bin/bash

# ============================================
# Script de Backup - WAHA
# Backup das sessões WhatsApp e mídias
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
log_error() { echo -e "${RED}[ERRO]${NC} $1"; }

# Diretórios
WAHA_DIR="/opt/waha"
BACKUP_DIR="$WAHA_DIR/backups"
DATE=$(date +%Y%m%d_%H%M%S)

echo -e "${BLUE}"
echo "============================================"
echo "  Backup WAHA - WhatsApp HTTP API"
echo "  Data: $(date)"
echo "============================================"
echo -e "${NC}"

# Verificar se WAHA está instalado
if [ ! -d "$WAHA_DIR" ]; then
    log_error "WAHA não encontrado em $WAHA_DIR"
    exit 1
fi

# Criar diretório de backup
mkdir -p "$BACKUP_DIR"

# ==========================================
# 1. Backup das Sessões
# ==========================================
log_info "Fazendo backup das sessões WhatsApp..."

if [ -d "$WAHA_DIR/data/sessions" ]; then
    tar -czf "$BACKUP_DIR/sessions_$DATE.tar.gz" -C "$WAHA_DIR/data" sessions
    log_success "Sessões: sessions_$DATE.tar.gz"
else
    log_info "Pasta sessions não encontrada, pulando..."
fi

# ==========================================
# 2. Backup das Mídias
# ==========================================
log_info "Fazendo backup das mídias..."

if [ -d "$WAHA_DIR/data/media" ]; then
    tar -czf "$BACKUP_DIR/media_$DATE.tar.gz" -C "$WAHA_DIR/data" media
    log_success "Mídias: media_$DATE.tar.gz"
else
    log_info "Pasta media não encontrada, pulando..."
fi

# ==========================================
# 3. Backup das Configurações
# ==========================================
log_info "Fazendo backup das configurações..."

tar -czf "$BACKUP_DIR/config_$DATE.tar.gz" \
    -C "$WAHA_DIR" \
    --exclude='.env' \
    docker-compose.yml \
    nginx/nginx.conf \
    2>/dev/null || true

log_success "Configurações: config_$DATE.tar.gz"

# ==========================================
# 4. Limpar Backups Antigos (manter últimos 7 dias)
# ==========================================
log_info "Limpando backups antigos..."

find "$BACKUP_DIR" -type f -mtime +7 -name "*.tar.gz" -delete

log_success "Backups antigos removidos"

# ==========================================
# 5. Resumo
# ==========================================
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Backup Concluído!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  Diretório: $BACKUP_DIR"
echo "  Tamanho total: $BACKUP_SIZE"
echo ""
echo "  Arquivos criados:"
ls -lh "$BACKUP_DIR"/*$DATE* 2>/dev/null | awk '{print "    "$9": "$5}'
echo ""
echo -e "${YELLOW}Dica:${NC} Configure este script no cron para backups automáticos:"
echo "  0 2 * * * $WAHA_DIR/scripts/backup.sh >> /var/log/waha-backup.log 2>&1"
echo ""
