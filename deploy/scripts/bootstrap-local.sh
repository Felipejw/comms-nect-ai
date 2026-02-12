#!/bin/bash

# ============================================
# Bootstrap Local - Instalação sem GitHub
# Sistema de Atendimento + Baileys WhatsApp
# ============================================
#
# USO:
#   1. Suba os arquivos para a VPS (SCP, SFTP, ZIP, etc.)
#   2. Execute: sudo bash /opt/sistema/deploy/scripts/bootstrap-local.sh
#
# ============================================

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Banner
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║       SISTEMA DE ATENDIMENTO - INSTALAÇÃO LOCAL               ║"
echo "║                                                               ║"
echo "║              Bootstrap Local v1.0                             ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Verificar root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERRO]${NC} Execute como root: sudo bash $0"
    exit 1
fi

# Detectar diretório raiz do projeto (2 níveis acima do script)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"

echo -e "${BLUE}[INFO]${NC} Diretório do projeto detectado: $PROJECT_DIR"

# Validar arquivos essenciais
if [ ! -f "$DEPLOY_DIR/docker-compose.yml" ]; then
    echo -e "${RED}[ERRO]${NC} Arquivo não encontrado: $DEPLOY_DIR/docker-compose.yml"
    echo -e "${RED}[ERRO]${NC} Verifique se os arquivos do projeto foram enviados corretamente."
    exit 1
fi

if [ ! -f "$SCRIPT_DIR/install-unified.sh" ]; then
    echo -e "${RED}[ERRO]${NC} Arquivo não encontrado: $SCRIPT_DIR/install-unified.sh"
    echo -e "${RED}[ERRO]${NC} Verifique se os arquivos do projeto foram enviados corretamente."
    exit 1
fi

echo -e "${GREEN}[OK]${NC} Arquivos do projeto validados!"

# Instalar git se necessário (dependência do install-unified)
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}[INFO]${NC} Instalando Git..."
    apt-get update -qq
    apt-get install -y -qq git
fi

# Dar permissão de execução a todos os scripts
chmod +x "$SCRIPT_DIR/"*.sh
echo -e "${GREEN}[OK]${NC} Permissões dos scripts configuradas!"

# Executar instalação unificada
echo -e "${BLUE}[INFO]${NC} Iniciando instalação unificada..."
echo ""

cd "$DEPLOY_DIR"
./scripts/install-unified.sh < /dev/tty

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║           INSTALAÇÃO LOCAL CONCLUÍDA COM SUCESSO!             ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
