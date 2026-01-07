#!/bin/bash

# ============================================
# Script de Restauração - Sistema de Atendimento
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
log_warning() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
log_error() { echo -e "${RED}[ERRO]${NC} $1"; }

# Diretório do script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$DEPLOY_DIR/backups"

cd "$DEPLOY_DIR"

# Carregar variáveis de ambiente
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

echo -e "${BLUE}"
echo "============================================"
echo "  Restauração do Sistema de Atendimento"
echo "============================================"
echo -e "${NC}"

# ==========================================
# 1. Listar Backups Disponíveis
# ==========================================
log_info "Backups disponíveis:"
echo ""

if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A $BACKUP_DIR 2>/dev/null)" ]; then
    log_error "Nenhum backup encontrado em $BACKUP_DIR"
    exit 1
fi

# Listar backups agrupados por data
ls -lt "$BACKUP_DIR"/*.gz 2>/dev/null | head -20 | awk '{print NR". "$9" ("$5")"}'

echo ""
read -p "Digite o número do backup de banco a restaurar (ou Enter para o mais recente): " backup_num

# Selecionar backup
if [ -z "$backup_num" ]; then
    DB_BACKUP=$(ls -t "$BACKUP_DIR"/db_backup_*.sql.gz 2>/dev/null | head -1)
else
    DB_BACKUP=$(ls -t "$BACKUP_DIR"/*.gz | sed -n "${backup_num}p")
fi

if [ -z "$DB_BACKUP" ] || [ ! -f "$DB_BACKUP" ]; then
    log_error "Backup não encontrado"
    exit 1
fi

# Extrair data do backup
BACKUP_DATE=$(basename "$DB_BACKUP" | grep -oP '\d{8}_\d{6}')

log_info "Selecionado backup de: $BACKUP_DATE"

# ==========================================
# 2. Confirmar Restauração
# ==========================================
echo ""
log_warning "ATENÇÃO: Esta ação irá substituir TODOS os dados atuais!"
read -p "Deseja continuar? (digite 'SIM' para confirmar): " confirm

if [ "$confirm" != "SIM" ]; then
    log_info "Restauração cancelada"
    exit 0
fi

# ==========================================
# 3. Parar Serviços
# ==========================================
log_info "Parando serviços..."

docker-compose stop auth rest storage functions nginx evolution 2>/dev/null || true

log_success "Serviços parados"

# ==========================================
# 4. Restaurar Banco de Dados
# ==========================================
log_info "Restaurando banco de dados..."

# Descompactar backup
gunzip -c "$DB_BACKUP" > /tmp/db_restore.sql

# Restaurar
docker-compose exec -T db psql -U postgres -d ${POSTGRES_DB:-postgres} < /tmp/db_restore.sql

rm /tmp/db_restore.sql

log_success "Banco de dados restaurado"

# ==========================================
# 5. Restaurar Storage (se disponível)
# ==========================================
STORAGE_BACKUP="$BACKUP_DIR/storage_backup_$BACKUP_DATE.tar.gz"

if [ -f "$STORAGE_BACKUP" ]; then
    log_info "Restaurando storage..."
    
    rm -rf volumes/storage/*
    tar -xzf "$STORAGE_BACKUP" -C volumes/
    
    log_success "Storage restaurado"
else
    log_warning "Backup de storage não encontrado para esta data"
fi

# ==========================================
# 6. Restaurar Evolution (se disponível)
# ==========================================
EVOLUTION_BACKUP="$BACKUP_DIR/evolution_backup_$BACKUP_DATE.tar.gz"

if [ -f "$EVOLUTION_BACKUP" ]; then
    log_info "Restaurando sessões do WhatsApp..."
    
    rm -rf volumes/evolution/*
    tar -xzf "$EVOLUTION_BACKUP" -C volumes/
    
    log_success "Sessões do WhatsApp restauradas"
else
    log_warning "Backup do Evolution não encontrado para esta data"
fi

# ==========================================
# 7. Reiniciar Serviços
# ==========================================
log_info "Reiniciando serviços..."

docker-compose up -d

log_success "Serviços reiniciados"

# ==========================================
# 8. Aguardar e Verificar
# ==========================================
log_info "Aguardando serviços iniciarem..."

sleep 20

# Verificar saúde
for service in db auth rest storage nginx; do
    if docker-compose ps | grep "$service" | grep -q "Up"; then
        log_success "Serviço $service: OK"
    else
        log_error "Serviço $service: FALHOU"
    fi
done

# ==========================================
# 9. Resumo
# ==========================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Restauração Concluída!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  Backup restaurado: $BACKUP_DATE"
echo "  URL do Sistema: https://${DOMAIN}"
echo ""
log_warning "Verifique se todas as funcionalidades estão operando corretamente"
echo ""
