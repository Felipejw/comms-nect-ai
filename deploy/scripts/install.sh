#!/bin/bash

# ============================================
# Script de Instalação - Sistema de Atendimento
# Self-Hosted com Supabase + Evolution API
# Distribuição via arquivo (sem Git)
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
VERSION=$(cat VERSION 2>/dev/null || echo "1.0.0")

# Banner
echo -e "${BLUE}"
echo "============================================"
echo "  Sistema de Atendimento - Instalação"
echo "  Self-Hosted com Supabase + WhatsApp"
echo "  Versão: $VERSION"
echo "============================================"
echo -e "${NC}"

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

# ==========================================
# 2. Verificar Frontend Pré-compilado
# ==========================================
log_info "Verificando frontend..."

if [ ! -d "frontend/dist" ] || [ ! -f "frontend/dist/index.html" ]; then
    log_error "Frontend não encontrado em frontend/dist/"
    log_error "O pacote de instalação parece estar incompleto."
    log_error "Certifique-se de ter baixado o pacote completo."
    exit 1
fi

log_success "Frontend encontrado"

# ==========================================
# 3. Configurar Variáveis de Ambiente
# ==========================================
log_info "Configurando variáveis de ambiente..."

if [ -f .env ]; then
    log_warning "Arquivo .env já existe"
    read -p "Deseja sobrescrever? (s/N): " overwrite
    if [ "$overwrite" != "s" ] && [ "$overwrite" != "S" ]; then
        log_info "Mantendo .env existente"
    else
        cp .env .env.backup
        log_info "Backup salvo em .env.backup"
        cp .env.example .env
    fi
else
    cp .env.example .env
fi

# Solicitar informações
echo ""
log_info "Configure as informações do seu servidor:"
echo ""

read -p "Domínio ou IP do servidor (ex: meusite.com.br): " DOMAIN
read -p "Email para SSL (opcional, pressione Enter para pular): " SSL_EMAIL
read -p "Senha do banco de dados (mínimo 12 caracteres): " -s POSTGRES_PASSWORD
echo ""

# Validar senha
if [ ${#POSTGRES_PASSWORD} -lt 12 ]; then
    log_error "Senha deve ter no mínimo 12 caracteres"
    exit 1
fi

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

# Gerar chave da Evolution API
EVOLUTION_API_KEY=$(openssl rand -hex 24)
log_success "Chave da Evolution API gerada"

# Atualizar .env
sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" .env
sed -i "s|^SSL_EMAIL=.*|SSL_EMAIL=$SSL_EMAIL|" .env
sed -i "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=https://$DOMAIN|" .env
sed -i "s|^SITE_URL=.*|SITE_URL=https://$DOMAIN|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" .env
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
sed -i "s|^ANON_KEY=.*|ANON_KEY=$ANON_KEY|" .env
sed -i "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY|" .env
sed -i "s|^EVOLUTION_API_KEY=.*|EVOLUTION_API_KEY=$EVOLUTION_API_KEY|" .env
sed -i "s|^EVOLUTION_SERVER_URL=.*|EVOLUTION_SERVER_URL=https://$DOMAIN:8080|" .env
sed -i "s|^WEBHOOK_URL=.*|WEBHOOK_URL=https://$DOMAIN/functions/v1/evolution-webhook|" .env
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
mkdir -p volumes/evolution
mkdir -p nginx/ssl
mkdir -p backups

log_success "Diretórios criados"

# ==========================================
# 5. Copiar Configurações do Kong
# ==========================================
log_info "Configurando Kong API Gateway..."

cat > volumes/kong/kong.yml << 'KONG_EOF'
_format_version: "2.1"
_transform: true

consumers:
  - username: anon
    keyauth_credentials:
      - key: $SUPABASE_ANON_KEY
  - username: service_role
    keyauth_credentials:
      - key: $SUPABASE_SERVICE_KEY

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
KONG_EOF

log_success "Kong configurado"

# ==========================================
# 6. Copiar Migrations do Banco
# ==========================================
log_info "Preparando migrations do banco de dados..."

if [ -f "supabase/init.sql" ]; then
    cp supabase/init.sql volumes/db/init/
    log_success "Migrations copiadas"
else
    log_warning "Arquivo init.sql não encontrado em supabase/"
fi

# ==========================================
# 7. Gerar Certificado SSL
# ==========================================
log_info "Configurando SSL..."

if [ -n "$SSL_EMAIL" ] && [ "$DOMAIN" != "localhost" ]; then
    # Usar Let's Encrypt via certbot
    if command -v certbot &> /dev/null; then
        log_info "Obtendo certificado SSL via Let's Encrypt..."
        $SUDO certbot certonly --standalone -d "$DOMAIN" --email "$SSL_EMAIL" --agree-tos --non-interactive || {
            log_warning "Não foi possível obter certificado. Gerando certificado auto-assinado..."
            openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                -keyout nginx/ssl/privkey.pem \
                -out nginx/ssl/fullchain.pem \
                -subj "/CN=$DOMAIN"
        }
        
        # Copiar certificados
        if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
            cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem nginx/ssl/
            cp /etc/letsencrypt/live/$DOMAIN/privkey.pem nginx/ssl/
        fi
    else
        log_warning "Certbot não encontrado. Gerando certificado auto-assinado..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout nginx/ssl/privkey.pem \
            -out nginx/ssl/fullchain.pem \
            -subj "/CN=$DOMAIN"
    fi
else
    log_info "Gerando certificado auto-assinado para desenvolvimento..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/privkey.pem \
        -out nginx/ssl/fullchain.pem \
        -subj "/CN=${DOMAIN:-localhost}"
fi

log_success "Certificados SSL configurados"

# ==========================================
# 8. Atualizar Frontend com Configurações
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
    log_success "Frontend configurado"
fi

# ==========================================
# 9. Iniciar Containers
# ==========================================
log_info "Iniciando containers Docker..."

# Parar containers existentes
docker-compose down 2>/dev/null || docker compose down 2>/dev/null || true

# Iniciar serviços em background
docker-compose up -d || docker compose up -d

log_success "Containers iniciados"

# ==========================================
# 10. Aguardar Serviços Iniciarem
# ==========================================
log_info "Aguardando serviços iniciarem..."

sleep 30

# Verificar se banco está pronto
max_attempts=30
attempt=0
while ! docker-compose exec -T db pg_isready -U postgres &>/dev/null && ! docker compose exec -T db pg_isready -U postgres &>/dev/null; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
        log_error "Banco de dados não iniciou a tempo"
        exit 1
    fi
    sleep 2
done

log_success "Banco de dados pronto"

# ==========================================
# 11. Executar Migrations
# ==========================================
log_info "Executando migrations do banco de dados..."

if [ -f "volumes/db/init/init.sql" ]; then
    docker-compose exec -T db psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/init.sql 2>/dev/null || \
    docker compose exec -T db psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/init.sql 2>/dev/null || {
        log_warning "Algumas migrations podem ter falhado (normal se já executadas)"
    }
    log_success "Migrations executadas"
fi

# ==========================================
# 12. Criar Usuário Admin
# ==========================================
echo ""
log_info "Criar usuário administrador inicial"
echo ""

read -p "Email do admin: " ADMIN_EMAIL
read -p "Senha do admin (mínimo 8 caracteres): " -s ADMIN_PASSWORD
echo ""
read -p "Nome do admin: " ADMIN_NAME

# Criar usuário via API
RESPONSE=$(curl -s -X POST "https://$DOMAIN/auth/v1/signup" \
    -H "apikey: $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"data\":{\"name\":\"$ADMIN_NAME\"}}")

USER_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$USER_ID" ]; then
    # Atualizar role para admin
    docker-compose exec -T db psql -U postgres -d postgres -c "UPDATE user_roles SET role = 'admin' WHERE user_id = '$USER_ID';" 2>/dev/null || \
    docker compose exec -T db psql -U postgres -d postgres -c "UPDATE user_roles SET role = 'admin' WHERE user_id = '$USER_ID';" 2>/dev/null
    log_success "Usuário admin criado com sucesso!"
else
    log_warning "Não foi possível criar usuário automaticamente. Crie manualmente após a instalação."
fi

# Salvar versão instalada
cp VERSION VERSION.old 2>/dev/null || true

# ==========================================
# 13. Resumo Final
# ==========================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Instalação Concluída com Sucesso!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}Informações de Acesso:${NC}"
echo ""
echo "  URL do Sistema:     https://$DOMAIN"
echo "  URL do Studio:      https://$DOMAIN/studio/"
echo "  Evolution API:      https://$DOMAIN:8080"
echo ""
echo -e "${BLUE}Credenciais:${NC}"
echo ""
echo "  Admin Email:        $ADMIN_EMAIL"
echo "  Banco de Dados:     $POSTGRES_PASSWORD"
echo "  Evolution API Key:  $EVOLUTION_API_KEY"
echo ""
echo -e "${YELLOW}IMPORTANTE:${NC}"
echo "  1. Salve as credenciais em local seguro"
echo "  2. Configure o webhook no Evolution: https://$DOMAIN/functions/v1/evolution-webhook"
echo "  3. Acesse o sistema e configure as conexões WhatsApp"
echo ""
echo -e "${BLUE}Comandos úteis:${NC}"
echo ""
echo "  Ver logs:           docker-compose logs -f"
echo "  Reiniciar:          docker-compose restart"
echo "  Parar:              docker-compose down"
echo "  Backup:             ./scripts/backup.sh"
echo "  Atualizar:          ./scripts/update.sh"
echo ""
echo -e "${BLUE}Versão instalada: $VERSION${NC}"
echo ""
