#!/bin/bash
set -e

# ============================================
# Baileys WhatsApp Server - Bootstrap
# Instalacao automatica via curl one-line
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
echo "║       Instalacao automatica via curl                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ==========================================
# Instrucoes Iniciais
# ==========================================
echo ""
echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║   INFORMACOES IMPORTANTES                                  ║${NC}"
echo -e "${YELLOW}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${YELLOW}║                                                            ║${NC}"
echo -e "${YELLOW}║   Este instalador oferece dois modos:                      ║${NC}"
echo -e "${YELLOW}║                                                            ║${NC}"
echo -e "${YELLOW}║   1. PRODUCAO (recomendado):                              ║${NC}"
echo -e "${YELLOW}║      - Requer dominio configurado (DNS apontando aqui)    ║${NC}"
echo -e "${YELLOW}║      - Portas 80 e 443 liberadas                          ║${NC}"
echo -e "${YELLOW}║      - Email valido para certificado SSL                  ║${NC}"
echo -e "${YELLOW}║      - Acesso via HTTPS                                   ║${NC}"
echo -e "${YELLOW}║                                                            ║${NC}"
echo -e "${YELLOW}║   2. DESENVOLVIMENTO/TESTE:                               ║${NC}"
echo -e "${YELLOW}║      - Nao requer dominio                                 ║${NC}"
echo -e "${YELLOW}║      - Apenas porta 3000 liberada                         ║${NC}"
echo -e "${YELLOW}║      - Acesso via HTTP (sem SSL)                          ║${NC}"
echo -e "${YELLOW}║      - Ideal para testes iniciais                         ║${NC}"
echo -e "${YELLOW}║                                                            ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

read -p "Pressione ENTER para continuar ou Ctrl+C para cancelar..."
echo ""

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
    log_error "Sistema operacional nao suportado"
    log_info "Sistemas suportados: Ubuntu 20.04+, Debian 11+"
    exit 1
fi

# Verificar se é Ubuntu ou Debian
case $OS in
    ubuntu)
        if [ "${OS_VERSION%%.*}" -lt 20 ]; then
            log_error "Ubuntu $OS_VERSION nao suportado. Minimo: Ubuntu 20.04"
            exit 1
        fi
        log_success "Sistema detectado: Ubuntu $OS_VERSION"
        ;;
    debian)
        if [ "${OS_VERSION%%.*}" -lt 11 ]; then
            log_error "Debian $OS_VERSION nao suportado. Minimo: Debian 11"
            exit 1
        fi
        log_success "Sistema detectado: Debian $OS_VERSION"
        ;;
    *)
        log_warning "Sistema $OS pode nao ser totalmente compativel"
        log_info "Continuando mesmo assim..."
        ;;
esac

# Verificar recursos minimos
log_info "Verificando recursos do sistema..."

# RAM (minimo 1GB)
TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
if [ "$TOTAL_RAM" -lt 900 ]; then
    log_error "Memoria insuficiente: ${TOTAL_RAM}MB (minimo: 1GB)"
    exit 1
fi
log_success "Memoria: ${TOTAL_RAM}MB"

# Disco (minimo 5GB livres)
FREE_DISK=$(df -m / | awk 'NR==2 {print $4}')
if [ "$FREE_DISK" -lt 5000 ]; then
    log_warning "Espaco em disco baixo: ${FREE_DISK}MB (recomendado: 5GB+)"
fi
log_success "Disco livre: ${FREE_DISK}MB"

# Obter e mostrar IP publico
log_info "Obtendo IP publico do servidor..."
SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || curl -s ipinfo.io/ip)
if [ -n "$SERVER_IP" ]; then
    log_success "IP publico: $SERVER_IP"
    echo ""
    echo -e "${CYAN}DICA: Se for usar modo producao, configure seu dominio${NC}"
    echo -e "${CYAN}      para apontar para este IP: $SERVER_IP${NC}"
    echo ""
fi

# Instalar dependencias basicas
log_info "Instalando dependencias basicas..."
apt-get update -qq
apt-get install -y -qq git curl wget ca-certificates gnupg lsb-release dnsutils

# Definir variaveis
INSTALL_DIR="/opt/baileys"
REPO_URL="https://github.com/Felipejw/comms-nect-ai.git"
BRANCH="main"

# Verificar instalacao anterior
if [ -d "$INSTALL_DIR" ]; then
    echo ""
    log_warning "Instalacao anterior encontrada em $INSTALL_DIR"
    read -p "Deseja remover e reinstalar? [s/N] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        log_info "Removendo instalacao anterior..."
        
        # Parar containers se existirem
        if [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
            cd "$INSTALL_DIR"
            docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
        fi
        
        # Backup do .env se existir
        if [ -f "$INSTALL_DIR/.env" ]; then
            cp "$INSTALL_DIR/.env" /tmp/baileys-env-backup
            log_info "Backup do .env salvo em /tmp/baileys-env-backup"
        fi
        
        rm -rf "$INSTALL_DIR"
    else
        log_info "Instalacao cancelada"
        exit 0
    fi
fi

# Clonar repositorio
log_info "Baixando arquivos do repositorio..."
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" /tmp/comms-nect-ai 2>/dev/null

if [ ! -d "/tmp/comms-nect-ai/deploy/baileys" ]; then
    log_error "Falha ao baixar arquivos. Verifique sua conexao."
    rm -rf /tmp/comms-nect-ai
    exit 1
fi

# Criar diretorio de instalacao
mkdir -p "$INSTALL_DIR"
cp -r /tmp/comms-nect-ai/deploy/baileys/* "$INSTALL_DIR/"
rm -rf /tmp/comms-nect-ai

# Restaurar backup do .env se existir
if [ -f /tmp/baileys-env-backup ]; then
    cp /tmp/baileys-env-backup "$INSTALL_DIR/.env"
    log_success "Configuracoes anteriores restauradas"
    rm /tmp/baileys-env-backup
fi

# Dar permissoes aos scripts
chmod +x "$INSTALL_DIR/scripts/"*.sh

log_success "Arquivos baixados para $INSTALL_DIR"

# Executar instalador principal
echo ""
log_info "Iniciando instalador principal..."
echo ""

cd "$INSTALL_DIR"
./scripts/install.sh

# Mensagem final
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       INSTALACAO CONCLUIDA COM SUCESSO!                    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Comandos uteis:"
echo ""
echo "  Ver status:      cd $INSTALL_DIR && ./scripts/diagnostico.sh"
echo "  Ver logs:        cd $INSTALL_DIR && docker compose logs -f"
echo "  Reiniciar:       cd $INSTALL_DIR && docker compose restart"
echo "  Atualizar:       cd $INSTALL_DIR && ./scripts/update.sh"
echo ""
