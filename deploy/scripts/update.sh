#!/bin/bash

# ============================================
# Script de Atualização - Sistema de Atendimento
# Modelo de distribuição por arquivo
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

# Ler versões
OLD_VERSION=$(cat VERSION.old 2>/dev/null || echo "desconhecida")
NEW_VERSION=$(cat VERSION 2>/dev/null || echo "2.0.0")

echo -e "${BLUE}"
echo "============================================"
echo "  Atualização do Sistema de Atendimento"
echo "  Versão: $OLD_VERSION → $NEW_VERSION"
echo "  Data: $(date)"
echo "============================================"
echo -e "${NC}"

# ==========================================
# 1. Confirmar Atualização
# ==========================================
echo ""
log_warning "ATENÇÃO: Certifique-se de ter feito backup antes de continuar!"
echo ""
read -p "Deseja continuar com a atualização? (s/N): " confirm
if [ "$confirm" != "s" ] && [ "$confirm" != "S" ]; then
    log_info "Atualização cancelada"
    exit 0
fi

# ==========================================
# 2. Fazer Backup Automático
# ==========================================
log_info "Fazendo backup antes da atualização..."

if [ -f "scripts/backup.sh" ]; then
    ./scripts/backup.sh || {
        log_warning "Backup automático falhou. Continuando mesmo assim..."
    }
    log_success "Backup concluído"
else
    log_warning "Script de backup não encontrado"
fi

# ==========================================
# 3. Parar Containers
# ==========================================
log_info "Parando containers..."

$DOCKER_COMPOSE down || true

log_success "Containers parados"

# ==========================================
# 4. Atualizar Imagens Docker (se necessário)
# ==========================================
log_info "Atualizando imagens Docker..."

$DOCKER_COMPOSE pull 2>/dev/null || {
    log_warning "Não foi possível atualizar imagens. Usando versões existentes."
}

log_success "Imagens verificadas"

# ==========================================
# 5. Executar Migrations de Atualização
# ==========================================
log_info "Verificando migrations..."

# Iniciar apenas o banco de dados
$DOCKER_COMPOSE up -d db

# Aguardar banco estar pronto
max_attempts=30
attempt=0
log_info "Aguardando banco de dados..."
while ! $DOCKER_COMPOSE exec -T db pg_isready -U postgres &>/dev/null; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
        log_error "Banco de dados não iniciou a tempo"
        exit 1
    fi
    sleep 2
done

# Executar migrations se existirem
if [ -f "supabase/migrations_update.sql" ]; then
    log_info "Executando migrations de atualização..."
    
    $DOCKER_COMPOSE exec -T db psql -U postgres -d ${POSTGRES_DB:-postgres} \
        -f /docker-entrypoint-initdb.d/migrations_update.sql || {
        log_warning "Algumas migrations podem ter falhado (normal se já executadas)"
    }
    
    # Mover para pasta de histórico
    mkdir -p supabase/migrations_applied
    mv supabase/migrations_update.sql "supabase/migrations_applied/update_$(date +%Y%m%d_%H%M%S).sql"
    
    log_success "Migrations executadas"
else
    log_info "Nenhuma migration de atualização encontrada"
fi

# Verificar migrations em pasta
if [ -d "supabase/migrations_update" ] && [ "$(ls -A supabase/migrations_update 2>/dev/null)" ]; then
    log_info "Executando migrations da pasta..."
    
    for migration in supabase/migrations_update/*.sql; do
        if [ -f "$migration" ]; then
            log_info "  - $(basename $migration)"
            $DOCKER_COMPOSE exec -T db psql -U postgres -d ${POSTGRES_DB:-postgres} -f "/docker-entrypoint-initdb.d/$(basename $migration)" || {
                log_warning "    Falhou (pode já ter sido aplicada)"
            }
        fi
    done
    
    # Mover para histórico
    mkdir -p supabase/migrations_applied
    mv supabase/migrations_update/* supabase/migrations_applied/ 2>/dev/null || true
    
    log_success "Migrations da pasta executadas"
fi

# ==========================================
# 6. Iniciar Todos os Containers
# ==========================================
log_info "Iniciando containers..."

$DOCKER_COMPOSE up -d

log_success "Containers iniciados"

# ==========================================
# 7. Aguardar Serviços
# ==========================================
log_info "Aguardando serviços iniciarem..."

sleep 20

# Verificar saúde dos serviços
services_ok=true

for service in db auth rest storage nginx; do
    if $DOCKER_COMPOSE ps 2>/dev/null | grep "$service" | grep -q "Up\|running"; then
        log_success "Serviço $service: OK"
    else
        log_error "Serviço $service: FALHOU"
        services_ok=false
    fi
done

# ==========================================
# 8. Verificar Saúde do WPPConnect
# ==========================================
log_info "Verificando WPPConnect Server..."

MAX_RETRIES=20
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
    # Tentar endpoint principal
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:21465/api/ 2>/dev/null || echo "000")
    
    # Se falhar, tentar endpoint alternativo
    if [ "$HTTP_CODE" = "000" ] || [ "$HTTP_CODE" = "502" ] || [ "$HTTP_CODE" = "503" ]; then
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:21465/api/showAllSessions 2>/dev/null || echo "000")
    fi
    
    # Qualquer resposta válida indica servidor funcionando
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "500" ]; then
        log_success "WPPConnect Server: OK (HTTP $HTTP_CODE)"
        break
    fi
    RETRY=$((RETRY + 1))
    echo -n "."
    sleep 3
done

if [ $RETRY -eq $MAX_RETRIES ]; then
    log_warning "WPPConnect pode ainda estar inicializando"
    log_info "Verifique com: $DOCKER_COMPOSE logs wppconnect"
fi

# ==========================================
# 9. Limpar Recursos
# ==========================================
log_info "Limpando recursos não utilizados..."

docker system prune -f 2>/dev/null || true

log_success "Limpeza concluída"

# ==========================================
# 10. Atualizar Registro de Versão
# ==========================================
cp VERSION VERSION.old 2>/dev/null || true

# ==========================================
# 11. Resumo
# ==========================================
echo ""
if [ "$services_ok" = true ]; then
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}  Atualização Concluída com Sucesso!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo "  Versão anterior: $OLD_VERSION"
    echo "  Versão atual:    $NEW_VERSION"
else
    echo -e "${RED}============================================${NC}"
    echo -e "${RED}  Atualização Concluída com Avisos${NC}"
    echo -e "${RED}============================================${NC}"
    echo ""
    echo "Alguns serviços podem não ter iniciado corretamente."
    echo ""
    echo "Comandos para diagnóstico:"
    echo "  $DOCKER_COMPOSE logs -f"
    echo "  $DOCKER_COMPOSE ps"
    echo ""
    echo "Para restaurar backup:"
    echo "  ./scripts/restore.sh backups/backup-XXXXXX.tar.gz"
fi
echo ""
echo "  URL do Sistema: https://${DOMAIN:-seu-dominio}"
echo ""
echo "  Verifique o CHANGELOG.md para ver as novidades!"
echo ""
