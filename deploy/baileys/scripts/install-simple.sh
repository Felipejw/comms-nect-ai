#!/bin/bash
set -e

# ============================================
# Baileys WhatsApp Server - Instalação Simplificada
# Com configuração automática de Nginx + SSL
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
echo "║       BAILEYS WHATSAPP SERVER - INSTALAÇÃO COMPLETA        ║"
echo "║       Docker + Nginx + SSL automáticos                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ==========================================
# Perguntar domínio e email
# ==========================================
echo -e "${CYAN}Configuração inicial:${NC}"
echo ""
read -p "  Digite o domínio do servidor (ex: chatbotvital.store): " USER_DOMAIN
echo ""

if [ -z "$USER_DOMAIN" ]; then
    log_error "Domínio não pode ser vazio!"
    exit 1
fi

# Remover protocolo se o usuário digitou com https://
USER_DOMAIN=$(echo "$USER_DOMAIN" | sed 's|https\?://||' | sed 's|/.*||')

read -p "  Digite seu email (para certificado SSL): " SSL_EMAIL
echo ""

if [ -z "$SSL_EMAIL" ]; then
    log_warning "Email não informado. Usando email genérico para SSL."
    SSL_EMAIL="admin@${USER_DOMAIN}"
fi

log_success "Domínio: $USER_DOMAIN"
log_success "Email SSL: $SSL_EMAIL"
echo ""

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
# Instalar Nginx
# ==========================================
log_info "Verificando Nginx..."

if ! command -v nginx &> /dev/null; then
    log_info "Nginx não encontrado. Instalando..."
    apt-get update -qq
    apt-get install -y nginx
    systemctl enable nginx
    systemctl start nginx
    log_success "Nginx instalado"
else
    log_success "Nginx já instalado"
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

# Domínio
DOMAIN=$USER_DOMAIN

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
# Configurar Nginx com proxy reverso
# ==========================================
log_info "Configurando Nginx para $USER_DOMAIN..."

# Remover config anterior do baileys se existir
rm -f /etc/nginx/sites-enabled/baileys
rm -f /etc/nginx/sites-available/baileys

cat > /etc/nginx/sites-available/baileys << NGINX_EOF
server {
    listen 80;
    server_name $USER_DOMAIN;

    location /baileys/ {
        rewrite ^/baileys/(.*)\$ /\$1 break;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 60s;
    }
}
NGINX_EOF

ln -sf /etc/nginx/sites-available/baileys /etc/nginx/sites-enabled/baileys

# Testar e recarregar Nginx
if nginx -t 2>/dev/null; then
    systemctl reload nginx
    log_success "Nginx configurado e recarregado"
else
    log_error "Erro na configuração do Nginx. Verifique manualmente."
    nginx -t
fi

# ==========================================
# Obter certificado SSL com Certbot
# ==========================================
log_info "Configurando SSL com Let's Encrypt..."

# Instalar Certbot se necessário
if ! command -v certbot &> /dev/null; then
    log_info "Instalando Certbot..."
    apt-get update -qq
    apt-get install -y certbot python3-certbot-nginx
    log_success "Certbot instalado"
fi

# Obter certificado SSL
log_info "Obtendo certificado SSL para $USER_DOMAIN..."
if certbot --nginx -d "$USER_DOMAIN" --non-interactive --agree-tos -m "$SSL_EMAIL" --redirect 2>/dev/null; then
    log_success "Certificado SSL obtido e configurado!"
    BAILEYS_URL="https://$USER_DOMAIN/baileys"
else
    log_warning "Não foi possível obter certificado SSL automaticamente."
    log_warning "Possíveis causas:"
    echo "  - DNS do domínio $USER_DOMAIN não aponta para este servidor ($SERVER_IP)"
    echo "  - Porta 80 bloqueada no firewall"
    echo ""
    log_info "Você pode tentar manualmente depois:"
    echo "  sudo certbot --nginx -d $USER_DOMAIN"
    echo ""
    BAILEYS_URL="http://$USER_DOMAIN/baileys"
fi

# ==========================================
# Salvar credenciais
# ==========================================
cat > CREDENCIAIS.txt << EOF
============================================
BAILEYS WHATSAPP SERVER - CREDENCIAIS
Gerado em: $(date)
============================================

DOMÍNIO: $USER_DOMAIN
URL DO BAILEYS: $BAILEYS_URL
API KEY: $API_KEY
WEBHOOK URL: $WEBHOOK_URL
SERVER IP: $SERVER_IP

============================================
CREDENCIAIS DE ACESSO AO PAINEL
============================================

Email:  admin@admin.com
Senha:  123456

⚠️  IMPORTANTE: Troque a senha após o primeiro login!

============================================
COMO CONFIGURAR NO SISTEMA
============================================

1. Acesse o painel do sistema
2. Vá em Configurações > Baileys
3. Preencha:
   - URL do Baileys: $BAILEYS_URL
   - API Key: $API_KEY

============================================
COMANDOS ÚTEIS
============================================

Ver logs:        cd $INSTALL_DIR && $DOCKER_COMPOSE logs -f
Reiniciar:       cd $INSTALL_DIR && $DOCKER_COMPOSE restart
Parar:           cd $INSTALL_DIR && $DOCKER_COMPOSE down
Diagnóstico:     cd $INSTALL_DIR && ./scripts/diagnostico.sh
Renovar SSL:     sudo certbot renew

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
echo -e "${CYAN}Informações do Baileys:${NC}"
echo ""
echo "  URL do Baileys:  $BAILEYS_URL"
echo "  API Key:         $API_KEY"
echo "  Webhook:         $WEBHOOK_URL"
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  CREDENCIAIS DE ACESSO AO PAINEL                          ║${NC}"
echo -e "${CYAN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║                                                            ║${NC}"
echo -e "${CYAN}║  Email:  ${GREEN}admin@admin.com${CYAN}                                  ║${NC}"
echo -e "${CYAN}║  Senha:  ${GREEN}123456${CYAN}                                           ║${NC}"
echo -e "${CYAN}║                                                            ║${NC}"
echo -e "${CYAN}║  ${YELLOW}⚠️  Troque a senha após o primeiro login!${CYAN}                ║${NC}"
echo -e "${CYAN}║                                                            ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Como configurar no sistema:${NC}"
echo ""
echo "  1. Acesse o painel do sistema"
echo "  2. Vá em Configurações > Baileys"
echo "  3. Preencha:"
echo "     - URL do Baileys: $BAILEYS_URL"
echo "     - API Key: $API_KEY"
echo ""
echo -e "${GREEN}Credenciais completas salvas em: CREDENCIAIS.txt${NC}"
echo ""
