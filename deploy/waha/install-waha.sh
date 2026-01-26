#!/bin/bash

# ============================================
# Instalação WAHA - WhatsApp HTTP API
# Script independente para VPS de revendedores
# Versão: 1.0.0
# ============================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Funções de log
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
log_error() { echo -e "${RED}[ERRO]${NC} $1"; }

# Banner
show_banner() {
    echo -e "${CYAN}"
    echo "============================================"
    echo "  Instalação WAHA - WhatsApp HTTP API"
    echo "  Versão: 1.0.0"
    echo "============================================"
    echo -e "${NC}"
    echo ""
    echo "Este script irá instalar o servidor WAHA em sua VPS."
    echo "Você precisará de um domínio apontando para este servidor."
    echo ""
}

# Verificar se é root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Este script precisa ser executado como root (sudo)"
        exit 1
    fi
}

# Detectar sistema operacional
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    else
        log_error "Sistema operacional não suportado"
        exit 1
    fi
    
    log_info "Sistema detectado: $OS $VERSION"
}

# Instalar Docker
install_docker() {
    if command -v docker &> /dev/null; then
        log_success "Docker já está instalado"
        return
    fi
    
    log_info "Instalando Docker..."
    
    # Remover versões antigas
    apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
    
    # Instalar dependências
    apt-get update
    apt-get install -y \
        ca-certificates \
        curl \
        gnupg \
        lsb-release
    
    # Adicionar chave GPG oficial do Docker
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/$OS/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Configurar repositório
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS \
        $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Instalar Docker
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Iniciar e habilitar Docker
    systemctl start docker
    systemctl enable docker
    
    log_success "Docker instalado com sucesso"
}

# Instalar Docker Compose (standalone)
install_docker_compose() {
    if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
        log_success "Docker Compose já está instalado"
        return
    fi
    
    log_info "Instalando Docker Compose..."
    
    COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d\" -f4)
    curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    log_success "Docker Compose instalado"
}

# Instalar Certbot
install_certbot() {
    if command -v certbot &> /dev/null; then
        log_success "Certbot já está instalado"
        return
    fi
    
    log_info "Instalando Certbot..."
    
    apt-get update
    apt-get install -y certbot
    
    log_success "Certbot instalado"
}

# Coletar informações do usuário
collect_info() {
    echo ""
    echo -e "${CYAN}Informe as configurações:${NC}"
    echo ""
    
    # Domínio
    while [ -z "$DOMAIN" ]; do
        read -p "  Domínio do servidor (ex: waha.meusite.com.br): " DOMAIN
        if [ -z "$DOMAIN" ]; then
            log_warn "O domínio é obrigatório"
        fi
    done
    
    # Email para SSL
    while [ -z "$SSL_EMAIL" ]; do
        read -p "  Email para SSL (Let's Encrypt): " SSL_EMAIL
        if [ -z "$SSL_EMAIL" ]; then
            log_warn "O email é obrigatório para o certificado SSL"
        fi
    done
    
    # Webhook URL (opcional)
    read -p "  URL do Webhook (opcional, Enter para pular): " WEBHOOK_URL
    
    # Confirmar informações
    echo ""
    echo -e "${YELLOW}Confirme as informações:${NC}"
    echo "  Domínio: $DOMAIN"
    echo "  Email SSL: $SSL_EMAIL"
    echo "  Webhook: ${WEBHOOK_URL:-Não configurado}"
    echo ""
    
    read -p "As informações estão corretas? (s/n): " CONFIRM
    if [ "$CONFIRM" != "s" ] && [ "$CONFIRM" != "S" ]; then
        log_info "Reiniciando coleta de informações..."
        DOMAIN=""
        SSL_EMAIL=""
        WEBHOOK_URL=""
        collect_info
    fi
}

# Gerar API Key
generate_api_key() {
    WAHA_API_KEY=$(openssl rand -hex 32)
    log_success "API Key gerada"
}

# Criar estrutura de diretórios
create_directories() {
    log_info "Criando estrutura de diretórios..."
    
    INSTALL_DIR="/opt/waha"
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$INSTALL_DIR/nginx/ssl"
    mkdir -p "$INSTALL_DIR/data/sessions"
    mkdir -p "$INSTALL_DIR/data/media"
    mkdir -p "$INSTALL_DIR/scripts"
    
    cd "$INSTALL_DIR"
    
    log_success "Diretórios criados em $INSTALL_DIR"
}

# Criar arquivo .env
create_env_file() {
    log_info "Criando arquivo de configuração..."
    
    cat > "$INSTALL_DIR/.env" << EOF
# ============================================
# Configuração WAHA - Gerado automaticamente
# Data: $(date)
# ============================================

# Domínio do servidor WAHA
DOMAIN=$DOMAIN

# API Key (GUARDE EM LOCAL SEGURO!)
WAHA_API_KEY=$WAHA_API_KEY

# Email para SSL (Let's Encrypt)
SSL_EMAIL=$SSL_EMAIL

# URL do Webhook (onde enviar mensagens recebidas)
WEBHOOK_URL=$WEBHOOK_URL

# Portas
HTTP_PORT=80
HTTPS_PORT=443
EOF

    chmod 600 "$INSTALL_DIR/.env"
    log_success "Arquivo .env criado"
}

# Criar docker-compose.yml
create_docker_compose() {
    log_info "Criando docker-compose.yml..."
    
    cat > "$INSTALL_DIR/docker-compose.yml" << 'EOF'
version: "3.8"

services:
  waha:
    image: devlikeapro/waha:latest
    container_name: waha
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      WHATSAPP_API_KEY: ${WAHA_API_KEY}
      WHATSAPP_HOOK_URL: ${WEBHOOK_URL:-}
      WHATSAPP_HOOK_EVENTS: "message,message.any,message.ack,session.status,state.change"
      WHATSAPP_RESTART_ALL_SESSIONS: "true"
      WAHA_DASHBOARD_ENABLED: "true"
      WAHA_DASHBOARD_USERNAME: admin
      WAHA_DASHBOARD_PASSWORD: ${WAHA_API_KEY}
    volumes:
      - ./data/sessions:/app/.waha/sessions
      - ./data/media:/app/.waha/media
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - waha-network

  nginx:
    image: nginx:alpine
    container_name: waha-proxy
    restart: unless-stopped
    ports:
      - "${HTTP_PORT:-80}:80"
      - "${HTTPS_PORT:-443}:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - waha
    networks:
      - waha-network

networks:
  waha-network:
    driver: bridge
EOF

    log_success "docker-compose.yml criado"
}

# Criar configuração do Nginx
create_nginx_config() {
    log_info "Criando configuração do Nginx..."
    
    cat > "$INSTALL_DIR/nginx/nginx.conf" << EOF
events {
    worker_connections 1024;
}

http {
    # Configurações de log
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    # Configurações de proxy
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    upstream waha_backend {
        server waha:3000;
    }

    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name $DOMAIN;
        
        # Para renovação do certificado
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        
        location / {
            return 301 https://\$server_name\$request_uri;
        }
    }

    # HTTPS Server
    server {
        listen 443 ssl http2;
        server_name $DOMAIN;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;

        # Segurança
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";

        location / {
            proxy_pass http://waha_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            
            # WebSocket support
            proxy_cache_bypass \$http_upgrade;
        }
    }
}
EOF

    log_success "Configuração do Nginx criada"
}

# Obter certificado SSL
obtain_ssl_certificate() {
    log_info "Obtendo certificado SSL..."
    
    # Parar nginx temporariamente se estiver rodando
    docker stop waha-proxy 2>/dev/null || true
    
    # Obter certificado
    certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$SSL_EMAIL" \
        -d "$DOMAIN"
    
    # Copiar certificados para o diretório do nginx
    cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem "$INSTALL_DIR/nginx/ssl/"
    cp /etc/letsencrypt/live/$DOMAIN/privkey.pem "$INSTALL_DIR/nginx/ssl/"
    
    # Configurar renovação automática
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/$DOMAIN/*.pem $INSTALL_DIR/nginx/ssl/ && docker restart waha-proxy") | crontab -
    
    log_success "Certificado SSL obtido e configurado"
}

# Criar scripts auxiliares
create_helper_scripts() {
    log_info "Criando scripts auxiliares..."
    
    # Script de backup
    cat > "$INSTALL_DIR/scripts/backup.sh" << 'EOFBACKUP'
#!/bin/bash
# Backup das sessões WAHA

BACKUP_DIR="/opt/waha/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "Fazendo backup das sessões..."
tar -czf "$BACKUP_DIR/sessions_$DATE.tar.gz" -C /opt/waha/data sessions

echo "Fazendo backup das mídias..."
tar -czf "$BACKUP_DIR/media_$DATE.tar.gz" -C /opt/waha/data media

# Manter apenas últimos 7 dias
find "$BACKUP_DIR" -type f -mtime +7 -delete

echo "Backup concluído: $BACKUP_DIR"
ls -lh "$BACKUP_DIR"
EOFBACKUP

    # Script de atualização
    cat > "$INSTALL_DIR/scripts/update.sh" << 'EOFUPDATE'
#!/bin/bash
# Atualizar WAHA para última versão

cd /opt/waha

echo "Parando containers..."
docker-compose down

echo "Baixando nova imagem..."
docker pull devlikeapro/waha:latest

echo "Iniciando containers..."
docker-compose up -d

echo "Verificando status..."
sleep 10
docker-compose ps

echo "Atualização concluída!"
EOFUPDATE

    # Script de desinstalação
    cat > "$INSTALL_DIR/scripts/uninstall.sh" << 'EOFUNINSTALL'
#!/bin/bash
# Desinstalar WAHA

echo "ATENÇÃO: Isso irá remover o WAHA e todos os dados!"
read -p "Tem certeza? (digite 'sim' para confirmar): " CONFIRM

if [ "$CONFIRM" != "sim" ]; then
    echo "Cancelado."
    exit 0
fi

cd /opt/waha

echo "Parando containers..."
docker-compose down -v

echo "Removendo imagens..."
docker rmi devlikeapro/waha:latest nginx:alpine 2>/dev/null || true

echo "Removendo diretórios..."
rm -rf /opt/waha

echo "Removendo cron de renovação SSL..."
crontab -l | grep -v "waha" | crontab -

echo "Desinstalação concluída!"
EOFUNINSTALL

    # Script de status
    cat > "$INSTALL_DIR/scripts/status.sh" << 'EOFSTATUS'
#!/bin/bash
# Verificar status do WAHA

cd /opt/waha

echo "=== Status dos Containers ==="
docker-compose ps

echo ""
echo "=== Health Check ==="
source .env
curl -s -o /dev/null -w "WAHA API: %{http_code}\n" http://localhost:3000/api/health
curl -s -o /dev/null -w "HTTPS: %{http_code}\n" https://$DOMAIN/api/health -k

echo ""
echo "=== Uso de Disco ==="
du -sh /opt/waha/data/*

echo ""
echo "=== Últimos Logs (WAHA) ==="
docker logs waha --tail 20
EOFSTATUS

    chmod +x "$INSTALL_DIR/scripts/"*.sh
    
    log_success "Scripts auxiliares criados"
}

# Iniciar containers
start_containers() {
    log_info "Iniciando containers..."
    
    cd "$INSTALL_DIR"
    
    # Detectar comando do Docker Compose
    if command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE="docker-compose"
    else
        DOCKER_COMPOSE="docker compose"
    fi
    
    $DOCKER_COMPOSE up -d
    
    log_info "Aguardando containers iniciarem..."
    sleep 15
    
    # Verificar status
    if $DOCKER_COMPOSE ps | grep -q "Up"; then
        log_success "Containers iniciados com sucesso"
    else
        log_error "Erro ao iniciar containers. Verifique os logs com: docker-compose logs"
        exit 1
    fi
}

# Verificar saúde do serviço
check_health() {
    log_info "Verificando saúde do serviço..."
    
    # Aguardar WAHA iniciar completamente
    for i in {1..30}; do
        if curl -s http://localhost:3000/api/health | grep -q "ok"; then
            log_success "WAHA está funcionando!"
            return 0
        fi
        sleep 2
    done
    
    log_warn "WAHA ainda não respondeu. Pode precisar de mais tempo para iniciar."
}

# Exibir resultado final
show_result() {
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}  Instalação Concluída com Sucesso!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo "  Seu servidor WAHA está funcionando!"
    echo ""
    echo -e "  ${CYAN}URL da API:${NC} https://$DOMAIN"
    echo -e "  ${CYAN}API Key:${NC} $WAHA_API_KEY"
    echo ""
    echo -e "  ${CYAN}Dashboard WAHA:${NC} https://$DOMAIN/dashboard"
    echo -e "  ${CYAN}Usuário:${NC} admin"
    echo -e "  ${CYAN}Senha:${NC} $WAHA_API_KEY"
    echo ""
    echo -e "${YELLOW}  IMPORTANTE: Guarde a API Key em local seguro!${NC}"
    echo ""
    echo "  Para conectar ao sistema principal:"
    echo "  1. Acesse Cloud > Secrets"
    echo "  2. Adicione as seguintes variáveis:"
    echo -e "     - ${CYAN}WAHA_API_URL${NC} = https://$DOMAIN"
    echo -e "     - ${CYAN}WAHA_API_KEY${NC} = $WAHA_API_KEY"
    echo ""
    echo "  Comandos úteis:"
    echo "    Ver logs:      cd /opt/waha && docker-compose logs -f"
    echo "    Reiniciar:     cd /opt/waha && docker-compose restart"
    echo "    Parar:         cd /opt/waha && docker-compose down"
    echo "    Status:        /opt/waha/scripts/status.sh"
    echo "    Backup:        /opt/waha/scripts/backup.sh"
    echo "    Atualizar:     /opt/waha/scripts/update.sh"
    echo ""
    echo -e "${GREEN}============================================${NC}"
    
    # Salvar credenciais em arquivo
    cat > "$INSTALL_DIR/CREDENCIAIS.txt" << EOF
============================================
CREDENCIAIS WAHA - GUARDE EM LOCAL SEGURO!
Gerado em: $(date)
============================================

URL da API: https://$DOMAIN
API Key: $WAHA_API_KEY

Dashboard: https://$DOMAIN/dashboard
Usuário: admin
Senha: $WAHA_API_KEY

Para configurar no sistema principal:
- WAHA_API_URL = https://$DOMAIN
- WAHA_API_KEY = $WAHA_API_KEY
============================================
EOF
    
    chmod 600 "$INSTALL_DIR/CREDENCIAIS.txt"
    log_info "Credenciais salvas em: $INSTALL_DIR/CREDENCIAIS.txt"
}

# Função principal
main() {
    show_banner
    check_root
    detect_os
    
    echo ""
    log_info "Verificando e instalando dependências..."
    install_docker
    install_docker_compose
    install_certbot
    
    collect_info
    generate_api_key
    
    create_directories
    create_env_file
    create_docker_compose
    create_nginx_config
    obtain_ssl_certificate
    create_helper_scripts
    
    start_containers
    check_health
    
    show_result
}

# Executar
main "$@"
