#!/bin/bash

# ============================================
# Script de Instalação Unificada
# Sistema de Atendimento + Baileys WhatsApp Server
# ============================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Diretórios
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$DEPLOY_DIR")"

# Funções de log
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "\n${CYAN}=== $1 ===${NC}\n"; }

# Banner
show_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                                                               ║"
    echo "║       SISTEMA DE ATENDIMENTO - INSTALAÇÃO UNIFICADA          ║"
    echo "║                                                               ║"
    echo "║       Frontend + Backend + Baileys WhatsApp                   ║"
    echo "║                                                               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Verificar se está rodando como root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Este script precisa ser executado como root"
        log_info "Execute: sudo $0"
        exit 1
    fi
}

# Verificar requisitos do sistema
check_requirements() {
    log_step "Verificando Requisitos do Sistema"
    
    # Verificar memória
    TOTAL_MEM=$(free -g | awk '/^Mem:/{print $2}')
    if [ "$TOTAL_MEM" -lt 4 ]; then
        log_warn "Memória RAM: ${TOTAL_MEM}GB (mínimo recomendado: 4GB)"
    else
        log_success "Memória RAM: ${TOTAL_MEM}GB"
    fi
    
    # Verificar disco
    DISK_FREE=$(df -BG / | awk 'NR==2{print $4}' | sed 's/G//')
    if [ "$DISK_FREE" -lt 20 ]; then
        log_error "Espaço em disco insuficiente: ${DISK_FREE}GB (mínimo: 20GB)"
        exit 1
    else
        log_success "Espaço em disco: ${DISK_FREE}GB"
    fi
}

# Instalar Docker se necessário
install_docker() {
    log_step "Verificando Docker"
    
    if ! command -v docker &> /dev/null; then
        log_info "Docker não encontrado. Instalando..."
        curl -fsSL https://get.docker.com | sh
        systemctl enable docker
        systemctl start docker
        log_success "Docker instalado com sucesso"
    else
        log_success "Docker já instalado: $(docker --version)"
    fi
    
    # Verificar Docker Compose
    if ! docker compose version &> /dev/null; then
        log_info "Docker Compose não encontrado. Instalando..."
        apt-get update
        apt-get install -y docker-compose-plugin
        log_success "Docker Compose instalado"
    else
        log_success "Docker Compose já instalado"
    fi
}

# Detectar instalação Baileys existente
detect_existing_baileys() {
    log_step "Detectando Instalação Baileys Existente"
    
    BAILEYS_EXISTS=false
    EXISTING_API_KEY=""
    EXISTING_SESSIONS_DIR=""
    
    for dir in "/opt/baileys" "/root/baileys" "$HOME/baileys"; do
        if [ -d "$dir/sessions" ]; then
            log_success "Encontrada instalação Baileys em: $dir"
            BAILEYS_EXISTS=true
            EXISTING_SESSIONS_DIR="$dir/sessions"
            
            if [ -f "$dir/.env" ]; then
                EXISTING_API_KEY=$(grep -E "^API_KEY=" "$dir/.env" 2>/dev/null | cut -d= -f2 | tr -d '"' | tr -d "'")
                if [ -n "$EXISTING_API_KEY" ]; then
                    log_success "API Key existente encontrada"
                fi
            fi
            break
        fi
    done
    
    if [ "$BAILEYS_EXISTS" = false ]; then
        log_info "Nenhuma instalação Baileys existente encontrada"
    fi
}

# Migrar sessões Baileys existentes
migrate_baileys_sessions() {
    if [ "$BAILEYS_EXISTS" = true ] && [ -n "$EXISTING_SESSIONS_DIR" ]; then
        log_step "Migrando Sessões WhatsApp"
        
        mkdir -p "$DEPLOY_DIR/volumes/baileys/sessions"
        
        SESSION_COUNT=$(find "$EXISTING_SESSIONS_DIR" -maxdepth 1 -type d | wc -l)
        SESSION_COUNT=$((SESSION_COUNT - 1))
        
        if [ "$SESSION_COUNT" -gt 0 ]; then
            log_info "Encontradas $SESSION_COUNT sessões para migrar"
            cp -r "$EXISTING_SESSIONS_DIR/"* "$DEPLOY_DIR/volumes/baileys/sessions/" 2>/dev/null || true
            log_success "Sessões migradas com sucesso"
        else
            log_info "Nenhuma sessão ativa para migrar"
        fi
    fi
}

# Parar Baileys standalone existente
stop_existing_baileys() {
    if [ "$BAILEYS_EXISTS" = true ]; then
        log_step "Parando Baileys Standalone"
        
        for dir in "/opt/baileys" "/root/baileys" "$HOME/baileys"; do
            if [ -f "$dir/docker-compose.yml" ]; then
                log_info "Parando containers em $dir..."
                cd "$dir"
                docker compose down 2>/dev/null || true
                log_success "Containers parados"
            fi
        done
    fi
}

# Coletar/Gerar informações automaticamente (ZERO PROMPTS)
collect_user_info() {
    log_step "Configuração Automática do Sistema"
    
    # Domínio: usar variável de ambiente ou detectar IP público
    if [ -z "$DOMAIN" ]; then
        log_info "Detectando IP público do servidor..."
        DOMAIN=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "localhost")
    fi
    log_success "Domínio/IP: $DOMAIN"
    
    # Email SSL
    if [ -z "$SSL_EMAIL" ]; then
        SSL_EMAIL="admin@${DOMAIN}"
    fi
    log_success "Email SSL: $SSL_EMAIL"
    
    # Senha do banco - sempre gerar automaticamente
    POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24)
    log_success "Senha do banco gerada"
    
    # API Key do Baileys
    if [ -n "$EXISTING_API_KEY" ]; then
        log_info "Usando API Key existente do Baileys"
        BAILEYS_API_KEY="$EXISTING_API_KEY"
    else
        BAILEYS_API_KEY=$(openssl rand -hex 32)
        log_success "API Key Baileys gerada"
    fi
    
    # JWT Secret
    JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 48)
    log_success "JWT Secret gerado"
    
    # Credenciais do admin
    ADMIN_EMAIL="admin@${DOMAIN}"
    ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
    ADMIN_NAME="Administrador"
    log_success "Credenciais do admin geradas"
}

# Gerar chaves JWT válidas usando Python3 (disponível em toda VPS Ubuntu)
generate_jwt_keys() {
    log_step "Gerando Chaves JWT"
    
    # Função Python para gerar JWT HS256 válido
    generate_jwt_python() {
        local role="$1"
        local secret="$2"
        python3 -c "
import hmac, hashlib, base64, json, time

def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

now = int(time.time())
exp = now + (10 * 365 * 24 * 60 * 60)  # 10 anos

header = b64url(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
payload = b64url(json.dumps({
    'role': '${role}',
    'iss': 'supabase',
    'iat': now,
    'exp': exp
}).encode())

signing_input = (header + '.' + payload).encode()
signature = b64url(hmac.new('${secret}'.encode(), signing_input, hashlib.sha256).digest())

print(header + '.' + payload + '.' + signature)
" 2>/dev/null
    }
    
    # Fallback: gerar JWT usando Docker com Node.js
    generate_jwt_docker() {
        local role="$1"
        local secret="$2"
        docker run --rm node:18-alpine node -e "
const crypto = require('crypto');
function b64url(str) { return Buffer.from(str).toString('base64url'); }
const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({alg:'HS256',typ:'JWT'}));
const payload = b64url(JSON.stringify({role:'${role}',iss:'supabase',iat:now,exp:now+(10*365*24*60*60)}));
const sig = crypto.createHmac('sha256','${secret}').update(header+'.'+payload).digest('base64url');
console.log(header+'.'+payload+'.'+sig);
" 2>/dev/null
    }
    
    # Tentar Python3 primeiro, depois Docker como fallback
    if command -v python3 &> /dev/null; then
        log_info "Gerando JWTs com Python3..."
        ANON_KEY=$(generate_jwt_python "anon" "$JWT_SECRET")
        SERVICE_ROLE_KEY=$(generate_jwt_python "service_role" "$JWT_SECRET")
    else
        log_info "Python3 não encontrado. Usando Docker para gerar JWTs..."
        ANON_KEY=$(generate_jwt_docker "anon" "$JWT_SECRET")
        SERVICE_ROLE_KEY=$(generate_jwt_docker "service_role" "$JWT_SECRET")
    fi
    
    # Validar que as chaves são JWTs válidos (formato: xxx.yyy.zzz)
    validate_jwt() {
        local key="$1"
        local name="$2"
        if [ -z "$key" ]; then
            log_error "Falha ao gerar $name - chave vazia"
            return 1
        fi
        local dot_count=$(echo "$key" | tr -cd '.' | wc -c)
        if [ "$dot_count" -ne 2 ]; then
            log_error "Falha ao gerar $name - formato inválido (esperado JWT com 2 pontos, obteve $dot_count)"
            return 1
        fi
        return 0
    }
    
    if ! validate_jwt "$ANON_KEY" "ANON_KEY" || ! validate_jwt "$SERVICE_ROLE_KEY" "SERVICE_ROLE_KEY"; then
        log_error "Não foi possível gerar chaves JWT válidas."
        log_error "Certifique-se de que Python3 ou Docker estão instalados."
        exit 1
    fi
    
    log_success "ANON_KEY gerada: ${ANON_KEY:0:20}..."
    log_success "SERVICE_ROLE_KEY gerada: ${SERVICE_ROLE_KEY:0:20}..."
    log_success "Chaves JWT válidas geradas com sucesso"
}

# Criar arquivo .env
create_env_file() {
    log_step "Criando Arquivo de Configuração"
    
    cat > "$DEPLOY_DIR/.env" << EOF
# ============================================
# CONFIGURAÇÃO DO SISTEMA - GERADO AUTOMATICAMENTE
# Data: $(date)
# ============================================

# ==========================================
# CONFIGURAÇÕES DO SERVIDOR
# ==========================================
DOMAIN=$DOMAIN
SSL_EMAIL=$SSL_EMAIL
API_EXTERNAL_URL=https://$DOMAIN
SITE_URL=https://$DOMAIN

# ==========================================
# BANCO DE DADOS
# ==========================================
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=postgres
POSTGRES_PORT=5432

# ==========================================
# CHAVES JWT
# ==========================================
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
JWT_EXPIRY=3600

# ==========================================
# PORTAS
# ==========================================
HTTP_PORT=80
HTTPS_PORT=443
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443

# ==========================================
# AUTENTICAÇÃO
# ==========================================
DISABLE_SIGNUP=false
ENABLE_EMAIL_AUTOCONFIRM=true
ENABLE_EMAIL_SIGNUP=true
ENABLE_ANONYMOUS_USERS=false
ENABLE_PHONE_SIGNUP=false

# ==========================================
# ENGINE DE WHATSAPP - BAILEYS (Integrado)
# ==========================================
WHATSAPP_ENGINE=baileys
BAILEYS_API_KEY=$BAILEYS_API_KEY
BAILEYS_INTERNAL_URL=http://baileys:3000
BAILEYS_EXTERNAL_URL=https://$DOMAIN/baileys
WEBHOOK_URL=http://kong:8000/functions/v1/baileys-webhook

# ==========================================
# SUPABASE STUDIO
# ==========================================
STUDIO_DEFAULT_ORGANIZATION=Sistema de Atendimento
STUDIO_DEFAULT_PROJECT=Producao

# ==========================================
# LOGS
# ==========================================
LOG_LEVEL=info

# ==========================================
# VARIÁVEIS DO FRONTEND
# ==========================================
VITE_SUPABASE_URL=https://$DOMAIN
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_PROJECT_ID=self-hosted
EOF

    chmod 600 "$DEPLOY_DIR/.env"
    log_success "Arquivo .env criado"
}

# Criar estrutura de diretórios
create_directories() {
    log_step "Criando Estrutura de Diretórios"
    
    # Limpar dados do banco se existirem (reinstalação limpa)
    # Isso garante que o PostgreSQL rode o init.sql com a senha nova
    if [ -d "$DEPLOY_DIR/volumes/db/data" ]; then
        log_warn "Dados anteriores do banco encontrados"
        log_info "Limpando para reinstalação limpa..."
        
        # Parar containers antes de limpar
        cd "$DEPLOY_DIR"
        docker compose --profile baileys down -v 2>/dev/null || true
        
        rm -rf "$DEPLOY_DIR/volumes/db/data"
        log_success "Dados antigos removidos - banco será reinicializado com senha nova"
    fi
    
    mkdir -p "$DEPLOY_DIR/volumes/db/data"
    mkdir -p "$DEPLOY_DIR/volumes/db/init"
    mkdir -p "$DEPLOY_DIR/volumes/storage"
    mkdir -p "$DEPLOY_DIR/volumes/kong"
    mkdir -p "$DEPLOY_DIR/volumes/baileys/sessions"
    mkdir -p "$DEPLOY_DIR/nginx/ssl"
    mkdir -p "$DEPLOY_DIR/backups"
    mkdir -p "$DEPLOY_DIR/frontend/dist"
    
    # Copiar init.sql como arquivo único (Docker precisa que exista para file mount)
    if [ -f "$DEPLOY_DIR/supabase/init.sql" ]; then
        cp "$DEPLOY_DIR/supabase/init.sql" "$DEPLOY_DIR/volumes/db/init/init.sql"
    fi
    
    # Criar arquivo vazio se não existir (evita erro de mount)
    touch "$DEPLOY_DIR/volumes/db/init/init.sql"
    
    log_success "Diretórios criados"
}

# Configurar Kong
configure_kong() {
    log_step "Configurando Kong API Gateway"
    
    cat > "$DEPLOY_DIR/volumes/kong/kong.yml" << 'EOF'
_format_version: "2.1"
_transform: true

services:
  - name: auth-v1
    url: http://auth:9999/verify
    routes:
      - name: auth-v1-route
        strip_path: true
        paths:
          - /auth/v1/verify
    plugins:
      - name: cors
  - name: auth-v1-all
    url: http://auth:9999
    routes:
      - name: auth-v1-all-route
        strip_path: true
        paths:
          - /auth/v1
    plugins:
      - name: cors

  - name: rest-v1
    url: http://rest:3000
    routes:
      - name: rest-v1-route
        strip_path: true
        paths:
          - /rest/v1
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: false
          key_names:
            - apikey

  - name: realtime-v1
    url: http://realtime:4000/socket
    routes:
      - name: realtime-v1-route
        strip_path: true
        paths:
          - /realtime/v1
    plugins:
      - name: cors

  - name: storage-v1
    url: http://storage:5000
    routes:
      - name: storage-v1-route
        strip_path: true
        paths:
          - /storage/v1
    plugins:
      - name: cors

  - name: functions-v1
    url: http://functions:8000
    routes:
      - name: functions-v1-route
        strip_path: true
        paths:
          - /functions/v1
    plugins:
      - name: cors

consumers:
  - username: anon
    keyauth_credentials:
      - key: ${SUPABASE_ANON_KEY}
  - username: service_role
    keyauth_credentials:
      - key: ${SUPABASE_SERVICE_KEY}

plugins:
  - name: cors
    config:
      origins:
        - "*"
      methods:
        - GET
        - HEAD
        - PUT
        - PATCH
        - POST
        - DELETE
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
        - apikey
        - X-Client-Info
      exposed_headers:
        - X-Supabase-Api-Version
      credentials: true
      max_age: 3600
EOF
    
    log_success "Kong configurado"
}

# Configurar SSL
configure_ssl() {
    log_step "Configurando SSL"
    
    if ! command -v certbot &> /dev/null; then
        log_info "Instalando Certbot..."
        apt-get update
        apt-get install -y certbot
    fi
    
    if [ -n "$DOMAIN" ] && [ -n "$SSL_EMAIL" ]; then
        log_info "Obtendo certificado SSL para $DOMAIN..."
        
        docker compose -f "$DEPLOY_DIR/docker-compose.yml" down 2>/dev/null || true
        
        certbot certonly --standalone -d "$DOMAIN" --email "$SSL_EMAIL" --agree-tos --non-interactive || {
            log_warn "Não foi possível obter certificado Let's Encrypt"
            log_info "Gerando certificado auto-assinado..."
            
            openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                -keyout "$DEPLOY_DIR/nginx/ssl/privkey.pem" \
                -out "$DEPLOY_DIR/nginx/ssl/fullchain.pem" \
                -subj "/CN=$DOMAIN"
        }
        
        if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
            cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$DEPLOY_DIR/nginx/ssl/"
            cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$DEPLOY_DIR/nginx/ssl/"
            log_success "Certificado SSL configurado"
        fi
    else
        log_warn "Domínio ou email não configurado, gerando certificado auto-assinado"
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$DEPLOY_DIR/nginx/ssl/privkey.pem" \
            -out "$DEPLOY_DIR/nginx/ssl/fullchain.pem" \
            -subj "/CN=localhost"
    fi
}

# Compilar frontend se necessário
build_frontend() {
    log_step "Verificando Frontend"
    
    if [ ! -f "$DEPLOY_DIR/frontend/dist/index.html" ]; then
        log_info "Frontend não encontrado, compilando..."
        
        if [ -f "$PROJECT_DIR/package.json" ]; then
            cd "$PROJECT_DIR"
            
            if command -v npm &> /dev/null; then
                npm install
                npm run build
                
                if [ -d "$PROJECT_DIR/dist" ]; then
                    cp -r "$PROJECT_DIR/dist/"* "$DEPLOY_DIR/frontend/dist/"
                    log_success "Frontend compilado"
                fi
            else
                log_warn "npm não encontrado. Instale Node.js ou copie o frontend compilado manualmente"
            fi
        fi
    else
        log_success "Frontend já está compilado"
    fi
}

# Iniciar serviços
start_services() {
    log_step "Iniciando Serviços"
    
    cd "$DEPLOY_DIR"
    
    log_info "Iniciando containers Docker..."
    docker compose --profile baileys up -d
    
    log_info "Aguardando containers iniciarem..."
    
    # Verificação ativa em vez de sleep fixo
    local max_wait=60
    local waited=0
    while [ $waited -lt $max_wait ]; do
        local running=$(docker compose --profile baileys ps --format '{{.State}}' 2>/dev/null | grep -c "running" || echo "0")
        if [ "$running" -ge 5 ]; then
            break
        fi
        sleep 5
        waited=$((waited + 5))
        log_info "Aguardando containers... ($waited/${max_wait}s, $running rodando)"
    done
    
    echo ""
    log_info "Status dos containers:"
    services=("supabase-db" "supabase-auth" "supabase-rest" "supabase-kong" "supabase-functions" "supabase-storage" "baileys-server" "app-nginx")
    for service in "${services[@]}"; do
        local status=$(docker inspect --format='{{.State.Status}}' "$service" 2>/dev/null || echo "not found")
        if [ "$status" = "running" ]; then
            log_success "$service: $status"
        else
            log_warn "$service: $status"
        fi
    done
    
    # Verificar especificamente o container auth (causa mais comum de falha)
    local auth_status=$(docker inspect --format='{{.State.Health.Status}}' supabase-auth 2>/dev/null || echo "not found")
    if [ "$auth_status" = "unhealthy" ]; then
        log_error "Container supabase-auth está unhealthy!"
        log_error "=== Últimas 20 linhas de log do Auth ==="
        docker logs supabase-auth --tail 20 2>&1
        log_info "Tentando reiniciar o auth..."
        docker compose restart auth
        sleep 15
        
        # Verificar novamente
        auth_status=$(docker inspect --format='{{.State.Health.Status}}' supabase-auth 2>/dev/null || echo "not found")
        if [ "$auth_status" = "healthy" ]; then
            log_success "Auth reiniciado com sucesso!"
        else
            log_error "Auth continua unhealthy após reinício. Verifique os logs acima."
            log_error "Causa mais provável: senha do banco não corresponde aos roles internos."
            log_info "Solução: remova volumes/db/data e rode a instalação novamente."
        fi
    fi
}

# Aguardar banco de dados ficar pronto
wait_for_database() {
    log_step "Aguardando Banco de Dados"
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        attempt=$((attempt + 1))
        
        if docker exec supabase-db pg_isready -U postgres &>/dev/null; then
            log_success "Banco de dados está pronto (tentativa $attempt/$max_attempts)"
            return 0
        fi
        
        log_info "Aguardando banco de dados... ($attempt/$max_attempts)"
        sleep 5
    done
    
    log_error "Banco de dados não ficou pronto após $max_attempts tentativas"
    return 1
}

# Aguardar GoTrue (Auth) ficar pronto - verifica diretamente na porta 9999
wait_for_auth() {
    log_step "Aguardando Serviço de Autenticação (GoTrue)"
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        attempt=$((attempt + 1))
        
        # Verificar GoTrue diretamente na porta 9999 (não via Kong)
        local health_code
        health_code=$(docker exec supabase-auth wget -q -O /dev/null --spider "http://localhost:9999/health" 2>&1 && echo "200" || echo "000")
        
        if [ "$health_code" = "200" ]; then
            log_success "GoTrue (Auth) está pronto (tentativa $attempt/$max_attempts)"
            break
        fi
        
        log_info "Aguardando GoTrue... ($attempt/$max_attempts)"
        sleep 5
    done
    
    if [ "$health_code" != "200" ]; then
        log_error "GoTrue não ficou pronto após $max_attempts tentativas"
        log_error "=== Logs do GoTrue (últimas 30 linhas) ==="
        docker logs supabase-auth --tail 30 2>&1 || true
        echo ""
        log_error "=== Status dos containers ==="
        docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
        return 1
    fi
    
    # Agora verificar se Kong está acessível na porta 8000
    log_info "Verificando Kong API Gateway (porta 8000)..."
    local kong_attempts=0
    local kong_max=15
    
    while [ $kong_attempts -lt $kong_max ]; do
        kong_attempts=$((kong_attempts + 1))
        
        local kong_code
        kong_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/auth/v1/health" 2>/dev/null || echo "000")
        
        if [ "$kong_code" = "200" ]; then
            log_success "Kong API Gateway está pronto (tentativa $kong_attempts/$kong_max)"
            return 0
        fi
        
        log_info "Aguardando Kong... ($kong_attempts/$kong_max) [HTTP $kong_code]"
        sleep 3
    done
    
    log_error "Kong não ficou pronto na porta 8000"
    log_error "=== Logs do Kong (últimas 20 linhas) ==="
    docker logs supabase-kong --tail 20 2>&1 || true
    echo ""
    log_error "=== Logs do Functions (últimas 10 linhas) ==="
    docker logs supabase-functions --tail 10 2>&1 || true
    log_warn "Continuando instalação apesar do Kong não estar pronto..."
    return 1
}

# Criar admin, tenant e subscription automaticamente
create_admin_and_tenant() {
    log_step "Criando Admin e Tenant"
    
    # 1. Criar usuário admin via GoTrue API (via Kong)
    log_info "Criando usuário admin via API..."
    
    local signup_response
    signup_response=$(curl -s -X POST "http://localhost:8000/auth/v1/signup" \
        -H "apikey: $ANON_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$ADMIN_EMAIL\",
            \"password\": \"$ADMIN_PASSWORD\",
            \"data\": {
                \"name\": \"$ADMIN_NAME\"
            }
        }" 2>/dev/null)
    
    # Extrair user_id da resposta
    local ADMIN_USER_ID
    ADMIN_USER_ID=$(echo "$signup_response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$ADMIN_USER_ID" ]; then
        log_warn "Não foi possível criar admin via API. Tentando via SQL direto..."
        
        # Fallback: criar via SQL direto no banco
        ADMIN_USER_ID=$(docker exec supabase-db psql -U postgres -t -c "
            INSERT INTO auth.users (
                instance_id, id, aud, role, email, 
                encrypted_password, email_confirmed_at,
                raw_app_meta_data, raw_user_meta_data,
                created_at, updated_at, confirmation_token
            ) VALUES (
                '00000000-0000-0000-0000-000000000000',
                gen_random_uuid(), 'authenticated', 'authenticated',
                '$ADMIN_EMAIL',
                crypt('$ADMIN_PASSWORD', gen_salt('bf')),
                now(),
                '{\"provider\": \"email\", \"providers\": [\"email\"]}'::jsonb,
                '{\"name\": \"$ADMIN_NAME\"}'::jsonb,
                now(), now(), ''
            )
            ON CONFLICT (email) DO UPDATE SET updated_at = now()
            RETURNING id;
        " 2>/dev/null | tr -d ' \n')
        
        if [ -z "$ADMIN_USER_ID" ]; then
            # Se já existe, buscar o ID
            ADMIN_USER_ID=$(docker exec supabase-db psql -U postgres -t -c "
                SELECT id FROM auth.users WHERE email = '$ADMIN_EMAIL' LIMIT 1;
            " 2>/dev/null | tr -d ' \n')
        fi
    fi
    
    if [ -z "$ADMIN_USER_ID" ]; then
        log_error "Falha ao criar/encontrar usuário admin"
        log_warn "Você pode criar o admin manualmente após a instalação"
        return 1
    fi
    
    log_success "Admin criado com ID: $ADMIN_USER_ID"
    
    # 2. Promover para super_admin
    log_info "Promovendo para super_admin..."
    docker exec supabase-db psql -U postgres -c "
        -- Remover role existente se houver
        DELETE FROM public.user_roles WHERE user_id = '$ADMIN_USER_ID';
        
        -- Inserir como super_admin
        INSERT INTO public.user_roles (user_id, role)
        VALUES ('$ADMIN_USER_ID', 'super_admin')
        ON CONFLICT (user_id, role) DO NOTHING;
    " 2>/dev/null
    log_success "Usuário promovido para super_admin"
    
    # 3. Criar tenant principal
    log_info "Criando tenant principal..."
    local TENANT_ID
    TENANT_ID=$(docker exec supabase-db psql -U postgres -t -c "
        INSERT INTO public.tenants (name, slug, owner_user_id, plan, subscription_status, is_active, subscription_expires_at)
        VALUES ('Empresa Principal', 'empresa-principal', '$ADMIN_USER_ID', 'basic', 'trial', true, now() + interval '30 days')
        ON CONFLICT DO NOTHING
        RETURNING id;
    " 2>/dev/null | tr -d ' \n')
    
    if [ -z "$TENANT_ID" ]; then
        # Se já existe, buscar o ID
        TENANT_ID=$(docker exec supabase-db psql -U postgres -t -c "
            SELECT id FROM public.tenants WHERE owner_user_id = '$ADMIN_USER_ID' LIMIT 1;
        " 2>/dev/null | tr -d ' \n')
    fi
    
    if [ -n "$TENANT_ID" ]; then
        log_success "Tenant criado com ID: $TENANT_ID"
        
        # 4. Atualizar perfil do admin com tenant_id
        log_info "Vinculando admin ao tenant..."
        docker exec supabase-db psql -U postgres -c "
            UPDATE public.profiles 
            SET tenant_id = '$TENANT_ID'
            WHERE user_id = '$ADMIN_USER_ID';
        " 2>/dev/null
        log_success "Admin vinculado ao tenant"
        
        # 5. Criar subscription trial de 30 dias
        log_info "Criando subscription trial..."
        docker exec supabase-db psql -U postgres -c "
            INSERT INTO public.tenant_subscriptions (
                tenant_id, plan_id, billing_cycle, status,
                current_period_start, current_period_end, trial_ends_at
            )
            SELECT 
                '$TENANT_ID',
                sp.id,
                'monthly',
                'active',
                now(),
                now() + interval '30 days',
                now() + interval '30 days'
            FROM public.subscription_plans sp
            WHERE sp.slug = 'basico'
            LIMIT 1
            ON CONFLICT DO NOTHING;
        " 2>/dev/null
        log_success "Trial de 30 dias ativado"
        
        # 6. Injetar credenciais do Baileys no system_settings
        log_info "Configurando credenciais do Baileys no banco..."
        docker exec supabase-db psql -U postgres -c "
            UPDATE public.system_settings
            SET value = '$BAILEYS_API_KEY'
            WHERE key = 'baileys_api_key';
        " 2>/dev/null
        log_success "Credenciais do Baileys configuradas"
    else
        log_warn "Não foi possível criar tenant. Configure manualmente."
    fi
}

# Verificar instalação
verify_installation() {
    log_step "Verificando Instalação"
    
    sleep 10
    
    log_info "Testando endpoints..."
    
    # Frontend
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost/health" | grep -q "200"; then
        log_success "Frontend: OK"
    else
        log_warn "Frontend: Pode demorar para iniciar"
    fi
    
    # Baileys
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/health" 2>/dev/null | grep -q "200"; then
        log_success "Baileys: OK"
    else
        log_info "Baileys: Verificando via Docker..."
        if docker ps | grep -q "baileys-server"; then
            log_success "Baileys: Container rodando"
        fi
    fi
}

# Salvar credenciais em arquivo
save_credentials() {
    log_step "Salvando Credenciais"
    
    cat > "$DEPLOY_DIR/CREDENCIAIS.txt" << EOF
============================================
   CREDENCIAIS DO SISTEMA
   Gerado em: $(date)
============================================

=== ACESSO AO SISTEMA ===
URL:      https://$DOMAIN
Email:    $ADMIN_EMAIL
Senha:    $ADMIN_PASSWORD

=== BAILEYS (WhatsApp Engine) ===
API Key:  $BAILEYS_API_KEY
URL API:  https://$DOMAIN/baileys

=== BANCO DE DADOS ===
Host:     localhost
Porta:    5432
Database: postgres
Usuário:  postgres
Senha:    $POSTGRES_PASSWORD

=== CHAVES JWT ===
JWT Secret:      $JWT_SECRET
Anon Key:        $ANON_KEY
Service Role:    $SERVICE_ROLE_KEY

=== COMANDOS ÚTEIS ===
# Ver logs
docker compose --profile baileys logs -f

# Reiniciar
docker compose --profile baileys restart

# Parar
docker compose --profile baileys down

# Backup
./scripts/backup.sh

============================================
  GUARDE ESTE ARQUIVO EM LOCAL SEGURO!
============================================
EOF

    chmod 600 "$DEPLOY_DIR/CREDENCIAIS.txt"
    log_success "Credenciais salvas em: $DEPLOY_DIR/CREDENCIAIS.txt"
}

# Mostrar resumo final
show_summary() {
    echo -e "\n${GREEN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                                                               ║"
    echo "║               INSTALAÇÃO CONCLUÍDA COM SUCESSO!              ║"
    echo "║                                                               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    echo ""
    echo -e "${CYAN}=== INFORMAÇÕES DE ACESSO ===${NC}"
    echo ""
    echo -e "  Sistema Web:     ${GREEN}https://$DOMAIN${NC}"
    echo -e "  Baileys API:     ${GREEN}https://$DOMAIN/baileys${NC}"
    echo ""
    echo -e "${CYAN}=== CREDENCIAIS DO ADMIN ===${NC}"
    echo ""
    echo -e "  Email:           ${YELLOW}$ADMIN_EMAIL${NC}"
    echo -e "  Senha:           ${YELLOW}$ADMIN_PASSWORD${NC}"
    echo ""
    echo -e "${CYAN}=== CREDENCIAIS ===${NC}"
    echo ""
    echo -e "  Baileys API Key: ${YELLOW}$BAILEYS_API_KEY${NC}"
    echo -e "  JWT Secret:      ${YELLOW}(salvo em .env e CREDENCIAIS.txt)${NC}"
    echo ""
    echo -e "  ${GREEN}Arquivo completo: $DEPLOY_DIR/CREDENCIAIS.txt${NC}"
    echo ""
    echo -e "${CYAN}=== COMANDOS ÚTEIS ===${NC}"
    echo ""
    echo "  # Ver logs de todos os serviços"
    echo "  docker compose --profile baileys logs -f"
    echo ""
    echo "  # Ver status dos containers"
    echo "  docker compose --profile baileys ps"
    echo ""
    echo "  # Reiniciar serviços"
    echo "  docker compose --profile baileys restart"
    echo ""
    echo -e "${YELLOW}  IMPORTANTE: Guarde as credenciais em local seguro!${NC}"
    echo -e "${YELLOW}  O arquivo CREDENCIAIS.txt contém TUDO que você precisa.${NC}"
    echo ""
}

# Função principal
main() {
    show_banner
    check_root
    check_requirements
    install_docker
    detect_existing_baileys
    migrate_baileys_sessions
    stop_existing_baileys
    collect_user_info
    generate_jwt_keys
    create_env_file
    create_directories
    configure_kong
    configure_ssl
    build_frontend
    start_services
    wait_for_database
    wait_for_auth
    create_admin_and_tenant
    save_credentials
    verify_installation
    show_summary
}

# Executar
main "$@"
