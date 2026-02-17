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
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
log_error() { echo -e "${RED}[ERRO]${NC} $1"; }

# Verificar root
if [ "$EUID" -ne 0 ]; then
    log_error "Execute como root: sudo ./scripts/update.sh"
    exit 1
fi

# Diretório do script → deploy/scripts/
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$DEPLOY_DIR")"

cd "$PROJECT_DIR"

# Carregar variáveis de ambiente do deploy
if [ -f "$DEPLOY_DIR/.env" ]; then
    export $(cat "$DEPLOY_DIR/.env" | grep -v '^#' | xargs)
fi

# Detectar comando do Docker Compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Ler versões
OLD_VERSION=$(cat "$DEPLOY_DIR/VERSION.old" 2>/dev/null || echo "desconhecida")
NEW_VERSION=$(cat "$DEPLOY_DIR/VERSION" 2>/dev/null || echo "3.0.0")

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   ATUALIZAÇÃO COMPLETA DO SISTEMA                         ║"
echo "║   Versão: $OLD_VERSION → $NEW_VERSION"
echo "║   Data: $(date)"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ==========================================
# 1. Git Pull - Baixar código mais recente
# ==========================================
log_info "Baixando código mais recente..."

# Corrigir permissões para o git pull
chown -R $(logname 2>/dev/null || echo $SUDO_USER):$(logname 2>/dev/null || echo $SUDO_USER) . 2>/dev/null || true

su -c "cd $PROJECT_DIR && git pull origin main" $(logname 2>/dev/null || echo $SUDO_USER) || {
    log_warning "Git pull falhou. Tentando com reset..."
    su -c "cd $PROJECT_DIR && git fetch origin main && git reset --hard origin/main" $(logname 2>/dev/null || echo $SUDO_USER) || {
        log_error "Não foi possível atualizar o código. Verifique o repositório."
        exit 1
    }
}

log_success "Código atualizado"

# ==========================================
# 2. Rebuild do Frontend via Docker
# ==========================================
log_info "Compilando frontend..."

# Limpar build anterior para garantir build limpo
rm -rf dist node_modules/.vite .vite

docker run --rm -v "$(pwd)":/app -w /app node:20-alpine sh -c "npm install --legacy-peer-deps && npm run build" || {
    log_error "Falha ao compilar o frontend"
    exit 1
}

# Verificar se o build gerou o index.html
if [ ! -f "dist/index.html" ]; then
    log_error "Build nao gerou dist/index.html. Abortando."
    exit 1
fi

log_success "Frontend compilado ($(ls dist/assets/*.js 2>/dev/null | wc -l) arquivos JS)"

# ==========================================
# 3. Deploy do Frontend
# ==========================================
log_info "Copiando frontend para o volume do Nginx..."

# Preservar config.js existente
if [ -f "$DEPLOY_DIR/frontend/dist/config.js" ]; then
    cp "$DEPLOY_DIR/frontend/dist/config.js" /tmp/config.js.bak
fi

# Criar diretório se não existir
mkdir -p "$DEPLOY_DIR/frontend/dist"

# Copiar novo build
cp -r dist/* "$DEPLOY_DIR/frontend/dist/"

# Restaurar config.js
if [ -f /tmp/config.js.bak ]; then
    cp /tmp/config.js.bak "$DEPLOY_DIR/frontend/dist/config.js"
    rm /tmp/config.js.bak
fi

# Injetar config.js no index.html (se ainda não estiver)
if ! grep -q 'config.js' "$DEPLOY_DIR/frontend/dist/index.html" 2>/dev/null; then
    sed -i 's|</head>|<script src="/config.js"></script></head>|' "$DEPLOY_DIR/frontend/dist/index.html"
    log_success "config.js injetado no index.html"
fi

# Recarregar Nginx para servir o conteúdo novo
log_info "Recarregando Nginx..."
docker exec app-nginx nginx -s reload 2>/dev/null && log_success "Nginx recarregado" || log_warning "Não foi possível recarregar Nginx (será reiniciado adiante)"

log_success "Frontend deployado"

# ==========================================
# 4. Backup automático
# ==========================================
log_info "Fazendo backup antes de reiniciar..."

cd "$DEPLOY_DIR"

if [ -f "scripts/backup.sh" ]; then
    ./scripts/backup.sh || {
        log_warning "Backup automático falhou. Continuando mesmo assim..."
    }
    log_success "Backup concluído"
else
    log_warning "Script de backup não encontrado"
fi

# ==========================================
# 5. Executar Migrations de Atualização
# ==========================================
log_info "Verificando migrations..."

# Iniciar apenas o banco de dados
$DOCKER_COMPOSE up -d db 2>/dev/null || true

# Aguardar banco estar pronto
max_attempts=30
attempt=0
log_info "Aguardando banco de dados..."
while ! $DOCKER_COMPOSE exec -T db pg_isready -U postgres &>/dev/null; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
        log_warning "Banco de dados não respondeu a tempo. Pulando migrations."
        break
    fi
    sleep 2
done

# Executar migrations se existirem
if [ $attempt -lt $max_attempts ]; then
    if [ -f "supabase/migrations_update.sql" ]; then
        log_info "Executando migrations de atualização..."
        $DOCKER_COMPOSE exec -T db psql -U postgres -d ${POSTGRES_DB:-postgres} \
            -f /docker-entrypoint-initdb.d/migrations_update.sql || {
            log_warning "Algumas migrations podem ter falhado (normal se já executadas)"
        }
        mkdir -p supabase/migrations_applied
        mv supabase/migrations_update.sql "supabase/migrations_applied/update_$(date +%Y%m%d_%H%M%S).sql"
        log_success "Migrations executadas"
    else
        log_info "Nenhuma migration de atualização encontrada"
    fi
fi

# ==========================================
# 6. Reiniciar TODOS os containers
# ==========================================
log_info "Reiniciando todos os containers..."

$DOCKER_COMPOSE --profile baileys up -d --force-recreate

log_success "Containers reiniciados"

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
# 8. Verificar Saúde do Baileys
# ==========================================
log_info "Verificando Baileys Server..."

MAX_RETRIES=20
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/health 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ]; then
        log_success "Baileys Server: OK"
        break
    fi
    RETRY=$((RETRY + 1))
    echo -n "."
    sleep 3
done

if [ $RETRY -eq $MAX_RETRIES ]; then
    log_warning "Baileys pode ainda estar inicializando"
    log_info "Verifique com: $DOCKER_COMPOSE logs baileys"
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
