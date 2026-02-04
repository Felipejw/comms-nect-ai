#!/bin/bash

# ============================================
# Baileys WhatsApp Server - Diagnóstico
# Versão simplificada para nova arquitetura
# ============================================

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Contadores
ERRORS=0
WARNINGS=0

# Funções de output
check_pass() { echo -e "  ${GREEN}✓${NC} $1"; }
check_fail() { echo -e "  ${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }
check_warn() { echo -e "  ${YELLOW}!${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
check_info() { echo -e "  ${BLUE}ℹ${NC} $1"; }

# Banner
echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║       BAILEYS - DIAGNÓSTICO DO SISTEMA                     ║"
echo "║       $(date '+%Y-%m-%d %H:%M:%S')                                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Determinar diretório de instalação
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$(dirname "$SCRIPT_DIR")"
cd "$INSTALL_DIR"

# Carregar .env
if [ -f ".env" ]; then
    source .env
    check_pass "Arquivo .env carregado"
else
    check_fail "Arquivo .env NÃO encontrado em $INSTALL_DIR"
fi

# Determinar comando Docker Compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# ==========================================
# 1. Verificar Docker
# ==========================================
echo ""
echo -e "${BLUE}[1/6] Docker${NC}"

if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')
    check_pass "Docker instalado (v$DOCKER_VERSION)"
else
    check_fail "Docker NÃO está instalado"
fi

if systemctl is-active --quiet docker 2>/dev/null; then
    check_pass "Docker daemon está rodando"
elif pgrep -x "dockerd" > /dev/null; then
    check_pass "Docker daemon está rodando (detectado via processo)"
else
    check_fail "Docker daemon NÃO está rodando"
fi

# ==========================================
# 2. Verificar Container Baileys
# ==========================================
echo ""
echo -e "${BLUE}[2/6] Container Baileys${NC}"

BAILEYS_RUNNING=$(docker ps --filter "name=baileys-server" --filter "status=running" -q 2>/dev/null)
if [ -n "$BAILEYS_RUNNING" ]; then
    check_pass "Container baileys-server está rodando"
    
    # Verificar uptime
    BAILEYS_UPTIME=$(docker inspect --format='{{.State.StartedAt}}' baileys-server 2>/dev/null || echo "")
    if [ -n "$BAILEYS_UPTIME" ]; then
        check_info "Iniciado em: $BAILEYS_UPTIME"
    fi
else
    check_fail "Container baileys-server NÃO está rodando"
    
    # Verificar se existe parado
    BAILEYS_EXISTS=$(docker ps -a --filter "name=baileys-server" -q 2>/dev/null)
    if [ -n "$BAILEYS_EXISTS" ]; then
        check_info "Container existe mas está parado. Inicie com: $DOCKER_COMPOSE up -d"
    else
        check_info "Container não existe. Execute: $DOCKER_COMPOSE up -d"
    fi
fi

# ==========================================
# 3. Verificar Porta 3000
# ==========================================
echo ""
echo -e "${BLUE}[3/6] Porta 3000${NC}"

if ss -tuln 2>/dev/null | grep -q ":3000 " || netstat -tuln 2>/dev/null | grep -q ":3000 "; then
    check_pass "Porta 3000 está aberta"
else
    check_fail "Porta 3000 NÃO está aberta"
fi

# ==========================================
# 4. Verificar Conectividade Local
# ==========================================
echo ""
echo -e "${BLUE}[4/6] Conectividade Local${NC}"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/health 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    check_pass "API local respondendo (HTTP 200)"
    
    HEALTH_RESPONSE=$(curl -s --max-time 5 http://localhost:3000/health 2>/dev/null || echo "{}")
    check_info "Health: $HEALTH_RESPONSE"
else
    check_fail "API local NÃO responde (HTTP $HTTP_CODE)"
    
    if [ "$HTTP_CODE" = "000" ]; then
        check_info "Conexão recusada - container pode não estar rodando"
    fi
fi

# ==========================================
# 5. Verificar Configuração
# ==========================================
echo ""
echo -e "${BLUE}[5/6] Configuração${NC}"

# Verificar API Key
if [ -n "$API_KEY" ]; then
    API_KEY_PREFIX="${API_KEY:0:8}..."
    check_pass "API_KEY configurada ($API_KEY_PREFIX)"
else
    check_fail "API_KEY NÃO configurada"
fi

# Verificar Webhook URL
if [ -n "$WEBHOOK_URL" ]; then
    check_pass "WEBHOOK_URL: $WEBHOOK_URL"
    
    # Verificar se é a URL correta
    if [[ "$WEBHOOK_URL" == *"qducanwbpleoceynmend"* ]]; then
        check_pass "WEBHOOK_URL aponta para projeto correto"
    else
        check_warn "WEBHOOK_URL pode estar apontando para projeto errado"
        check_info "URL correta: https://qducanwbpleoceynmend.supabase.co/functions/v1/baileys-webhook"
    fi
else
    check_warn "WEBHOOK_URL NÃO configurada"
fi

# ==========================================
# 6. Verificar Proxy Nginx (Externo)
# ==========================================
echo ""
echo -e "${BLUE}[6/6] Proxy Nginx (Host)${NC}"

# Detectar se Nginx está instalado no host
if command -v nginx &> /dev/null; then
    check_pass "Nginx está instalado no host"
    
    # Verificar se Nginx está rodando
    if systemctl is-active --quiet nginx 2>/dev/null; then
        check_pass "Nginx está rodando"
    else
        check_warn "Nginx instalado mas não está rodando"
    fi
    
    # Verificar se existe regra para /baileys
    NGINX_CONFIG=$(nginx -T 2>/dev/null | grep -A5 "location /baileys" || echo "")
    if [ -n "$NGINX_CONFIG" ]; then
        check_pass "Regra /baileys encontrada na configuração Nginx"
    else
        check_warn "Regra /baileys NÃO encontrada no Nginx"
        check_info "Adicione o snippet de nginx-snippet.conf ao seu Nginx"
    fi
else
    check_warn "Nginx não está instalado no host"
    check_info "Você precisa de um proxy reverso para acessar via HTTPS"
fi

# ==========================================
# Recursos do Sistema
# ==========================================
echo ""
echo -e "${BLUE}[Extra] Recursos${NC}"

# Disco
DISK_USAGE=$(df -h "$INSTALL_DIR" 2>/dev/null | awk 'NR==2 {print $5}' | tr -d '%')
if [ -n "$DISK_USAGE" ]; then
    if [ "$DISK_USAGE" -lt 80 ]; then
        check_pass "Disco: ${DISK_USAGE}% usado"
    elif [ "$DISK_USAGE" -lt 95 ]; then
        check_warn "Disco: ${DISK_USAGE}% usado"
    else
        check_fail "Disco: ${DISK_USAGE}% usado - CRÍTICO!"
    fi
fi

# Memória
MEM_TOTAL=$(free -m | awk '/^Mem:/{print $2}')
MEM_USED=$(free -m | awk '/^Mem:/{print $3}')
MEM_USAGE=$((MEM_USED * 100 / MEM_TOTAL))
check_info "Memória: ${MEM_USAGE}% usada (${MEM_USED}MB / ${MEM_TOTAL}MB)"

# Sessões WhatsApp
if [ -d "$INSTALL_DIR/sessions" ]; then
    SESSION_COUNT=$(find "$INSTALL_DIR/sessions" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
    check_info "Sessões WhatsApp salvas: $SESSION_COUNT"
fi

# ==========================================
# Logs Recentes
# ==========================================
echo ""
echo -e "${BLUE}[Extra] Logs Recentes${NC}"

if docker ps --filter "name=baileys-server" -q &>/dev/null; then
    ERROR_COUNT=$(docker logs baileys-server 2>&1 | tail -100 | grep -ci "error" || echo "0")
    
    if [ "$ERROR_COUNT" -eq 0 ]; then
        check_pass "Nenhum erro nos últimos 100 logs"
    else
        check_warn "$ERROR_COUNT erros encontrados nos logs recentes"
    fi
    
    echo ""
    check_info "Últimas 5 linhas do log:"
    docker logs baileys-server 2>&1 | tail -5 | sed 's/^/    /'
fi

# ==========================================
# Resumo Final
# ==========================================
echo ""
echo "════════════════════════════════════════════════════════════"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "  ${GREEN}✓ TUDO OK! Sistema funcionando corretamente.${NC}"
elif [ $ERRORS -eq 0 ]; then
    echo -e "  ${YELLOW}! Sistema funcionando com $WARNINGS aviso(s).${NC}"
else
    echo -e "  ${RED}✗ Encontrados $ERRORS erro(s) e $WARNINGS aviso(s).${NC}"
fi

echo "════════════════════════════════════════════════════════════"

# ==========================================
# Snippet Nginx (se necessário)
# ==========================================
if [ $WARNINGS -gt 0 ] || [ $ERRORS -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}Se você precisa configurar o proxy Nginx, adicione este bloco:${NC}"
    echo ""
    echo "    location /baileys/ {"
    echo "        proxy_pass http://127.0.0.1:3000/;"
    echo "        proxy_http_version 1.1;"
    echo "        proxy_set_header Host \$host;"
    echo "        proxy_set_header X-Real-IP \$remote_addr;"
    echo "        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
    echo "        proxy_set_header X-Forwarded-Proto \$scheme;"
    echo "        proxy_read_timeout 300s;"
    echo "    }"
    echo ""
    echo "Depois execute: sudo nginx -t && sudo systemctl reload nginx"
fi

# ==========================================
# Comandos úteis
# ==========================================
echo ""
echo "Comandos úteis:"
echo ""
echo "  Ver logs:        $DOCKER_COMPOSE logs -f"
echo "  Reiniciar:       $DOCKER_COMPOSE restart"
echo "  Parar:           $DOCKER_COMPOSE down"
echo "  Atualizar:       ./scripts/update.sh"
echo ""

exit $ERRORS
