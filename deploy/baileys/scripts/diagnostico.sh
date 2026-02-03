#!/bin/bash

# ============================================
# Baileys WhatsApp Server - Diagnostico
# Verifica status completo do sistema
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

# Funcoes de output
check_pass() { echo -e "  ${GREEN}✓${NC} $1"; }
check_fail() { echo -e "  ${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }
check_warn() { echo -e "  ${YELLOW}!${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
check_info() { echo -e "  ${BLUE}ℹ${NC} $1"; }

# Banner
echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║       BAILEYS - DIAGNOSTICO DO SISTEMA                     ║"
echo "║       $(date '+%Y-%m-%d %H:%M:%S')                                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Determinar diretorio de instalacao
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$(dirname "$SCRIPT_DIR")"
cd "$INSTALL_DIR"

# Carregar .env
if [ -f ".env" ]; then
    source .env
    check_pass "Arquivo .env carregado"
else
    check_fail "Arquivo .env NAO encontrado em $INSTALL_DIR"
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
echo -e "${BLUE}[1/7] Docker${NC}"

if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')
    check_pass "Docker instalado (v$DOCKER_VERSION)"
else
    check_fail "Docker NAO esta instalado"
fi

if systemctl is-active --quiet docker 2>/dev/null; then
    check_pass "Docker daemon esta rodando"
elif pgrep -x "dockerd" > /dev/null; then
    check_pass "Docker daemon esta rodando (detectado via processo)"
else
    check_fail "Docker daemon NAO esta rodando"
fi

# ==========================================
# 2. Verificar Containers
# ==========================================
echo ""
echo -e "${BLUE}[2/7] Containers${NC}"

# Verificar se docker-compose.yml existe
if [ ! -f "docker-compose.yml" ]; then
    check_fail "docker-compose.yml NAO encontrado"
else
    # Baileys container
    BAILEYS_RUNNING=$(docker ps --filter "name=baileys" --filter "status=running" -q 2>/dev/null)
    if [ -n "$BAILEYS_RUNNING" ]; then
        check_pass "Container baileys esta rodando"
        
        # Verificar tempo de uptime
        BAILEYS_UPTIME=$(docker inspect --format='{{.State.StartedAt}}' baileys-server 2>/dev/null || echo "")
        if [ -n "$BAILEYS_UPTIME" ]; then
            check_info "Iniciado em: $BAILEYS_UPTIME"
        fi
    else
        check_fail "Container baileys NAO esta rodando"
    fi
    
    # Nginx container
    NGINX_RUNNING=$(docker ps --filter "name=nginx" --filter "status=running" -q 2>/dev/null)
    if [ -n "$NGINX_RUNNING" ]; then
        check_pass "Container nginx esta rodando"
    else
        check_fail "Container nginx NAO esta rodando"
    fi
    
    # Status detalhado
    echo ""
    check_info "Status detalhado dos containers:"
    $DOCKER_COMPOSE ps 2>/dev/null | sed 's/^/    /' || docker ps -a --filter "name=baileys" 2>/dev/null | sed 's/^/    /'
fi

# ==========================================
# 3. Verificar Portas
# ==========================================
echo ""
echo -e "${BLUE}[3/7] Portas${NC}"

check_port() {
    local port=$1
    local desc=$2
    
    # Tentar netstat primeiro, depois ss
    if netstat -tuln 2>/dev/null | grep -q ":$port "; then
        check_pass "Porta $port ($desc) esta aberta"
        return 0
    elif ss -tuln 2>/dev/null | grep -q ":$port "; then
        check_pass "Porta $port ($desc) esta aberta"
        return 0
    else
        check_fail "Porta $port ($desc) NAO esta aberta"
        return 1
    fi
}

check_port 3000 "Baileys API interna"
check_port 80 "HTTP"
check_port 443 "HTTPS"

# ==========================================
# 4. Verificar SSL
# ==========================================
echo ""
echo -e "${BLUE}[4/7] Certificado SSL${NC}"

if [ -n "$DOMAIN" ]; then
    check_info "Dominio configurado: $DOMAIN"
    
    # Verificar se certificado existe
    CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
    
    if [ -f "$CERT_PATH" ]; then
        check_pass "Certificado SSL encontrado"
        
        # Verificar validade
        EXPIRY=$(openssl x509 -enddate -noout -in "$CERT_PATH" 2>/dev/null | cut -d= -f2)
        if [ -n "$EXPIRY" ]; then
            EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s 2>/dev/null || echo "0")
            NOW_EPOCH=$(date +%s)
            
            if [ "$EXPIRY_EPOCH" -gt 0 ]; then
                DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
                
                if [ "$DAYS_LEFT" -gt 30 ]; then
                    check_pass "Certificado valido por $DAYS_LEFT dias"
                elif [ "$DAYS_LEFT" -gt 0 ]; then
                    check_warn "Certificado expira em $DAYS_LEFT dias - renovar em breve!"
                else
                    check_fail "Certificado EXPIRADO!"
                fi
            fi
        fi
        
        # Verificar se certificado corresponde ao dominio
        CERT_DOMAIN=$(openssl x509 -noout -subject -in "$CERT_PATH" 2>/dev/null | grep -oP 'CN\s*=\s*\K[^,]+' || echo "")
        if [ "$CERT_DOMAIN" = "$DOMAIN" ]; then
            check_pass "Certificado corresponde ao dominio"
        else
            check_warn "Certificado para '$CERT_DOMAIN', esperado '$DOMAIN'"
        fi
    else
        check_fail "Certificado SSL NAO encontrado em $CERT_PATH"
        check_info "Execute: sudo certbot certonly --standalone -d $DOMAIN"
    fi
else
    check_warn "Dominio NAO configurado no .env"
    check_info "Adicione DOMAIN=seu-dominio.com ao arquivo .env"
fi

# ==========================================
# 5. Verificar Conectividade
# ==========================================
echo ""
echo -e "${BLUE}[5/7] Conectividade${NC}"

# Teste interno (localhost via HTTP)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/health 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    check_pass "API local respondendo (HTTP $HTTP_CODE)"
    
    # Tentar obter mais info
    HEALTH_RESPONSE=$(curl -s --max-time 5 http://localhost:3000/health 2>/dev/null || echo "{}")
    check_info "Health: $HEALTH_RESPONSE"
else
    check_fail "API local NAO responde (HTTP $HTTP_CODE)"
    
    # Tentar diagnosticar
    if [ "$HTTP_CODE" = "000" ]; then
        check_info "Conexao recusada - container pode nao estar rodando"
    elif [ "$HTTP_CODE" = "401" ]; then
        check_info "API requer autenticacao (esperado)"
    fi
fi

# Teste externo (HTTPS)
if [ -n "$DOMAIN" ]; then
    HTTPS_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -k "https://$DOMAIN/health" 2>/dev/null || echo "000")
    
    if [ "$HTTPS_CODE" = "200" ]; then
        check_pass "API externa respondendo (HTTPS $HTTPS_CODE)"
    elif [ "$HTTPS_CODE" != "000" ]; then
        check_warn "API externa retornou HTTP $HTTPS_CODE"
    else
        check_fail "API externa NAO responde em https://$DOMAIN"
        
        # Verificar se DNS resolve
        DNS_CHECK=$(dig +short "$DOMAIN" 2>/dev/null | head -1)
        if [ -n "$DNS_CHECK" ]; then
            check_info "DNS resolve para: $DNS_CHECK"
        else
            check_warn "DNS nao resolve - verifique configuracao do dominio"
        fi
    fi
fi

# Verificar conectividade com internet
INTERNET_CHECK=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 https://api.whatsapp.com 2>/dev/null || echo "000")
if [ "$INTERNET_CHECK" != "000" ]; then
    check_pass "Conexao com internet OK"
else
    check_warn "Sem conexao com internet ou WhatsApp bloqueado"
fi

# ==========================================
# 6. Verificar Recursos
# ==========================================
echo ""
echo -e "${BLUE}[6/7] Recursos do Sistema${NC}"

# Disco
DISK_USAGE=$(df -h "$INSTALL_DIR" 2>/dev/null | awk 'NR==2 {print $5}' | tr -d '%')
if [ -n "$DISK_USAGE" ]; then
    if [ "$DISK_USAGE" -lt 80 ]; then
        check_pass "Disco: ${DISK_USAGE}% usado"
    elif [ "$DISK_USAGE" -lt 95 ]; then
        check_warn "Disco: ${DISK_USAGE}% usado - limpar espaco em breve"
    else
        check_fail "Disco: ${DISK_USAGE}% usado - CRITICO!"
    fi
fi

# Memoria
MEM_TOTAL=$(free -m | awk '/^Mem:/{print $2}')
MEM_USED=$(free -m | awk '/^Mem:/{print $3}')
MEM_USAGE=$((MEM_USED * 100 / MEM_TOTAL))

if [ "$MEM_USAGE" -lt 80 ]; then
    check_pass "Memoria: ${MEM_USAGE}% usada (${MEM_USED}MB / ${MEM_TOTAL}MB)"
elif [ "$MEM_USAGE" -lt 95 ]; then
    check_warn "Memoria: ${MEM_USAGE}% usada - monitorar"
else
    check_fail "Memoria: ${MEM_USAGE}% usada - CRITICO!"
fi

# CPU Load
LOAD_AVG=$(cat /proc/loadavg | cut -d' ' -f1)
CPU_CORES=$(nproc)
check_info "Load average: $LOAD_AVG (${CPU_CORES} cores)"

# Sessoes WhatsApp ativas
if [ -d "$INSTALL_DIR/sessions" ]; then
    SESSION_COUNT=$(find "$INSTALL_DIR/sessions" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
    check_info "Sessoes WhatsApp salvas: $SESSION_COUNT"
else
    check_info "Nenhuma sessao WhatsApp encontrada"
fi

# Uso de disco pelo Docker
DOCKER_DISK=$(docker system df --format '{{.Size}}' 2>/dev/null | head -1 || echo "N/A")
check_info "Espaco usado pelo Docker: $DOCKER_DISK"

# ==========================================
# 7. Logs Recentes
# ==========================================
echo ""
echo -e "${BLUE}[7/7] Logs Recentes${NC}"

# Verificar erros nos logs do Baileys
if docker ps --filter "name=baileys-server" -q &>/dev/null; then
    ERROR_COUNT=$(docker logs baileys-server 2>&1 | tail -100 | grep -ci "error" || echo "0")
    WARN_COUNT=$(docker logs baileys-server 2>&1 | tail -100 | grep -ci "warn" || echo "0")
    
    if [ "$ERROR_COUNT" -eq 0 ]; then
        check_pass "Nenhum erro nos ultimos 100 logs"
    else
        check_warn "$ERROR_COUNT erros encontrados nos logs recentes"
    fi
    
    if [ "$WARN_COUNT" -gt 0 ]; then
        check_info "$WARN_COUNT avisos nos logs recentes"
    fi
    
    # Ultimas linhas do log
    echo ""
    check_info "Ultimas 5 linhas do log:"
    docker logs baileys-server 2>&1 | tail -5 | sed 's/^/    /'
else
    check_warn "Container baileys-server nao encontrado para analise de logs"
fi

# ==========================================
# Configuracao
# ==========================================
echo ""
echo -e "${BLUE}[Extra] Configuracao${NC}"

# Verificar variaveis importantes
if [ -n "$API_KEY" ]; then
    API_KEY_PREFIX="${API_KEY:0:8}..."
    check_pass "API_KEY configurada ($API_KEY_PREFIX)"
else
    check_fail "API_KEY NAO configurada"
fi

if [ -n "$WEBHOOK_URL" ]; then
    check_pass "WEBHOOK_URL: $WEBHOOK_URL"
else
    check_warn "WEBHOOK_URL NAO configurada"
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
# Comandos uteis
# ==========================================
echo ""
echo "Comandos uteis:"
echo ""
echo "  Ver logs em tempo real:"
echo "    $DOCKER_COMPOSE logs -f baileys"
echo ""
echo "  Reiniciar containers:"
echo "    $DOCKER_COMPOSE restart"
echo ""
echo "  Parar tudo:"
echo "    $DOCKER_COMPOSE down"
echo ""
echo "  Atualizar sistema:"
echo "    ./scripts/update.sh"
echo ""
echo "  Limpar espaco Docker:"
echo "    docker system prune -af"
echo ""

# Retornar codigo de erro se houver problemas
exit $ERRORS
