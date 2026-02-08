#!/bin/bash

# ============================================
# Script de Instalação Unificada
# Sistema de Atendimento + Baileys WhatsApp Server
# ============================================

# NOTA: Não usar set -e em scripts de instalação complexos.
# Qualquer comando que falhe mataria o script silenciosamente,
# impedindo diagnóstico e fallback.

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
    
    # Credenciais do admin (senha fixa padrão)
    ADMIN_EMAIL="admin@admin.com"
    ADMIN_PASSWORD="123456"
    ADMIN_NAME="Administrador"
    log_success "Admin: $ADMIN_EMAIL / $ADMIN_PASSWORD"
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
ADDITIONAL_REDIRECT_URLS=

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
    
    # Gerar script de sincronização de senhas que roda DENTRO do init do PostgreSQL
    # Isso garante que as senhas das roles correspondam ao POSTGRES_PASSWORD
    # ANTES de qualquer serviço conectar (elimina race condition)
    cat > "$DEPLOY_DIR/volumes/db/init/99-sync-passwords.sh" << PASSEOF
#!/bin/bash
set -e
echo "=== Sincronizando senhas dos roles internos ==="
psql -v ON_ERROR_STOP=0 -U postgres <<-EOSQL
    ALTER ROLE supabase_auth_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
    ALTER ROLE supabase_storage_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
    ALTER ROLE authenticator WITH PASSWORD '${POSTGRES_PASSWORD}';
EOSQL
echo "=== Senhas sincronizadas com sucesso ==="
PASSEOF
    chmod +x "$DEPLOY_DIR/volumes/db/init/99-sync-passwords.sh"
    log_success "Script 99-sync-passwords.sh gerado"
    
    # Gerar roles.sql que será montado em /docker-entrypoint-initdb.d/init-scripts/
    # Este é o padrão oficial do Supabase para definir senhas das roles internas
    # Usa \set pgpass para ler POSTGRES_PASSWORD do ambiente do container em runtime
    cat > "$DEPLOY_DIR/volumes/db/roles.sql" << 'ROLESEOF'
-- roles.sql: Set passwords for internal Supabase roles
-- This file follows the official Supabase self-hosted pattern
-- Mounted at /docker-entrypoint-initdb.d/init-scripts/99-roles.sql
-- NOTE: change to your own passwords for production environments
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
ROLESEOF
    log_success "roles.sql gerado (formato oficial com \\set pgpass)"
    
    log_success "Diretórios criados"
}

# Configurar Kong
configure_kong() {
    log_step "Configurando Kong API Gateway"
    
    cat > "$DEPLOY_DIR/volumes/kong/kong.yml" << EOF
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
      - key: $ANON_KEY
  - username: service_role
    keyauth_credentials:
      - key: $SERVICE_ROLE_KEY

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

# Gerar config.js para runtime configuration do frontend
# Isso permite trocar de domínio sem recompilar o frontend
generate_frontend_config() {
    log_info "Gerando config.js para o frontend..."
    
    mkdir -p "$DEPLOY_DIR/frontend/dist"
    
    # Usar window.location.origin para que funcione em HTTP e HTTPS
    # Isso elimina problemas de mismatch de protocolo
    cat > "$DEPLOY_DIR/frontend/dist/config.js" << CONFIGEOF
window.__SUPABASE_CONFIG__ = {
  url: window.location.origin,
  anonKey: "${ANON_KEY}"
};
CONFIGEOF
    
    log_success "config.js gerado (usa origin dinâmico, anonKey injetada)"
}

# Compilar frontend se necessário
build_frontend() {
    log_step "Verificando Frontend"
    
    # Sempre limpar dist antigo para garantir que config.js seja injetado
    if [ -d "$DEPLOY_DIR/frontend/dist" ]; then
        log_info "Removendo build anterior para garantir rebuild limpo..."
        rm -rf "$DEPLOY_DIR/frontend/dist"
        mkdir -p "$DEPLOY_DIR/frontend/dist"
    fi
    
    if [ ! -f "$DEPLOY_DIR/frontend/dist/index.html" ]; then
        log_info "Compilando frontend..."
        
        if [ -f "$PROJECT_DIR/package.json" ]; then
            cd "$PROJECT_DIR"
            
            # Build with PLACEHOLDER env vars so the Supabase client
            # uses runtime config (window.__SUPABASE_CONFIG__ from config.js)
            if command -v npm &> /dev/null; then
                log_info "Compilando com npm local..."
                VITE_SUPABASE_URL="https://placeholder.supabase.co" \
                VITE_SUPABASE_PUBLISHABLE_KEY="placeholder" \
                VITE_SUPABASE_PROJECT_ID="self-hosted" \
                npm install && npm run build
            else
                log_info "npm não encontrado. Compilando via Docker..."
                docker run --rm \
                    -v "$PROJECT_DIR:/app" \
                    -w /app \
                    -e "VITE_SUPABASE_URL=https://placeholder.supabase.co" \
                    -e "VITE_SUPABASE_PUBLISHABLE_KEY=placeholder" \
                    -e "VITE_SUPABASE_PROJECT_ID=self-hosted" \
                    node:20-alpine sh -c "npm install && npm run build" 2>&1
            fi
            
            if [ -d "$PROJECT_DIR/dist" ]; then
                cp -r "$PROJECT_DIR/dist/"* "$DEPLOY_DIR/frontend/dist/"
                
                # Inject config.js script tag into index.html (before </head>)
                if [ -f "$DEPLOY_DIR/frontend/dist/index.html" ]; then
                    sed -i 's|</head>|<script src="/config.js"></script>\n</head>|' \
                        "$DEPLOY_DIR/frontend/dist/index.html"
                    log_success "config.js injetado no index.html"
                fi
                
                log_success "Frontend compilado com sucesso"
            else
                log_error "Falha na compilação do frontend - diretório dist não encontrado"
            fi
        else
            log_error "package.json não encontrado em $PROJECT_DIR"
        fi
    else
        log_success "Frontend já está compilado"
    fi
}

# Iniciar serviços em 3 etapas com diagnóstico e fallback
start_services() {
    log_step "Iniciando Serviços"
    cd "$DEPLOY_DIR"

    # =============================================
    # ETAPA 1: Banco de dados primeiro
    # =============================================
    log_info "Etapa 1/3: Iniciando banco de dados..."
    docker compose up -d db
    
    # Esperar banco ficar healthy
    local db_wait=0
    local db_max=60
    while [ $db_wait -lt $db_max ]; do
        local db_health=$(docker inspect --format='{{.State.Health.Status}}' supabase-db 2>/dev/null || echo "starting")
        if [ "$db_health" = "healthy" ]; then
            log_success "Banco de dados healthy"
            break
        fi
        sleep 3
        db_wait=$((db_wait + 3))
        log_info "Aguardando banco... ($db_wait/${db_max}s)"
    done
    
    if [ "$db_health" != "healthy" ]; then
        log_error "Banco não ficou healthy em ${db_max}s. Abortando."
        docker logs supabase-db --tail 20 2>&1
        return 1
    fi

    # =============================================
    # ETAPA 1b: Aguardar roles internas do Supabase
    # O init.sql NÃO é mais auto-executado (está em subdiretório).
    # Precisamos esperar apenas as roles internas do Supabase.
    # =============================================
    log_info "Aguardando roles internas do Supabase serem criadas..."
    local role_check=0
    local role_max=60
    while [ $role_check -lt $role_max ]; do
        if docker exec supabase-db psql -U postgres -t -c "SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin';" 2>/dev/null | grep -q "1"; then
            log_success "Roles internas do Supabase prontas"
            break
        fi
        sleep 3
        role_check=$((role_check + 3))
        log_info "Aguardando roles internas... ($role_check/${role_max}s)"
    done

    if [ $role_check -ge $role_max ]; then
        log_warn "Roles internas não encontradas após ${role_max}s"
        log_info "Criando roles manualmente como fallback..."
        docker exec supabase-db psql -U postgres -c "
            DO \$\$ BEGIN
                IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
                    CREATE ROLE supabase_auth_admin WITH LOGIN PASSWORD '${POSTGRES_PASSWORD}' NOINHERIT;
                END IF;
                IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
                    CREATE ROLE supabase_storage_admin WITH LOGIN PASSWORD '${POSTGRES_PASSWORD}' NOINHERIT;
                END IF;
                IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
                    CREATE ROLE authenticator WITH LOGIN PASSWORD '${POSTGRES_PASSWORD}' NOINHERIT;
                END IF;
                IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
                    CREATE ROLE anon NOLOGIN NOINHERIT;
                END IF;
                IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
                    CREATE ROLE authenticated NOLOGIN NOINHERIT;
                END IF;
                IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
                    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
                END IF;
                IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
                    CREATE ROLE supabase_admin WITH LOGIN PASSWORD '${POSTGRES_PASSWORD}' BYPASSRLS;
                END IF;
            END \$\$;
            GRANT anon TO authenticator;
            GRANT authenticated TO authenticator;
            GRANT service_role TO authenticator;
            GRANT supabase_admin TO authenticator;
            CREATE SCHEMA IF NOT EXISTS auth;
            GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
            GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
            GRANT ALL ON SCHEMA public TO supabase_admin, supabase_auth_admin;
            GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO supabase_admin, supabase_auth_admin;
            GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
            GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
            GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
        " 2>&1 || log_warn "Alguns grants podem ter falhado"
    fi

    # =============================================
    # ETAPA 1c: Executar init.sql manualmente
    # O script 99-sync-passwords.sh já foi executado automaticamente
    # pelo PostgreSQL durante o init, sincronizando as senhas das roles.
    # Agora só precisamos rodar o nosso init.sql com as tabelas do app.
    # =============================================
    log_info "Executando init.sql manualmente (modo seguro)..."
    docker exec supabase-db psql -U postgres -f /docker-entrypoint-initdb.d/migrations/init.sql 2>&1 | tail -5
    
    # Verificar se init.sql criou as tabelas
    if docker exec supabase-db psql -U postgres -t -c "SELECT 1 FROM public.profiles LIMIT 0;" 2>/dev/null | grep -q ""; then
        log_success "init.sql executado com sucesso - tabelas criadas"
    else
        log_error "init.sql falhou - tabela public.profiles não encontrada"
        log_warn "Continuando mesmo assim..."
    fi

    # =============================================
    # ETAPA 1d: Verificar que as senhas estão corretas
    # O 99-sync-passwords.sh deveria ter rodado durante o init.
    # Fazemos um teste rápido e ALTER ROLE como fallback apenas se falhar.
    # =============================================
    log_info "Verificando autenticação das roles..."
    
    local network_name
    network_name=$(docker inspect supabase-db --format='{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null | head -1)
    if [ -z "$network_name" ]; then
        network_name="deploy_supabase-network"
    fi
    
    local password_ok=false
    if docker run --rm --network "$network_name" \
        -e PGPASSWORD="${POSTGRES_PASSWORD}" \
        postgres:15-alpine \
        psql -U supabase_auth_admin -h db -d postgres -c "SELECT 1;" 2>/dev/null | grep -q "1"; then
        password_ok=true
        log_success "Senhas das roles corretas (99-sync-passwords.sh funcionou!)"
    fi
    
    if [ "$password_ok" = "false" ]; then
        log_warn "99-sync-passwords.sh pode não ter rodado. Aplicando ALTER ROLE como fallback..."
        docker exec supabase-db psql -U postgres -c \
            "ALTER ROLE supabase_auth_admin WITH PASSWORD '${POSTGRES_PASSWORD}';" 2>&1
        docker exec supabase-db psql -U postgres -c \
            "ALTER ROLE supabase_storage_admin WITH PASSWORD '${POSTGRES_PASSWORD}';" 2>&1
        docker exec supabase-db psql -U postgres -c \
            "ALTER ROLE authenticator WITH PASSWORD '${POSTGRES_PASSWORD}';" 2>&1
        docker exec supabase-db psql -U postgres -c "SELECT pg_reload_conf();" 2>/dev/null
        sleep 2
        log_success "Senhas sincronizadas via fallback"
    fi

    # =============================================
    # ETAPA 2: Auth (GoTrue) - agora com roles + schemas prontos
    # =============================================
    log_info "Etapa 2/3: Iniciando serviço de autenticação..."
    docker compose up -d auth
    
    # Aguardar auth com diagnóstico detalhado
    local auth_wait=0
    local auth_max=90
    local auth_ok=false
    local auth_crash_handled=false
    
    while [ $auth_wait -lt $auth_max ]; do
        # Verificar se o container ainda está rodando
        local auth_running=$(docker inspect --format='{{.State.Running}}' supabase-auth 2>/dev/null || echo "false")
        
        if [ "$auth_running" = "false" ] && [ "$auth_crash_handled" = "false" ]; then
            auth_crash_handled=true
            log_error "GoTrue crashou! Exibindo logs:"
            docker logs supabase-auth --tail 15 2>&1
            
            log_info "Reiniciando auth..."
            docker compose up -d auth
            sleep 5
        fi
        
        local auth_health=$(docker inspect --format='{{.State.Health.Status}}' supabase-auth 2>/dev/null || echo "starting")
        if [ "$auth_health" = "healthy" ]; then
            auth_ok=true
            log_success "Serviço de autenticação healthy!"
            break
        fi
        
        sleep 3
        auth_wait=$((auth_wait + 3))
        log_info "Aguardando auth... ($auth_wait/${auth_max}s) [status: $auth_health]"
    done
    
    if [ "$auth_ok" = "false" ]; then
        log_error "Auth não ficou healthy em ${auth_max}s"
        echo ""
        log_error "=== LOGS DO AUTH ==="
        docker logs supabase-auth --tail 40 2>&1
        echo ""
        log_error "=== ROLES NO BANCO ==="
        docker exec supabase-db psql -U postgres -c "SELECT rolname FROM pg_roles WHERE rolname LIKE 'supabase%' OR rolname IN ('authenticator','anon','authenticated','service_role');" 2>&1
        echo ""
        log_warn "Continuando instalação mesmo com auth unhealthy..."
    fi

    # =============================================
    # ETAPA 3: Todos os outros serviços
    # =============================================
    log_info "Etapa 3/3: Iniciando demais serviços..."
    docker compose --profile baileys up -d || true
    
    sleep 5
    
    echo ""
    log_info "Status final dos containers:"
    local services=("supabase-db" "supabase-auth" "supabase-rest" "supabase-kong" "supabase-functions" "supabase-storage" "baileys-server" "app-nginx")
    for service in "${services[@]}"; do
        local status=$(docker inspect --format='{{.State.Status}}' "$service" 2>/dev/null || echo "not found")
        local health=$(docker inspect --format='{{.State.Health.Status}}' "$service" 2>/dev/null || echo "n/a")
        if [ "$status" = "running" ]; then
            log_success "$service: $status (health: $health)"
        else
            log_warn "$service: $status"
        fi
    done
}

# Aguardar Kong API Gateway ficar pronto (DB e Auth já foram tratados em start_services)
wait_for_services() {
    log_step "Verificando Conectividade dos Serviços"
    
    # Verificar Kong na porta 8000 (precisa estar pronto para criar admin)
    log_info "Verificando Kong API Gateway (porta 8000)..."
    local kong_attempts=0
    local kong_max=20
    
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
    log_error "=== Logs do Auth (últimas 10 linhas) ==="
    docker logs supabase-auth --tail 10 2>&1 || true
    log_warn "Continuando instalação apesar do Kong não estar pronto..."
    return 1
}

# Criar admin automaticamente (sem tenant)
create_admin() {
    log_step "Criando Usuário Admin"
    
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
    
    # 2. Promover para admin
    log_info "Promovendo para admin..."
    docker exec supabase-db psql -U postgres -c "
        -- Remover role existente se houver
        DELETE FROM public.user_roles WHERE user_id = '$ADMIN_USER_ID';
        
        -- Inserir como admin
        INSERT INTO public.user_roles (user_id, role)
        VALUES ('$ADMIN_USER_ID', 'admin')
        ON CONFLICT (user_id, role) DO NOTHING;
    " 2>/dev/null
    log_success "Usuário promovido para admin"
    
    # 3. Configurar credenciais do Baileys no system_settings
    log_info "Configurando credenciais do Baileys no banco..."
    docker exec supabase-db psql -U postgres -c "
        UPDATE public.system_settings
        SET value = '$BAILEYS_API_KEY'
        WHERE key = 'baileys_api_key';
    " 2>/dev/null
    log_success "Credenciais do Baileys configuradas"
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
    echo -e "${CYAN}=== DOMÍNIO PERSONALIZADO ===${NC}"
    echo ""
    echo -e "  Para apontar um domínio personalizado:"
    echo -e "  ${YELLOW}sudo bash scripts/change-domain.sh meudominio.com.br${NC}"
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
    generate_frontend_config
    start_services
    wait_for_services
    create_admin
    save_credentials
    verify_installation
    show_summary
}

# Executar
main "$@"
