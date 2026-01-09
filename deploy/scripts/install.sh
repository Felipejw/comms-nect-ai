#!/bin/bash

# ============================================
# Script de Instalação - Sistema de Atendimento
# Self-Hosted com Supabase + WPPConnect Server
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
VERSION=$(cat VERSION 2>/dev/null || echo "2.0.0")

# Banner
echo -e "${BLUE}"
echo "============================================"
echo "  Sistema de Atendimento - Instalação"
echo "  Self-Hosted com Supabase + WPPConnect"
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
    log_error "Falha na preparação do frontend"
    exit 1
fi

log_success "Frontend pronto"

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

# Gerar chave do WPPConnect
WPPCONNECT_SECRET_KEY=$(openssl rand -hex 24)
log_success "Chave do WPPConnect gerada"

# Atualizar .env
sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" .env
sed -i "s|^SSL_EMAIL=.*|SSL_EMAIL=$SSL_EMAIL|" .env
sed -i "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=https://$DOMAIN|" .env
sed -i "s|^SITE_URL=.*|SITE_URL=https://$DOMAIN|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" .env
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
sed -i "s|^ANON_KEY=.*|ANON_KEY=$ANON_KEY|" .env
sed -i "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY|" .env
sed -i "s|^WPPCONNECT_SECRET_KEY=.*|WPPCONNECT_SECRET_KEY=$WPPCONNECT_SECRET_KEY|" .env
sed -i "s|^WPPCONNECT_SERVER_URL=.*|WPPCONNECT_SERVER_URL=https://$DOMAIN:21465|" .env
sed -i "s|^WEBHOOK_URL=.*|WEBHOOK_URL=https://$DOMAIN/functions/v1/wppconnect-webhook|" .env
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
mkdir -p volumes/wppconnect/tokens
mkdir -p volumes/wppconnect/userDataDir
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
$DOCKER_COMPOSE down 2>/dev/null || true

# Iniciar serviços em background
$DOCKER_COMPOSE up -d

log_success "Containers iniciados"

# ==========================================
# 10. Aguardar Serviços Iniciarem
# ==========================================
log_info "Aguardando serviços iniciarem..."

sleep 30

# Verificar se banco está pronto
max_attempts=30
attempt=0
while ! $DOCKER_COMPOSE exec -T db pg_isready -U postgres &>/dev/null; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
        log_error "Banco de dados não iniciou a tempo"
        exit 1
    fi
    sleep 2
done

log_success "Banco de dados pronto"

# ==========================================
# 11. Verificar Saúde do WPPConnect
# ==========================================
check_wppconnect_health() {
    local max_retries=30
    local retry_count=0
    local wait_time=5
    
    log_info "Verificando WPPConnect Server (pode levar até 2 minutos)..."
    
    while [ $retry_count -lt $max_retries ]; do
        # Verificar se container está rodando (usando wppconnect-1 como principal)
        if ! $DOCKER_COMPOSE ps wppconnect-1 2>/dev/null | grep -q "Up\|running"; then
            log_warning "Container WPPConnect não está rodando. Tentando reiniciar..."
            $DOCKER_COMPOSE up -d wppconnect-1
            sleep 10
        fi
        
        # Tentar health check via curl
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:21465/api/health 2>/dev/null || echo "000")
        
        # 200 = OK, 401 = Não autorizado (mas servidor está funcionando)
        if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
            log_success "WPPConnect Server está funcionando (HTTP $HTTP_CODE)"
            return 0
        fi
        
        retry_count=$((retry_count + 1))
        remaining=$((max_retries - retry_count))
        echo -e "  Tentativa $retry_count/$max_retries - HTTP: $HTTP_CODE - Aguardando... ($remaining restantes)"
        sleep $wait_time
    done
    
    return 1
}

if check_wppconnect_health; then
    log_success "WPPConnect Server verificado com sucesso"
else
    log_warning "WPPConnect pode ainda estar inicializando"
    log_info "Verifique manualmente com: $DOCKER_COMPOSE logs wppconnect-1"
    log_info "Teste: curl http://localhost:21465/api/health"
fi

# ==========================================
# 12. Executar Migrations
# ==========================================
log_info "Executando migrations do banco de dados..."

if [ -f "volumes/db/init/init.sql" ]; then
    $DOCKER_COMPOSE exec -T db psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/init.sql 2>/dev/null || {
        log_warning "Algumas migrations podem ter falhado (normal se já executadas)"
    }
    log_success "Migrations executadas"
fi

# ==========================================
# 13. Criar Usuário Admin
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
    $DOCKER_COMPOSE exec -T db psql -U postgres -d postgres -c "UPDATE user_roles SET role = 'admin' WHERE user_id = '$USER_ID';" 2>/dev/null || true
    log_success "Usuário admin criado com sucesso!"
else
    log_warning "Não foi possível criar usuário automaticamente. Crie manualmente após a instalação."
fi

# ==========================================
# 14. Resumo Final
# ==========================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Instalação Concluída com Sucesso!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  URL do Sistema: https://$DOMAIN"
echo ""
echo "  Credenciais do Admin:"
echo "    Email: $ADMIN_EMAIL"
echo "    Senha: (a que você digitou)"
echo ""
echo "  Serviços:"
echo "    Frontend:    https://$DOMAIN"
echo "    API:         https://$DOMAIN/rest/v1/"
echo "    WPPConnect:  http://localhost:21465"
echo ""
echo -e "${YELLOW}  IMPORTANTE:${NC}"
echo "    - Guarde a senha do banco de dados em local seguro"
echo "    - Para WhatsApp, vá em Conexões e escaneie o QR Code"
echo "    - O WPPConnect resolve automaticamente números LID"
echo ""
echo "  Comandos úteis:"
echo "    Ver logs:     $DOCKER_COMPOSE logs -f"
echo "    Reiniciar:    $DOCKER_COMPOSE restart"
echo "    Parar:        $DOCKER_COMPOSE down"
echo "    Backup:       ./scripts/backup.sh"
echo ""
echo -e "${GREEN}============================================${NC}"
