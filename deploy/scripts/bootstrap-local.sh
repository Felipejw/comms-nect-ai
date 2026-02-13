#!/bin/bash

# ============================================
# Bootstrap Local - Instalação com ZIP (1 comando)
# Sistema de Atendimento + Baileys WhatsApp
# ============================================
#
# USO:
#   sudo bash bootstrap-local.sh [arquivo.zip]
#
#   Se nenhum ZIP for passado, busca automaticamente
#   qualquer .zip no diretório atual ou em /root/
#
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

INSTALL_DIR="/opt/sistema"

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║       SISTEMA DE ATENDIMENTO - INSTALAÇÃO LOCAL               ║"
echo "║                                                               ║"
echo "║              Bootstrap Local v2.1                             ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERRO]${NC} Execute como root: sudo bash $0"
    exit 1
fi

# ==========================================
# ENCONTRAR O ZIP
# ==========================================
ZIP_FILE="$1"

if [ -z "$ZIP_FILE" ]; then
    # Buscar qualquer .zip no diretório atual
    ZIP_FILE=$(ls "$PWD"/*.zip 2>/dev/null | head -1)
fi

if [ -z "$ZIP_FILE" ]; then
    # Buscar em /root/
    ZIP_FILE=$(ls /root/*.zip 2>/dev/null | head -1)
fi

if [ -z "$ZIP_FILE" ]; then
    # Buscar em /home/*/
    ZIP_FILE=$(ls /home/*/*.zip 2>/dev/null | head -1)
fi

if [ -z "$ZIP_FILE" ]; then
    echo -e "${RED}[ERRO]${NC} Nenhum arquivo .zip encontrado."
    echo -e "${YELLOW}Uso: sudo bash bootstrap-local.sh arquivo.zip${NC}"
    exit 1
fi

echo -e "${BLUE}[INFO]${NC} ZIP encontrado: $ZIP_FILE"

# ==========================================
# INSTALAR DEPENDÊNCIAS
# ==========================================
if ! command -v unzip &> /dev/null; then
    echo -e "${YELLOW}[INFO]${NC} Instalando unzip..."
    apt-get update -qq
    apt-get install -y -qq unzip
fi

if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}[INFO]${NC} Instalando git..."
    apt-get update -qq
    apt-get install -y -qq git
fi

# ==========================================
# EXTRAIR ZIP
# ==========================================
rm -rf /tmp/sistema-extract
echo -e "${BLUE}[INFO]${NC} Extraindo ZIP..."
unzip -o "$ZIP_FILE" -d /tmp/sistema-extract

# Detectar pasta raiz extraída (qualquer nome)
EXTRACTED_DIR=$(find /tmp/sistema-extract -maxdepth 1 -type d ! -path /tmp/sistema-extract | head -1)
if [ -z "$EXTRACTED_DIR" ]; then
    EXTRACTED_DIR="/tmp/sistema-extract"
fi

echo -e "${GREEN}[OK]${NC} Extraído: $EXTRACTED_DIR"

# Detectar onde está o deploy/ (pode ser raiz ou subpasta)
if [ -f "$EXTRACTED_DIR/deploy/docker-compose.yml" ]; then
    PROJECT_SOURCE="$EXTRACTED_DIR"
elif [ -f "$EXTRACTED_DIR/docker-compose.yml" ]; then
    PROJECT_SOURCE="$EXTRACTED_DIR"
else
    echo -e "${RED}[ERRO]${NC} Estrutura do ZIP não reconhecida. docker-compose.yml não encontrado."
    rm -rf /tmp/sistema-extract
    exit 1
fi

echo -e "${BLUE}[INFO]${NC} Projeto encontrado em: $PROJECT_SOURCE"

# ==========================================
# BACKUP DE INSTALAÇÃO EXISTENTE
# ==========================================
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}[INFO]${NC} Instalação anterior detectada, fazendo backup..."

    if [ -d "$INSTALL_DIR/deploy/volumes/baileys/sessions" ]; then
        mkdir -p /tmp/baileys-backup
        cp -r "$INSTALL_DIR/deploy/volumes/baileys/sessions/"* /tmp/baileys-backup/ 2>/dev/null || true
        echo -e "${GREEN}[OK]${NC} Sessões WhatsApp salvas"
    elif [ -d "$INSTALL_DIR/volumes/baileys/sessions" ]; then
        mkdir -p /tmp/baileys-backup
        cp -r "$INSTALL_DIR/volumes/baileys/sessions/"* /tmp/baileys-backup/ 2>/dev/null || true
        echo -e "${GREEN}[OK]${NC} Sessões WhatsApp salvas"
    fi

    if [ -f "$INSTALL_DIR/deploy/.env" ]; then
        cp "$INSTALL_DIR/deploy/.env" /tmp/sistema-env-backup 2>/dev/null || true
        echo -e "${GREEN}[OK]${NC} .env salvo"
    elif [ -f "$INSTALL_DIR/.env" ]; then
        cp "$INSTALL_DIR/.env" /tmp/sistema-env-backup 2>/dev/null || true
        echo -e "${GREEN}[OK]${NC} .env salvo"
    fi

    if [ -f "$INSTALL_DIR/deploy/docker-compose.yml" ]; then
        cd /tmp
        (cd "$INSTALL_DIR/deploy" && docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true)
    elif [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
        cd /tmp
        (cd "$INSTALL_DIR" && docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true)
    fi

    rm -rf "$INSTALL_DIR"
fi

# ==========================================
# MOVER PROJETO COMPLETO PARA DIRETÓRIO FINAL
# ==========================================
mkdir -p "$INSTALL_DIR"
cp -r "$PROJECT_SOURCE/"* "$INSTALL_DIR/"
cp "$PROJECT_SOURCE/".[!.]* "$INSTALL_DIR/" 2>/dev/null || true
rm -rf /tmp/sistema-extract

# Restaurar backup
if [ -d "/tmp/baileys-backup" ] && [ "$(ls -A /tmp/baileys-backup 2>/dev/null)" ]; then
    mkdir -p "$INSTALL_DIR/deploy/volumes/baileys/sessions"
    cp -r /tmp/baileys-backup/* "$INSTALL_DIR/deploy/volumes/baileys/sessions/"
    rm -rf /tmp/baileys-backup
    echo -e "${GREEN}[OK]${NC} Sessões restauradas"
fi

if [ -f "/tmp/sistema-env-backup" ]; then
    cp /tmp/sistema-env-backup "$INSTALL_DIR/deploy/.env"
    echo -e "${GREEN}[OK]${NC} .env restaurado"
fi

# ==========================================
# EXECUTAR INSTALAÇÃO
# ==========================================
chmod +x "$INSTALL_DIR/deploy/scripts/"*.sh

echo -e "${BLUE}[INFO]${NC} Iniciando instalação unificada..."
echo ""

cd "$INSTALL_DIR/deploy"
./scripts/install-unified.sh < /dev/tty

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║           INSTALAÇÃO CONCLUÍDA COM SUCESSO!                   ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
