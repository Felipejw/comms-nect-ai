#!/bin/bash

# ============================================
# Bootstrap Local - Instalação com ZIP ou Local
# Sistema de Atendimento + Baileys WhatsApp
# ============================================
#
# USO:
#   Modo 1 (ZIP): sudo bash bootstrap-local.sh sistema-atendimento-v3.0.0.zip
#   Modo 2 (Local): sudo bash /opt/sistema/deploy/scripts/bootstrap-local.sh
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

INSTALL_DIR="/opt/sistema"

# Banner
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║       SISTEMA DE ATENDIMENTO - INSTALAÇÃO LOCAL               ║"
echo "║                                                               ║"
echo "║              Bootstrap Local v2.0                             ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Verificar root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERRO]${NC} Execute como root: sudo bash $0"
    exit 1
fi

# ==========================================
# MODO 1: Argumento ZIP fornecido
# ==========================================
ZIP_FILE="$1"

# Se nenhum argumento, tentar autodetectar ZIP no diretório atual
if [ -z "$ZIP_FILE" ]; then
    DETECTED_ZIP=$(ls "$PWD"/chatbot-*.zip 2>/dev/null | head -1)
    if [ -z "$DETECTED_ZIP" ]; then
        DETECTED_ZIP=$(ls /root/chatbot-*.zip 2>/dev/null | head -1)
    fi
    if [ -n "$DETECTED_ZIP" ]; then
        ZIP_FILE="$DETECTED_ZIP"
        echo -e "${BLUE}[INFO]${NC} ZIP detectado automaticamente: $ZIP_FILE"
    fi
fi

if [ -n "$ZIP_FILE" ]; then
    # Modo ZIP
    if [ ! -f "$ZIP_FILE" ]; then
        echo -e "${RED}[ERRO]${NC} Arquivo não encontrado: $ZIP_FILE"
        exit 1
    fi

    echo -e "${BLUE}[INFO]${NC} Modo ZIP: $ZIP_FILE"

    # Instalar unzip se necessário
    if ! command -v unzip &> /dev/null; then
        echo -e "${YELLOW}[INFO]${NC} Instalando unzip..."
        apt-get update -qq
        apt-get install -y -qq unzip
    fi

    # Limpar extração anterior
    rm -rf /tmp/sistema-extract

    # Extrair ZIP
    echo -e "${BLUE}[INFO]${NC} Extraindo ZIP..."
    unzip -o "$ZIP_FILE" -d /tmp/sistema-extract

    # Detectar pasta raiz dentro do ZIP (pode ter subpasta)
    EXTRACTED_DIR=$(find /tmp/sistema-extract -maxdepth 1 -type d ! -path /tmp/sistema-extract | head -1)
    if [ -z "$EXTRACTED_DIR" ]; then
        EXTRACTED_DIR="/tmp/sistema-extract"
    fi

    echo -e "${GREEN}[OK]${NC} ZIP extraído: $EXTRACTED_DIR"

    # Backup de sessões existentes se houver instalação anterior
    if [ -d "$INSTALL_DIR/volumes/baileys/sessions" ]; then
        echo -e "${BLUE}[INFO]${NC} Salvando sessões WhatsApp existentes..."
        mkdir -p /tmp/baileys-backup
        cp -r "$INSTALL_DIR/volumes/baileys/sessions/"* /tmp/baileys-backup/ 2>/dev/null || true
    fi

    # Backup do .env existente
    if [ -f "$INSTALL_DIR/.env" ]; then
        cp "$INSTALL_DIR/.env" /tmp/sistema-env-backup 2>/dev/null || true
        echo -e "${GREEN}[OK]${NC} .env salvo em /tmp/sistema-env-backup"
    fi

    # Parar containers existentes
    if [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
        cd /tmp
        (cd "$INSTALL_DIR" && docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true)
    fi

    # Mover para diretório final
    rm -rf "$INSTALL_DIR"
    mv "$EXTRACTED_DIR" "$INSTALL_DIR"
    rm -rf /tmp/sistema-extract

    # Restaurar sessões
    if [ -d "/tmp/baileys-backup" ] && [ "$(ls -A /tmp/baileys-backup 2>/dev/null)" ]; then
        echo -e "${GREEN}[OK]${NC} Restaurando sessões WhatsApp..."
        mkdir -p "$INSTALL_DIR/volumes/baileys/sessions"
        cp -r /tmp/baileys-backup/* "$INSTALL_DIR/volumes/baileys/sessions/"
        rm -rf /tmp/baileys-backup
    fi

    # Restaurar .env
    if [ -f "/tmp/sistema-env-backup" ]; then
        cp /tmp/sistema-env-backup "$INSTALL_DIR/.env"
        echo -e "${GREEN}[OK]${NC} .env restaurado"
    fi

    DEPLOY_DIR="$INSTALL_DIR"

else
    # ==========================================
    # MODO 2: Executado de dentro da pasta (sem ZIP)
    # ==========================================
    echo -e "${BLUE}[INFO]${NC} Modo local: detectando diretório do projeto..."

    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

    echo -e "${BLUE}[INFO]${NC} Diretório deploy detectado: $DEPLOY_DIR"
fi

# ==========================================
# VALIDAÇÃO E EXECUÇÃO
# ==========================================

# Validar arquivos essenciais
if [ ! -f "$DEPLOY_DIR/docker-compose.yml" ]; then
    echo -e "${RED}[ERRO]${NC} Arquivo não encontrado: $DEPLOY_DIR/docker-compose.yml"
    echo -e "${RED}[ERRO]${NC} Verifique se os arquivos foram enviados corretamente."
    exit 1
fi

if [ ! -f "$DEPLOY_DIR/scripts/install-unified.sh" ]; then
    echo -e "${RED}[ERRO]${NC} Arquivo não encontrado: $DEPLOY_DIR/scripts/install-unified.sh"
    exit 1
fi

echo -e "${GREEN}[OK]${NC} Arquivos validados!"

# Instalar git se necessário
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}[INFO]${NC} Instalando Git..."
    apt-get update -qq
    apt-get install -y -qq git
fi

# Dar permissão de execução
chmod +x "$DEPLOY_DIR/scripts/"*.sh
echo -e "${GREEN}[OK]${NC} Permissões configuradas!"

# Executar instalação
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
