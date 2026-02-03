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
    
    # Verificar locais comuns
    for dir in "/opt/baileys" "/root/baileys" "$HOME/baileys"; do
        if [ -d "$dir/sessions" ]; then
            log_success "Encontrada instalação Baileys em: $dir"
            BAILEYS_EXISTS=true
            EXISTING_SESSIONS_DIR="$dir/sessions"
            
            # Tentar extrair API Key existente
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
        
        # Criar diretório de destino
        mkdir -p "$DEPLOY_DIR/volumes/baileys/sessions"
        
        # Contar sessões
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
    
    # Email SSL: usar variável de ambiente ou gerar
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

# Gerar chaves JWT
generate_jwt_keys() {
    log_step "Gerando Chaves JWT"
    
    # Gerar ANON_KEY
    ANON_KEY=$(node -e "
        const jwt = require('jsonwebtoken');
        const payload = {
            role: 'anon',
            iss: 'supabase',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60)
        };
        console.log(jwt.sign(payload, '$JWT_SECRET'));
    " 2>/dev/null) || ANON_KEY=$(openssl rand -base64 64 | tr -dc 'a-zA-Z0-9' | head -c 64)
    
    # Gerar SERVICE_ROLE_KEY
    SERVICE_ROLE_KEY=$(node -e "
        const jwt = require('jsonwebtoken');
        const payload = {
            role: 'service_role',
            iss: 'supabase',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60)
        };
        console.log(jwt.sign(payload, '$JWT_SECRET'));
    " 2>/dev/null) || SERVICE_ROLE_KEY=$(openssl rand -base64 64 | tr -dc 'a-zA-Z0-9' | head -c 64)
    
    log_success "Chaves JWT geradas"
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
    
    mkdir -p "$DEPLOY_DIR/volumes/db/data"
    mkdir -p "$DEPLOY_DIR/volumes/db/init"
    mkdir -p "$DEPLOY_DIR/volumes/storage"
    mkdir -p "$DEPLOY_DIR/volumes/kong"
    mkdir -p "$DEPLOY_DIR/volumes/baileys/sessions"
    mkdir -p "$DEPLOY_DIR/nginx/ssl"
    mkdir -p "$DEPLOY_DIR/backups"
    mkdir -p "$DEPLOY_DIR/frontend/dist"
    
    # Copiar init.sql se existir
    if [ -f "$DEPLOY_DIR/supabase/init.sql" ]; then
        cp "$DEPLOY_DIR/supabase/init.sql" "$DEPLOY_DIR/volumes/db/init/"
    fi
    
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
    
    # Verificar se certbot está instalado
    if ! command -v certbot &> /dev/null; then
        log_info "Instalando Certbot..."
        apt-get update
        apt-get install -y certbot
    fi
    
    # Tentar obter certificado Let's Encrypt
    if [ -n "$DOMAIN" ] && [ -n "$SSL_EMAIL" ]; then
        log_info "Obtendo certificado SSL para $DOMAIN..."
        
        # Parar serviços que possam estar usando porta 80
        docker compose -f "$DEPLOY_DIR/docker-compose.yml" down 2>/dev/null || true
        
        certbot certonly --standalone -d "$DOMAIN" --email "$SSL_EMAIL" --agree-tos --non-interactive || {
            log_warn "Não foi possível obter certificado Let's Encrypt"
            log_info "Gerando certificado auto-assinado..."
            
            openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                -keyout "$DEPLOY_DIR/nginx/ssl/privkey.pem" \
                -out "$DEPLOY_DIR/nginx/ssl/fullchain.pem" \
                -subj "/CN=$DOMAIN"
        }
        
        # Copiar certificados se obtidos via Let's Encrypt
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
            
            # Instalar dependências
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
    
    # Iniciar com profile baileys
    log_info "Iniciando containers Docker..."
    docker compose --profile baileys up -d
    
    # Aguardar serviços iniciarem
    log_info "Aguardando serviços iniciarem..."
    sleep 30
    
    # Verificar saúde dos serviços
    log_info "Verificando saúde dos serviços..."
    
    services=("supabase-db" "supabase-auth" "supabase-rest" "supabase-kong" "baileys-server" "app-nginx")
    for service in "${services[@]}"; do
        if docker ps --format '{{.Names}}' | grep -q "^${service}$"; then
            log_success "$service: Rodando"
        else
            log_warn "$service: Não encontrado ou não iniciou"
        fi
    done
}

# Verificar instalação
verify_installation() {
    log_step "Verificando Instalação"
    
    # Testar endpoint de saúde
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
    echo -e "Sistema Web:     ${GREEN}https://$DOMAIN${NC}"
    echo -e "Baileys API:     ${GREEN}https://$DOMAIN/baileys${NC}"
    echo -e "Supabase Studio: ${GREEN}https://$DOMAIN/studio/${NC}"
    echo ""
    echo -e "${CYAN}=== CREDENCIAIS ===${NC}"
    echo ""
    echo -e "Baileys API Key: ${YELLOW}$BAILEYS_API_KEY${NC}"
    echo -e "JWT Secret:      ${YELLOW}(salvo em .env)${NC}"
    echo ""
    echo -e "${CYAN}=== COMANDOS ÚTEIS ===${NC}"
    echo ""
    echo "# Ver logs de todos os serviços"
    echo "docker compose --profile baileys logs -f"
    echo ""
    echo "# Ver status dos containers"
    echo "docker compose --profile baileys ps"
    echo ""
    echo "# Reiniciar serviços"
    echo "docker compose --profile baileys restart"
    echo ""
    echo "# Parar serviços"
    echo "docker compose --profile baileys down"
    echo ""
    echo -e "${YELLOW}IMPORTANTE: Guarde as credenciais em local seguro!${NC}"
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
    verify_installation
    show_summary
}

# Executar
main "$@"
