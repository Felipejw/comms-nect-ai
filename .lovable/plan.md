
# Plano: Instalação One-Line e Script de Diagnóstico para Baileys

## Visão Geral

Adicionar duas funcionalidades ao servidor Baileys:
1. **Instalação via curl de uma linha** - Usuário executa apenas um comando para baixar e instalar tudo
2. **Script de diagnóstico** - Verifica automaticamente status de containers, portas, SSL e conectividade

## 1. Instalação One-Line via Curl

### Como Funcionará

O usuário executará apenas este comando na VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/Felipejw/comms-nect-ai/main/deploy/baileys/scripts/bootstrap.sh | sudo bash
```

### Arquivo: `deploy/baileys/scripts/bootstrap.sh`

Este script será o ponto de entrada que:
1. Detecta o sistema operacional
2. Instala dependências básicas (git, curl)
3. Clona o repositório em `/opt/baileys`
4. Executa o script de instalação principal

```bash
#!/bin/bash
set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_error() { echo -e "${RED}[ERRO]${NC} $1"; }

# Banner
echo -e "${CYAN}"
echo "============================================"
echo "   Baileys WhatsApp Server - Instalador"
echo "   Instalacao automatica via curl"
echo "============================================"
echo -e "${NC}"

# Verificar root
if [ "$EUID" -ne 0 ]; then
    log_error "Execute como root: curl ... | sudo bash"
    exit 1
fi

# Detectar OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    log_error "Sistema nao suportado"
    exit 1
fi

log_info "Sistema detectado: $OS"

# Instalar dependencias basicas
log_info "Instalando dependencias..."
apt-get update -qq
apt-get install -y -qq git curl wget

# Definir diretorio de instalacao
INSTALL_DIR="/opt/baileys"
REPO_URL="https://github.com/Felipejw/comms-nect-ai.git"
BRANCH="main"

# Remover instalacao anterior se existir
if [ -d "$INSTALL_DIR" ]; then
    log_info "Removendo instalacao anterior..."
    rm -rf "$INSTALL_DIR"
fi

# Clonar repositorio
log_info "Baixando arquivos..."
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" /tmp/comms-nect-ai
mkdir -p "$INSTALL_DIR"
cp -r /tmp/comms-nect-ai/deploy/baileys/* "$INSTALL_DIR/"
rm -rf /tmp/comms-nect-ai

# Dar permissoes
chmod +x "$INSTALL_DIR/scripts/"*.sh

# Executar instalador principal
cd "$INSTALL_DIR"
./scripts/install.sh

log_success "Instalacao concluida!"
```

## 2. Script de Diagnóstico

### Arquivo: `deploy/baileys/scripts/diagnostico.sh`

Script completo que verifica:
- Status de todos os containers
- Portas abertas (3000, 80, 443)
- Certificado SSL (validade, domínio)
- Conectividade interna e externa
- Espaço em disco
- Logs recentes

```bash
#!/bin/bash

# ============================================
# Diagnostico Baileys WhatsApp Server
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

check_pass() { echo -e "  ${GREEN}✓${NC} $1"; }
check_fail() { echo -e "  ${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }
check_warn() { echo -e "  ${YELLOW}!${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
check_info() { echo -e "  ${BLUE}ℹ${NC} $1"; }

# Banner
echo -e "${CYAN}"
echo "============================================"
echo "   Baileys - Diagnostico do Sistema"
echo "   $(date)"
echo "============================================"
echo -e "${NC}"

# Carregar .env
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$(dirname "$SCRIPT_DIR")"
cd "$INSTALL_DIR"

if [ -f ".env" ]; then
    source .env
else
    check_fail "Arquivo .env nao encontrado"
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
    check_fail "Docker nao instalado"
fi

if systemctl is-active --quiet docker; then
    check_pass "Docker esta rodando"
else
    check_fail "Docker nao esta rodando"
fi

# ==========================================
# 2. Verificar Containers
# ==========================================
echo ""
echo -e "${BLUE}[2/7] Containers${NC}"

# Baileys
BAILEYS_STATUS=$($DOCKER_COMPOSE ps baileys 2>/dev/null | grep -E "Up|running" || echo "")
if [ -n "$BAILEYS_STATUS" ]; then
    check_pass "Container baileys esta rodando"
else
    check_fail "Container baileys NAO esta rodando"
fi

# Nginx
NGINX_STATUS=$($DOCKER_COMPOSE ps nginx 2>/dev/null | grep -E "Up|running" || echo "")
if [ -n "$NGINX_STATUS" ]; then
    check_pass "Container nginx esta rodando"
else
    check_fail "Container nginx NAO esta rodando"
fi

# Mostrar todos os containers
echo ""
check_info "Status detalhado:"
$DOCKER_COMPOSE ps 2>/dev/null || docker ps -a --filter "name=baileys" 2>/dev/null

# ==========================================
# 3. Verificar Portas
# ==========================================
echo ""
echo -e "${BLUE}[3/7] Portas${NC}"

check_port() {
    local port=$1
    local desc=$2
    if netstat -tuln 2>/dev/null | grep -q ":$port " || ss -tuln 2>/dev/null | grep -q ":$port "; then
        check_pass "Porta $port ($desc) esta aberta"
        return 0
    else
        check_fail "Porta $port ($desc) NAO esta aberta"
        return 1
    fi
}

check_port 3000 "Baileys API"
check_port 80 "HTTP"
check_port 443 "HTTPS"

# ==========================================
# 4. Verificar SSL
# ==========================================
echo ""
echo -e "${BLUE}[4/7] Certificado SSL${NC}"

if [ -n "$DOMAIN" ]; then
    # Verificar se certificado existe
    if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        check_pass "Certificado existe para $DOMAIN"
        
        # Verificar validade
        EXPIRY=$(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" 2>/dev/null | cut -d= -f2)
        EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s 2>/dev/null || echo "0")
        NOW_EPOCH=$(date +%s)
        DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
        
        if [ "$DAYS_LEFT" -gt 30 ]; then
            check_pass "Certificado valido por $DAYS_LEFT dias"
        elif [ "$DAYS_LEFT" -gt 0 ]; then
            check_warn "Certificado expira em $DAYS_LEFT dias - renovar em breve!"
        else
            check_fail "Certificado EXPIRADO!"
        fi
    else
        check_fail "Certificado SSL nao encontrado"
    fi
else
    check_warn "Dominio nao configurado no .env"
fi

# ==========================================
# 5. Verificar Conectividade
# ==========================================
echo ""
echo -e "${BLUE}[5/7] Conectividade${NC}"

# Teste interno (localhost)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/health 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    check_pass "API local respondendo (HTTP $HTTP_CODE)"
else
    check_fail "API local NAO responde (HTTP $HTTP_CODE)"
fi

# Teste externo (HTTPS)
if [ -n "$DOMAIN" ]; then
    HTTPS_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -k "https://$DOMAIN/health" 2>/dev/null || echo "000")
    if [ "$HTTPS_CODE" = "200" ]; then
        check_pass "API externa respondendo (HTTPS $HTTPS_CODE)"
    elif [ "$HTTPS_CODE" != "000" ]; then
        check_warn "API externa retornou HTTP $HTTPS_CODE"
    else
        check_fail "API externa NAO responde"
    fi
fi

# ==========================================
# 6. Verificar Recursos
# ==========================================
echo ""
echo -e "${BLUE}[6/7] Recursos do Sistema${NC}"

# Disco
DISK_USAGE=$(df -h "$INSTALL_DIR" | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$DISK_USAGE" -lt 80 ]; then
    check_pass "Disco: ${DISK_USAGE}% usado"
elif [ "$DISK_USAGE" -lt 95 ]; then
    check_warn "Disco: ${DISK_USAGE}% usado - limpar espaco em breve"
else
    check_fail "Disco: ${DISK_USAGE}% usado - CRITICO!"
fi

# Memoria
MEM_USAGE=$(free | awk '/Mem:/ {printf "%.0f", $3/$2 * 100}')
if [ "$MEM_USAGE" -lt 80 ]; then
    check_pass "Memoria: ${MEM_USAGE}% usada"
elif [ "$MEM_USAGE" -lt 95 ]; then
    check_warn "Memoria: ${MEM_USAGE}% usada - monitorar"
else
    check_fail "Memoria: ${MEM_USAGE}% usada - CRITICO!"
fi

# Sessoes ativas
if [ -d "$INSTALL_DIR/sessions" ]; then
    SESSION_COUNT=$(ls -1 "$INSTALL_DIR/sessions" 2>/dev/null | wc -l)
    check_info "Sessoes WhatsApp: $SESSION_COUNT"
fi

# ==========================================
# 7. Logs Recentes
# ==========================================
echo ""
echo -e "${BLUE}[7/7] Logs Recentes${NC}"

# Verificar erros nos logs
ERROR_COUNT=$(docker logs baileys-server 2>&1 | tail -100 | grep -ci "error" || echo "0")
if [ "$ERROR_COUNT" -eq 0 ]; then
    check_pass "Nenhum erro nos ultimos 100 logs"
else
    check_warn "$ERROR_COUNT erros encontrados nos logs"
fi

# Ultimas linhas
echo ""
check_info "Ultimas 5 linhas do log:"
docker logs baileys-server 2>&1 | tail -5 | sed 's/^/    /'

# ==========================================
# Resumo
# ==========================================
echo ""
echo "============================================"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "  ${GREEN}Tudo OK! Sistema funcionando corretamente.${NC}"
elif [ $ERRORS -eq 0 ]; then
    echo -e "  ${YELLOW}Sistema funcionando com $WARNINGS aviso(s).${NC}"
else
    echo -e "  ${RED}Encontrados $ERRORS erro(s) e $WARNINGS aviso(s).${NC}"
fi
echo "============================================"

# ==========================================
# Comandos uteis
# ==========================================
echo ""
echo "Comandos uteis:"
echo "  Ver logs:      $DOCKER_COMPOSE logs -f"
echo "  Reiniciar:     $DOCKER_COMPOSE restart"
echo "  Parar:         $DOCKER_COMPOSE down"
echo "  Atualizar:     ./scripts/update.sh"
echo ""

exit $ERRORS
```

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `deploy/baileys/scripts/bootstrap.sh` | Criar | Script de bootstrap para curl one-line |
| `deploy/baileys/scripts/diagnostico.sh` | Criar | Script de diagnóstico completo |
| `deploy/baileys/README.md` | Atualizar | Adicionar instrução de instalação one-line |

## Atualização do README

Adicionar no topo do README:

```markdown
## Instalação Rápida (Uma Linha)

```bash
curl -fsSL https://raw.githubusercontent.com/Felipejw/comms-nect-ai/main/deploy/baileys/scripts/bootstrap.sh | sudo bash
```

Este comando irá:
1. Detectar seu sistema operacional
2. Instalar Docker automaticamente
3. Configurar SSL com Let's Encrypt
4. Iniciar o servidor Baileys

## Diagnóstico

Após instalado, para verificar o status do sistema:

```bash
cd /opt/baileys
./scripts/diagnostico.sh
```
```

## Fluxo da Instalação One-Line

```text
Usuário executa curl | sudo bash
          │
          ▼
    bootstrap.sh
          │
          ├─── Verifica root
          ├─── Detecta OS (Ubuntu/Debian)
          ├─── Instala git, curl
          ├─── Clona repo em /tmp
          ├─── Copia para /opt/baileys
          │
          ▼
    install.sh (existente)
          │
          ├─── Instala Docker
          ├─── Coleta domínio/email
          ├─── Gera API Key
          ├─── Obtém SSL
          ├─── Inicia containers
          │
          ▼
    Servidor rodando!
```

## Verificações do Diagnóstico

| Verificação | O que checa |
|-------------|-------------|
| Docker | Instalado e rodando |
| Containers | baileys e nginx Up |
| Portas | 3000, 80, 443 abertas |
| SSL | Certificado existe e válido |
| Conectividade | API local e externa respondem |
| Recursos | Disco e memória adequados |
| Logs | Erros recentes |

## Benefícios

1. **Instalação simples** - Um único comando para instalar tudo
2. **Diagnóstico rápido** - Identificar problemas em segundos
3. **Padronização** - Mesma experiência para todos os clientes
4. **Suporte facilitado** - Output do diagnóstico ajuda a resolver problemas
