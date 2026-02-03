#!/bin/bash

# ============================================
# Bootstrap Script - Instalação One-Line
# Sistema de Atendimento + Baileys WhatsApp
# ============================================
# 
# USO:
#   curl -fsSL https://raw.githubusercontent.com/Felipejw/comms-nect-ai/main/deploy/scripts/bootstrap.sh | sudo bash
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

# Configurações
REPO_URL="https://github.com/Felipejw/comms-nect-ai.git"
INSTALL_DIR="/opt/sistema"
BRANCH="main"

# Banner
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║       SISTEMA DE ATENDIMENTO - INSTALAÇÃO AUTOMÁTICA         ║"
echo "║                                                               ║"
echo "║              Bootstrap Script v1.0                            ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Verificar root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERRO]${NC} Execute como root: curl ... | sudo bash"
    exit 1
fi

echo -e "${BLUE}[INFO]${NC} Iniciando instalação..."

# Instalar git se necessário
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}[INFO]${NC} Instalando Git..."
    apt-get update -qq
    apt-get install -y git
fi

# Remover instalação anterior automaticamente (ZERO PROMPTS)
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}[WARN]${NC} Diretório $INSTALL_DIR já existe"
    echo -e "${BLUE}[INFO]${NC} Fazendo backup das sessões automaticamente..."
    
    # Backup das sessões WhatsApp
    if [ -d "$INSTALL_DIR/deploy/volumes/baileys/sessions" ]; then
        mkdir -p /tmp/baileys-backup
        cp -r "$INSTALL_DIR/deploy/volumes/baileys/sessions/"* /tmp/baileys-backup/ 2>/dev/null || true
        echo -e "${GREEN}[OK]${NC} Sessões WhatsApp salvas em /tmp/baileys-backup"
    fi
    
    # Backup do .env se existir
    if [ -f "$INSTALL_DIR/deploy/.env" ]; then
        cp "$INSTALL_DIR/deploy/.env" /tmp/sistema-env-backup 2>/dev/null || true
        echo -e "${GREEN}[OK]${NC} Arquivo .env salvo em /tmp/sistema-env-backup"
    fi
    
    # Parar containers existentes
    if [ -f "$INSTALL_DIR/deploy/docker-compose.yml" ]; then
        cd "$INSTALL_DIR/deploy"
        docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
    fi
    
    # IMPORTANTE: Mudar para diretório seguro ANTES de deletar
    cd /tmp
    
    # Remover diretório antigo
    rm -rf "$INSTALL_DIR"
    echo -e "${GREEN}[OK]${NC} Instalação anterior removida"
fi

# Garantir que estamos em diretório válido para o git clone
cd /tmp

# Clonar repositório
echo -e "${BLUE}[INFO]${NC} Clonando repositório..."
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"

# Restaurar sessões do backup
if [ -d "/tmp/baileys-backup" ] && [ "$(ls -A /tmp/baileys-backup 2>/dev/null)" ]; then
    echo -e "${GREEN}[OK]${NC} Restaurando sessões do backup..."
    mkdir -p "$INSTALL_DIR/deploy/volumes/baileys/sessions"
    cp -r /tmp/baileys-backup/* "$INSTALL_DIR/deploy/volumes/baileys/sessions/"
    rm -rf /tmp/baileys-backup
fi

# Tornar scripts executáveis
chmod +x "$INSTALL_DIR/deploy/scripts/"*.sh

# Executar instalação
echo -e "${GREEN}[OK]${NC} Repositório clonado com sucesso!"
echo -e "${BLUE}[INFO]${NC} Iniciando instalação unificada..."
echo ""

cd "$INSTALL_DIR/deploy"
./scripts/install-unified.sh

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║              BOOTSTRAP CONCLUÍDO COM SUCESSO!                ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
