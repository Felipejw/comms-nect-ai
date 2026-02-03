#!/bin/bash
set -e

# ============================================
# Instalador Baileys WhatsApp Server
# ============================================

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

# Verificar se e root
if [ "$EUID" -ne 0 ]; then
    log_error "Execute como root: sudo ./install.sh"
    exit 1
fi

echo ""
echo "============================================"
echo "   Baileys WhatsApp Server - Instalador"
echo "============================================"
echo ""

# ==========================================
# Verificar Docker
# ==========================================
log_info "Verificando Docker..."

if ! command -v docker &> /dev/null; then
    log_info "Docker nao encontrado. Instalando..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    log_success "Docker instalado"
else
    log_success "Docker ja instalado"
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    log_info "Docker Compose nao encontrado. Instalando..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    log_success "Docker Compose instalado"
else
    log_success "Docker Compose ja instalado"
fi

# Determinar comando do Docker Compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# ==========================================
# Coletar informacoes
# ==========================================
echo ""
log_info "Configuracao do servidor Baileys"
echo ""

# Dominio
read -p "Digite o dominio (ex: baileys.meusite.com.br): " DOMAIN
if [ -z "$DOMAIN" ]; then
    log_error "Dominio e obrigatorio"
    exit 1
fi

# Email para SSL
read -p "Digite seu email (para SSL Let's Encrypt): " SSL_EMAIL
if [ -z "$SSL_EMAIL" ]; then
    log_error "Email e obrigatorio"
    exit 1
fi

# Webhook URL
read -p "Digite a URL do webhook (Supabase Edge Function): " WEBHOOK_URL
if [ -z "$WEBHOOK_URL" ]; then
    log_warning "Webhook URL nao informada. Eventos nao serao enviados."
fi

# Gerar API Key
API_KEY=$(openssl rand -hex 32)
log_success "API Key gerada: $API_KEY"

# ==========================================
# Configurar arquivos
# ==========================================
INSTALL_DIR="$(pwd)"
log_info "Diretorio de instalacao: $INSTALL_DIR"

# Criar arquivo .env
cat > .env << EOF
# Configuracao Baileys WhatsApp Server
# Gerado em $(date)

DOMAIN=$DOMAIN
API_KEY=$API_KEY
SSL_EMAIL=$SSL_EMAIL
WEBHOOK_URL=$WEBHOOK_URL
HTTP_PORT=80
HTTPS_PORT=443
LOG_LEVEL=info
EOF

log_success "Arquivo .env criado"

# Configurar nginx
mkdir -p nginx
sed "s/\${DOMAIN}/$DOMAIN/g" nginx/nginx.conf.template > nginx/nginx.conf
log_success "Nginx configurado"

# ==========================================
# Instalar Certbot e obter certificado
# ==========================================
log_info "Configurando SSL com Let's Encrypt..."

# Instalar certbot
if ! command -v certbot &> /dev/null; then
    apt-get update
    apt-get install -y certbot
fi

# Obter certificado (modo standalone)
log_info "Obtendo certificado SSL para $DOMAIN..."
certbot certonly --standalone -d "$DOMAIN" --email "$SSL_EMAIL" --agree-tos --non-interactive || {
    log_warning "Falha ao obter certificado. Certifique-se que:"
    log_warning "  1. O dominio $DOMAIN aponta para este servidor"
    log_warning "  2. As portas 80 e 443 estao liberadas no firewall"
    log_warning ""
    log_warning "Voce pode obter o certificado manualmente depois com:"
    log_warning "  certbot certonly --standalone -d $DOMAIN"
}

# ==========================================
# Build e iniciar containers
# ==========================================
log_info "Construindo imagem Docker..."
$DOCKER_COMPOSE build

log_info "Iniciando containers..."
$DOCKER_COMPOSE up -d

# ==========================================
# Aguardar inicializacao
# ==========================================
log_info "Aguardando servicos iniciarem..."
sleep 10

# Verificar health
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health || echo "000")
if [ "$HEALTH_CHECK" = "200" ]; then
    log_success "Servidor Baileys esta rodando!"
else
    log_warning "Servidor pode estar iniciando. Verifique os logs: $DOCKER_COMPOSE logs -f"
fi

# ==========================================
# Resumo
# ==========================================
echo ""
echo "============================================"
echo "   INSTALACAO CONCLUIDA!"
echo "============================================"
echo ""
echo "Informacoes importantes:"
echo ""
echo "  URL do servidor: https://$DOMAIN"
echo "  API Key: $API_KEY"
echo ""
echo "Para testar a conexao:"
echo "  curl -H 'X-API-Key: $API_KEY' https://$DOMAIN/health"
echo ""
echo "Para ver os logs:"
echo "  $DOCKER_COMPOSE logs -f"
echo ""
echo "Configure no seu sistema:"
echo "  - URL do servidor Baileys: https://$DOMAIN"
echo "  - API Key: $API_KEY"
echo ""
echo "============================================"
