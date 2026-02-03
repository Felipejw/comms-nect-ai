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
CYAN='\033[0;36m'
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
# Checklist de Pre-requisitos
# ==========================================
echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   ANTES DE CONTINUAR, VOCE PRECISA TER:                   ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║                                                            ║"
echo "║   PARA PRODUCAO (com SSL):                                ║"
echo "║   1. Um dominio apontando para este servidor              ║"
echo "║      (ex: baileys.seusite.com.br)                         ║"
echo "║   2. Portas 80 e 443 liberadas no firewall                ║"
echo "║   3. Um email valido (para certificado SSL)               ║"
echo "║                                                            ║"
echo "║   PARA DESENVOLVIMENTO/TESTE:                             ║"
echo "║   - Apenas porta 3000 liberada (sem SSL)                  ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

read -p "Tem tudo pronto? [s/N] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo ""
    log_info "Configure os pre-requisitos e execute novamente."
    log_info "Para liberar portas no Ubuntu/Debian:"
    echo "  sudo ufw allow 80/tcp"
    echo "  sudo ufw allow 443/tcp"
    echo "  sudo ufw allow 3000/tcp"
    echo ""
    exit 0
fi

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
# Escolher modo de instalacao
# ==========================================
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   ESCOLHA O MODO DE INSTALACAO                            ║${NC}"
echo -e "${CYAN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║                                                            ║${NC}"
echo -e "${CYAN}║   1) Com dominio e SSL (producao) - ${GREEN}RECOMENDADO${CYAN}           ║${NC}"
echo -e "${CYAN}║   2) Apenas IP, sem SSL (desenvolvimento/teste)           ║${NC}"
echo -e "${CYAN}║                                                            ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
read -p "Opcao [1]: " INSTALL_MODE
INSTALL_MODE=${INSTALL_MODE:-1}

# Variaveis de controle
USE_SSL=true
DOMAIN=""
SSL_EMAIL=""

if [ "$INSTALL_MODE" = "2" ]; then
    # ==========================================
    # Modo Desenvolvimento (sem SSL)
    # ==========================================
    log_warning "Modo desenvolvimento selecionado - SSL desabilitado"
    USE_SSL=false
    
    # Obter IP publico
    log_info "Obtendo IP publico do servidor..."
    DOMAIN=$(curl -s ifconfig.me || curl -s icanhazip.com || curl -s ipinfo.io/ip)
    
    if [ -z "$DOMAIN" ]; then
        log_error "Nao foi possivel obter o IP publico do servidor."
        read -p "Digite o IP do servidor manualmente: " DOMAIN
        if [ -z "$DOMAIN" ]; then
            log_error "IP e obrigatorio"
            exit 1
        fi
    fi
    
    log_success "Servidor sera acessivel em: http://$DOMAIN:3000"
    
else
    # ==========================================
    # Modo Producao (com SSL)
    # ==========================================
    USE_SSL=true
    
    # Coletar dominio com validacao e retry
    echo ""
    log_info "Configuracao do dominio"
    echo ""
    
    while true; do
        read -p "Digite o dominio (ex: baileys.meusite.com.br): " DOMAIN
        
        # Verificar se esta vazio
        if [ -z "$DOMAIN" ]; then
            log_warning "Dominio nao pode ser vazio. Tente novamente."
            continue
        fi
        
        # Validar formato basico do dominio
        if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$ ]]; then
            log_warning "Formato invalido. Use algo como: baileys.seusite.com.br"
            continue
        fi
        
        break
    done
    
    # ==========================================
    # Verificar DNS
    # ==========================================
    log_info "Verificando configuracao de DNS..."
    
    # Instalar dnsutils se necessario
    if ! command -v dig &> /dev/null; then
        apt-get update -qq && apt-get install -y -qq dnsutils 2>/dev/null || true
    fi
    
    # Obter IP publico do servidor
    SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || curl -s ipinfo.io/ip)
    
    # Resolver dominio
    DOMAIN_IP=""
    if command -v dig &> /dev/null; then
        DOMAIN_IP=$(dig +short "$DOMAIN" | head -1)
    elif command -v nslookup &> /dev/null; then
        DOMAIN_IP=$(nslookup "$DOMAIN" 2>/dev/null | grep -A1 "Name:" | grep "Address" | awk '{print $2}' | head -1)
    fi
    
    if [ -n "$SERVER_IP" ] && [ -n "$DOMAIN_IP" ]; then
        if [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
            echo ""
            log_warning "ATENCAO: O dominio $DOMAIN pode nao apontar para este servidor!"
            log_warning "  IP deste servidor: $SERVER_IP"
            log_warning "  IP do dominio:     $DOMAIN_IP"
            echo ""
            log_info "Isso pode causar falha ao obter o certificado SSL."
            echo ""
            read -p "Deseja continuar mesmo assim? [s/N] " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Ss]$ ]]; then
                echo ""
                log_info "Configure o DNS para apontar $DOMAIN para $SERVER_IP"
                log_info "Aguarde a propagacao (pode levar alguns minutos) e execute novamente."
                echo ""
                exit 0
            fi
        else
            log_success "DNS verificado: $DOMAIN aponta para $SERVER_IP"
        fi
    else
        log_warning "Nao foi possivel verificar o DNS. Continuando..."
    fi
    
    # Coletar email para SSL com validacao
    echo ""
    while true; do
        read -p "Digite seu email (para SSL Let's Encrypt): " SSL_EMAIL
        
        if [ -z "$SSL_EMAIL" ]; then
            log_warning "Email e obrigatorio para o certificado SSL. Tente novamente."
            continue
        fi
        
        # Validacao basica de email
        if [[ ! "$SSL_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
            log_warning "Formato de email invalido. Tente novamente."
            continue
        fi
        
        break
    done
fi

# ==========================================
# Webhook URL (opcional para ambos os modos)
# ==========================================
echo ""
read -p "Digite a URL do webhook (Supabase Edge Function) [opcional]: " WEBHOOK_URL
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
if [ "$USE_SSL" = true ]; then
    cat > .env << EOF
# Configuracao Baileys WhatsApp Server
# Gerado em $(date)
# Modo: Producao (com SSL)

DOMAIN=$DOMAIN
API_KEY=$API_KEY
SSL_EMAIL=$SSL_EMAIL
WEBHOOK_URL=$WEBHOOK_URL
USE_SSL=true
HTTP_PORT=80
HTTPS_PORT=443
LOG_LEVEL=info
EOF
else
    cat > .env << EOF
# Configuracao Baileys WhatsApp Server
# Gerado em $(date)
# Modo: Desenvolvimento (sem SSL)

DOMAIN=$DOMAIN
API_KEY=$API_KEY
SSL_EMAIL=
WEBHOOK_URL=$WEBHOOK_URL
USE_SSL=false
HTTP_PORT=3000
HTTPS_PORT=
LOG_LEVEL=debug
EOF
fi

log_success "Arquivo .env criado"

# Configurar nginx (apenas se usar SSL)
if [ "$USE_SSL" = true ]; then
    # Criar estrutura de diretorios
    mkdir -p nginx/ssl
    
    # Verificar se nginx.conf existe como diretorio (erro comum) e remover
    if [ -d "nginx/nginx.conf" ]; then
        log_warning "Removendo diretorio nginx/nginx.conf incorreto..."
        rm -rf "nginx/nginx.conf"
    fi
    
    # Gerar nginx.conf a partir do template
    if [ -f "nginx/nginx.conf.template" ]; then
        sed "s/\${DOMAIN}/$DOMAIN/g" "nginx/nginx.conf.template" > "nginx/nginx.conf"
        log_success "Nginx configurado para $DOMAIN"
    else
        log_warning "Template nginx.conf.template nao encontrado. Criando configuracao padrao..."
        cat > "nginx/nginx.conf" << NGINX_EOF
# Configuracao Nginx gerada automaticamente
events {
    worker_connections 1024;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 50M;

    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    upstream baileys {
        server baileys:3000;
    }

    server {
        listen 80;
        server_name $DOMAIN;
        
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        
        location / {
            return 301 https://\$host\$request_uri;
        }
    }

    server {
        listen 443 ssl http2;
        server_name $DOMAIN;

        ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

        ssl_session_timeout 1d;
        ssl_session_cache shared:SSL:50m;
        ssl_session_tickets off;

        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;

        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";

        location / {
            proxy_pass http://baileys;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_read_timeout 86400;
        }
    }
}
NGINX_EOF
        log_success "Nginx configurado com configuracao padrao"
    fi
fi

# ==========================================
# Instalar Certbot e obter certificado (apenas modo producao)
# ==========================================
if [ "$USE_SSL" = true ]; then
    log_info "Configurando SSL com Let's Encrypt..."
    
    # Instalar certbot
    if ! command -v certbot &> /dev/null; then
        apt-get update -qq
        apt-get install -y -qq certbot
    fi
    
    # Obter certificado (modo standalone)
    log_info "Obtendo certificado SSL para $DOMAIN..."
    certbot certonly --standalone -d "$DOMAIN" --email "$SSL_EMAIL" --agree-tos --non-interactive || {
        echo ""
        log_warning "Falha ao obter certificado SSL."
        log_warning "Possiveis causas:"
        log_warning "  1. O dominio $DOMAIN nao aponta para este servidor"
        log_warning "  2. As portas 80 e 443 nao estao liberadas"
        log_warning "  3. Ja existe um servico usando a porta 80"
        echo ""
        log_info "Voce pode:"
        log_info "  1. Corrigir o problema e executar novamente"
        log_info "  2. Obter o certificado manualmente depois com:"
        echo "     certbot certonly --standalone -d $DOMAIN"
        echo ""
        read -p "Deseja continuar sem SSL (modo desenvolvimento)? [s/N] " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Ss]$ ]]; then
            USE_SSL=false
            log_warning "Continuando sem SSL..."
            # Atualizar .env para modo sem SSL
            sed -i 's/USE_SSL=true/USE_SSL=false/' .env
            sed -i 's/HTTP_PORT=80/HTTP_PORT=3000/' .env
        else
            exit 1
        fi
    }
fi

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
if [ "$USE_SSL" = true ]; then
    HEALTH_URL="https://$DOMAIN/health"
    SERVER_URL="https://$DOMAIN"
else
    HEALTH_URL="http://localhost:3000/health"
    SERVER_URL="http://$DOMAIN:3000"
fi

HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null || echo "000")
if [ "$HEALTH_CHECK" = "200" ]; then
    log_success "Servidor Baileys esta rodando!"
else
    log_warning "Servidor pode estar iniciando. Verifique os logs: $DOCKER_COMPOSE logs -f"
fi

# ==========================================
# Resumo
# ==========================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}   INSTALACAO CONCLUIDA!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Informacoes importantes:"
echo ""
if [ "$USE_SSL" = true ]; then
    echo "  Modo: PRODUCAO (com SSL)"
    echo "  URL do servidor: https://$DOMAIN"
else
    echo "  Modo: DESENVOLVIMENTO (sem SSL)"
    echo "  URL do servidor: http://$DOMAIN:3000"
fi
echo "  API Key: $API_KEY"
echo ""
echo "Para testar a conexao:"
if [ "$USE_SSL" = true ]; then
    echo "  curl -H 'X-API-Key: $API_KEY' https://$DOMAIN/health"
else
    echo "  curl -H 'X-API-Key: $API_KEY' http://$DOMAIN:3000/health"
fi
echo ""
echo "Para ver os logs:"
echo "  $DOCKER_COMPOSE logs -f"
echo ""
echo "Para diagnostico completo:"
echo "  ./scripts/diagnostico.sh"
echo ""
echo "Configure no seu sistema:"
echo "  - URL do servidor Baileys: $SERVER_URL"
echo "  - API Key: $API_KEY"
echo ""
echo "============================================"
