#!/bin/bash

# ============================================
# Script de Diagnóstico - Sistema de Atendimento
# Verifica status de todos os serviços
# ============================================

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
log_section() { echo -e "\n${CYAN}════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}════════════════════════════════════════${NC}"; }

# Diretório do script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

cd "$DEPLOY_DIR"

# Detectar comando do Docker Compose
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║       DIAGNÓSTICO DO SISTEMA DE ATENDIMENTO                ║"
echo "║       Data: $(date '+%Y-%m-%d %H:%M:%S')                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ==========================================
# 1. Verificar Docker
# ==========================================
log_section "1. STATUS DO DOCKER"

if command -v docker &> /dev/null; then
    log_success "Docker instalado: $(docker --version)"
else
    log_error "Docker não encontrado!"
    exit 1
fi

if docker info &>/dev/null; then
    log_success "Docker daemon está rodando"
else
    log_error "Docker daemon não está rodando!"
fi

# ==========================================
# 2. Verificar Containers
# ==========================================
log_section "2. STATUS DOS CONTAINERS"

echo ""
$DOCKER_COMPOSE ps 2>/dev/null || {
    log_error "Não foi possível listar containers. Verifique se está no diretório deploy/"
}

# ==========================================
# 3. Verificar Serviços Principais
# ==========================================
log_section "3. HEALTH CHECK DOS SERVIÇOS"

check_service() {
    local name=$1
    local url=$2
    local expected_codes=$3
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")
    
    if echo "$expected_codes" | grep -q "$HTTP_CODE"; then
        log_success "$name: HTTP $HTTP_CODE"
        return 0
    else
        log_error "$name: HTTP $HTTP_CODE (esperado: $expected_codes)"
        return 1
    fi
}

# Verificar Kong API Gateway
check_service "Kong API Gateway" "http://localhost:8000/health" "200"

# Verificar REST API (PostgREST)
check_service "REST API (PostgREST)" "http://localhost:3000/" "200 401"

# Verificar Auth (GoTrue)
check_service "Auth (GoTrue)" "http://localhost:9999/health" "200"

# Verificar Storage
check_service "Storage API" "http://localhost:5000/status" "200"

# Verificar WPPConnect
echo ""
log_info "Verificando WPPConnect Server..."

WPPCONNECT_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:21465/api/ 2>/dev/null || echo "000")
if [ "$WPPCONNECT_CODE" = "200" ] || [ "$WPPCONNECT_CODE" = "401" ] || [ "$WPPCONNECT_CODE" = "403" ] || [ "$WPPCONNECT_CODE" = "404" ]; then
    log_success "WPPConnect Server: HTTP $WPPCONNECT_CODE (funcionando)"
else
    log_warning "WPPConnect Server: HTTP $WPPCONNECT_CODE"
    
    # Tentar endpoint alternativo
    WPPCONNECT_ALT=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:21465/api/showAllSessions 2>/dev/null || echo "000")
    if [ "$WPPCONNECT_ALT" != "000" ]; then
        log_info "  Endpoint alternativo /api/showAllSessions: HTTP $WPPCONNECT_ALT"
    fi
fi

# ==========================================
# 4. Verificar Portas
# ==========================================
log_section "4. PORTAS EM USO"

echo ""
echo "Portas principais do sistema:"
echo ""

check_port() {
    local port=$1
    local service=$2
    if netstat -tuln 2>/dev/null | grep -q ":$port " || ss -tuln 2>/dev/null | grep -q ":$port "; then
        log_success "Porta $port ($service): Em uso"
    else
        log_warning "Porta $port ($service): Livre"
    fi
}

check_port 80 "HTTP/Nginx"
check_port 443 "HTTPS/Nginx"
check_port 8000 "Kong API Gateway"
check_port 5432 "PostgreSQL"
check_port 21465 "WPPConnect"
check_port 3000 "PostgREST"
check_port 9999 "GoTrue Auth"

# ==========================================
# 5. Verificar Logs de Erro
# ==========================================
log_section "5. ÚLTIMOS ERROS NOS LOGS"

echo ""
log_info "Verificando logs de erro (últimas 10 linhas)..."
echo ""

for container in supabase-db supabase-auth supabase-rest wppconnect-1; do
    errors=$($DOCKER_COMPOSE logs --tail=50 $container 2>/dev/null | grep -i "error\|fatal\|panic" | tail -5)
    if [ -n "$errors" ]; then
        echo -e "${RED}[$container]${NC}"
        echo "$errors"
        echo ""
    fi
done

# ==========================================
# 6. Verificar Uso de Recursos
# ==========================================
log_section "6. USO DE RECURSOS"

echo ""
log_info "Memória:"
free -h 2>/dev/null || echo "Comando 'free' não disponível"

echo ""
log_info "Disco:"
df -h / 2>/dev/null | tail -1

echo ""
log_info "Top 5 containers por memória:"
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}" 2>/dev/null | head -6

# ==========================================
# 7. Verificar Configuração
# ==========================================
log_section "7. CONFIGURAÇÃO"

if [ -f ".env" ]; then
    log_success "Arquivo .env encontrado"
    
    # Verificar variáveis críticas (sem mostrar valores)
    for var in DOMAIN POSTGRES_PASSWORD JWT_SECRET ANON_KEY SERVICE_ROLE_KEY WPPCONNECT_SECRET_KEY; do
        if grep -q "^$var=" .env 2>/dev/null; then
            log_success "  $var: Configurado"
        else
            log_warning "  $var: Não configurado"
        fi
    done
else
    log_error "Arquivo .env não encontrado!"
fi

# ==========================================
# 8. Resumo
# ==========================================
log_section "8. RESUMO"

echo ""
total_containers=$($DOCKER_COMPOSE ps -q 2>/dev/null | wc -l)
running_containers=$($DOCKER_COMPOSE ps --filter "status=running" -q 2>/dev/null | wc -l)

echo "Total de containers: $total_containers"
echo "Containers rodando: $running_containers"
echo ""

if [ "$running_containers" -eq "$total_containers" ] && [ "$total_containers" -gt 0 ]; then
    log_success "Todos os containers estão rodando!"
else
    log_warning "Alguns containers podem não estar rodando corretamente"
fi

echo ""
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}  Comandos úteis para debug:${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""
echo "  Ver logs de um container:"
echo "    $DOCKER_COMPOSE logs -f <container>"
echo ""
echo "  Reiniciar um container:"
echo "    $DOCKER_COMPOSE restart <container>"
echo ""
echo "  Reiniciar todos os containers:"
echo "    $DOCKER_COMPOSE down && $DOCKER_COMPOSE up -d"
echo ""
echo "  Testar WPPConnect manualmente:"
echo "    curl -v http://localhost:21465/api/"
echo ""
