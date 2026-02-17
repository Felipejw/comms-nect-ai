#!/bin/bash

# ============================================
# Script de Instalação - Sistema de Atendimento
# Self-Hosted com Supabase + Baileys
# Versão: Instalação Automatizada Robusta
# ============================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funções de log
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
log_error() { echo -e "${RED}[ERRO]${NC} $1"; }

# Diretório do script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

cd "$DEPLOY_DIR"

# Ler versão
VERSION=$(cat VERSION 2>/dev/null || echo "3.0.0")

# Banner
echo -e "${BLUE}"
echo "============================================"
echo "  Sistema de Atendimento - Instalação"
echo "  Self-Hosted com Supabase + Baileys"
echo "  Versão: $VERSION"
echo "============================================"
echo -e "${NC}"

# ==========================================
# FUNÇÕES AUXILIARES
# ==========================================

# Função para validar configuração antes de iniciar
validate_configuration() {
    local errors=0
    
    log_info "Validando configuração..."
    
    # Verificar arquivos críticos
    if [ ! -f "volumes/kong/kong.yml" ]; then
        log_error "kong.yml não existe"
        errors=$((errors+1))
    fi
    
    if [ ! -f "nginx/nginx.conf" ]; then
        log_error "nginx.conf não existe"
        errors=$((errors+1))
    fi
    
    if [ ! -f "frontend/dist/index.html" ]; then
        log_error "Frontend não compilado (frontend/dist/index.html não existe)"
        errors=$((errors+1))
    fi
    
    if [ ! -f "nginx/ssl/fullchain.pem" ]; then
        log_error "Certificado SSL não existe"
        errors=$((errors+1))
    fi
    
    # Verificar .env
    if ! grep -q "^JWT_SECRET=.\{32,\}" .env 2>/dev/null; then
        log_error "JWT_SECRET inválido ou não definido"
        errors=$((errors+1))
    fi
    
    if ! grep -q "^ANON_KEY=.\{50,\}" .env 2>/dev/null; then
        log_error "ANON_KEY inválido ou não definido"
        errors=$((errors+1))
    fi
    
    if ! grep -q "^SERVICE_ROLE_KEY=.\{50,\}" .env 2>/dev/null; then
        log_error "SERVICE_ROLE_KEY inválido ou não definido"
        errors=$((errors+1))
    fi
    
    if [ $errors -gt 0 ]; then
        log_error "Validação falhou com $errors erro(s)"
        return 1
    fi
    
    log_success "Validação concluída sem erros"
    return 0
}

# ==========================================
# 1. Verificar Requisitos
# ==========================================
log_info "Verificando requisitos do sistema..."

# Verificar se é root ou tem sudo
if [ "$EUID" -ne 0 ]; then 
    if ! command -v sudo &> /dev/null; then
        log_error "Este script precisa ser executado como root ou com sudo"
        exit 1
    fi
    SUDO="sudo"
else
    SUDO=""
fi

# Verificar Docker
if ! command -v docker &> /dev/null; then
    log_warning "Docker não encontrado. Instalando..."
    curl -fsSL https://get.docker.com | $SUDO sh
    $SUDO usermod -aG docker $USER
    log_success "Docker instalado"
else
    log_success "Docker encontrado: $(docker --version)"
fi

# Verificar Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    log_warning "Docker Compose não encontrado. Instalando..."
    $SUDO curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    $SUDO chmod +x /usr/local/bin/docker-compose
    log_success "Docker Compose instalado"
else
    log_success "Docker Compose encontrado"
fi

# Detectar comando do Docker Compose
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

# ==========================================
# 2. Verificar/Compilar Frontend
# ==========================================
log_info "Verificando frontend..."

# Detectar se estamos em instalação via GitHub (sem frontend compilado)
if [ ! -d "frontend/dist" ] || [ ! -f "frontend/dist/index.html" ]; then
    log_warning "Frontend pré-compilado não encontrado."
    log_info "Detectado instalação via GitHub. Compilando frontend..."
    
    # Salvar diretório atual
    CURRENT_DIR=$(pwd)
    PROJECT_ROOT=$(dirname "$DEPLOY_DIR")
    
    # Verificar se package.json existe no diretório raiz
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        log_error "package.json não encontrado em $PROJECT_ROOT"
        log_error "Certifique-se de ter clonado o repositório completo."
        exit 1
    fi
    
    # Verificar/Instalar Node.js
    if ! command -v node &> /dev/null; then
        log_info "Node.js não encontrado. Instalando Node.js 18..."
        
        # Detectar sistema operacional
        if [ -f /etc/debian_version ]; then
            # Debian/Ubuntu
            curl -fsSL https://deb.nodesource.com/setup_18.x | $SUDO bash -
            $SUDO apt-get install -y nodejs
        elif [ -f /etc/redhat-release ]; then
            # CentOS/RHEL/Fedora
            curl -fsSL https://rpm.nodesource.com/setup_18.x | $SUDO bash -
            $SUDO yum install -y nodejs
        else
            log_error "Sistema operacional não suportado para instalação automática do Node.js"
            log_error "Por favor, instale o Node.js 18+ manualmente e execute novamente."
            exit 1
        fi
        
        log_success "Node.js instalado: $(node --version)"
    else
        NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -lt 18 ]; then
            log_warning "Node.js versão $(node --version) detectada. Recomendado v18+"
        fi
        log_success "Node.js encontrado: $(node --version)"
    fi
    
    # Verificar npm
    if ! command -v npm &> /dev/null; then
        log_error "npm não encontrado. Por favor, instale o Node.js corretamente."
        exit 1
    fi
    
    log_info "Instalando dependências do frontend..."
    cd "$PROJECT_ROOT"
    
    # Limpar cache npm se necessário
    npm cache clean --force 2>/dev/null || true
    
    # Instalar dependências
    if ! npm install; then
        log_error "Falha ao instalar dependências npm"
        exit 1
    fi
    log_success "Dependências instaladas"
    
    # Criar arquivo .env temporário para build
    log_info "Configurando variáveis de build..."
    cat > .env << EOF
VITE_SUPABASE_URL=https://placeholder.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=placeholder
VITE_SUPABASE_PROJECT_ID=placeholder
EOF
    
    # Compilar frontend
    log_info "Compilando frontend (pode levar alguns minutos)..."
    if ! npm run build; then
        log_error "Falha ao compilar frontend"
        rm -f .env
        exit 1
    fi
    log_success "Frontend compilado"
    
    # Verificar se build gerou index.html
    if [ ! -f "$PROJECT_ROOT/dist/index.html" ]; then
        log_error "Build não gerou index.html. Verifique os erros acima."
        rm -f .env
        exit 1
    fi
    
    # Remover .env temporário
    rm -f .env
    
    # Criar diretório frontend e copiar dist
    mkdir -p "$DEPLOY_DIR/frontend"
    cp -r dist "$DEPLOY_DIR/frontend/"
    
    # Voltar ao diretório deploy
    cd "$CURRENT_DIR"
    
    log_success "Frontend compilado e copiado para deploy/frontend/dist/"
fi

# Verificação final
if [ ! -f "frontend/dist/index.html" ]; then
    log_error "Falha na preparação do frontend. Arquivo index.html não encontrado."
    log_error "Verifique se o build do frontend foi executado corretamente."
    exit 1
fi

log_success "Frontend pronto"

# ==========================================
# 3. Configurar Variáveis de Ambiente
# ==========================================
log_info "Configurando variáveis de ambiente..."

# Backup do .env existente (sem prompt)
if [ -f .env ]; then
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    log_info "Backup do .env anterior salvo"
fi

# Copiar template
cp .env.example .env

# ==========================================
# CONFIGURAÇÃO 100% AUTOMÁTICA (ZERO PROMPTS)
# ==========================================

# Detectar domínio: usar variável de ambiente ou IP público
if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "seu-dominio.com.br" ]; then
    log_info "Detectando IP público do servidor..."
    DOMAIN=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "localhost")
    log_success "Usando IP/Domínio: $DOMAIN"
fi

# SSL Email: usar variável de ambiente ou gerar baseado no domínio
if [ -z "$SSL_EMAIL" ]; then
    SSL_EMAIL="admin@${DOMAIN}"
fi
log_info "Email SSL: $SSL_EMAIL"

# Gerar senha do banco automaticamente (24 caracteres alfanuméricos)
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24)
log_success "Senha do banco gerada automaticamente"

# Gerar JWT Secret (64 caracteres hexadecimais)
JWT_SECRET=$(openssl rand -hex 32)
log_success "JWT Secret gerado"

# Gerar chaves JWT usando o formato correto
generate_jwt_key() {
    local role=$1
    local header='{"alg":"HS256","typ":"JWT"}'
    local payload="{\"role\":\"$role\",\"iss\":\"supabase\",\"iat\":$(date +%s),\"exp\":$(($(date +%s) + 315360000))}"
    
    local header_base64=$(echo -n "$header" | base64 -w 0 | tr '+/' '-_' | tr -d '=')
    local payload_base64=$(echo -n "$payload" | base64 -w 0 | tr '+/' '-_' | tr -d '=')
    
    local signature=$(echo -n "$header_base64.$payload_base64" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | base64 -w 0 | tr '+/' '-_' | tr -d '=')
    
    echo "$header_base64.$payload_base64.$signature"
}

ANON_KEY=$(generate_jwt_key "anon")
SERVICE_ROLE_KEY=$(generate_jwt_key "service_role")
log_success "Chaves JWT geradas"

# Gerar chave do Baileys
BAILEYS_API_KEY=$(openssl rand -hex 32)
log_success "Chave BAILEYS_API_KEY gerada"

WEBHOOK_URL="http://kong:8000/functions/v1/baileys-webhook"

# Gerar credenciais do admin automaticamente
ADMIN_EMAIL="admin@${DOMAIN}"
ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
ADMIN_NAME="Administrador"
log_success "Credenciais do admin geradas automaticamente"

# Atualizar .env
sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" .env
sed -i "s|^SSL_EMAIL=.*|SSL_EMAIL=$SSL_EMAIL|" .env
sed -i "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=https://$DOMAIN|" .env
sed -i "s|^SITE_URL=.*|SITE_URL=https://$DOMAIN|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" .env
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
sed -i "s|^ANON_KEY=.*|ANON_KEY=$ANON_KEY|" .env
sed -i "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY|" .env
sed -i "s|^BAILEYS_API_KEY=.*|BAILEYS_API_KEY=$BAILEYS_API_KEY|" .env
sed -i "s|^BAILEYS_EXTERNAL_URL=.*|BAILEYS_EXTERNAL_URL=https://$DOMAIN/baileys|" .env
sed -i "s|^WEBHOOK_URL=.*|WEBHOOK_URL=$WEBHOOK_URL|" .env
sed -i "s|^VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=https://$DOMAIN|" .env
sed -i "s|^VITE_SUPABASE_PUBLISHABLE_KEY=.*|VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY|" .env

log_success "Arquivo .env configurado"

# ==========================================
# 4. Criar Estrutura de Diretórios
# ==========================================
log_info "Criando estrutura de diretórios..."

mkdir -p volumes/db/data
mkdir -p volumes/db/init
mkdir -p volumes/storage
mkdir -p volumes/kong
mkdir -p volumes/baileys/sessions
mkdir -p nginx/ssl
mkdir -p backups

log_success "Diretórios criados"

# ==========================================
# 5. Gerar Configuração do Kong (APÓS variáveis definidas)
# ==========================================
log_info "Configurando Kong API Gateway..."

# Verificar se as chaves foram definidas
if [ -z "$ANON_KEY" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
    # Carregar do .env se não estiverem definidas
    source .env 2>/dev/null || true
fi

# Verificar novamente
if [ -z "$ANON_KEY" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
    log_error "ANON_KEY ou SERVICE_ROLE_KEY não definidas. Verifique o arquivo .env"
    exit 1
fi

# Gerar kong.yml usando cat com variáveis interpoladas CORRETAMENTE
cat > volumes/kong/kong.yml << EOF
_format_version: "2.1"
_transform: true

consumers:
  - username: anon
    keyauth_credentials:
      - key: $ANON_KEY
  - username: service_role
    keyauth_credentials:
      - key: $SERVICE_ROLE_KEY

acls:
  - consumer: anon
    group: anon
  - consumer: service_role
    group: admin

services:
  - name: auth-v1-open
    url: http://auth:9999/verify
    routes:
      - name: auth-v1-open
        strip_path: true
        paths:
          - /auth/v1/verify
    plugins:
      - name: cors

  - name: auth-v1-open-callback
    url: http://auth:9999/callback
    routes:
      - name: auth-v1-open-callback
        strip_path: true
        paths:
          - /auth/v1/callback
    plugins:
      - name: cors

  - name: auth-v1-open-authorize
    url: http://auth:9999/authorize
    routes:
      - name: auth-v1-open-authorize
        strip_path: true
        paths:
          - /auth/v1/authorize
    plugins:
      - name: cors

  - name: auth-v1
    url: http://auth:9999/
    routes:
      - name: auth-v1
        strip_path: true
        paths:
          - /auth/v1/
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: false
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - admin
            - anon

  - name: rest-v1
    url: http://rest:3000/
    routes:
      - name: rest-v1
        strip_path: true
        paths:
          - /rest/v1/
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: false
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - admin
            - anon

  - name: realtime-v1
    url: http://realtime:4000/socket/
    routes:
      - name: realtime-v1
        strip_path: true
        paths:
          - /realtime/v1/
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: false
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - admin
            - anon

  - name: storage-v1
    url: http://storage:5000/
    routes:
      - name: storage-v1
        strip_path: true
        paths:
          - /storage/v1/
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: false
      - name: acl
        config:
          hide_groups_header: true
          allow:
            - admin
            - anon

  - name: functions-v1
    url: http://functions:9000/
    routes:
      - name: functions-v1
        strip_path: true
        paths:
          - /functions/v1/
    plugins:
      - name: cors

plugins:
  - name: cors
    config:
      origins:
        - "*"
      methods:
        - GET
        - POST
        - PUT
        - DELETE
        - PATCH
        - OPTIONS
      headers:
        - Accept
        - Accept-Version
        - Authorization
        - Content-Length
        - Content-MD5
        - Content-Type
        - Date
        - X-Auth-Token
        - X-Client-Info
        - apikey
        - x-upsert
      exposed_headers:
        - X-Total-Count
        - Content-Range
      max_age: 3600
      credentials: true
EOF

log_success "Kong configurado"

# ==========================================
# 6. Gerar Configuração do Nginx
# ==========================================
log_info "Gerando configuração do Nginx..."

cat > nginx/nginx.conf << 'NGINX_EOF'
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Docker DNS resolver
    resolver 127.0.0.11 valid=10s ipv6=off;
    resolver_timeout 5s;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 50M;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/s;

    # HTTP -> HTTPS redirect
    server {
        listen 80;
        listen [::]:80;
        server_name _;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS Server
    server {
        listen 443 ssl http2;
        listen [::]:443 ssl http2;
        server_name _;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_prefer_server_ciphers on;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 1d;
        ssl_session_tickets off;

        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        root /usr/share/nginx/html;
        index index.html;

        # Frontend SPA
        location / {
            try_files $uri $uri/ /index.html;
            
            location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
                expires 1y;
                add_header Cache-Control "public, immutable";
            }
        }

        # Supabase REST API
        location /rest/v1/ {
            limit_req zone=api burst=20 nodelay;
            
            set $upstream_kong kong:8000;
            proxy_pass http://$upstream_kong/rest/v1/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Connection "";
            
            add_header Access-Control-Allow-Origin * always;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PATCH, OPTIONS" always;
            add_header Access-Control-Allow-Headers "Authorization, Content-Type, apikey, X-Client-Info" always;
            
            if ($request_method = OPTIONS) {
                return 204;
            }
        }

        # Supabase Auth API
        location /auth/v1/ {
            limit_req zone=auth burst=10 nodelay;
            
            set $upstream_kong kong:8000;
            proxy_pass http://$upstream_kong/auth/v1/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Connection "";
            
            add_header Access-Control-Allow-Origin * always;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PATCH, OPTIONS" always;
            add_header Access-Control-Allow-Headers "Authorization, Content-Type, apikey, X-Client-Info" always;
            
            if ($request_method = OPTIONS) {
                return 204;
            }
        }

        # Supabase Storage API
        location /storage/v1/ {
            set $upstream_kong kong:8000;
            proxy_pass http://$upstream_kong/storage/v1/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Connection "";
            
            client_max_body_size 50M;
            
            add_header Access-Control-Allow-Origin * always;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PATCH, OPTIONS" always;
            add_header Access-Control-Allow-Headers "Authorization, Content-Type, apikey, X-Client-Info, x-upsert" always;
            
            if ($request_method = OPTIONS) {
                return 204;
            }
        }

        # Supabase Edge Functions
        location /functions/v1/ {
            limit_req zone=api burst=30 nodelay;
            
            set $upstream_kong kong:8000;
            proxy_pass http://$upstream_kong/functions/v1/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Connection "";
            
            proxy_read_timeout 300s;
            proxy_connect_timeout 75s;
            
            add_header Access-Control-Allow-Origin * always;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PATCH, OPTIONS" always;
            add_header Access-Control-Allow-Headers "Authorization, Content-Type, apikey, X-Client-Info" always;
            
            if ($request_method = OPTIONS) {
                return 204;
            }
        }

        # Supabase Realtime (WebSocket)
        location /realtime/v1/ {
            set $upstream_kong kong:8000;
            proxy_pass http://$upstream_kong/realtime/v1/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            proxy_read_timeout 86400;
        }

        # Baileys API Proxy
        location /baileys/ {
            set $upstream_baileys baileys:3000;
            proxy_pass http://$upstream_baileys/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Connection "";
            
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_read_timeout 86400;
        }

        # Health check
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
NGINX_EOF

log_success "Nginx configurado"

# ==========================================
# 7. Copiar Migrations do Banco
# ==========================================
log_info "Preparando migrations do banco de dados..."

if [ -f "supabase/init.sql" ]; then
    cp supabase/init.sql volumes/db/init/
    log_success "Migrations copiadas"
else
    log_warning "Arquivo init.sql não encontrado em supabase/"
fi

# ==========================================
# 8. Gerar Certificado SSL
# ==========================================
log_info "Configurando SSL..."

# Função para detectar se é IP
is_ip_address() {
    [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# Função para tentar Let's Encrypt
try_letsencrypt() {
    local domain=$1
    local email=${SSL_EMAIL:-ssl@$domain}
    
    # Instalar certbot se necessário
    if ! command -v certbot &> /dev/null; then
        log_info "Instalando certbot..."
        apt-get update -qq && apt-get install -y -qq certbot 2>/dev/null || return 1
    fi
    
    # Parar serviços na porta 80 temporariamente
    $DOCKER_COMPOSE stop nginx 2>/dev/null || true
    
    log_info "Obtendo certificado Let's Encrypt para $domain..."
    certbot certonly --standalone \
        --preferred-challenges http \
        -d "$domain" \
        --email "$email" \
        --agree-tos \
        --non-interactive || return 1
    
    # Copiar certificados
    if [ -d "/etc/letsencrypt/live/$domain" ]; then
        cp /etc/letsencrypt/live/$domain/fullchain.pem nginx/ssl/
        cp /etc/letsencrypt/live/$domain/privkey.pem nginx/ssl/
        return 0
    fi
    
    return 1
}

# Gerar certificado auto-assinado
generate_self_signed() {
    local domain=${1:-localhost}
    log_info "Gerando certificado auto-assinado para $domain..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/privkey.pem \
        -out nginx/ssl/fullchain.pem \
        -subj "/CN=$domain"
}

# Lógica principal de SSL
if is_ip_address "$DOMAIN"; then
    # IP não suporta Let's Encrypt
    log_warning "Domínio é um IP. Let's Encrypt não suportado."
    generate_self_signed "$DOMAIN"
elif [ "$DOMAIN" = "localhost" ]; then
    generate_self_signed "localhost"
else
    # Domínio real - tentar Let's Encrypt automaticamente
    if try_letsencrypt "$DOMAIN"; then
        log_success "Certificado Let's Encrypt obtido com sucesso!"
    else
        log_warning "Let's Encrypt falhou. Usando certificado auto-assinado..."
        generate_self_signed "$DOMAIN"
        echo ""
        log_info "Para obter SSL válido manualmente depois, execute:"
        echo "  sudo certbot certonly --standalone -d $DOMAIN --email seu@email.com"
        echo "  sudo cp /etc/letsencrypt/live/$DOMAIN/*.pem $INSTALL_DIR/nginx/ssl/"
        echo "  cd $INSTALL_DIR && docker compose restart nginx"
    fi
fi

log_success "Certificados SSL configurados"

# ==========================================
# 9. Atualizar Frontend com Configurações
# ==========================================
log_info "Configurando frontend..."

# Substituir placeholders no frontend compilado
if [ -f "frontend/dist/index.html" ]; then
    # Criar script de configuração dinâmica
    cat > frontend/dist/config.js << EOF
window.__SUPABASE_CONFIG__ = {
    url: "https://$DOMAIN",
    anonKey: "$ANON_KEY"
};
EOF
    
    # Inserir referência ao config.js no index.html se não existir
    if ! grep -q "config.js" frontend/dist/index.html; then
        sed -i 's|</head>|<script src="/config.js"></script></head>|' frontend/dist/index.html
    fi
    
    log_success "Frontend configurado"
fi

# ==========================================
# 10. Validar Configuração Antes de Iniciar
# ==========================================
if ! validate_configuration; then
    log_error "Falha na validação. Corrija os erros acima e execute novamente."
    exit 1
fi

# ==========================================
# 11. Iniciar Containers
# ==========================================
log_info "Iniciando containers Docker..."

# Parar containers existentes
$DOCKER_COMPOSE down 2>/dev/null || true

# Iniciar serviços com profile Baileys
log_info "Iniciando com Baileys..."
$DOCKER_COMPOSE --profile baileys up -d

log_success "Containers iniciados"

# ==========================================
# 12. Aguardar Serviços Iniciarem
# ==========================================
log_info "Aguardando serviços iniciarem..."

# Primeira espera para containers subirem
sleep 30

# Verificar quais containers estão rodando
log_info "Verificando status dos containers..."
$DOCKER_COMPOSE ps

# Função para verificar se container está rodando
check_container_running() {
    local service=$1
    local status=$($DOCKER_COMPOSE ps $service 2>/dev/null | grep -E "Up|running" || echo "")
    if [ -n "$status" ]; then
        return 0
    fi
    return 1
}

# Aguardar containers críticos estarem Up
log_info "Aguardando containers críticos..."
for service in db auth rest kong; do
    attempts=0
    while [ $attempts -lt 30 ]; do
        if check_container_running $service; then
            log_success "Container $service está rodando"
            break
        fi
        attempts=$((attempts + 1))
        echo -e "  Aguardando $service... (tentativa $attempts/30)"
        sleep 2
    done
done

# Segunda espera para serviços internos iniciarem
log_info "Aguardando serviços internos inicializarem..."
sleep 30

# Verificar se banco está pronto
log_info "Verificando banco de dados..."
max_attempts=30
attempt=0
while ! $DOCKER_COMPOSE exec -T db pg_isready -U postgres &>/dev/null; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
        log_error "Banco de dados não iniciou a tempo"
        exit 1
    fi
    echo -e "  Aguardando PostgreSQL... (tentativa $attempt/$max_attempts)"
    sleep 2
done

log_success "Banco de dados pronto"

# ==========================================
# 13. Verificar Disponibilidade da API (Kong)
# ==========================================
wait_for_api() {
    local max_attempts=60
    local attempt=0
    
    log_info "Verificando disponibilidade da API (Kong)..."
    
    while [ $attempt -lt $max_attempts ]; do
        # Primeiro verificar se Kong está escutando (qualquer resposta)
        KONG_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
            "http://localhost:8000/" 2>/dev/null || echo "000")
        
        if [ "$KONG_CODE" != "000" ]; then
            # Kong está respondendo, agora verificar auth
            AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
                "http://localhost:8000/auth/v1/health" 2>/dev/null || echo "000")
            
            if [ "$AUTH_CODE" = "200" ]; then
                log_success "API está disponível (Kong: $KONG_CODE, Auth: $AUTH_CODE)"
                return 0
            fi
            
            # Kong responde mas auth ainda não está pronto
            echo -e "  Tentativa $attempt/$max_attempts - Kong: $KONG_CODE, Auth: $AUTH_CODE - Aguardando..."
        else
            # Kong não está respondendo
            echo -e "  Tentativa $attempt/$max_attempts - Kong não responde - Aguardando..."
        fi
        
        attempt=$((attempt + 1))
        sleep 3
    done
    
    log_warning "API pode não estar totalmente disponível ainda"
    log_info "Diagnóstico: Execute 'docker compose logs kong auth' para verificar"
    return 1
}

wait_for_api

# ==========================================
# 14. Verificar Saúde do Baileys
# ==========================================
check_baileys_health() {
    local max_retries=30
    local retry_count=0
    local wait_time=5
    
    log_info "Verificando Baileys Server (pode levar até 2 minutos)..."
    
    while [ $retry_count -lt $max_retries ]; do
        # Verificar se container está rodando
        if ! $DOCKER_COMPOSE ps baileys 2>/dev/null | grep -q "Up\|running"; then
            log_warning "Container Baileys não está rodando. Tentando reiniciar..."
            $DOCKER_COMPOSE --profile baileys up -d baileys
            sleep 10
        fi
        
        # Tentar health check via curl
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/health 2>/dev/null || echo "000")
        
        if [ "$HTTP_CODE" = "200" ]; then
            log_success "Baileys Server está funcionando (HTTP $HTTP_CODE)"
            return 0
        fi
        
        retry_count=$((retry_count + 1))
        remaining=$((max_retries - retry_count))
        echo -e "  Tentativa $retry_count/$max_retries - HTTP: $HTTP_CODE - Aguardando... ($remaining restantes)"
        sleep $wait_time
    done
    
    return 1
}

if check_baileys_health; then
    log_success "Baileys verificado com sucesso"
else
    log_warning "Baileys pode ainda estar inicializando"
    log_info "Verifique manualmente com: $DOCKER_COMPOSE logs baileys"
fi

# ==========================================
# 15. Executar Migrations
# ==========================================
log_info "Executando migrations do banco de dados..."

if [ -f "volumes/db/init/init.sql" ]; then
    $DOCKER_COMPOSE exec -T db psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/init.sql 2>/dev/null || {
        log_warning "Algumas migrations podem ter falhado (normal se já executadas)"
    }
    log_success "Migrations executadas"
fi

# ==========================================
# 16. Inserir Configurações do Baileys no Banco
# ==========================================
log_info "Configurando Baileys no banco de dados..."

$DOCKER_COMPOSE exec -T db psql -U postgres -d postgres -c "
INSERT INTO public.system_settings (key, value, category, description) VALUES 
  ('baileys_server_url', 'http://baileys:3000', 'baileys', 'URL interna do servidor Baileys'),
  ('baileys_api_key', '$BAILEYS_API_KEY', 'baileys', 'Chave de API do Baileys')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
" 2>/dev/null && log_success "Configurações Baileys inseridas no banco" || log_warning "Configurações Baileys podem já existir"

# ==========================================
# 17. Criar Usuário Admin (AUTOMÁTICO)
# ==========================================
log_info "Criando usuário administrador automaticamente..."

# Variável para controlar se admin foi criado
ADMIN_CREATED=false

# Criar usuário via API interna (localhost:8000) em vez de HTTPS externo
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://localhost:8000/auth/v1/signup" \
    -H "apikey: $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"data\":{\"name\":\"$ADMIN_NAME\"}}" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    USER_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -n "$USER_ID" ]; then
        # Atualizar role para admin
        $DOCKER_COMPOSE exec -T db psql -U postgres -d postgres \
            -c "UPDATE user_roles SET role = 'admin' WHERE user_id = '$USER_ID';" 2>/dev/null || true
        log_success "Usuário admin criado com sucesso!"
        ADMIN_CREATED=true
    fi
else
    log_warning "API não disponível (HTTP $HTTP_CODE). Criando admin via SQL..."
    
    # FALLBACK: Criar admin diretamente no banco via SQL
    SQL_RESULT=$($DOCKER_COMPOSE exec -T db psql -U postgres -d postgres -c "
        DO \$\$
        DECLARE
            new_uid uuid := gen_random_uuid();
        BEGIN
            -- Inserir usuário em auth.users
            INSERT INTO auth.users (
                id,
                instance_id,
                email,
                encrypted_password,
                email_confirmed_at,
                raw_user_meta_data,
                created_at,
                updated_at,
                role,
                aud
            ) VALUES (
                new_uid,
                '00000000-0000-0000-0000-000000000000',
                '$ADMIN_EMAIL',
                crypt('$ADMIN_PASSWORD', gen_salt('bf')),
                now(),
                jsonb_build_object('name', '$ADMIN_NAME'),
                now(),
                now(),
                'authenticated',
                'authenticated'
            );
            
            -- Aguardar trigger criar profile/role
            PERFORM pg_sleep(1);
            
            -- Garantir que role seja admin
            UPDATE public.user_roles SET role = 'admin' WHERE user_id = new_uid;
            
            -- Se não existir role, inserir
            INSERT INTO public.user_roles (user_id, role)
            SELECT new_uid, 'admin'
            WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = new_uid);
            
            RAISE NOTICE 'Admin criado com ID: %', new_uid;
        END \$\$;
    " 2>&1)
    
    if echo "$SQL_RESULT" | grep -q "NOTICE\|INSERT\|DO"; then
        log_success "Admin criado via SQL com sucesso!"
        ADMIN_CREATED=true
    else
        log_error "Falha ao criar admin via SQL: $SQL_RESULT"
    fi
fi

# ==========================================
# 18. Resumo Final - TODAS AS CREDENCIAIS
# ==========================================
show_summary() {
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                               ║${NC}"
    echo -e "${GREEN}║              INSTALAÇÃO CONCLUÍDA COM SUCESSO!               ║${NC}"
    echo -e "${GREEN}║                                                               ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                    CREDENCIAIS DE ACESSO                        ${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${YELLOW}URL do Sistema:${NC}    https://$DOMAIN"
    echo ""
    echo -e "  ${YELLOW}Admin:${NC}"
    echo "    Email:           $ADMIN_EMAIL"
    echo "    Senha:           $ADMIN_PASSWORD"
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                    BANCO DE DADOS                               ${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "    Senha PostgreSQL: $POSTGRES_PASSWORD"
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                    CHAVES API                                   ${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "    Baileys API Key:  $BAILEYS_API_KEY"
    echo "    ANON_KEY:         ${ANON_KEY:0:50}..."
    echo "    SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY:0:50}..."
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                    SERVIÇOS                                     ${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "    Frontend:     https://$DOMAIN"
    echo "    API:          https://$DOMAIN/rest/v1/"
    echo "    Auth:         https://$DOMAIN/auth/v1/"
    echo "    Baileys:      https://$DOMAIN/baileys"
    echo ""
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                                                               ║${NC}"
    echo -e "${RED}║   ⚠️  GUARDE ESSAS INFORMAÇÕES EM LOCAL SEGURO!  ⚠️          ║${NC}"
    echo -e "${RED}║                                                               ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${YELLOW}Próximos passos:${NC}"
    echo "    1. Acesse https://$DOMAIN"
    echo "    2. Faça login com as credenciais acima"
    echo "    3. Vá em Conexões e escaneie o QR Code do WhatsApp"
    echo ""
    
    # Salvar credenciais em arquivo seguro
    CREDS_FILE="$DEPLOY_DIR/CREDENCIAIS.txt"
    cat > "$CREDS_FILE" << CREDS_EOF
============================================
CREDENCIAIS DO SISTEMA - GERADO AUTOMATICAMENTE
Data: $(date)
============================================

URL: https://$DOMAIN

ADMIN:
  Email: $ADMIN_EMAIL
  Senha: $ADMIN_PASSWORD

BANCO DE DADOS:
  Senha: $POSTGRES_PASSWORD

API KEYS:
  Baileys: $BAILEYS_API_KEY
  ANON_KEY: $ANON_KEY
  SERVICE_ROLE_KEY: $SERVICE_ROLE_KEY

============================================
GUARDE ESTE ARQUIVO EM LOCAL SEGURO!
============================================
CREDS_EOF
    chmod 600 "$CREDS_FILE"
    echo -e "  ${GREEN}Credenciais salvas em: $CREDS_FILE${NC}"
    echo ""
}

show_summary
