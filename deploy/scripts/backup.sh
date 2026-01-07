#!/bin/bash

# ============================================
# Script de Backup - Sistema de Atendimento
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

# Diretório do script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$DEPLOY_DIR/backups"
DATE=$(date +%Y%m%d_%H%M%S)

cd "$DEPLOY_DIR"

# Carregar variáveis de ambiente
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Detectar comando do Docker Compose
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

echo -e "${BLUE}"
echo "============================================"
echo "  Backup do Sistema de Atendimento"
echo "  Data: $(date)"
echo "============================================"
echo -e "${NC}"

# Criar diretório de backup
mkdir -p "$BACKUP_DIR"

# ==========================================
# 1. Backup do Banco de Dados
# ==========================================
log_info "Fazendo backup do banco de dados..."

BACKUP_FILE="$BACKUP_DIR/db_backup_$DATE.sql"

$DOCKER_COMPOSE exec -T db pg_dump -U postgres -d ${POSTGRES_DB:-postgres} \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    > "$BACKUP_FILE"

gzip "$BACKUP_FILE"
log_success "Banco de dados: db_backup_$DATE.sql.gz"

# ==========================================
# 2. Backup do Storage
# ==========================================
log_info "Fazendo backup do storage..."

STORAGE_BACKUP="$BACKUP_DIR/storage_backup_$DATE.tar.gz"

if [ -d "volumes/storage" ]; then
    tar -czf "$STORAGE_BACKUP" -C volumes storage
    log_success "Storage: storage_backup_$DATE.tar.gz"
else
    log_info "Pasta storage não encontrada, pulando..."
fi

# ==========================================
# 3. Backup das Configurações
# ==========================================
log_info "Fazendo backup das configurações..."

CONFIG_BACKUP="$BACKUP_DIR/config_backup_$DATE.tar.gz"

tar -czf "$CONFIG_BACKUP" \
    --exclude='.env' \
    -C "$DEPLOY_DIR" \
    nginx/nginx.conf \
    volumes/kong/kong.yml \
    docker-compose.yml \
    2>/dev/null || true

log_success "Configurações: config_backup_$DATE.tar.gz"

# ==========================================
# 4. Backup do WPPConnect (Multi-Instance)
# ==========================================
log_info "Fazendo backup das sessões do WhatsApp..."

WPPCONNECT_BACKUP="$BACKUP_DIR/wppconnect_backup_$DATE.tar.gz"

# Backup de todas as instâncias
WPPCONNECT_DIRS=""
for i in 1 2 3; do
    if [ -d "volumes/wppconnect-$i" ]; then
        WPPCONNECT_DIRS="$WPPCONNECT_DIRS wppconnect-$i"
    fi
done

# Fallback para estrutura antiga
if [ -d "volumes/wppconnect" ] && [ -z "$WPPCONNECT_DIRS" ]; then
    WPPCONNECT_DIRS="wppconnect"
fi

if [ -n "$WPPCONNECT_DIRS" ]; then
    tar -czf "$WPPCONNECT_BACKUP" -C volumes $WPPCONNECT_DIRS
    log_success "WPPConnect: wppconnect_backup_$DATE.tar.gz (instâncias: $WPPCONNECT_DIRS)"
else
    log_info "Pasta wppconnect não encontrada, pulando..."
fi

# ==========================================
# 5. Limpar Backups Antigos (manter últimos 7 dias)
# ==========================================
log_info "Limpando backups antigos..."

find "$BACKUP_DIR" -type f -mtime +7 -name "*.gz" -delete

log_success "Backups antigos removidos"

# ==========================================
# 6. Resumo
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
echo "  0 2 * * * $SCRIPT_DIR/backup.sh >> /var/log/backup.log 2>&1"
echo ""
