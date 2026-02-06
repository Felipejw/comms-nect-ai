#!/bin/bash

# ============================================
# Script para Alterar Domínio do Sistema
# Uso: sudo bash scripts/change-domain.sh meudominio.com
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
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "\n${CYAN}=== $1 ===${NC}\n"; }

# Diretórios
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

# Verificar root
if [ "$EUID" -ne 0 ]; then
    log_error "Execute como root: sudo $0 <dominio>"
    exit 1
fi

# Verificar argumento
NEW_DOMAIN="$1"
if [ -z "$NEW_DOMAIN" ]; then
    echo ""
    echo -e "${CYAN}Uso: sudo bash scripts/change-domain.sh <dominio>${NC}"
    echo ""
    echo "Exemplos:"
    echo "  sudo bash scripts/change-domain.sh meudominio.com.br"
    echo "  sudo bash scripts/change-domain.sh app.minhaempresa.com"
    echo ""
    echo "Antes de executar, aponte o DNS do domínio para o IP deste servidor."
    echo ""
    exit 1
fi

# Verificar se .env existe
if [ ! -f "$DEPLOY_DIR/.env" ]; then
    log_error "Arquivo .env não encontrado em $DEPLOY_DIR"
    log_info "Execute a instalação primeiro: sudo bash scripts/install-unified.sh"
    exit 1
fi

# Carregar variáveis atuais
source "$DEPLOY_DIR/.env"
OLD_DOMAIN="$DOMAIN"

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║              ALTERAÇÃO DE DOMÍNIO DO SISTEMA                 ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

log_info "Domínio atual:  $OLD_DOMAIN"
log_info "Novo domínio:   $NEW_DOMAIN"
echo ""

# =============================================
# 1. Atualizar .env
# =============================================
log_step "Atualizando Configuração"

sed -i "s|^DOMAIN=.*|DOMAIN=$NEW_DOMAIN|" "$DEPLOY_DIR/.env"
sed -i "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=https://$NEW_DOMAIN|" "$DEPLOY_DIR/.env"
sed -i "s|^SITE_URL=.*|SITE_URL=https://$NEW_DOMAIN|" "$DEPLOY_DIR/.env"
sed -i "s|^BAILEYS_EXTERNAL_URL=.*|BAILEYS_EXTERNAL_URL=https://$NEW_DOMAIN/baileys|" "$DEPLOY_DIR/.env"
sed -i "s|^VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=https://$NEW_DOMAIN|" "$DEPLOY_DIR/.env"
sed -i "s|^SSL_EMAIL=.*|SSL_EMAIL=admin@$NEW_DOMAIN|" "$DEPLOY_DIR/.env"

log_success ".env atualizado"

# =============================================
# 2. Obter certificado SSL
# =============================================
log_step "Configurando SSL"

# Verificar se é um IP ou domínio
is_ip() {
    echo "$1" | grep -qP '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$'
}

if is_ip "$NEW_DOMAIN"; then
    log_warn "O novo domínio é um IP. Usando certificado auto-assinado."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$DEPLOY_DIR/nginx/ssl/privkey.pem" \
        -out "$DEPLOY_DIR/nginx/ssl/fullchain.pem" \
        -subj "/CN=$NEW_DOMAIN" 2>/dev/null
    log_success "Certificado auto-assinado gerado"
else
    log_info "Tentando obter certificado Let's Encrypt para $NEW_DOMAIN..."
    
    # Instalar certbot se necessário
    if ! command -v certbot &> /dev/null; then
        apt-get update -qq && apt-get install -y -qq certbot
    fi
    
    # Parar nginx temporariamente para liberar porta 80
    docker stop app-nginx 2>/dev/null || true
    
    certbot certonly --standalone -d "$NEW_DOMAIN" \
        --email "admin@$NEW_DOMAIN" \
        --agree-tos --non-interactive 2>&1
    
    if [ -f "/etc/letsencrypt/live/$NEW_DOMAIN/fullchain.pem" ]; then
        cp "/etc/letsencrypt/live/$NEW_DOMAIN/fullchain.pem" "$DEPLOY_DIR/nginx/ssl/"
        cp "/etc/letsencrypt/live/$NEW_DOMAIN/privkey.pem" "$DEPLOY_DIR/nginx/ssl/"
        log_success "Certificado Let's Encrypt obtido!"
    else
        log_warn "Não foi possível obter certificado Let's Encrypt"
        log_info "Gerando certificado auto-assinado como fallback..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$DEPLOY_DIR/nginx/ssl/privkey.pem" \
            -out "$DEPLOY_DIR/nginx/ssl/fullchain.pem" \
            -subj "/CN=$NEW_DOMAIN" 2>/dev/null
        log_success "Certificado auto-assinado gerado"
    fi
fi

# =============================================
# 3. Regenerar config.js do frontend
# =============================================
log_step "Atualizando Frontend"

# Recarregar ANON_KEY do .env atualizado
source "$DEPLOY_DIR/.env"

cat > "$DEPLOY_DIR/frontend/dist/config.js" << CONFIGEOF
window.__SUPABASE_CONFIG__ = {
  url: "https://${NEW_DOMAIN}",
  anonKey: "${ANON_KEY}"
};
CONFIGEOF

log_success "config.js atualizado com novo domínio"

# =============================================
# 4. Atualizar CREDENCIAIS.txt
# =============================================
if [ -f "$DEPLOY_DIR/CREDENCIAIS.txt" ]; then
    sed -i "s|https://$OLD_DOMAIN|https://$NEW_DOMAIN|g" "$DEPLOY_DIR/CREDENCIAIS.txt"
    log_success "CREDENCIAIS.txt atualizado"
fi

# =============================================
# 5. Reiniciar serviços afetados
# =============================================
log_step "Reiniciando Serviços"

cd "$DEPLOY_DIR"

# Reiniciar Auth (usa API_EXTERNAL_URL e SITE_URL)
docker compose up -d auth 2>/dev/null
log_info "Auth reiniciado"

# Reiniciar Kong (para pegar novas URLs)
docker compose up -d kong 2>/dev/null
log_info "Kong reiniciado"

# Reiniciar Nginx (novo SSL + config.js)
docker compose up -d nginx 2>/dev/null
log_info "Nginx reiniciado"

sleep 5

# =============================================
# Resumo
# =============================================
echo -e "\n${GREEN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║            DOMÍNIO ALTERADO COM SUCESSO!                     ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo ""
echo -e "  Domínio anterior: ${YELLOW}$OLD_DOMAIN${NC}"
echo -e "  Novo domínio:     ${GREEN}$NEW_DOMAIN${NC}"
echo ""
echo -e "  Acesse o sistema: ${GREEN}https://$NEW_DOMAIN${NC}"
echo ""

if ! is_ip "$NEW_DOMAIN"; then
    echo -e "${YELLOW}  IMPORTANTE: Certifique-se de que o DNS do domínio${NC}"
    echo -e "${YELLOW}  aponta para o IP deste servidor.${NC}"
    echo ""
fi
