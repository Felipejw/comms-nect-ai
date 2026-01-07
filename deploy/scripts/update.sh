#!/bin/bash

# ============================================
# Script de Atualização - Sistema de Atendimento
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
PROJECT_DIR="$(dirname "$DEPLOY_DIR")"

cd "$DEPLOY_DIR"

# Carregar variáveis de ambiente
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

echo -e "${BLUE}"
echo "============================================"
echo "  Atualização do Sistema de Atendimento"
echo "  Data: $(date)"
echo "============================================"
echo -e "${NC}"

# ==========================================
# 1. Fazer Backup Antes de Atualizar
# ==========================================
log_info "Fazendo backup antes da atualização..."

./scripts/backup.sh

log_success "Backup concluído"

# ==========================================
# 2. Baixar Atualizações do Repositório
# ==========================================
log_info "Baixando atualizações..."

cd "$PROJECT_DIR"

# Guardar alterações locais
git stash 2>/dev/null || true

# Baixar atualizações
git pull origin main || {
    log_warning "Não foi possível atualizar via git. Continuando com versão atual..."
}

# Restaurar alterações locais
git stash pop 2>/dev/null || true

cd "$DEPLOY_DIR"

log_success "Código atualizado"

# ==========================================
# 3. Atualizar Dependências do Frontend
# ==========================================
log_info "Atualizando dependências do frontend..."

cd "$PROJECT_DIR"

npm install

log_success "Dependências atualizadas"

# ==========================================
# 4. Rebuild do Frontend
# ==========================================
log_info "Reconstruindo frontend..."

npm run build

# Copiar build
cp -r dist/* "$DEPLOY_DIR/frontend/dist/"

cd "$DEPLOY_DIR"

log_success "Frontend reconstruído"

# ==========================================
# 5. Atualizar Imagens Docker
# ==========================================
log_info "Atualizando imagens Docker..."

docker-compose pull

log_success "Imagens atualizadas"

# ==========================================
# 6. Executar Novas Migrations
# ==========================================
log_info "Verificando migrations..."

if [ -f "supabase/migrations_update.sql" ]; then
    log_info "Executando novas migrations..."
    docker-compose exec -T db psql -U postgres -d ${POSTGRES_DB:-postgres} -f /docker-entrypoint-initdb.d/migrations_update.sql || {
        log_warning "Algumas migrations podem ter falhado"
    }
    log_success "Migrations executadas"
fi

# ==========================================
# 7. Reiniciar Containers
# ==========================================
log_info "Reiniciando containers..."

docker-compose down
docker-compose up -d

log_success "Containers reiniciados"

# ==========================================
# 8. Aguardar Serviços
# ==========================================
log_info "Aguardando serviços iniciarem..."

sleep 20

# Verificar saúde dos serviços
services_ok=true

for service in db auth rest storage functions nginx; do
    if docker-compose ps | grep "$service" | grep -q "Up"; then
        log_success "Serviço $service: OK"
    else
        log_error "Serviço $service: FALHOU"
        services_ok=false
    fi
done

# ==========================================
# 9. Limpar Recursos Não Utilizados
# ==========================================
log_info "Limpando recursos Docker não utilizados..."

docker system prune -f --volumes 2>/dev/null || true

log_success "Limpeza concluída"

# ==========================================
# 10. Resumo
# ==========================================
echo ""
if [ "$services_ok" = true ]; then
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}  Atualização Concluída com Sucesso!${NC}"
    echo -e "${GREEN}============================================${NC}"
else
    echo -e "${RED}============================================${NC}"
    echo -e "${RED}  Atualização Concluída com Avisos${NC}"
    echo -e "${RED}============================================${NC}"
    echo ""
    echo "Alguns serviços podem não ter iniciado corretamente."
    echo "Verifique os logs: docker-compose logs -f"
fi
echo ""
echo "  URL do Sistema: https://${DOMAIN}"
echo ""
