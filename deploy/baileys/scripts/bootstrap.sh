#!/bin/bash
set -e

# ============================================
# Baileys WhatsApp Server - Bootstrap
# Instalação automática via curl one-line
# ============================================

# Cores
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

# Banner
echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║       BAILEYS WHATSAPP SERVER - INSTALADOR                 ║"
echo "║       Instalação automática e simplificada                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Verificar root
if [ "$EUID" -ne 0 ]; then
    log_error "Execute como root!"
    echo ""
    echo "Uso correto:"
    echo "  curl -fsSL https://raw.githubusercontent.com/Felipejw/comms-nect-ai/main/deploy/baileys/scripts/bootstrap.sh | sudo bash"
    echo ""
    exit 1
fi

# Detectar OS
log_info "Detectando sistema operacional..."
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    OS_VERSION=$VERSION_ID
else
    log_error "Sistema operacional não suportado"
    exit 1
fi

case $OS in
    ubuntu|debian)
        log_success "Sistema detectado: $OS $OS_VERSION"
        ;;
    *)
        log_warning "Sistema $OS pode não ser totalmente compatível"
        ;;
esac

# Verificar recursos mínimos
log_info "Verificando recursos do sistema..."

# RAM (mínimo 1GB)
TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
if [ "$TOTAL_RAM" -lt 900 ]; then
    log_error "Memória insuficiente: ${TOTAL_RAM}MB (mínimo: 1GB)"
    exit 1
fi
log_success "Memória: ${TOTAL_RAM}MB"

# Disco (mínimo 5GB livres)
FREE_DISK=$(df -m / | awk 'NR==2 {print $4}')
log_success "Disco livre: ${FREE_DISK}MB"

# Obter IP público
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo "N/A")
if [ "$SERVER_IP" != "N/A" ]; then
    log_success "IP público: $SERVER_IP"
fi

# Instalar dependências básicas
log_info "Instalando dependências básicas..."
apt-get update -qq
apt-get install -y -qq git curl wget ca-certificates gnupg lsb-release

# Definir variáveis
INSTALL_DIR="/opt/baileys"
REPO_URL="https://github.com/Felipejw/comms-nect-ai.git"
BRANCH="main"

# Verificar instalação anterior
if [ -d "$INSTALL_DIR" ]; then
    log_warning "Instalação anterior encontrada em $INSTALL_DIR"
    
    # Backup das sessões automaticamente
    if [ -d "$INSTALL_DIR/sessions" ]; then
        log_info "Fazendo backup das sessões..."
        mkdir -p /tmp/baileys-sessions-backup
        cp -r "$INSTALL_DIR/sessions/"* /tmp/baileys-sessions-backup/ 2>/dev/null || true
    fi
    
    # Parar containers
    if [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
        cd "$INSTALL_DIR"
        docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
    fi
    
    rm -rf "$INSTALL_DIR"
    log_success "Instalação anterior removida"
fi

# Clonar repositório
log_info "Baixando arquivos do repositório..."
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" /tmp/comms-nect-ai 2>/dev/null

if [ ! -d "/tmp/comms-nect-ai/deploy/baileys" ]; then
    log_error "Falha ao baixar arquivos. Verifique sua conexão."
    rm -rf /tmp/comms-nect-ai
    exit 1
fi

# Criar diretório de instalação
mkdir -p "$INSTALL_DIR"
cp -r /tmp/comms-nect-ai/deploy/baileys/* "$INSTALL_DIR/"
rm -rf /tmp/comms-nect-ai

# Restaurar sessões do backup
if [ -d "/tmp/baileys-sessions-backup" ] && [ "$(ls -A /tmp/baileys-sessions-backup 2>/dev/null)" ]; then
    log_info "Restaurando sessões do backup..."
    mkdir -p "$INSTALL_DIR/sessions"
    cp -r /tmp/baileys-sessions-backup/* "$INSTALL_DIR/sessions/"
    rm -rf /tmp/baileys-sessions-backup
    log_success "Sessões restauradas"
fi

# Dar permissões aos scripts
chmod +x "$INSTALL_DIR/scripts/"*.sh

log_success "Arquivos instalados em $INSTALL_DIR"

# Executar instalador simplificado
echo ""
log_info "Iniciando instalação..."
echo ""

cd "$INSTALL_DIR"
./scripts/install-simple.sh

# Mensagem final
echo ""
log_success "Bootstrap concluído!"
echo ""
echo "Comandos úteis:"
echo ""
echo "  Ver status:      cd $INSTALL_DIR && ./scripts/diagnostico.sh"
echo "  Ver logs:        cd $INSTALL_DIR && docker compose logs -f"
echo "  Reiniciar:       cd $INSTALL_DIR && docker compose restart"
echo ""
