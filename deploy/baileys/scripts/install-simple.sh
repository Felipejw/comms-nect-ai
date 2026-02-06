#!/bin/bash
set -e

# ============================================
# Baileys WhatsApp Server - Instalação Simplificada
# Zero-config: gera tudo automaticamente
# ============================================

# Cores
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
    log_error "Execute como root: sudo ./install-simple.sh"
    exit 1
fi

# Banner
echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║       BAILEYS WHATSAPP SERVER - INSTALAÇÃO SIMPLES         ║"
echo "║       Zero-config: API Key e Webhook automáticos           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ==========================================
# Verificar/Instalar Docker
# ==========================================
log_info "Verificando Docker..."

if ! command -v docker &> /dev/null; then
    log_info "Docker não encontrado. Instalando..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    log_success "Docker instalado"
else
    log_success "Docker já instalado"
fi

# Verificar Docker Compose
if ! docker compose version &> /dev/null; then
    if ! command -v docker-compose &> /dev/null; then
        log_info "Docker Compose não encontrado. Instalando..."
        curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
        log_success "Docker Compose instalado"
    fi
fi

# Determinar comando Docker Compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# ==========================================
# Diretório de instalação
# ==========================================
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$INSTALL_DIR"
log_info "Diretório: $INSTALL_DIR"

# ==========================================
# Gerar configurações automaticamente
# ==========================================
log_info "Gerando configurações..."

# Gerar API Key
API_KEY=$(openssl rand -hex 32)
log_success "API Key gerada"

# Webhook URL fixa (projeto Supabase correto)
WEBHOOK_URL="https://qducanwbpleoceynmend.supabase.co/functions/v1/baileys-webhook"
log_success "Webhook URL configurada"

# Detectar IP público
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "localhost")
log_info "IP do servidor: $SERVER_IP"

# ==========================================
# Criar arquivo .env
# ==========================================
cat > .env << EOF
# ============================================
# Baileys WhatsApp Server - Configuração
# Gerado automaticamente em $(date)
# ============================================

# API Key para autenticação
API_KEY=$API_KEY

# Webhook para enviar eventos ao Lovable Cloud
WEBHOOK_URL=$WEBHOOK_URL

# Supabase Anon Key para autenticacao do webhook
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkdWNhbndicGxlb2NleW5tZW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNTUxODIsImV4cCI6MjA4MjYzMTE4Mn0.1EQ_XXifnOx3REsjE9ZCbd7dYC7IvXxEjZFIP25vmOA

# Nível de log: debug, info, warn, error
LOG_LEVEL=info
EOF

log_success "Arquivo .env criado"

# ==========================================
# Criar diretório de sessões
# ==========================================
mkdir -p sessions
chmod 755 sessions
log_success "Diretório de sessões criado"

# ==========================================
# Parar containers existentes (se houver)
# ==========================================
if docker ps -a --filter "name=baileys-server" -q | grep -q .; then
    log_info "Parando container existente..."
    $DOCKER_COMPOSE down 2>/dev/null || docker stop baileys-server 2>/dev/null || true
    docker rm baileys-server 2>/dev/null || true
fi

# ==========================================
# Build e iniciar container
# ==========================================
log_info "Construindo imagem Docker (pode demorar alguns minutos)..."
$DOCKER_COMPOSE build --no-cache

log_info "Iniciando container..."
$DOCKER_COMPOSE up -d

# ==========================================
# Aguardar inicialização
# ==========================================
log_info "Aguardando servidor iniciar..."
sleep 10

# Verificar health
RETRIES=6
while [ $RETRIES -gt 0 ]; do
    HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null || echo "000")
    if [ "$HEALTH_CHECK" = "200" ]; then
        log_success "Servidor Baileys rodando na porta 3000!"
        break
    fi
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -gt 0 ]; then
        log_info "Aguardando... ($RETRIES tentativas restantes)"
        sleep 5
    fi
done

if [ "$HEALTH_CHECK" != "200" ]; then
    log_warning "Servidor pode estar iniciando. Verifique os logs:"
    echo "  $DOCKER_COMPOSE logs -f"
fi

# ==========================================
# Gerar snippet Nginx
# ==========================================
cat > nginx-snippet.conf << 'NGINX_EOF'
# ============================================
# Baileys WhatsApp Server - Snippet Nginx
# Adicione este bloco dentro do seu server {} que escuta 443
# ============================================

location /baileys/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
    proxy_connect_timeout 60s;
}
NGINX_EOF

log_success "Snippet Nginx gerado: nginx-snippet.conf"

# ==========================================
# Salvar credenciais
# ==========================================
cat > CREDENCIAIS.txt << EOF
============================================
BAILEYS WHATSAPP SERVER - CREDENCIAIS
Gerado em: $(date)
============================================

API KEY: $API_KEY

WEBHOOK URL: $WEBHOOK_URL

SERVER IP: $SERVER_IP

============================================
PRÓXIMOS PASSOS:
============================================

1. Configure o Nginx do seu VPS para fazer proxy:

   Edite seu arquivo de configuração Nginx:
   sudo nano /etc/nginx/sites-available/default
   (ou o arquivo do seu domínio)

   Adicione DENTRO do bloco server {} que escuta 443:

   location /baileys/ {
       proxy_pass http://127.0.0.1:3000/;
       proxy_http_version 1.1;
       proxy_set_header Upgrade \$http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host \$host;
       proxy_set_header X-Real-IP \$remote_addr;
       proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto \$scheme;
       proxy_read_timeout 300s;
   }

2. Teste e recarregue o Nginx:
   sudo nginx -t && sudo systemctl reload nginx

3. Teste a conexão:
   curl -H "X-API-Key: $API_KEY" https://SEU_DOMINIO/baileys/health

4. Configure no sistema:
   - URL do Baileys: https://SEU_DOMINIO/baileys
   - API Key: $API_KEY

============================================
COMANDOS ÚTEIS:
============================================

Ver logs:        $DOCKER_COMPOSE logs -f
Reiniciar:       $DOCKER_COMPOSE restart
Parar:           $DOCKER_COMPOSE down
Diagnóstico:     ./scripts/diagnostico.sh

============================================
EOF

log_success "Credenciais salvas em: CREDENCIAIS.txt"

# ==========================================
# Resumo Final
# ==========================================
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       INSTALAÇÃO CONCLUÍDA COM SUCESSO!                    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Informações importantes:${NC}"
echo ""
echo "  Container Baileys: rodando na porta 3000"
echo "  API Key: ${API_KEY:0:16}..."
echo "  Webhook: $WEBHOOK_URL"
echo ""
echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  AÇÃO NECESSÁRIA: Configure o proxy no Nginx do host       ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  1. Edite o Nginx do seu VPS:"
echo "     sudo nano /etc/nginx/sites-available/default"
echo ""
echo "  2. Adicione dentro do bloco server {} que escuta 443:"
echo ""
echo -e "${CYAN}     location /baileys/ {"
echo "         proxy_pass http://127.0.0.1:3000/;"
echo "         proxy_http_version 1.1;"
echo "         proxy_set_header Host \$host;"
echo "         proxy_set_header X-Real-IP \$remote_addr;"
echo "         proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
echo "         proxy_set_header X-Forwarded-Proto \$scheme;"
echo "         proxy_read_timeout 300s;"
echo -e "     }${NC}"
echo ""
echo "  3. Teste e recarregue:"
echo "     sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "  4. Verifique se funciona:"
echo "     curl https://SEU_DOMINIO/baileys/health"
echo ""
echo -e "${GREEN}Credenciais completas salvas em: CREDENCIAIS.txt${NC}"
echo ""
